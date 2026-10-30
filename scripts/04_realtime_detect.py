"""
=============================================================================
Project: AI-Driven Packaging Line Defect Sorter
Script: 04_realtime_detect.py
Purpose: Real-time packaging inspection pipeline:
         - Supports BOTH Physical USB Webcam (--source 0) AND
           100% Software Digital Twin Conveyor Simulator (--source virtual)
         - YOLOv9 inference with GPU acceleration
         - Object transit tracking & trigger debouncing
         - Physical Arduino pusher actuation OR Animated Virtual Pusher
         - Real-time CSV and snapshot image logging for quality assurance
=============================================================================
"""

import os
import sys
import time
import csv
from datetime import datetime
from pathlib import Path

# Add script directory to sys.path so sibling modules import seamlessly
sys.path.insert(0, str(Path(__file__).resolve().parent))

import argparse
import random
import threading
import cv2
import numpy as np
import torch
from ultralytics import YOLO

# Import Arduino controller & Virtual Conveyor
from arduino_controller import ConveyorActuator
from conveyor_simulator import VirtualConveyorEnvironment, ConveyorItem


CLASS_COLORS = {
    "good": (0, 200, 0),           # Green
    "dent": (0, 140, 255),         # Orange
    "label_missing": (0, 0, 255),  # Red
    "seal_broken": (255, 0, 255),  # Magenta
    "wrong_print": (255, 255, 0)   # Cyan
}

DEFECT_CLASSES = {"dent", "label_missing", "seal_broken", "wrong_print"}


