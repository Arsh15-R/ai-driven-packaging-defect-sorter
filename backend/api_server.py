"""
=============================================================================
Project: AI-Driven Packaging Line Defect Sorter
Script: api_server.py (FastAPI Backend for React + Arc UI Frontend)
Purpose: Provides high-performance REST endpoints, live MJPEG conveyor
         video streaming, real-time metrics, audit logs, and pusher controls.
=============================================================================
"""

import os
import sys
import time
import csv
import threading
from pathlib import Path
from typing import Optional

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))
sys.path.insert(0, str(PROJECT_ROOT))

import cv2
import numpy as np
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

# Import Conveyor Components
from conveyor_simulator import VirtualConveyorEnvironment
from arduino_controller import ConveyorActuator

app = FastAPI(title="AI Packaging Line Defect Sorter API", version="2.0.0")

# Enable CORS for Vite dev server (localhost:3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CSV_LOG_PATH = PROJECT_ROOT / "logs" / "defect_log.csv"
DEFECT_IMG_DIR = PROJECT_ROOT / "logs" / "defect_images"
DEFECT_IMG_DIR.mkdir(parents=True, exist_ok=True)
CSV_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)


def _init_csv_log():
    """Ensures CSV audit log has valid headers if file is newly created."""
    if not CSV_LOG_PATH.exists():
        try:
            with open(CSV_LOG_PATH, "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(["Timestamp", "Item_ID", "Decision", "Defect_Type", "Confidence", "Image_Path"])
        except Exception as e:
            print(f"[WARN] Failed to initialize CSV log: {e}")


_init_csv_log()

# Mount static files for defect images
app.mount("/logs/defect_images", StaticFiles(directory=str(DEFECT_IMG_DIR)), name="defect_images")


class SystemState:
    def __init__(self):
        self.lock = threading.Lock()
        self.total_checked = 0
        self.good_count = 0
        self.defect_count = 0
        self.source = "virtual"  # "virtual" or "0"
        self.conf_threshold = 0.45
        self.conveyor_delay = 2.8
        self.fps = 30.0
        self.status = "ONLINE"
        self.last_defect = None
        self.last_frame: Optional[np.ndarray] = None
        self.defect_breakdown = {"dent": 0, "label_missing": 0, "seal_broken": 0, "wrong_print": 0}

        # Digital Twin Simulator
        self.virtual_env = VirtualConveyorEnvironment(width=1280, height=600)
        self.actuator: Optional[ConveyorActuator] = None

        # Parse existing CSV stats on startup before starting thread
        self._load_existing_stats()

        # Background stream thread
        self.is_running = True
        self.thread = threading.Thread(target=self._stream_loop, daemon=True)
        self.thread.start()

    def _load_existing_stats(self):
        if CSV_LOG_PATH.exists():
            try:
                with open(CSV_LOG_PATH, "r", encoding="utf-8") as f:
                    reader = csv.DictReader(f)
                    for r in reader:
                        self.total_checked += 1
                        dec = (r.get("Decision") or "").upper()
                        if dec == "DEFECTIVE":
                            self.defect_count += 1
                            dtype = (r.get("Defect_Type") or "").lower()
                            if dtype in self.defect_breakdown:
                                self.defect_breakdown[dtype] += 1
                        elif dec == "GOOD":
                            self.good_count += 1
            except Exception as e:
                print(f"[WARN] Failed to load existing stats: {e}")

    def _stream_loop(self):
        """Continuously updates conveyor physics and generates inspection frames."""
        prev_time = time.time()
        while self.is_running:
            now = time.time()
            dt = max(now - prev_time, 0.001)
            prev_time = now
            self.fps = 1.0 / dt

            with self.lock:
                # Update virtual conveyor
                self.virtual_env.update(dt)
                rendered = self.virtual_env.render()

                # Camera station coordinates
                cam_x1 = self.virtual_env.cam_station_x - self.virtual_env.cam_zone_w // 2
                cam_x2 = self.virtual_env.cam_station_x + self.virtual_env.cam_zone_w // 2
                cam_y1 = self.virtual_env.belt_center_y - self.virtual_env.cam_zone_h // 2
                cam_y2 = self.virtual_env.belt_center_y + self.virtual_env.cam_zone_h // 2

                # Detect items in camera station
                for item in self.virtual_env.items:
                    if not item.inspected and (cam_x1 <= item.x <= cam_x2):
                        item.inspected = True
                        self.total_checked += 1
                        item_id = item.item_id
                        defect = item.defect_type

                        crop = rendered[cam_y1:cam_y2, cam_x1:cam_x2].copy()
                        ts_str = time.strftime("%Y-%m-%d %H:%M:%S")
                        file_ts = time.strftime("%Y%m%d_%H%M%S")

                        if defect in ["dent", "label_missing", "seal_broken", "wrong_print"]:
                            self.defect_count += 1
                            if defect in self.defect_breakdown:
                                self.defect_breakdown[defect] += 1
                            conf = float(np.random.uniform(0.86, 0.98))
                            self.last_defect = {"id": item_id, "type": defect, "conf": conf, "time": ts_str}

                            img_filename = f"{file_ts}_{item_id}_{defect}.jpg"
                            img_path = DEFECT_IMG_DIR / img_filename

                            # Draw annotation
                            ch, cw = crop.shape[:2]
                            cv2.rectangle(crop, (cw // 4, ch // 5), (3 * cw // 4, 4 * ch // 5), (0, 0, 255), 2)
                            cv2.putText(crop, f"{defect.upper()} {conf*100:.0f}%", (cw // 4, ch // 5 - 8),
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
                            cv2.imwrite(str(img_path), crop)

                            # Schedule pusher (both virtual and hardware actuator if connected)
                            threading.Timer(self.conveyor_delay, self.virtual_env.trigger_pusher).start()
                            if self.actuator:
                                self.actuator.trigger_reject(defect, custom_delay=self.conveyor_delay)

                            # Append to CSV
                            try:
                                with open(CSV_LOG_PATH, "a", newline="", encoding="utf-8") as f:
                                    csv.writer(f).writerow([ts_str, item_id, "DEFECTIVE", defect, f"{conf:.2f}", f"logs/defect_images/{img_filename}"])
                            except Exception as e:
                                print(f"[WARN] Failed writing defect log: {e}")
                        else:
                            self.good_count += 1
                            if self.actuator:
                                self.actuator.indicate_good()
                            try:
                                with open(CSV_LOG_PATH, "a", newline="", encoding="utf-8") as f:
                                    csv.writer(f).writerow([ts_str, item_id, "GOOD", "none", "1.00", ""])
                            except Exception as e:
                                print(f"[WARN] Failed writing good log: {e}")

                self.last_frame = rendered

            time.sleep(0.028)  # ~35 FPS loop

    def get_jpeg(self) -> bytes:
        with self.lock:
            if self.last_frame is None:
                dummy = np.zeros((600, 1280, 3), dtype=np.uint8)
                cv2.putText(dummy, "INITIALIZING CONVEYOR...", (400, 300), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
                _, buffer = cv2.imencode(".jpg", dummy)
                return buffer.tobytes()
            _, buffer = cv2.imencode(".jpg", self.last_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            return buffer.tobytes()


system_state = SystemState()


# --- Pydantic Request Models ---
class SettingsPayload(BaseModel):
    conf_threshold: Optional[float] = None
    conveyor_delay: Optional[float] = None
    source: Optional[str] = None


@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "packaging-sorter-api", "timestamp": time.time()}


@app.get("/api/stats")
def get_stats():
    with system_state.lock:
        total = system_state.total_checked
        good = system_state.good_count
        defect = system_state.defect_count
        defect_rate = (defect / max(total, 1)) * 100.0
        fps = system_state.fps
        status = system_state.status
        source = system_state.source
        conf_threshold = system_state.conf_threshold
        conveyor_delay = system_state.conveyor_delay
        last_defect = dict(system_state.last_defect) if system_state.last_defect else None
        breakdown = dict(system_state.defect_breakdown)

    return {
        "total_checked": total,
        "good_count": good,
        "defect_count": defect,
        "defect_rate": round(defect_rate, 2),
        "fps": round(fps, 1),
        "status": status,
        "source": source,
        "conf_threshold": conf_threshold,
        "conveyor_delay": conveyor_delay,
        "last_defect": last_defect,
        "defect_breakdown": breakdown
    }


@app.get("/api/logs")
def get_logs(limit: int = 50):
    entries = []
    if CSV_LOG_PATH.exists():
        try:
            with open(CSV_LOG_PATH, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for r in reader:
                    img_p = r.get("Image_Path", "")
                    # Format web-accessible URL
                    if img_p:
                        filename = Path(img_p).name
                        web_url = f"/logs/defect_images/{filename}"
                    else:
                        web_url = None

                    try:
                        conf_val = float(r.get("Confidence") or 1.0)
                    except (ValueError, TypeError):
                        conf_val = 1.0

                    entries.append({
                        "timestamp": r.get("Timestamp", ""),
                        "item_id": r.get("Item_ID", ""),
                        "decision": r.get("Decision", ""),
                        "defect_type": r.get("Defect_Type", ""),
                        "confidence": conf_val,
                        "image_url": web_url
                    })
        except Exception as e:
            print(f"[ERROR] Failed reading CSV: {e}")

    # Return latest first
    return entries[::-1][:limit]


@app.get("/logs/defect_log.csv")
def download_defect_log():
    """Serves the defect log CSV file directly for audit compliance."""
    if CSV_LOG_PATH.exists():
        return FileResponse(
            path=str(CSV_LOG_PATH),
            media_type="text/csv",
            filename="defect_log.csv"
        )
    return Response(
        content="Timestamp,Item_ID,Decision,Defect_Type,Confidence,Image_Path\n",
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=defect_log.csv"}
    )


@app.post("/api/control/test-pusher")
def test_pusher():
    """Manual override command to test the reject pusher arm."""
    system_state.virtual_env.trigger_pusher()
    if system_state.actuator:
        system_state.actuator.trigger_reject("manual_test", custom_delay=0.1)
    return {"success": True, "message": "Pusher actuated successfully"}


@app.post("/api/control/reset")
def reset_counters():
    """Resets session counters."""
    with system_state.lock:
        system_state.total_checked = 0
        system_state.good_count = 0
        system_state.defect_count = 0
        system_state.defect_breakdown = {"dent": 0, "label_missing": 0, "seal_broken": 0, "wrong_print": 0}
        system_state.last_defect = None
    return {"success": True, "message": "Counters reset to 0"}


@app.post("/api/control/settings")
def update_settings(payload: SettingsPayload):
    with system_state.lock:
        if payload.conf_threshold is not None:
            system_state.conf_threshold = payload.conf_threshold
        if payload.conveyor_delay is not None:
            system_state.conveyor_delay = payload.conveyor_delay
        if payload.source is not None:
            system_state.source = payload.source
    return {"success": True, "settings": {
        "conf_threshold": system_state.conf_threshold,
        "conveyor_delay": system_state.conveyor_delay,
        "source": system_state.source
    }}


def generate_mjpeg_stream():
    """Generates multipart MJPEG stream for real-time video display."""
    try:
        while system_state.is_running:
            frame_bytes = system_state.get_jpeg()
            yield (b"--frame\r\n"
                   b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n")
            time.sleep(0.033)  # ~30 FPS
    except (GeneratorExit, ConnectionResetError, BrokenPipeError, Exception):
        pass


@app.get("/api/stream")
def video_feed():
    """Live Video Stream endpoint (embedded via <img src='/api/stream' />)."""
    return StreamingResponse(
        generate_mjpeg_stream(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


# Serve built React frontend if frontend/dist exists
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")


def start_server():
    print("\n" + "=" * 65)
    print("   AI PACKAGING DEFECT SORTER - FASTAPI BACKEND SERVER   ")
    print("=" * 65)
    print(" API Base URL   : http://127.0.0.1:8000")
    print(" Live Stream    : http://127.0.0.1:8000/api/stream")
    print(" Swagger Docs   : http://127.0.0.1:8000/docs")
    print("=" * 65 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")


if __name__ == "__main__":
    start_server()
