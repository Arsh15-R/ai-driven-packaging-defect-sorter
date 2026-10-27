"""
=============================================================================
Project: AI-Driven Packaging Line Defect Sorter
Module: backend/routers/inspect.py
Purpose: FastAPI endpoints for AI product inspection:
         - POST /api/inspect/classify (Multipart or Base64 inference)
         - POST /api/inspect/save (Auth verification, Supabase Storage & DB)
         - GET  /api/inspect/history (User history with signed URLs & pagination)
         - GET  /api/inspect/model-info (Active model diagnostics)
=============================================================================
"""

import base64
import json
import binascii
from typing import Optional, Dict, Any, List, Tuple
from fastapi import (
    APIRouter,
    Request,
    UploadFile,
    File,
    Form,
    Header,
    Query,
    HTTPException,
    status,
    Depends
)
from pydantic import BaseModel, Field

from ..models.factory import get_inspection_model
from ..services.supabase_service import get_supabase_service, SupabaseService

router = APIRouter(prefix="/api/inspect", tags=["Product Inspection"])


# -----------------------------------------------------------------------------
# Request & Response Schemas
# -----------------------------------------------------------------------------
class ClassifyBase64Request(BaseModel):
    """Payload for Base64 image classification."""
    image_base64: Optional[str] = Field(
        None,
        description="Base64 encoded image string (with or without 'data:image/...;base64,' prefix)"
    )
    image: Optional[str] = Field(
        None,
        description="Alias for image_base64"
    )


class ClassifyResponse(BaseModel):
    """Standardized response from classification endpoint."""
    prediction: str = Field(..., description="'Defective' or 'Non-defective'")
    is_defective: bool = Field(..., description="Boolean defective flag")
    confidence: float = Field(..., description="Confidence score (0.0 to 1.0)")
    is_placeholder: bool = Field(..., description="True if placeholder demo model was used")
    defect_type: Optional[str] = Field("none", description="Defect classification label")
    boxes: Optional[List[Dict[str, Any]]] = Field(default_factory=list, description="Detected bounding boxes")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Detailed model inference telemetry")


class SaveInspectionJsonRequest(BaseModel):
    """Payload for saving an inspection via JSON with Base64 image."""
    image_base64: str = Field(..., description="Base64 encoded image string")
    filename: Optional[str] = Field("inspection.jpg", description="Original or generated filename")
    prediction: Optional[str] = Field(None, description="Pre-computed prediction or auto-inferred if omitted")
    is_defective: Optional[bool] = Field(None, description="Pre-computed flag or auto-inferred if omitted")
    confidence: Optional[float] = Field(None, description="Pre-computed confidence or auto-inferred if omitted")
    is_placeholder: Optional[bool] = Field(None, description="Pre-computed placeholder flag")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Custom metadata or notes")


class HistoryResponse(BaseModel):
    """Paginated user inspection history."""
    items: List[Dict[str, Any]]
    total: int
    page: int
    limit: int
    has_more: bool


# -----------------------------------------------------------------------------
# Helper Utilities
# -----------------------------------------------------------------------------
def _decode_base64_image(b64_str: str) -> bytes:
    """Safely decodes base64 string, handling data URI headers if present."""
    if not b64_str:
        raise HTTPException(status_code=400, detail="Empty base64 image data provided.")

    clean_str = b64_str.strip()
    if "," in clean_str and "base64" in clean_str.split(",")[0]:
        clean_str = clean_str.split(",", 1)[1]

    try:
        return base64.b64decode(clean_str)
    except (binascii.Error, ValueError) as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid base64 encoding: {err}"
        )


async def _extract_image_bytes(
    file: Optional[UploadFile],
    b64_payload: Optional[ClassifyBase64Request]
) -> Tuple[bytes, str]:
    """Extracts raw image bytes and filename from either multipart upload or JSON base64."""
    if file is not None and file.filename:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        return content, file.filename

    if b64_payload is not None:
        raw_b64 = b64_payload.image_base64 or b64_payload.image
        if raw_b64:
            return _decode_base64_image(raw_b64), "upload.jpg"

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="No image provided. Send a multipart file ('file') or JSON body with 'image_base64'."
    )


