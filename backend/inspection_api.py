"""
=============================================================================
Project: AI-Driven Packaging Line Defect Sorter
Script: backend/inspection_api.py
Purpose: Standalone FastAPI Application for Product Inspection & Supabase
         Integration. Can be run independently or mounted in api_server.py.
=============================================================================
"""

import sys
from pathlib import Path

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn

from backend.config import settings
from backend.routers.inspect import router as inspect_router
from backend.models.factory import get_inspection_model

app = FastAPI(
    title="AI Product Inspection & Quality Control API",
    description="High-performance inspection API featuring pluggable PyTorch/YOLO/Placeholder "
                "models and secure Supabase Storage & Database integration.",
    version="2.1.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_private_network_headers(request, call_next):
    """Permit Chromium Private Network Access (PNA) requests from HTTPS web apps to localhost."""
    if request.method == "OPTIONS" and request.headers.get("access-control-request-private-network"):
        from fastapi import Response
        res = Response(status_code=204)
        res.headers["Access-Control-Allow-Origin"] = request.headers.get("origin", "*")
        res.headers["Access-Control-Allow-Methods"] = "*"
        res.headers["Access-Control-Allow-Headers"] = "*"
        res.headers["Access-Control-Allow-Credentials"] = "true"
        res.headers["Access-Control-Allow-Private-Network"] = "true"
        return res
    response = await call_next(request)
    response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response

# Mount local defect images directory for local preview
settings.DEFECT_IMG_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/logs/defect_images", StaticFiles(directory=str(settings.DEFECT_IMG_DIR)), name="defect_images")

# Mount inspection router
app.include_router(inspect_router)


@app.get("/api/health")
async def health_check():
    """Health status and configuration overview."""
    model = get_inspection_model()
    return {
        "status": "ok",
        "service": "ai-inspection-api",
        "model_type": model.get_info().get("model_name"),
        "is_placeholder": model.get_info().get("is_placeholder", True),
        "supabase_connected": settings.is_supabase_configured,
        "storage_bucket": settings.SUPABASE_STORAGE_BUCKET
    }


def start_server():
    print("\n" + "=" * 65)
    print("   AI PRODUCT INSPECTION & QUALITY ASSURANCE API   ")
    print("=" * 65)
    print(f" API Base URL    : http://{settings.API_HOST}:{settings.API_PORT}")
    print(f" Swagger Docs    : http://{settings.API_HOST}:{settings.API_PORT}/docs")
    print(f" Supabase Status : {'Configured' if settings.is_supabase_configured else 'Local Fallback'}")
    print("=" * 65 + "\n")
    uvicorn.run(app, host=settings.API_HOST, port=settings.API_PORT, log_level="info")


if __name__ == "__main__":
    start_server()
