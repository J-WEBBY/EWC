"""
Embedding utilities — generates vector embeddings for semantic memory search.
Uses OpenAI text-embedding-3-small (1536d). Gracefully no-ops if no API key.
"""

import os
from typing import Optional


def generate_embedding(text: str) -> Optional[list[float]]:
    """
    Generate a 1536-dim embedding for the given text.
    Returns None if OPENAI_API_KEY is not set or on error.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=text[:8000],
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"[embeddings] generate_embedding error: {e}")
        return None
