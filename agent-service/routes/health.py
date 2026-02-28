"""Health check endpoint."""

from fastapi import APIRouter
from db import get_supabase

router = APIRouter()


@router.get("/health")
async def health_check():
    """Basic health check — verifies Supabase connection."""
    try:
        db = get_supabase()
        result = db.table("tenants").select("id").limit(1).execute()
        db_ok = result.data is not None
    except Exception:
        db_ok = False

    return {
        "status": "healthy" if db_ok else "degraded",
        "service": "jwebly-agent-service",
        "version": "1.0.0",
        "database": "connected" if db_ok else "disconnected",
    }
