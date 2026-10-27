"""
=============================================================================
Project: AI-Driven Packaging Line Defect Sorter
Module: backend/models/__init__.py
Purpose: Public exports for modular inspection model architecture.
=============================================================================
"""

from .base import BaseInspectionModel, InspectionResult
from .placeholder import PlaceholderInspectionModel
from .pytorch_model import PyTorchInspectionModel
from .factory import create_inspection_model, get_inspection_model, reset_inspection_model

__all__ = [
    "BaseInspectionModel",
    "InspectionResult",
    "PlaceholderInspectionModel",
    "PyTorchInspectionModel",
    "create_inspection_model",
    "get_inspection_model",
    "reset_inspection_model",
]