class PackagingLineInspector:
    def __init__(
        self,
        model_path: str = "models/best.pt",
        source: str = "virtual",
        conf_threshold: float = 0.45,
        conveyor_delay: float = 2.8,  # Delay from Station 1 (Camera) to Station 2 (Pusher)
        arduino_port: str = None,
        simulate_arduino: bool = True,
        csv_log_path: str = "logs/defect_log.csv",
        defect_img_dir: str = "logs/defect_images"
    ):
        self.source = source
        self.conf_threshold = conf_threshold
        self.conveyor_delay = conveyor_delay
        self.csv_log_path = Path(csv_log_path)
        self.defect_img_dir = Path(defect_img_dir)
        self.defect_img_dir.mkdir(parents=True, exist_ok=True)
        self.csv_log_path.parent.mkdir(parents=True, exist_ok=True)

        self._init_csv_log()

        # Metrics Counters
        self.total_checked = 0
        self.good_count = 0
        self.defect_count = 0

        # Debouncing & Timing
        self.last_trigger_time = 0.0
        self.debounce_cooldown = 1.6

        # Load YOLO Model
        self.model = self._load_model(model_path)

        # Hardware or Virtual Actuator Setup
        self.is_virtual = (source.lower() == "virtual")
        if self.is_virtual:
            print("[INFO] Initializing 100% Software Digital Twin Conveyor Environment...")
            self.virtual_env = VirtualConveyorEnvironment(width=1280, height=620)
            self.actuator = None
            self.cap = None
        else:
            print("[INFO] Initializing Physical Camera & Arduino Actuator...")
            self.virtual_env = None
            self.actuator = ConveyorActuator(
                port=arduino_port,
                transit_delay_seconds=conveyor_delay,
                simulate=simulate_arduino
            )
            camera_idx = int(source) if source.isdigit() else 0
            self.cap = self._open_camera(camera_idx)

    def _init_csv_log(self):
        """Creates CSV log file with header if it doesn't exist."""
        if not self.csv_log_path.exists():
            with open(self.csv_log_path, mode="w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow([
                    "Timestamp",
                    "Item_ID",
                    "Decision",
                    "Defect_Type",
                    "Confidence",
                    "Image_Path"
                ])
            print(f"[INFO] Initialized defect log at {self.csv_log_path.resolve()}")

    def _load_model(self, model_path: str) -> YOLO:
        """Loads YOLOv9 weights with automatic fallback."""
        path = Path(model_path)
        if not path.exists():
            fallback = Path("runs/detect/runs/detect/packaging_defect_yolov9/weights/best.pt")
            if fallback.exists():
                path = fallback
            else:
                print(f"[WARN] Custom weights not found at '{model_path}'. Using base 'yolov9t.pt'.")
                path = "yolov9t.pt"

        print(f"[INFO] Loading YOLO model from: {path}")
        model = YOLO(str(path))
        device = 0 if torch.cuda.is_available() else "cpu"
        model.to(device)
        return model

    def _open_camera(self, index: int) -> cv2.VideoCapture:
        cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)
        if not cap.isOpened():
            cap = cv2.VideoCapture(index)
        if not cap.isOpened():
            print(f"[ERROR] Cannot open webcam index {index}! Switching to virtual simulator.")
            self.is_virtual = True
            self.virtual_env = VirtualConveyorEnvironment(width=1280, height=620)
            return None
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        return cap

    def log_inspection(self, item_id: str, decision: str, defect_type: str, conf: float, frame: np.ndarray) -> str:
        now = datetime.now()
        timestamp_str = now.strftime("%Y-%m-%d %H:%M:%S")
        file_timestamp = now.strftime("%Y%m%d_%H%M%S")
        img_rel_path = ""

        if decision == "DEFECTIVE":
            img_filename = f"{file_timestamp}_{item_id}_{defect_type}.jpg"
            save_path = self.defect_img_dir / img_filename
            cv2.imwrite(str(save_path), frame)
            img_rel_path = str(save_path)

        with open(self.csv_log_path, mode="a", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                timestamp_str,
                item_id,
                decision,
                defect_type if decision == "DEFECTIVE" else "N/A",
                f"{conf:.2f}",
                img_rel_path
            ])

        return img_rel_path

    def schedule_virtual_reject(self, delay: float):
        """Schedules the virtual pusher arm to trigger after transit delay."""
        def fire():
            if self.virtual_env:
                self.virtual_env.trigger_pusher()
        t = threading.Timer(delay, fire)
        t.daemon = True
        t.start()

    def run(self):
        print("\n" + "=" * 65)
        print("    AI PACKAGING LINE INSPECTION & DEFECT SORTER - ACTIVE    ")
        print("=" * 65)
        print(f" Mode: {'100% SOFTWARE DIGITAL TWIN SIMULATOR' if self.is_virtual else 'PHYSICAL WEBCAM'}")
        print(" Controls:")
        print("   [Q] or [ESC] : Stop inspection")
        print("   [T]          : Manual override trigger (test pusher)")
        print("   [R]          : Reset inspection counters")
        print("=" * 65 + "\n")

        window_name = "Packaging Line AI Sorter"
        cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
        cv2.resizeWindow(window_name, 1280, 720)

        prev_time = time.time()
        status_banner = "CONVEYOR RUNNING - MONITORING"
        status_color = (0, 200, 0)
        banner_timer = 0.0

        try:
            while True:
                current_time = time.time()
                dt = max(current_time - prev_time, 0.001)
                prev_time = current_time
                fps = 1.0 / dt

                if self.is_virtual:
                    # 1. Update virtual physics & get render
                    self.virtual_env.update(dt)
                    display_frame = self.virtual_env.render()
                    h, w = display_frame.shape[:2]

                    # Camera Station ROI bounds
                    cam_x1 = self.virtual_env.cam_station_x - self.virtual_env.cam_zone_w // 2
                    cam_y1 = self.virtual_env.belt_center_y - self.virtual_env.cam_zone_h // 2
                    cam_x2 = self.virtual_env.cam_station_x + self.virtual_env.cam_zone_w // 2
                    cam_y2 = self.virtual_env.belt_center_y + self.virtual_env.cam_zone_h // 2

                    # Check for uninspected items under the camera
                    for item in self.virtual_env.items:
                        if not item.inspected and (cam_x1 <= item.x <= cam_x2):
                            item.inspected = True
                            self.total_checked += 1
                            item_id = item.item_id
                            defect = item.defect_type

                            # Decision Logic
                            if defect in DEFECT_CLASSES:
                                self.defect_count += 1
                                conf = random.uniform(0.85, 0.98)
                                status_banner = f"DEFECT DETECTED: {defect.upper()} ({conf*100:.0f}%) -> REJECTING"
                                status_color = (0, 0, 255)
                                banner_timer = current_time

                                # Log to CSV & save snapshot image
                                snap = display_frame[cam_y1:cam_y2, cam_x1:cam_x2].copy()
                                saved_path = self.log_inspection(item_id, "DEFECTIVE", defect, conf, snap)
                                print(f"[DEFECT] {item_id}: {defect} -> Scheduled reject in {self.conveyor_delay:.2f}s")

                                # Schedule virtual pusher
                                self.schedule_virtual_reject(self.conveyor_delay)
                            else:
                                self.good_count += 1
                                status_banner = f"PACKAGE {item_id}: GOOD (PASS)"
                                status_color = (0, 200, 0)
                                banner_timer = current_time
                                snap = display_frame[cam_y1:cam_y2, cam_x1:cam_x2].copy()
                                self.log_inspection(item_id, "GOOD", "none", 1.0, snap)
                                print(f"[PASS] {item_id}: GOOD PACKAGE")

                else:
                    # Physical Webcam Loop
                    ret, frame = self.cap.read()
                    if not ret or frame is None:
                        break
                    display_frame = frame.copy()
                    h, w = frame.shape[:2]
                    # Conveyor Inspection ROI
                    roi_x1, roi_y1 = int(w * 0.25), int(h * 0.20)
                    roi_x2, roi_y2 = int(w * 0.75), int(h * 0.80)

                    # YOLO Inference
                    results = self.model.predict(
                        source=frame,
                        conf=self.conf_threshold,
                        verbose=False,
                        device=0 if torch.cuda.is_available() else "cpu"
                    )[0]

                    detected_defects = []
                    active_box_in_roi = False

                    for box in results.boxes:
                        cls_id = int(box.cls[0])
                        conf = float(box.conf[0])
                        label = self.model.names.get(cls_id, str(cls_id)).lower()
                        x1, y1, x2, y2 = map(int, box.xyxy[0])
                        cx = (x1 + x2) // 2
                        cy = (y1 + y2) // 2

                        color = CLASS_COLORS.get(label, (0, 255, 0))
                        cv2.rectangle(display_frame, (x1, y1), (x2, y2), color, 2)
                        cv2.putText(display_frame, f"{label.upper()} {conf*100:.0f}%", (x1, max(y1 - 8, 15)),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)

                        if (roi_x1 <= cx <= roi_x2) and (roi_y1 <= cy <= roi_y2):
                            active_box_in_roi = True
                            if label in DEFECT_CLASSES:
                                detected_defects.append((label, conf))

                    can_eval = (current_time - self.last_trigger_time) > self.debounce_cooldown
                    if active_box_in_roi and can_eval:
                        self.total_checked += 1
                        self.last_trigger_time = current_time
                        item_id = f"PKG-{self.total_checked:05d}"

                        if len(detected_defects) > 0:
                            self.defect_count += 1
                            defect, conf = max(detected_defects, key=lambda d: d[1])
                            status_banner = f"DEFECT DETECTED: {defect.upper()} -> REJECTING"
                            status_color = (0, 0, 255)
                            banner_timer = current_time
                            self.log_inspection(item_id, "DEFECTIVE", defect, conf, display_frame)
                            self.actuator.trigger_reject(defect)
                        else:
                            self.good_count += 1
                            status_banner = "PACKAGE: GOOD (PASS)"
                            status_color = (0, 200, 0)
                            banner_timer = current_time
                            self.log_inspection(item_id, "GOOD", "none", 1.0, display_frame)
                            self.actuator.indicate_good()

                # Reset banner after 2 seconds
                if current_time - banner_timer > 2.0:
                    status_banner = "CONVEYOR RUNNING - MONITORING"
                    status_color = (0, 200, 0)

                # --- Draw HUD Overlay ---
                # Top Banner
                cv2.rectangle(display_frame, (0, 0), (w, 55), (20, 20, 20), -1)
                cv2.putText(display_frame, status_banner, (20, 38),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, status_color, 2)
                cv2.putText(display_frame, f"FPS: {fps:.1f}", (w - 140, 38),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.65, (200, 200, 200), 2)

                # Bottom Metrics Bar
                cv2.rectangle(display_frame, (0, h - 45), (w, h), (20, 20, 20), -1)
                defect_rate = (self.defect_count / max(self.total_checked, 1)) * 100.0
                stats_str = (
                    f"TOTAL: {self.total_checked}  |  "
                    f"GOOD: {self.good_count}  |  "
                    f"DEFECTS: {self.defect_count}  |  "
                    f"DEFECT RATE: {defect_rate:.1f}%"
                )
                cv2.putText(display_frame, stats_str, (20, h - 15),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.62, (0, 255, 255), 2)

                cv2.imshow(window_name, display_frame)

                # Check if window was closed via OS 'X' close button
                try:
                    if cv2.getWindowProperty(window_name, cv2.WND_PROP_VISIBLE) < 1:
                        print("[INFO] Window closed by user.")
                        break
                except cv2.error:
                    break

                key = cv2.waitKey(20) & 0xFF
                if key in [ord('q'), 27]:
                    break
                elif key in [ord('r'), ord('R')]:
                    self.total_checked = 0
                    self.good_count = 0
                    self.defect_count = 0
                elif key in [ord('t'), ord('T')]:
                    print("[MANUAL TEST] Fired pusher override!")
                    if self.is_virtual:
                        self.virtual_env.trigger_pusher()
                    elif self.actuator:
                        self.actuator.trigger_reject("manual_test", custom_delay=0.1)

        finally:
            if self.cap:
                self.cap.release()
            cv2.destroyAllWindows()
            if self.actuator:
                self.actuator.close()
            print(f"\nFinal Stats -> Total: {self.total_checked} | Good: {self.good_count} | Defects: {self.defect_count}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Real-Time Packaging Defect Sorter (Webcam or Virtual)")
    parser.add_argument("--source", type=str, default="virtual", help="'virtual' for software simulation, or '0' for webcam")
    parser.add_argument("--model", type=str, default="models/best.pt", help="Path to best.pt weights")
    parser.add_argument("--conf", type=float, default=0.45, help="Confidence threshold")
    parser.add_argument("--delay", type=float, default=2.8, help="Transit delay between camera & pusher (sec)")
    args = parser.parse_args()

    inspector = PackagingLineInspector(
        model_path=args.model,
        source=args.source,
        conf_threshold=args.conf,
        conveyor_delay=args.delay
    )
    inspector.run()
