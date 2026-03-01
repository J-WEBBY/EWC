"""
JWEBLY Agent Service — FastAPI entry point.
Hosts CrewAI-powered agents accessible via REST + SSE.
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import os
from config import AGENT_SERVICE_PORT, AGENT_SERVICE_SECRET
from routes.chat import router as chat_router
from routes.classify import router as classify_router
from routes.health import router as health_router

app = FastAPI(
    title="EWC Agent Service",
    description="CrewAI-powered intelligence layer for Edgbaston Wellness Clinic",
    version="2.0.0",
)

# ---------------------------------------------------------------------------
# CORS — allow Next.js frontend (localhost in dev, Vercel URL in prod)
# Set ALLOWED_ORIGINS env var as comma-separated list for production.
# e.g. ALLOWED_ORIGINS=https://ewc-three.vercel.app,https://ewc.vercel.app
# ---------------------------------------------------------------------------
_default_origins = "http://localhost:3000,http://127.0.0.1:3000"
_origins_env = os.getenv("ALLOWED_ORIGINS", _default_origins)
ALLOWED_ORIGINS = [o.strip() for o in _origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Auth middleware — shared secret between Next.js and this service
# ---------------------------------------------------------------------------
@app.middleware("http")
async def verify_service_secret(request: Request, call_next):
    # Skip auth for health check and docs
    if request.url.path in ("/health", "/docs", "/openapi.json"):
        return await call_next(request)

    secret = request.headers.get("x-service-secret", "")
    if AGENT_SERVICE_SECRET and secret != AGENT_SERVICE_SECRET:
        return JSONResponse(
            status_code=401,
            content={"error": "Unauthorized — invalid service secret"},
        )
    return await call_next(request)


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(health_router, tags=["Health"])
app.include_router(chat_router, prefix="/chat", tags=["Chat"])
app.include_router(classify_router, prefix="/classify", tags=["Classification"])


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=AGENT_SERVICE_PORT,
        reload=True,
    )
