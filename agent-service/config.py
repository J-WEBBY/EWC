"""
Centralised configuration — loads from environment variables.
"""

import os
from dotenv import load_dotenv

load_dotenv()


# ---------------------------------------------------------------------------
# Anthropic
# ---------------------------------------------------------------------------
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

# ---------------------------------------------------------------------------
# Supabase
# ---------------------------------------------------------------------------
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL", "")

# ---------------------------------------------------------------------------
# Tavily (web search)
# ---------------------------------------------------------------------------
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")

# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------
AGENT_SERVICE_PORT = int(os.getenv("AGENT_SERVICE_PORT", "8001"))
AGENT_SERVICE_SECRET = os.getenv("AGENT_SERVICE_SECRET", "")

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
PRIMARY_MODEL = os.getenv("PRIMARY_MODEL", "claude-sonnet-4-20250514")
SPECIALIST_MODEL = os.getenv("SPECIALIST_MODEL", "claude-sonnet-4-20250514")
CLASSIFIER_MODEL = os.getenv("CLASSIFIER_MODEL", "claude-haiku-4-20250514")
