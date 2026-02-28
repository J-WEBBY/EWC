"""
Chat endpoint — SSE streaming conversation with the Primary Agent.
Mirrors the Next.js /api/primary-agent/chat route but powered by CrewAI.
"""

import json
import time
import asyncio
import traceback
import random
from typing import Optional
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel, Field
from db import get_supabase
from crews.primary_crew import run_primary_agent
from config import CLASSIFIER_MODEL

MAX_RETRIES = 3
RETRY_BASE_S = 2.0

router = APIRouter()


# ---------------------------------------------------------------------------
# Request model
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    tenant_id: str
    user_id: str
    conversation_id: str
    message: str
    agent_scope: Optional[str] = None


# ---------------------------------------------------------------------------
# SSE Streaming Chat
# ---------------------------------------------------------------------------

@router.post("/stream")
async def chat_stream(request: ChatRequest):
    """
    SSE endpoint — streams tool_call, text_delta, done, and error events.
    Compatible with the existing Next.js chat page SSE consumer.
    """

    async def event_generator():
        try:
            db = get_supabase()

            # Load conversation history
            history_result = (
                db.table("chat_messages")
                .select("role, content")
                .eq("conversation_id", request.conversation_id)
                .eq("tenant_id", request.tenant_id)
                .order("created_at")
                .execute()
            )
            chat_history = history_result.data or []

            # Save user message
            db.table("chat_messages").insert({
                "conversation_id": request.conversation_id,
                "tenant_id": request.tenant_id,
                "role": "user",
                "content": request.message,
                "agent_scope": request.agent_scope,
            }).execute()

            # Detect likely tool usage from user message for indicator
            msg_lower = request.message.lower()
            if any(w in msg_lower for w in ["search", "find", "look up", "google", "latest", "current", "news", "trend"]):
                indicator_name = "web_search"
            elif any(w in msg_lower for w in ["signal", "task", "alert", "event"]):
                indicator_name = "query_signals"
            elif any(w in msg_lower for w in ["knowledge", "policy", "procedure", "document"]):
                indicator_name = "knowledge_base_search"
            elif any(w in msg_lower for w in ["report", "analytics", "summary", "stats"]):
                indicator_name = "generate_report"
            elif any(w in msg_lower for w in ["scan", "health", "check", "audit"]):
                indicator_name = "run_proactive_scan"
            elif any(w in msg_lower for w in ["department", "team", "staff", "member"]):
                indicator_name = "get_department_info"
            else:
                indicator_name = "thinking"

            yield {
                "event": "message",
                "data": json.dumps({
                    "type": "tool_call",
                    "name": indicator_name,
                    "input": {},
                }),
            }

            # Run the Primary Agent with retry for transient API errors (529)
            loop = asyncio.get_event_loop()
            result = None
            last_error = None

            for attempt in range(MAX_RETRIES + 1):
                try:
                    result = await loop.run_in_executor(
                        None,
                        lambda: run_primary_agent(
                            tenant_id=request.tenant_id,
                            user_id=request.user_id,
                            message=request.message,
                            conversation_id=request.conversation_id,
                            agent_scope=request.agent_scope,
                            chat_history=chat_history,
                        ),
                    )
                    break
                except Exception as e:
                    last_error = e
                    err_str = str(e)
                    is_retryable = "529" in err_str or "overloaded" in err_str.lower() or "503" in err_str
                    if attempt < MAX_RETRIES and is_retryable:
                        delay = RETRY_BASE_S * (2 ** attempt) + random.random()
                        print(f"[chat] Attempt {attempt + 1} failed (retryable: {err_str[:80]}), retrying in {delay:.1f}s...")
                        await asyncio.sleep(delay)
                        continue
                    raise

            if result is None:
                raise last_error or Exception("Agent execution failed")

            response_text = result["response"]

            # Clear tool indicator before streaming text
            yield {
                "event": "message",
                "data": json.dumps({
                    "type": "tool_result",
                    "name": indicator_name,
                    "output": "done",
                    "durationMs": 0,
                }),
            }

            # Stream the response in chunks for progressive rendering
            chunk_size = 120  # characters per chunk
            for i in range(0, len(response_text), chunk_size):
                chunk = response_text[i : i + chunk_size]
                yield {
                    "event": "message",
                    "data": json.dumps({
                        "type": "text_delta",
                        "content": chunk,
                    }),
                }
                await asyncio.sleep(0.015)  # Small delay for smooth streaming

            # Save assistant message
            db.table("chat_messages").insert({
                "conversation_id": request.conversation_id,
                "tenant_id": request.tenant_id,
                "role": "assistant",
                "content": response_text,
                "agent_scope": request.agent_scope,
                "model_used": "crewai-primary",
            }).execute()

            # Update conversation metadata
            new_count = len(chat_history) + 2
            db.table("chat_conversations").update({
                "message_count": new_count,
                "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }).eq("id", request.conversation_id).execute()

            # Auto-title on first message
            if len(chat_history) == 0:
                _generate_title(
                    request.tenant_id,
                    request.conversation_id,
                    request.message,
                )

            # Done event
            yield {
                "event": "message",
                "data": json.dumps({
                    "type": "done",
                    "response": response_text,
                    "toolCalls": result.get("tool_calls", []),
                }),
            }

            yield {"event": "message", "data": "[DONE]"}

        except Exception as e:
            traceback.print_exc()
            yield {
                "event": "message",
                "data": json.dumps({
                    "type": "error",
                    "content": str(e),
                }),
            }
            yield {"event": "message", "data": "[DONE]"}

    return EventSourceResponse(event_generator())


# ---------------------------------------------------------------------------
# Non-streaming fallback
# ---------------------------------------------------------------------------

@router.post("/send")
async def chat_send(request: ChatRequest):
    """Non-streaming endpoint — returns the full response at once."""
    try:
        db = get_supabase()

        # Load history
        history_result = (
            db.table("chat_messages")
            .select("role, content")
            .eq("conversation_id", request.conversation_id)
            .eq("tenant_id", request.tenant_id)
            .order("created_at")
            .execute()
        )
        chat_history = history_result.data or []

        # Save user message
        db.table("chat_messages").insert({
            "conversation_id": request.conversation_id,
            "tenant_id": request.tenant_id,
            "role": "user",
            "content": request.message,
            "agent_scope": request.agent_scope,
        }).execute()

        # Run agent with retry for transient API errors
        loop = asyncio.get_event_loop()
        result = None
        last_error = None

        for attempt in range(MAX_RETRIES + 1):
            try:
                result = await loop.run_in_executor(
                    None,
                    lambda: run_primary_agent(
                        tenant_id=request.tenant_id,
                        user_id=request.user_id,
                        message=request.message,
                        conversation_id=request.conversation_id,
                        agent_scope=request.agent_scope,
                        chat_history=chat_history,
                    ),
                )
                break
            except Exception as e:
                last_error = e
                err_str = str(e)
                is_retryable = "529" in err_str or "overloaded" in err_str.lower() or "503" in err_str
                if attempt < MAX_RETRIES and is_retryable:
                    delay = RETRY_BASE_S * (2 ** attempt) + random.random()
                    print(f"[chat/send] Attempt {attempt + 1} failed (retryable), retrying in {delay:.1f}s...")
                    await asyncio.sleep(delay)
                    continue
                raise

        if result is None:
            raise last_error or Exception("Agent execution failed")

        # Save assistant message
        assistant_result = db.table("chat_messages").insert({
            "conversation_id": request.conversation_id,
            "tenant_id": request.tenant_id,
            "role": "assistant",
            "content": result["response"],
            "agent_scope": request.agent_scope,
            "model_used": "crewai-primary",
        }).execute()

        msg_id = assistant_result.data[0]["id"] if assistant_result.data else None

        # Update count
        new_count = len(chat_history) + 2
        db.table("chat_conversations").update({
            "message_count": new_count,
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }).eq("id", request.conversation_id).execute()

        if len(chat_history) == 0:
            _generate_title(
                request.tenant_id,
                request.conversation_id,
                request.message,
            )

        return {
            "success": True,
            "response": result["response"],
            "messageId": msg_id,
        }

    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)},
        )


# ---------------------------------------------------------------------------
# Background title generation
# ---------------------------------------------------------------------------

def _generate_title(tenant_id: str, conversation_id: str, first_message: str):
    """Generate a concise conversation title using HAIKU."""
    try:
        import anthropic
        import os

        client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))
        response = client.messages.create(
            model=CLASSIFIER_MODEL,
            max_tokens=30,
            system="Generate a concise 3-6 word title for this conversation. Return ONLY the title text, no quotes, no punctuation at the end.",
            messages=[{"role": "user", "content": first_message}],
        )

        title = response.content[0].text.strip()[:200] if response.content else "New Conversation"

        db = get_supabase()
        db.table("chat_conversations").update({"title": title}).eq(
            "id", conversation_id
        ).eq("tenant_id", tenant_id).execute()
        print(f"[chat] Title generated for {conversation_id}: {title}")
    except Exception as e:
        print(f"[chat] _generate_title error: {e}")
