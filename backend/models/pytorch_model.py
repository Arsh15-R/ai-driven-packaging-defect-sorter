"""
=============================================================================
Project: AI-Driven Packaging Line Defect Sorter
Module: backend/models/pytorch_model.py
Purpose: PyTorch and YOLOv8 inspection model implementation.
         Supports YOLOv8 weights (.pt / .onnx / .engine) and PyTorch models
         with CUDA acceleration and standardized defect output.
=============================================================================
"""

import os
import time
import io
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple
import cv2
import numpy as np
from PIL import Image

from .base import BaseInspectionModel

# Known defect class labels for packaging line
DEFECT_CLASSES = {"dent", "label_missing", "seal_broken", "wrong_print", "defect", "defective"}


class PyTorchInspectionModel(BaseInspectionModel):
    """
    Production-ready PyTorch / YOLOv8 inspection model.
    Loads trained weights (e.g. models/best.pt) and executes defect detection.
    Pre-processing and inference are strictly isolated from UI and database layers.
    """

    def __init__(
        self,
        weights_path: Optional[str] = None,
        confidence_threshold: float = 0.45,
        device: str = "auto"
    ):
        self.weights_path = weights_path
        self.confidence_threshold = confidence_threshold
        self.requested_device = device
        self.device = "cpu"
        self.device_name = "CPU"
        self.model = None
        self.model_type = "uninitialized"
        self.is_loaded = False
        self.class_names: Dict[int, str] = {}
        self.load_error: Optional[str] = None

        self._initialize_model()

    def _resolve_device(self) -> str:
        """Determines whether CUDA or CPU should be used."""
        try:
            import torch
            if self.requested_device == "cpu":
                return "cpu"
            if torch.cuda.is_available():
                self.device_name = torch.cuda.get_device_name(0)
                return "cuda:0"
        except Exception:
            pass
        self.device_name = "CPU"
        return "cpu"

    def _initialize_model(self):
        """Loads model weights from disk."""
        if not self.weights_path:
            self.load_error = "No model weights path provided"
            return

        target_path = Path(self.weights_path)
        if not target_path.exists():
            self.load_error = f"Model weights not found at path: {target_path.resolve()}"
            return

        try:
            import torch
            self.device = self._resolve_device()

            # Check if Ultralytics YOLO is available and file is YOLO weights (.pt)
            try:
                from ultralytics import YOLO
                print(f"[PyTorchInspectionModel] Loading YOLO model from {target_path} on {self.device}...")
                self.model = YOLO(str(target_path))
                if self.device.startswith("cuda"):
                    self.model.to(0)
                self.model_type = "Ultralytics-YOLOv8"
                self.class_names = self.model.names if hasattr(self.model, "names") else {}
                self.is_loaded = True
                print(f"[PyTorchInspectionModel] Successfully loaded YOLO model on {self.device_name}")
                return
            except Exception as yolo_err:
                print(f"[PyTorchInspectionModel] YOLO loader notice: {yolo_err}. Trying TorchScript/Torch...")

            # Fallback to TorchScript / PyTorch module
            try:
                print(f"[PyTorchInspectionModel] Loading TorchScript model from {target_path}...")
                self.model = torch.jit.load(str(target_path), map_location=self.device)
                self.model.eval()
                self.model_type = "PyTorch-TorchScript"
                self.is_loaded = True
                return
            except Exception:
                pass

            # Fallback to standard torch.load
            model_obj = torch.load(str(target_path), map_location=self.device)
            if hasattr(model_obj, "eval"):
                model_obj.eval()
                self.model = model_obj
                self.model_type = "PyTorch-Module"
                self.is_loaded = True
            else:
                self.load_error = f"Loaded object from {target_path} is not an executable nn.Module"

        except Exception as e:
            self.load_error = f"Failed to load weights from {target_path}: {e}"
            print(f"[PyTorchInspectionModel ERROR] {self.load_error}")

    def get_info(self) -> Dict[str, Any]:
        """Returns model architecture, loading status, and device metadata."""
        return {
            "model_name": "PyTorchInspectionModel",
            "model_type": self.model_type,
            "is_loaded": self.is_loaded,
            "weights_path": str(self.weights_path) if self.weights_path else None,
            "device": self.device,
            "device_name": self.device_name,
            "confidence_threshold": self.confidence_threshold,
            "is_placeholder": False,
            "class_names": self.class_names,
            "load_error": self.load_error
        }

    def _preprocess(self, image_bytes: bytes) -> np.ndarray:
        """
        Isolated preprocessing: decodes raw bytes into standard BGR/RGB image array.
        """
        if not image_bytes:
            raise ValueError("Empty image bytes received for PyTorch preprocessing")

        np_arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if img is None:
            pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

        return img

    def predict(self, image_bytes: bytes) -> Dict[str, Any]:
        """
        Runs model inference on raw image bytes.
        Returns standardized dictionary conforming to BaseInspectionModel.
        """
        start_time = time.perf_counter()

        # If model is not loaded, raise descriptive error
        if not self.is_loaded or self.model is None:
            raise RuntimeError(
                f"PyTorch model is not loaded. Reason: {self.load_error or 'Weights file unavailable'}. "
                "Ensure weights exist or configure MODEL_TYPE=placeholder for demo mode."
            )

        # 1. Preprocess
        img = self._preprocess(image_bytes)
        h, w = img.shape[:2]

        # 2. Run Inference
        detected_boxes: List[Dict[str, Any]] = []
        is_defective = False
        highest_conf = 0.0
        primary_defect_type = "none"

        if self.model_type == "Ultralytics-YOLOv8":
            results = self.model.predict(
                source=img,
                conf=self.confidence_threshold,
                verbose=False,
                device=0 if self.device.startswith("cuda") else "cpu"
            )[0]

            for box in results.boxes:
                cls_id = int(box.cls[0])
                conf = float(box.conf[0])
                label = self.class_names.get(cls_id, str(cls_id)).lower()
                x1, y1, x2, y2 = map(int, box.xyxy[0])

                detected_boxes.append({
                    "class_id": cls_id,
                    "class_name": label,
                    "confidence": round(conf, 4),
                    "bbox": [x1, y1, x2, y2]
                })

                if label in DEFECT_CLASSES:
                    is_defective = True
                    if conf > highest_conf:
                        highest_conf = conf
                        primary_defect_type = label
                elif label == "good" and not is_defective:
                    if conf > highest_conf:
                        highest_conf = conf

            if not detected_boxes:
                # No box detected above threshold -> default to Non-defective
                is_defective = False
                highest_conf = 0.88
                primary_defect_type = "none"
            elif not is_defective:
                # Detections were present, but all were "good"
                is_defective = False
                primary_defect_type = "none"
                if highest_conf == 0.0:
                    highest_conf = 0.95

        else:
            # Generic PyTorch model inference path (TorchScript / Module)
            import torch
            rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            resized = cv2.resize(rgb, (224, 224)).astype(np.float32) / 255.0
            tensor = torch.from_numpy(resized).permute(2, 0, 1).unsqueeze(0).to(self.device)

            with torch.no_grad():
                outputs = self.model(tensor)
                probs = torch.softmax(outputs, dim=1).cpu().numpy()[0]
                pred_idx = int(np.argmax(probs))
                highest_conf = float(probs[pred_idx])

                # Convention: index 0 = Good/Non-defective, index > 0 = Defective
                is_defective = (pred_idx > 0)
                primary_defect_type = f"class_{pred_idx}" if is_defective else "none"

        elapsed_ms = (time.perf_counter() - start_time) * 1000.0

        result = {
            "prediction": "Defective" if is_defective else "Non-defective",
            "is_defective": is_defective,
            "confidence": max(0.0, min(1.0, round(highest_conf, 4))),
            "is_placeholder": False,
            "metadata": {
                "model_name": "PyTorchInspectionModel",
                "model_type": self.model_type,
                "weights_path": str(self.weights_path),
                "device": self.device,
                "device_name": self.device_name,
                "defect_type": primary_defect_type,
                "detections": detected_boxes,
                "detection_count": len(detected_boxes),
                "image_resolution": f"{w}x{h}",
                "inference_time_ms": round(elapsed_ms, 2)
            }
        }

        return self.validate_result(result)
