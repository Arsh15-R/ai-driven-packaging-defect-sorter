"""
=============================================================================
Project: AI-Driven Packaging Line Defect Sorter
Module: backend/config.py
Purpose: Central configuration management for FastAPI backend,
         model selection, and Supabase integration.
=============================================================================
"""

import os
from pathlib import Path
from typing import Optional, List
from dotenv import load_dotenv

# Base paths
BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent

# Load .env from project root if it exists, otherwise from backend dir
env_path = PROJECT_ROOT / ".env"
if not env_path.exists():
    env_path = BACKEND_DIR / ".env"

if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()  # Fallback to default search


class Settings:
    """Application settings loaded from environment variables."""

    # Supabase Settings
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "").rstrip("/")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
    SUPABASE_STORAGE_BUCKET: str = os.getenv("SUPABASE_STORAGE_BUCKET", "inspection-images")

    # Model Settings
    # Options: "auto", "placeholder", "pytorch"
    MODEL_TYPE: str = os.getenv("MODEL_TYPE", "auto").strip().lower()
    
    # Weights path: defaults to models/best.pt in project root
    _default_weights = str(PROJECT_ROOT / "models" / "best.pt")
    MODEL_WEIGHTS_PATH: str = os.getenv("MODEL_WEIGHTS_PATH", _default_weights)
    
    CONFIDENCE_THRESHOLD: float = float(os.getenv("CONFIDENCE_THRESHOLD", "0.45"))
    DEVICE: str = os.getenv("DEVICE", "auto").strip().lower()

    # Server Settings
    API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
    API_PORT: int = int(os.getenv("API_PORT", "8000"))
    CORS_ORIGINS: List[str] = [
        origin.strip() 
        for origin in os.getenv("CORS_ORIGINS", "*").split(",") 
        if origin.strip()
    ]

    # Directories
    LOGS_DIR: Path = PROJECT_ROOT / "logs"
    DEFECT_IMG_DIR: Path = PROJECT_ROOT / "logs" / "defect_images"
    CSV_LOG_PATH: Path = PROJECT_ROOT / "logs" / "defect_log.csv"

    @property
    def is_supabase_configured(self) -> bool:
        """Returns True if Supabase URL and service role key are properly configured."""
        url = self.SUPABASE_URL.lower()
        key = self.SUPABASE_SERVICE_ROLE_KEY
        if not url or not key:
            return False
        if "your-project" in url or "your-service-role-key" in key:
            return False
        return url.startswith("http://") or url.startswith("https://")

    def resolve_weights_path(self) -> Optional[Path]:
        """Resolves the weights path against PROJECT_ROOT if relative."""
        p = Path(self.MODEL_WEIGHTS_PATH)
        if not p.is_absolute():
            p = PROJECT_ROOT / p
        return p if p.exists() else None


# Global settings singleton
settings = Settings()