# -----------------------------------------------------------------------------
# Endpoints
# -----------------------------------------------------------------------------
@router.get("/model-info")
async def get_model_info():
    """Returns telemetry and configuration about the active inspection model."""
    model = get_inspection_model()
    return {
        "status": "online",
        "model_info": model.get_info()
    }


@router.post("/classify", response_model=ClassifyResponse)
async def classify_product(
    request: Request,
    file: Optional[UploadFile] = File(None)
):
    """
    Executes defect inspection on an uploaded product image.
    Supports both Multipart Form-data (file upload) and JSON payload with Base64.
    """
    content_type = request.headers.get("content-type", "").lower()
    image_bytes = None

    if "application/json" in content_type:
        try:
            body = await request.json()
            raw_b64 = body.get("image_base64") or body.get("image")
            if raw_b64:
                image_bytes = _decode_base64_image(raw_b64)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON request body: {e}")
    else:
        if file is not None and file.filename:
            image_bytes = await file.read()
        else:
            try:
                form = await request.form()
                form_file = form.get("file")
                if form_file and hasattr(form_file, "read"):
                    image_bytes = await form_file.read()
                elif "image_base64" in form or "image" in form:
                    raw_b64 = form.get("image_base64") or form.get("image")
                    image_bytes = _decode_base64_image(str(raw_b64))
            except Exception:
                pass

    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No image provided. Send a multipart file ('file') or JSON body with 'image_base64'."
        )

    model = get_inspection_model()
    try:
        result = model.predict(image_bytes)
        meta = result.get("metadata", {})
        result["defect_type"] = meta.get("defect_type", "none" if not result.get("is_defective") else "defect")
        result["boxes"] = meta.get("detections", [])
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inference execution failed: {str(e)}"
        )


@router.post("/save")
async def save_inspection(
    request: Request,
    authorization: Optional[str] = Header(None, alias="Authorization"),
    file: Optional[UploadFile] = File(None),
    prediction: Optional[str] = Form(None),
    is_defective: Optional[bool] = Form(None),
    confidence: Optional[float] = Form(None),
    is_placeholder: Optional[bool] = Form(None),
    metadata: Optional[str] = Form(None),
    supabase_service: SupabaseService = Depends(get_supabase_service)
):
    """
    Saves an inspection record and uploads the inspection image to private Supabase Storage.
    Supports both Multipart Form-data (file upload) and JSON payload with Base64.
    
    1. Verifies user JWT with Supabase Auth (GET /auth/v1/user)
    2. Uploads image to private bucket 'inspection-images' using server SUPABASE_SERVICE_ROLE_KEY
    3. If classification fields are omitted, automatically runs inference via active model
    4. Records entry in 'inspections' table
    5. Returns saved record including signed image preview URL
    """
    # 1. Verify User Authentication
    user = await supabase_service.verify_user_token(authorization or "")
    user_id = user["id"]

    content_type_header = request.headers.get("content-type", "").lower()
    image_bytes = None
    filename = "inspection.jpg"
    parsed_metadata = {}

    if "application/json" in content_type_header:
        try:
            body = await request.json()
            raw_b64 = body.get("image_base64") or body.get("image")
            if raw_b64:
                image_bytes = _decode_base64_image(raw_b64)
            filename = body.get("filename", "inspection.jpg")
            prediction = body.get("prediction", prediction)
            is_defective = body.get("is_defective", is_defective)
            confidence = body.get("confidence", confidence)
            is_placeholder = body.get("is_placeholder", is_placeholder)
            raw_meta = body.get("metadata", {})
            if isinstance(raw_meta, dict):
                parsed_metadata = raw_meta
            elif isinstance(raw_meta, str):
                try:
                    parsed_metadata = json.loads(raw_meta)
                except Exception:
                    parsed_metadata = {"raw_notes": raw_meta}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON request body: {e}")
    else:
        if file is not None and file.filename:
            image_bytes = await file.read()
            filename = file.filename
        else:
            try:
                form = await request.form()
                form_file = form.get("file")
                if form_file and hasattr(form_file, "read"):
                    image_bytes = await form_file.read()
                    filename = getattr(form_file, "filename", "inspection.jpg")
            except Exception:
                pass

        if metadata:
            try:
                parsed_metadata = json.loads(metadata)
            except Exception:
                parsed_metadata = {"raw_notes": metadata}

    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image file is required for save inspection (field 'file' or JSON 'image_base64')."
        )

    # 3. Automatic inference if classification results were not supplied
    model = get_inspection_model()
    if prediction is None or confidence is None or is_defective is None:
        infer_result = model.predict(image_bytes)
        prediction = infer_result["prediction"]
        is_defective = infer_result["is_defective"]
        confidence = infer_result["confidence"]
        is_placeholder = infer_result["is_placeholder"]
        parsed_metadata.update(infer_result.get("metadata", {}))

    # 4. Upload to Private Supabase Storage bucket
    upload_content_type = "image/png" if filename.lower().endswith(".png") else "image/jpeg"
    storage_path = await supabase_service.upload_image(
        image_bytes=image_bytes,
        filename=filename,
        content_type=upload_content_type,
        user_id=user_id
    )

    # 5. Insert record into PostgREST 'inspections' table
    record_payload = {
        "user_id": user_id,
        "image_path": storage_path,
        "prediction": prediction,
        "is_defective": bool(is_defective),
        "confidence": float(confidence),
        "is_placeholder": bool(is_placeholder if is_placeholder is not None else False),
        "metadata": parsed_metadata
    }

    saved_record = await supabase_service.save_inspection(record_payload)

    # 6. Generate signed URL for immediate client preview
    signed_url = await supabase_service.create_signed_url(storage_path)
    saved_record["image_url"] = signed_url

    return {
        "success": True,
        "message": "Inspection record saved successfully",
        "data": saved_record,
        "record": saved_record
    }


