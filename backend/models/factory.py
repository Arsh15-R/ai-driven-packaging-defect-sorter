"""
=============================================================================
Project: AI-Driven Packaging Line Defect Sorter
Module: backend/models/factory.py
Purpose: Model factory and lifecycle management. Dynamically instantiates
         either PyTorchInspectionModel or PlaceholderInspectionModel based
         on configuration and weight availability.
=============================================================================
"""

import os
from pathlib import Path
from typing import Optional

from ..config import settings
from .base import BaseInspectionModel
from .placeholder import PlaceholderInspectionModel
from .pytorch_model import PyTorchInspectionModel

_MODEL_INSTANCE: Optional[BaseInspectionModel] = None


def create_inspection_model(
    model_type: Optional[str] = None,
    weights_path: Optional[str] = None
) -> BaseInspectionModel:
    """
    Factory function to instantiate an inspection model.

    Args:
        model_type: "auto", "placeholder", or "pytorch" (defaults to settings.MODEL_TYPE)
        weights_path: Path to model weights (defaults to settings.MODEL_WEIGHTS_PATH)

    Returns:
        Instance of BaseInspectionModel
    """
    selected_type = (model_type or settings.MODEL_TYPE).strip().lower()
    selected_weights = weights_path or settings.MODEL_WEIGHTS_PATH

    # Resolve relative weights path against project root if needed
    if selected_weights:
        resolved = Path(selected_weights)
        if not resolved.is_absolute():
            resolved = settings.PROJECT_ROOT / resolved
        selected_weights = str(resolved)

    print(f"[ModelFactory] Creating inspection model. Requested type: '{selected_type}'")

    if selected_type == "placeholder":
        print("[ModelFactory] Using PlaceholderInspectionModel (demo mode)")
        return PlaceholderInspectionModel()

    if selected_type == "pytorch":
        print(f"[ModelFactory] Initializing PyTorchInspectionModel from weights: {selected_weights}")
        model = PyTorchInspectionModel(
            weights_path=selected_weights,
            confidence_threshold=settings.CONFIDENCE_THRESHOLD,
            device=settings.DEVICE
        )
        if not model.is_loaded:
            print(f"[ModelFactory WARNING] PyTorch weights could not be loaded: {model.load_error}")
        return model

    # "auto" mode: attempt PyTorch/YOLO first if weights exist, else fallback to Placeholder
    if selected_weights and Path(selected_weights).exists():
        print(f"[ModelFactory Auto] Found model weights at '{selected_weights}'. Attempting PyTorch/YOLO load...")
        try:
            pytorch_model = PyTorchInspectionModel(
                weights_path=selected_weights,
                confidence_threshold=settings.CONFIDENCE_THRESHOLD,
                device=settings.DEVICE
            )
            if pytorch_model.is_loaded:
                print("[ModelFactory Auto] Successfully loaded PyTorch inspection model.")
                return pytorch_model
            else:
                print(f"[ModelFactory Auto] PyTorch load failed ({pytorch_model.load_error}). Falling back to Placeholder.")
        except Exception as e:
            print(f"[ModelFactory Auto] Error during PyTorch load: {e}. Falling back to Placeholder.")
    else:
        print(f"[ModelFactory Auto] No weights file found at '{selected_weights}'. Initializing Placeholder Inspection Model.")

    return PlaceholderInspectionModel()


def get_inspection_model(force_reload: bool = False) -> BaseInspectionModel:
    """
    Returns the cached singleton model instance, initializing it if necessary.
    Thread-safe initialization.
    """
    global _MODEL_INSTANCE
    if _MODEL_INSTANCE is None or force_reload:
        _MODEL_INSTANCE = create_inspection_model()
    return _MODEL_INSTANCE


def reset_inspection_model(model_instance: Optional[BaseInspectionModel] = None):
    """Overrides the global model instance (useful for unit testing)."""
    global _MODEL_INSTANCE
    _MODEL_INSTANCE = model_instance
