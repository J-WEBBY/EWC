"""
Web search tool — Tavily API for current information.
"""

import httpx
from crewai.tools import BaseTool
from pydantic import BaseModel, Field
from config import TAVILY_API_KEY

TAVILY_URL = "https://api.tavily.com/search"


class WebSearchInput(BaseModel):
    query: str = Field(..., description="Search query")
    max_results: int = Field(5, description="Max results (1-10)", ge=1, le=10)
    search_depth: str = Field(
        "advanced", description='Search depth: "basic" or "advanced" (default advanced for better results)'
    )


class WebSearchTool(BaseTool):
    name: str = "web_search"
    description: str = (
        "Search the web for current information, news, trends, or external data. "
        "Use this when you need up-to-date information not in the knowledge base. "
        "Always prefer search_depth 'advanced' for thorough, high-quality results."
    )
    args_schema: type[BaseModel] = WebSearchInput

    def _run(
        self,
        query: str,
        max_results: int = 5,
        search_depth: str = "advanced",
    ) -> str:
        if not TAVILY_API_KEY:
            return "Web search is not configured (TAVILY_API_KEY missing)."

        query = query.strip()
        if not query:
            return "Missing search query."

        if search_depth not in ("basic", "advanced"):
            search_depth = "advanced"

        try:
            resp = httpx.post(
                TAVILY_URL,
                json={
                    "api_key": TAVILY_API_KEY,
                    "query": query,
                    "max_results": max_results,
                    "search_depth": search_depth,
                    "include_answer": True,
                    "include_raw_content": False,
                },
                timeout=30.0,
            )
            resp.raise_for_status()
            data = resp.json()

            output = ""
            if data.get("answer"):
                output += f"**Summary:** {data['answer']}\n\n"

            results = data.get("results", [])
            if results:
                output += "**Sources:**\n"
                for r in results:
                    snippet = (r.get("content") or "No snippet")[:300]
                    output += f"- [{r.get('title', 'Untitled')}]({r.get('url', '')})\n  {snippet}\n\n"
            else:
                output += "No results found for this query."

            return output.strip()

        except httpx.HTTPStatusError as e:
            return f"Tavily API error ({e.response.status_code}): {e.response.text[:200]}"
        except Exception as e:
            return f"Web search failed: {str(e)}"