@router.post("/save-json")
async def save_inspection_json(
    payload: SaveInspectionJsonRequest,
    authorization: Optional[str] = Header(None, alias="Authorization"),
    supabase_service: SupabaseService = Depends(get_supabase_service)
):
    """
    Alternative JSON endpoint for saving inspection records with base64 images.
    """
    user = await supabase_service.verify_user_token(authorization or "")
    user_id = user["id"]

    image_bytes = _decode_base64_image(payload.image_base64)
    model = get_inspection_model()

    prediction = payload.prediction
    is_defective = payload.is_defective
    confidence = payload.confidence
    is_placeholder = payload.is_placeholder
    metadata = payload.metadata or {}

    if prediction is None or confidence is None or is_defective is None:
        infer_result = model.predict(image_bytes)
        prediction = infer_result["prediction"]
        is_defective = infer_result["is_defective"]
        confidence = infer_result["confidence"]
        is_placeholder = infer_result["is_placeholder"]
        metadata.update(infer_result.get("metadata", {}))

    storage_path = await supabase_service.upload_image(
        image_bytes=image_bytes,
        filename=payload.filename or "inspection.jpg",
        content_type="image/jpeg",
        user_id=user_id
    )

    record_payload = {
        "user_id": user_id,
        "image_path": storage_path,
        "prediction": prediction,
        "is_defective": bool(is_defective),
        "confidence": float(confidence),
        "is_placeholder": bool(is_placeholder if is_placeholder is not None else False),
        "metadata": metadata
    }

    saved_record = await supabase_service.save_inspection(record_payload)
    signed_url = await supabase_service.create_signed_url(storage_path)
    saved_record["image_url"] = signed_url

    return {
        "success": True,
        "message": "Inspection record saved successfully via JSON",
        "data": saved_record,
        "record": saved_record
    }


@router.get("/history", response_model=HistoryResponse)
async def get_inspection_history(
    authorization: Optional[str] = Header(None, alias="Authorization"),
    search: Optional[str] = Query(None, description="Search filter for prediction or defect type"),
    page: int = Query(1, ge=1, description="Page number starting at 1"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    is_defective: Optional[bool] = Query(None, description="Filter by defective state"),
    supabase_service: SupabaseService = Depends(get_supabase_service)
):
    """
    Lists the authenticated user's past inspection audits.
    Enforces server-side user isolation, search filtering, pagination,
    and returns temporary signed URLs for all private inspection images.
    """
    user = await supabase_service.verify_user_token(authorization or "")
    user_id = user["id"]

    records, total_count = await supabase_service.get_history(
        user_id=user_id,
        search=search,
        is_defective=is_defective,
        page=page,
        limit=limit
    )

    offset = (page - 1) * limit
    has_more = (offset + len(records)) < total_count

    return {
        "items": records,
        "total": total_count,
        "page": page,
        "limit": limit,
        "has_more": has_more
    }
