"""
=============================================================================
Project: AI-Driven Packaging Line Defect Sorter (SORTEX PRO)
Script: sortex_pro_pipeline.py
Purpose: Complete Production Pipeline with:
         1. Non-freezing camera acquisition (with graceful exit on disconnect)
         2. Clear warning & mode isolation if COCO fallback is used
         3. YOLOv9 + ByteTrack persistent multi-object tracking (unique ID)
         4. Virtual Optical Gate Line: EXACTLY ONE decision per package ID
         5. reject_package() with marked Arduino hardware plug-in point
         6. High-contrast filled badge labels matching professional visualizer
         7. Accurate Dual Telemetry: Camera FPS vs. GPU Inference Latency
=============================================================================
"""

import sys
import time
import csv
import argparse
from pathlib import Path
from datetime import datetime

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import cv2
import numpy as np
import torch
from ultralytics import YOLO

# Vibrant Color Palette (BGR format) for packaging classes
COLORS = {
    "good":          (0, 220, 0),       # Bright Green
    "dent":          (0, 0, 255),       # Bright Red
    "label_missing": (0, 140, 255),     # Orange
    "missing_label": (0, 140, 255),     # Orange alias
    "seal_broken":   (255, 0, 255),     # Magenta
    "broken_seal":   (255, 0, 255),     # Magenta alias
    "wrong_print":   (0, 255, 255),     # Yellow
}
DEFAULT_COLOR = (240, 240, 240)

DEFECT_CLASSES = {"dent", "label_missing", "missing_label", "seal_broken", "broken_seal", "wrong_print"}


