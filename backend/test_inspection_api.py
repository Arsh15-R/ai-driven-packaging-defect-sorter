"""
=============================================================================
Project: AI-Driven Packaging Line Defect Sorter
Script: backend/test_inspection_api.py
Purpose: Comprehensive end-to-end unit and integration tests for FastAPI
         endpoints, model architectures, and Supabase service integration.
=============================================================================
"""

import io
import sys
from pathlib import Path

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import base64
import unittest
import numpy as np
import cv2
from fastapi.testclient import TestClient

from backend.inspection_api import app
from backend.models import (
    PlaceholderInspectionModel,
    PyTorchInspectionModel,
    get_inspection_model,
    reset_inspection_model
)
from backend.services.supabase_service import get_supabase_service


class TestInspectionSystem(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        
        # Generate synthetic test JPEG image
        test_img = np.zeros((480, 640, 3), dtype=np.uint8)
        # Add sample shapes
        cv2.circle(test_img, (320, 240), 100, (255, 255, 255), -1)
        cv2.putText(test_img, "TEST PKG", (200, 240), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 255), 2)
        _, buf = cv2.imencode(".jpg", test_img)
        cls.test_jpeg_bytes = buf.tobytes()
        cls.test_b64 = base64.b64encode(cls.test_jpeg_bytes).decode("utf-8")
        cls.test_auth_header = {"Authorization": "Bearer demo-token"}

    def test_01_placeholder_model(self):
        """Verify PlaceholderInspectionModel satisfies BaseInspectionModel contract."""
        model = PlaceholderInspectionModel()
        result = model.predict(self.test_jpeg_bytes)
        
        self.assertIn("prediction", result)
        self.assertIn(result["prediction"], ["Defective", "Non-defective"])
        self.assertIsInstance(result["is_defective"], bool)
        self.assertIsInstance(result["confidence"], float)
        self.assertTrue(0.0 <= result["confidence"] <= 1.0)
        self.assertTrue(result["is_placeholder"])
        self.assertIn("metadata", result)
        self.assertIn("heuristics", result["metadata"])

    def test_02_pytorch_model_skeleton(self):
        """Verify PyTorchInspectionModel loads weights or handles missing weights gracefully."""
        model = PyTorchInspectionModel(weights_path="models/best.pt")
        # In our workspace, models/best.pt exists
        self.assertTrue(model.is_loaded)
        result = model.predict(self.test_jpeg_bytes)
        self.assertIn("prediction", result)
        self.assertFalse(result["is_placeholder"])
        self.assertEqual(result["metadata"]["model_name"], "PyTorchInspectionModel")

    def test_03_endpoint_health_and_model_info(self):
        """Verify /api/health and /api/inspect/model-info."""
        resp = self.client.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "ok")

        resp_info = self.client.get("/api/inspect/model-info")
        self.assertEqual(resp_info.status_code, 200)
        info = resp_info.json()
        self.assertIn("model_info", info)

    def test_04_classify_multipart(self):
        """Verify POST /api/inspect/classify with multipart file upload."""
        files = {
            "file": ("sample.jpg", self.test_jpeg_bytes, "image/jpeg")
        }
        resp = self.client.post("/api/inspect/classify", files=files)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("prediction", data)
        self.assertIn("confidence", data)
        self.assertIn("is_placeholder", data)
        self.assertIn("is_defective", data)

    def test_05_classify_base64_json(self):
        """Verify POST /api/inspect/classify with JSON base64 body."""
        payload = {"image_base64": f"data:image/jpeg;base64,{self.test_b64}"}
        resp = self.client.post("/api/inspect/classify", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("prediction", data)
        self.assertIn("confidence", data)

    def test_06_classify_missing_image_400(self):
        """Verify POST /api/inspect/classify returns 400 when no image is provided."""
        resp = self.client.post("/api/inspect/classify")
        self.assertEqual(resp.status_code, 400)

    def test_07_save_inspection_multipart(self):
        """Verify POST /api/inspect/save with JWT token and image upload."""
        files = {
            "file": ("carton_01.jpg", self.test_jpeg_bytes, "image/jpeg")
        }
        data = {
            "prediction": "Defective",
            "is_defective": "true",
            "confidence": "0.94",
            "is_placeholder": "true",
            "metadata": '{"defect_type": "dent", "severity": "medium"}'
        }
        resp = self.client.post(
            "/api/inspect/save",
            headers=self.test_auth_header,
            files=files,
            data=data
        )
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertTrue(body["success"])
        saved = body["data"]
        self.assertEqual(saved["prediction"], "Defective")
        self.assertTrue(saved["is_defective"])
        self.assertIn("image_path", saved)
        self.assertIn("image_url", saved)

    def test_08_save_inspection_missing_auth_401(self):
        """Verify POST /api/inspect/save returns 401 when Authorization header is omitted."""
        files = {
            "file": ("carton_02.jpg", self.test_jpeg_bytes, "image/jpeg")
        }
        resp = self.client.post("/api/inspect/save", files=files)
        self.assertEqual(resp.status_code, 401)

    def test_09_save_inspection_json(self):
        """Verify POST /api/inspect/save-json with base64 and auto-inference."""
        payload = {
            "image_base64": self.test_b64,
            "filename": "json_inspect.jpg",
            "metadata": {"line_id": "L-01"}
        }
        resp = self.client.post(
            "/api/inspect/save-json",
            headers=self.test_auth_header,
            json=payload
        )
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertTrue(body["success"])
        saved = body["data"]
        self.assertIn("id", saved)
        self.assertIn("image_url", saved)

    def test_10_history_pagination_and_search(self):
        """Verify GET /api/inspect/history lists records with signed URLs and pagination."""
        resp = self.client.get(
            "/api/inspect/history?page=1&limit=10",
            headers=self.test_auth_header
        )
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertIn("items", body)
        self.assertIn("total", body)
        self.assertIn("has_more", body)
        self.assertGreaterEqual(body["total"], 2)
        
        # Verify first item contains image_url
        first_item = body["items"][0]
        self.assertIn("image_url", first_item)
        self.assertTrue(len(first_item["image_url"]) > 0)

        # Test search filter
        resp_search = self.client.get(
            "/api/inspect/history?search=Defective",
            headers=self.test_auth_header
        )
        self.assertEqual(resp_search.status_code, 200)
        self.assertGreaterEqual(resp_search.json()["total"], 1)


if __name__ == "__main__":
    unittest.main()
