"""
=============================================================================
Project: AI-Driven Packaging Line Defect Sorter
Module: backend/models/placeholder.py
Purpose: Realistic, clearly-marked placeholder inspection model using
         optical image heuristics (brightness, contrast, edge gradients).
=============================================================================
"""

import time
import io
import hashlib
from typing import Dict, Any, Tuple
import cv2
import numpy as np
from PIL import Image

from .base import BaseInspectionModel


class PlaceholderInspectionModel(BaseInspectionModel):
    """
    Demonstration model that inspects input images using real computer vision
    heuristics (luminance, Laplacian variance, quadrant uniformity) to produce
    reproducible, realistic defect classifications while clearly flagging
    `is_placeholder: True`.
    """

    KNOWN_DEFECT_TYPES = ["dent", "label_missing", "seal_broken", "wrong_print"]

    def __init__(self, demo_name: str = "Demo Heuristic Inspection Engine"):
        self.demo_name = demo_name
        self.version = "1.0.0-demo"

    def get_info(self) -> Dict[str, Any]:
        return {
            "model_name": self.demo_name,
            "architecture": "HeuristicOpticalAnalyzer",
            "version": self.version,
            "is_placeholder": True,
            "status": "active_demo",
            "supported_classes": ["Non-defective", "dent", "label_missing", "seal_broken", "wrong_print"]
        }

    def _decode_image(self, image_bytes: bytes) -> Tuple[np.ndarray, int, int]:
        """
        Decodes raw bytes into an OpenCV BGR numpy array.
        Falls back to PIL if OpenCV decoding fails.
        """
        if not image_bytes:
            raise ValueError("Empty image bytes received for inspection")

        # Try OpenCV decoding
        np_arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if img is None:
            # Fallback to PIL
            try:
                pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
                img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
            except Exception as e:
                raise ValueError(f"Could not decode image bytes: {e}")

        h, w = img.shape[:2]
        return img, w, h

    def predict(self, image_bytes: bytes) -> Dict[str, Any]:
        """
        Inspects the image using optical metrics and returns a standardized result.
        """
        start_time = time.perf_counter()

        try:
            img, width, height = self._decode_image(image_bytes)
        except Exception as decode_err:
            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            return self.validate_result({
                "prediction": "Defective",
                "is_defective": True,
                "confidence": 0.99,
                "is_placeholder": True,
                "metadata": {
                    "model_name": self.demo_name,
                    "error": str(decode_err),
                    "defect_type": "corrupted_image",
                    "inference_time_ms": round(elapsed_ms, 2),
                    "notice": "DEMO PLACEHOLDER: Image could not be decoded."
                }
            })

        # Convert to grayscale for optical measurements
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        mean_brightness = float(np.mean(gray))
        std_contrast = float(np.std(gray))
        laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())

        # Quadrant analysis for localized anomalies
        mid_y, mid_x = height // 2, width // 2
        q1 = np.mean(gray[:mid_y, :mid_x])
        q2 = np.mean(gray[:mid_y, mid_x:])
        q3 = np.mean(gray[mid_y:, :mid_x])
        q4 = np.mean(gray[mid_y:, mid_x:])
        quadrant_std = float(np.std([q1, q2, q3, q4]))

        # Deterministic hash of image content for reproducible demo behavior
        img_hash = hashlib.md5(image_bytes[:4096]).hexdigest()
        hash_val = int(img_hash[:6], 16)

        # Defect heuristic decision tree:
        # 1. Very low sharpness / blur or uniform blank -> label_missing
        # 2. High quadrant disparity -> dent or seal_broken
        # 3. Extreme brightness/contrast anomaly -> wrong_print
        # 4. Controlled pseudo-hash toggle for realistic demo distribution (~30% defects)
        is_defective = False
        defect_type = "none"
        confidence = 0.92

        if laplacian_var < 15.0 or std_contrast < 12.0:
            is_defective = True
            defect_type = "label_missing"
            confidence = min(0.97, 0.85 + (15.0 - max(0.0, laplacian_var)) * 0.008)
        elif quadrant_std > 45.0:
            is_defective = True
            defect_type = "dent" if (hash_val % 2 == 0) else "seal_broken"
            confidence = min(0.96, 0.84 + (quadrant_std / 100.0) * 0.1)
        elif mean_brightness < 30.0 or mean_brightness > 235.0:
            is_defective = True
            defect_type = "wrong_print"
            confidence = 0.91
        else:
            # Deterministic simulation based on image hash
            # 35% defective, 65% good to mirror standard quality control inspection lines
            if (hash_val % 100) < 35:
                is_defective = True
                defect_idx = (hash_val // 100) % len(self.KNOWN_DEFECT_TYPES)
                defect_type = self.KNOWN_DEFECT_TYPES[defect_idx]
                confidence = 0.85 + float((hash_val % 14) / 100.0)
            else:
                is_defective = False
                defect_type = "none"
                confidence = 0.90 + float((hash_val % 10) / 100.0)

        confidence = max(0.65, min(0.99, round(confidence, 4)))
        elapsed_ms = (time.perf_counter() - start_time) * 1000.0

        result_dict = {
            "prediction": "Defective" if is_defective else "Non-defective",
            "is_defective": is_defective,
            "confidence": confidence,
            "is_placeholder": True,
            "metadata": {
                "model_name": self.demo_name,
                "model_version": self.version,
                "defect_type": defect_type,
                "inference_time_ms": round(elapsed_ms, 2),
                "heuristics": {
                    "image_dimensions": f"{width}x{height}",
                    "mean_brightness": round(mean_brightness, 2),
                    "contrast_std": round(std_contrast, 2),
                    "laplacian_variance": round(laplacian_var, 2),
                    "quadrant_std": round(quadrant_std, 2)
                },
                "notice": (
                    "DEMO MODE: Results are simulated using visual heuristics. "
                    "Configure MODEL_TYPE=pytorch or provide weights for production inference."
                )
            }
        }

        return self.validate_result(result_dict)