# =============================================================================
# PART C: VIRTUAL PUSHER & REJECT MECHANISM
# =============================================================================
class PusherController:
    """
    Manages package diversion simulation with clean plug-in point for physical Arduino.
    """
    def __init__(self, serial_port: str = None, baudrate: int = 9600):
        self.arduino = None
        self.active_pushes = []  # Tracks on-screen virtual pusher animations

        if serial_port:
            try:
                import serial
                self.arduino = serial.Serial(serial_port, baudrate, timeout=1)
                time.sleep(2)
                print(f"[HARDWARE] Connected to physical Arduino on {serial_port}")
            except Exception as e:
                print(f"[WARN] Could not connect to Arduino on {serial_port}: {e}. Running in VIRTUAL mode.")
                self.arduino = None
        else:
            print("[INFO] Hardware Mode: VIRTUAL SIMULATION (No Arduino connected).")

    def reject_package(self, package_id: str, defect: str, confidence: float, crop_frame: np.ndarray, log_csv_path: Path, img_dir: Path):
        """
        Executes package rejection:
        1. Logs to CSV audit file
        2. Saves high-res crop snapshot to disk
        3. Animates virtual pusher HUD
        4. Transmits serial byte to physical Arduino (if connected)
        """
        ts_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        file_ts = datetime.now().strftime("%Y%m%d_%H%M%S")

        # 1. Save Defect Snapshot Image
        img_filename = f"{file_ts}_{package_id}_{defect}.jpg"
        img_path = img_dir / img_filename
        if crop_frame is not None and crop_frame.size > 0:
            cv2.imwrite(str(img_path), crop_frame)

        # 2. Append Audit Log Row
        try:
            with open(log_csv_path, "a", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow([ts_str, package_id, "DEFECTIVE", defect, f"{confidence:.2f}", f"logs/defect_images/{img_filename}"])
        except Exception as e:
            print(f"[WARN] Failed writing CSV log: {e}")

        # 3. Virtual Pusher Animation Trigger
        self.active_pushes.append({
            "id": package_id,
            "defect": defect,
            "start_time": time.time(),
            "duration": 1.2  # On-screen animation display duration in seconds
        })

        # =====================================================================
        # >>> HARDWARE PLUG-IN POINT <<<
        # When your physical Arduino/servo pusher is built, this sends the signal:
        # =====================================================================
        if self.arduino and self.arduino.is_open:
            try:
                self.arduino.write(b"R\n")  # 'R' = Reject command
                print(f"[SERIAL -> ARDUINO] Sent 'R' reject command for {package_id}")
            except Exception as e:
                print(f"[SERIAL ERROR] Failed writing to Arduino: {e}")
        else:
            print(f"🤖 [VIRTUAL PUSHER EXTENDED] Package {package_id} DIVERTED! Defect: {defect.upper()} ({confidence*100:.1f}%)")

    def log_good_package(self, package_id: str, confidence: float, log_csv_path: Path):
        """Logs nominal passed package."""
        ts_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        try:
            with open(log_csv_path, "a", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow([ts_str, package_id, "GOOD", "none", f"{confidence:.2f}", ""])
        except Exception as e:
            print(f"[WARN] Failed writing CSV log: {e}")

        print(f"✅ [NOMINAL PASSED] Package {package_id} Passed Downstream ({confidence*100:.1f}%)")


# =============================================================================
# VISUAL RENDERING: SOLID FILLED BADGES (MATCHING UPLOADED IMAGE)
# =============================================================================
def draw_styled_box(frame, x1, y1, x2, y2, label_text, color, thickness=2):
    h_frame, w_frame = frame.shape[:2]

    # Outer Bounding Rectangle
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, thickness)

    # Compute text size
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.55
    text_thickness = 2
    (text_w, text_h), baseline = cv2.getTextSize(label_text, font, font_scale, text_thickness)

    tag_pad = 4
    tag_h = text_h + tag_pad * 2 + baseline
    tag_w = text_w + tag_pad * 2

    # Flip tag inside box if it exceeds the top edge of the frame
    if y1 - tag_h >= 0:
        tag_y1 = y1 - tag_h
        tag_y2 = y1
        text_y = y1 - tag_pad - baseline // 2
    else:
        tag_y1 = y1
        tag_y2 = y1 + tag_h
        text_y = y1 + tag_h - tag_pad - baseline // 2

    tag_x1 = x1
    tag_x2 = min(x1 + tag_w, w_frame - 1)

    # Solid filled label background
    cv2.rectangle(frame, (tag_x1, tag_y1), (tag_x2, tag_y2), color, -1)

    # Text contrast: black on bright, white on dark
    luminance = 0.299 * color[2] + 0.587 * color[1] + 0.114 * color[0]
    text_color = (0, 0, 0) if luminance > 128 else (255, 255, 255)

    cv2.putText(
        frame,
        label_text,
        (tag_x1 + tag_pad, text_y),
        font,
        font_scale,
        text_color,
        text_thickness,
        cv2.LINE_AA
    )


# =============================================================================
# MAIN TRACKING & INSPECTION PIPELINE
# =============================================================================
def main():
    parser = argparse.ArgumentParser(description="SORTEX PRO: Complete Inspection Pipeline")
    parser.add_argument("--source", type=str, default="0", help="Webcam index (0) or path to video file (.mp4)")
    parser.add_argument("--model", type=str, default="models/best.pt", help="Path to trained YOLOv9 weights")
    parser.add_argument("--conf", type=float, default=0.50, help="Confidence threshold (default: 0.50)")
    parser.add_argument("--gate", type=float, default=0.55, help="Virtual gate line Y position (0.2 to 0.8, default: 0.55)")
    parser.add_argument("--port", type=str, default=None, help="Arduino serial COM port (optional)")
    args = parser.parse_args()

    # Setup directories and CSV log
    csv_path = PROJECT_ROOT / "logs" / "defect_log.csv"
    img_dir = PROJECT_ROOT / "logs" / "defect_images"
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    img_dir.mkdir(parents=True, exist_ok=True)

    if not csv_path.exists():
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(["Timestamp", "Item_ID", "Decision", "Defect_Type", "Confidence", "Image_Path"])

    # 1. Device Selection (RTX 3050 CUDA)
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"

    # 2. Load Model with Fix #2: Warn explicitly if falling back to COCO
    model_path = Path(args.model)
    is_custom_model = True
    if not model_path.exists():
        print("\n" + "!" * 75)
        print(" [WARNING] models/best.pt not found! Falling back to pretrained yolov9s.pt.")
        print(" Note: Pretrained COCO weights detect general objects (car, person, bottle),")
        print(" NOT packaging defects. Train models/best.pt for real inspection!")
        print("!" * 75 + "\n")
        model_path = PROJECT_ROOT / "yolov9s.pt"
        is_custom_model = False

    print(f"[INFO] Loading YOLOv9 model: {model_path} on {device} ({gpu_name})")
    model = YOLO(str(model_path))
    model.to(device)

    # 3. Open Video Source with Fix #1: Windows CAP_DSHOW and disconnect protection
    source_val = int(args.source) if args.source.isdigit() else args.source
    is_live_cam = isinstance(source_val, int)

    if is_live_cam:
        cap = cv2.VideoCapture(source_val, cv2.CAP_DSHOW)
        if not cap.isOpened():
            cap = cv2.VideoCapture(source_val)
    else:
        video_p = Path(source_val)
        if not video_p.exists():
            print(f"[ERROR] Video file not found: {video_p}")
            sys.exit(1)
        cap = cv2.VideoCapture(str(video_p))

    if not cap.isOpened():
        print(f"[ERROR] Could not open camera/source '{args.source}'!")
        print(" -> Verify camera privacy settings and ensure no other application is locking it.")
        sys.exit(1)

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    # Initialize Pusher Controller
    pusher = PusherController(serial_port=args.port)

    # Tracking & Gate States
    previous_centers = {}   # track_id -> (cx, cy)
    inspected_packages = {} # track_id -> {"decision": "GOOD"|"DEFECTIVE", "defect": str, "conf": float}

    # Production Counters
    total_inspected = 0
    good_count = 0
    defect_count = 0
    defect_breakdown = {"dent": 0, "missing_label": 0, "broken_seal": 0, "wrong_print": 0}

    conf_threshold = args.conf
    prev_time = time.time()
    camera_fps = 30.0
    infer_ms = 10.0

    print("\n" + "=" * 65)
    print("   SORTEX PRO - PACKAGING DEFECT SORTER PIPELINE")
    print("=" * 65)
    print(" Controls:")
    print("   [ESC / Q] : Exit Pipeline")
    print("   [T]       : Test Pusher Simulation")
    print("   [R]       : Reset Production Counters")
    print("   [+] / [-] : Adjust Confidence Threshold")
    print("=" * 65 + "\n")

    while True:
        # Fix #1: Graceful camera failure handling (never hangs on cap.read() error)
        ok, frame = cap.read()
        if not ok or frame is None:
            if not is_live_cam:
                # Video file: loop seamlessly
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                continue
            else:
                # Check for exit key during camera drop
                key = cv2.waitKey(20) & 0xFF
                if key in [27, ord("q"), ord("Q")]:
                    print("[INFO] Exit signal received during camera wait.")
                    break
                time.sleep(0.05)
                continue

        h, w = frame.shape[:2]
        gate_y = int(h * args.gate)

        # FPS & Inference Latency Tracking
        now = time.time()
        dt = max(now - prev_time, 0.001)
        prev_time = now
        camera_fps = 0.9 * camera_fps + 0.1 * (1.0 / dt)

        # ---------------------------------------------------------------------
        # PART B: REAL-TIME INFERENCE WITH BYTETRACK OBJECT TRACKING
        # ---------------------------------------------------------------------
        t0 = time.time()
        results = model.track(
            source=frame,
            conf=conf_threshold,
            persist=True,
            tracker="bytetrack.yaml",
            device=device,
            verbose=False
        )[0]
        infer_ms = 0.9 * infer_ms + 0.1 * ((time.time() - t0) * 1000.0)

        current_active_ids = set()

        if results.boxes is not None and results.boxes.id is not None:
            boxes = results.boxes.xyxy.cpu().numpy().astype(int)
            track_ids = results.boxes.id.cpu().numpy().astype(int)
            confidences = results.boxes.conf.cpu().numpy()
            class_ids = results.boxes.cls.cpu().numpy().astype(int)

            for box, track_id, conf, cls_id in zip(boxes, track_ids, confidences, class_ids):
                current_active_ids.add(track_id)
                x1, y1, x2, y2 = box
                cx = (x1 + x2) // 2
                cy = (y1 + y2) // 2

                raw_name = model.names.get(cls_id, str(cls_id)).lower()
                is_defect = (raw_name in DEFECT_CLASSES) if is_custom_model else (raw_name != "bottle")

                # Normalize alias names
                defect_label = raw_name.replace("label_missing", "missing_label").replace("seal_broken", "broken_seal")

                # -------------------------------------------------------------
                # VIRTUAL GATE LINE: EXACTLY ONE DECISION PER TRACK ID
                # -------------------------------------------------------------
                if track_id in previous_centers:
                    prev_cx, prev_cy = previous_centers[track_id]
                    # Check if center point crossed the gate line downwards
                    crossed_gate = (prev_cy < gate_y <= cy) or (prev_cy <= gate_y < cy)

                    if crossed_gate and (track_id not in inspected_packages):
                        total_inspected += 1
                        package_id = f"PKG-{track_id:04d}"

                        # Extract high-res cropped snapshot for defect archive
                        pad = 20
                        cx1, cy1 = max(0, x1 - pad), max(0, y1 - pad)
                        cx2, cy2 = min(w, x2 + pad), min(h, y2 + pad)
                        crop_img = frame[cy1:cy2, cx1:cx2].copy()

                        if is_defect:
                            defect_count += 1
                            if defect_label in defect_breakdown:
                                defect_breakdown[defect_label] += 1
                            else:
                                defect_breakdown["dent"] += 1

                            inspected_packages[track_id] = {
                                "decision": "DEFECTIVE",
                                "defect": defect_label,
                                "conf": float(conf)
                            }
                            # Trigger Virtual Pusher & Logging
                            pusher.reject_package(package_id, defect_label, float(conf), crop_img, csv_path, img_dir)
                        else:
                            good_count += 1
                            inspected_packages[track_id] = {
                                "decision": "GOOD",
                                "defect": "none",
                                "conf": float(conf)
                            }
                            pusher.log_good_package(package_id, float(conf), csv_path)

                previous_centers[track_id] = (cx, cy)

                # Determine Label Text & Color based on Inspection State
                if track_id in inspected_packages:
                    dec = inspected_packages[track_id]["decision"]
                    if dec == "DEFECTIVE":
                        badge_color = (0, 0, 255)
                        badge_text = f"PKG #{track_id:04d} [DIVERTED]"
                    else:
                        badge_color = (0, 220, 0)
                        badge_text = f"PKG #{track_id:04d} [PASSED]"
                else:
                    # In transit towards gate
                    badge_color = COLORS.get(raw_name, DEFAULT_COLOR)
                    badge_text = f"ID #{track_id:04d} {raw_name.upper()} {conf:.2f}"

                draw_styled_box(frame, x1, y1, x2, y2, badge_text, badge_color, thickness=2)
                cv2.circle(frame, (cx, cy), 4, (255, 255, 255), -1)

        # Clean expired track history
        for old_id in list(previous_centers.keys()):
            if old_id not in current_active_ids:
                del previous_centers[old_id]

        # ---------------------------------------------------------------------
        # DRAW VIRTUAL OPTICAL GATE LINE
        # ---------------------------------------------------------------------
        gate_color = (235, 99, 37)  # Amber / Cobalt
        cv2.line(frame, (0, gate_y), (w, gate_y), gate_color, 2)
        cv2.putText(frame, "[ OPTICAL INSPECTION GATE - DECISION LINE ]", (20, gate_y - 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, gate_color, 2, cv2.LINE_AA)

        # ---------------------------------------------------------------------
        # TOP TELEMETRY HUD BAR
        # ---------------------------------------------------------------------
        cv2.rectangle(frame, (0, 0), (w, 60), (16, 20, 28), -1)
        cv2.line(frame, (0, 60), (w, 60), (60, 70, 90), 1)

        pass_rate = ((good_count / max(total_inspected, 1)) * 100.0) if total_inspected > 0 else 100.0
        hud_l1 = f"SORTEX PRO | Inspected: {total_inspected}  |  Passed: {good_count}  |  Rejected: {defect_count}  |  Pass Rate: {pass_rate:.1f}%"
        cv2.putText(frame, hud_l1, (18, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.62, (255, 255, 255), 2, cv2.LINE_AA)

        # Realistic FPS & Inference Latency Display
        hw_tag = f"GPU: {gpu_name} (Infer: {infer_ms:.1f}ms ~{1000/max(infer_ms,1):.0f} FPS) | Camera: {camera_fps:.1f} FPS"
        cv2.putText(frame, hw_tag, (18, 48), cv2.FONT_HERSHEY_SIMPLEX, 0.44, (0, 255, 140) if "cuda" in device else (180, 180, 180), 1, cv2.LINE_AA)

        # Model Fallback Warning Banner
        if not is_custom_model:
            cv2.rectangle(frame, (w - 380, 10), (w - 15, 50), (0, 0, 180), -1)
            cv2.putText(frame, "DEMO MODE: COCO WEIGHTS", (w - 365, 36), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)

        # ---------------------------------------------------------------------
        # VIRTUAL PUSHER ANIMATION OVERLAY (BOTTOM-RIGHT POPUP)
        # ---------------------------------------------------------------------
        curr_time = time.time()
        active_pushes = [p for p in pusher.active_pushes if curr_time - p["start_time"] < p["duration"]]
        pusher.active_pushes = active_pushes

        if len(active_pushes) > 0:
            latest_push = active_pushes[-1]
            # Flash border and status
            cv2.rectangle(frame, (w - 360, h - 85), (w - 15, h - 15), (0, 0, 200), -1)
            cv2.rectangle(frame, (w - 360, h - 85), (w - 15, h - 15), (255, 255, 255), 2)
            cv2.putText(frame, f"DIVERTED: {latest_push['id']}", (w - 345, h - 55),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)
            cv2.putText(frame, f"REASON: {latest_push['defect'].upper()}", (w - 345, h - 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.50, (0, 255, 255), 2)

        cv2.imshow("SORTEX PRO - AI Packaging Line Defect Sorter", frame)

        # ---------------------------------------------------------------------
        # KEYBOARD CONTROLS
        # ---------------------------------------------------------------------
        key = cv2.waitKey(1) & 0xFF
        if key in [27, ord("q"), ord("Q")]:
            break
        elif key in [ord("t"), ord("T")]:
            print("[TEST PUSHER] Manual override triggered.")
            pusher.reject_package("PKG-TEST", "manual_test", 1.0, None, csv_path, img_dir)
        elif key in [ord("r"), ord("R")]:
            total_inspected = 0
            good_count = 0
            defect_count = 0
            defect_breakdown = {d: 0 for d in defect_breakdown}
            inspected_packages.clear()
            previous_centers.clear()
            print("[INFO] Counters reset to 0.")
        elif key in [ord("+"), ord("=")]:
            conf_threshold = min(0.95, conf_threshold + 0.05)
            print(f"[INFO] Confidence threshold: {conf_threshold:.2f}")
        elif key in [ord("-"), ord("_")]:
            conf_threshold = max(0.10, conf_threshold - 0.05)
            print(f"[INFO] Confidence threshold: {conf_threshold:.2f}")

    cap.release()
    cv2.destroyAllWindows()
    if pusher.arduino:
        pusher.arduino.close()
    print("[INFO] Pipeline shut down cleanly.")


if __name__ == "__main__":
    main()
