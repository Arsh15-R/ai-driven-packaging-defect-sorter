"""
=============================================================================
Project: SORTEX PRO - AI-Driven Packaging Line Defect Sorter
Script: gate_detector.py (Complete End-to-End Production Pipeline)
Features:
  1. Auto-discover camera feed with OpenCV CAP_DSHOW (handles busy/permission errors)
  2. YOLOv8s neural inference with custom trained weights (best.pt)
  3. ByteTrack multi-object tracking (unique ID per package)
  4. Virtual optical gate line (decides every package EXACTLY ONCE)
  5. Arduino serial reject mechanism with transit delay scheduling
  6. Real-time telemetry dashboard & metrics HUD
  7. Defect archive (high-res crop snapshot + CSV audit trail)
  8. Interactive "Test Pusher" ('t') and "Reset" ('r') controls
  9. Video simulation mode (--source sample_conveyor.mp4)
 10. Hardware auto-fallback if Arduino or Camera is unplugged
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
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))
sys.path.insert(0, str(PROJECT_ROOT))

import cv2
import numpy as np
import torch
from ultralytics import YOLO

# Hardware interface
from arduino_controller import ConveyorActuator

# Defect class taxonomy
DEFECT_CLASSES = {"dent", "missing_label", "label_missing", "broken_seal", "seal_broken", "wrong_print"}


def parse_arguments():
    parser = argparse.ArgumentParser(description="SORTEX PRO: AI Packaging Line Defect Sorter")
    parser.add_argument("--source", type=str, default="0",
                        help="Video source: '0' for webcam, or path to recorded video file (e.g. 'conveyor.mp4')")
    parser.add_argument("--weights", type=str, default="models/best.pt",
                        help="Path to YOLOv8 weights file (default: models/best.pt)")
    parser.add_argument("--conf", type=float, default=0.50,
                        help="Confidence threshold for defect classification (default: 0.50)")
    parser.add_argument("--delay", type=float, default=2.8,
                        help="Transit delay in seconds between Camera Gate and Pusher (default: 2.8s)")
    parser.add_argument("--port", type=str, default=None,
                        help="Arduino COM port (e.g. 'COM3'). If omitted, auto-detects.")
    parser.add_argument("--gate", type=float, default=0.50,
                        help="Virtual gate line vertical position (0.1 to 0.9, default: 0.50)")
    parser.add_argument("--simulate-arduino", action="store_true",
                        help="Force software simulation of Arduino without physical hardware")
    return parser.parse_args()


# =============================================================================
# 1. ROBUST CAMERA & VIDEO FILE ACQUISITION (HANDLES ERRORS & VIDEO LOOPS)
# =============================================================================
def open_video_source(source_str: str):
    """
    Opens webcam with Windows DirectShow fallback, or loads a recorded video file.
    """
    if source_str.isdigit():
        cam_idx = int(source_str)
        for idx in [cam_idx, 0, 1, 2]:
            print(f"[CAMERA] Attempting to open Webcam Index {idx} with CAP_DSHOW...")
            cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
            if not cap.isOpened():
                cap = cv2.VideoCapture(idx)

            if cap.isOpened():
                ret, test_frame = cap.read()
                if ret and test_frame is not None and test_frame.size > 0:
                    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
                    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
                    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    print(f"[CAMERA] Connected to Physical Webcam Index {idx} successfully.")
                    return cap, True
                cap.release()

        raise RuntimeError(
            "Could not connect to any webcam! Please check:\n"
            "1. Close background apps using the camera (Zoom, Teams, Chrome).\n"
            "2. Verify camera privacy permissions in Windows Settings."
        )
    else:
        # Video file simulation mode
        video_path = Path(source_str)
        if not video_path.exists():
            raise FileNotFoundError(f"Video file not found at: {video_path.resolve()}")
        print(f"[VIDEO SIMULATION] Loading pre-recorded conveyor video: {video_path}")
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise RuntimeError(f"Failed opening video file: {video_path}")
        return cap, False


# =============================================================================
# 2. LOGGING & AUDIT TRAIL SETUP
# =============================================================================
def setup_logging():
    csv_path = PROJECT_ROOT / "logs" / "defect_log.csv"
    img_dir = PROJECT_ROOT / "logs" / "defect_images"
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    img_dir.mkdir(parents=True, exist_ok=True)

    if not csv_path.exists():
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["Timestamp", "Item_ID", "Decision", "Defect_Type", "Confidence", "Image_Path"])
        print(f"[AUDIT LOG] Initialized new CSV ledger at {csv_path}")

    return csv_path, img_dir


# =============================================================================
# MAIN PIPELINE
# =============================================================================
def main():
    args = parse_arguments()
    csv_path, img_dir = setup_logging()

    # 1. Initialize Video Source
    cap, is_live_cam = open_video_source(args.source)

    # 2. Initialize YOLOv8 Model
    weights_path = Path(args.weights)
    if not weights_path.exists():
        weights_path = PROJECT_ROOT / "models" / "best.pt"
        if not weights_path.exists():
            weights_path = PROJECT_ROOT / "yolov8s.pt"

    device = 0 if torch.cuda.is_available() else "cpu"
    print(f"[MODEL] Loading YOLOv8 weights from: {weights_path} [Device: {device}]")
    model = YOLO(str(weights_path))
    model.to(device)

    # 3. Initialize Arduino Pusher Interface (Auto-Detects COM Port or Simulates)
    actuator = ConveyorActuator(
        port=args.port,
        transit_delay_seconds=args.delay,
        simulate=args.simulate_arduino
    )

    # Tracking & Gate state
    previous_positions = {}
    inspected_ids = {}

    # Real Metrics
    total_inspected = 0
    good_count = 0
    defect_count = 0
    defect_breakdown = {d: 0 for d in ["dent", "missing_label", "broken_seal", "wrong_print"]}
    latest_defect = None

    fps = 30.0
    prev_time = time.time()

    print("\n" + "=" * 70)
    print(" SORTEX PRO: PACKAGING LINE DEFECT SORTER - ACTIVE PIPELINE")
    print(" Key Controls:")
    print("   [T] - Test Pusher Arm (Manual Trigger)")
    print("   [R] - Reset All Production Counters")
    print("   [Q] - Quit Pipeline")
    print("=" * 70 + "\n")

    try:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret or frame is None:
                if not is_live_cam:
                    # Loop video file continuously
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                else:
                    time.sleep(0.05)
                    continue

            h, w = frame.shape[:2]
            gate_y = int(h * args.gate)

            # Calculate FPS
            curr_time = time.time()
            fps = 0.9 * fps + 0.1 * (1.0 / max(curr_time - prev_time, 0.001))
            prev_time = curr_time

            # -----------------------------------------------------------------
            # YOLOv8 Tracking with ByteTrack
            # -----------------------------------------------------------------
            results = model.track(
                source=frame,
                conf=0.35,
                persist=True,
                tracker="bytetrack.yaml",
                verbose=False,
                device=device,
                half=True if device == 0 else False
            )[0]

            current_active_ids = set()

            if results.boxes is not None and results.boxes.id is not None:
                boxes = results.boxes.xyxy.cpu().numpy().astype(int)
                track_ids = results.boxes.id.cpu().numpy().astype(int)
                confidences = results.boxes.conf.cpu().numpy()
                class_ids = results.boxes.cls.cpu().numpy().astype(int)

                for (box, track_id, conf, cls_id) in zip(boxes, track_ids, confidences, class_ids):
                    current_active_ids.add(track_id)
                    x1, y1, x2, y2 = box
                    cx = (x1 + x2) // 2
                    cy = (y1 + y2) // 2
                    label_name = model.names.get(cls_id, str(cls_id)).lower()

                    is_defect = (label_name in DEFECT_CLASSES) and (conf >= args.conf)

                    # ---------------------------------------------------------
                    # Virtual Optical Gate Line Crossing Detection
                    # ---------------------------------------------------------
                    if track_id in previous_positions:
                        prev_cx, prev_cy = previous_positions[track_id]
                        crossed_gate = (prev_cy < gate_y <= cy) or (prev_cy <= gate_y < cy)

                        if crossed_gate and (track_id not in inspected_ids):
                            total_inspected += 1
                            item_id = f"PKG-{track_id:05d}"
                            ts_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                            file_ts = datetime.now().strftime("%Y%m%d_%H%M%S")

                            if is_defect:
                                defect_count += 1
                                norm_def = label_name.replace("label_missing", "missing_label").replace("seal_broken", "broken_seal")
                                if norm_def in defect_breakdown:
                                    defect_breakdown[norm_def] += 1
                                else:
                                    defect_breakdown["dent"] += 1

                                latest_defect = {
                                    "id": item_id,
                                    "type": norm_def,
                                    "conf": float(conf),
                                    "status": "DIVERTED"
                                }

                                # Save snapshot image of defect
                                crop_pad = 20
                                cx1, cy1 = max(0, x1 - crop_pad), max(0, y1 - crop_pad)
                                cx2, cy2 = min(w, x2 + crop_pad), min(h, y2 + crop_pad)
                                crop = frame[cy1:cy2, cx1:cx2].copy()
                                img_filename = f"{file_ts}_{item_id}_{norm_def}.jpg"
                                img_save_path = img_dir / img_filename
                                cv2.imwrite(str(img_save_path), crop)

                                # Send non-blocking reject command to Arduino after transit delay
                                actuator.trigger_reject(defect_type=norm_def, custom_delay=args.delay)

                                # Log to CSV
                                with open(csv_path, "a", newline="", encoding="utf-8") as f:
                                    csv.writer(f).writerow([ts_str, item_id, "DEFECTIVE", norm_def, f"{conf:.2f}", f"logs/defect_images/{img_filename}"])

                                inspected_ids[track_id] = {"decision": "DEFECTIVE", "defect": norm_def, "conf": float(conf)}
                                print(f"🚨 [DEFECT DIVERTED] {item_id} -> {norm_def.upper()} ({conf*100:.1f}%) | Pusher scheduled in {args.delay:.1f}s")

                            else:
                                good_count += 1
                                actuator.indicate_good()

                                # Log to CSV
                                with open(csv_path, "a", newline="", encoding="utf-8") as f:
                                    csv.writer(f).writerow([ts_str, item_id, "GOOD", "none", f"{conf:.2f}", ""])

                                inspected_ids[track_id] = {"decision": "GOOD", "defect": "none", "conf": float(conf)}
                                print(f"✅ [GOOD PASSED] {item_id} -> Nominal Package Proceeding Downstream")

                    previous_positions[track_id] = (cx, cy)

                    # Draw Bounding Box & Label
                    if track_id in inspected_ids:
                        dec = inspected_ids[track_id]["decision"]
                        box_color = (0, 200, 0) if dec == "GOOD" else (0, 0, 255)
                        lbl = f"PKG #{track_id:04d} [{dec}]"
                    else:
                        box_color = (255, 140, 0)
                        lbl = f"PKG #{track_id:04d} {label_name.upper()} {conf*100:.0f}%"

                    cv2.rectangle(frame, (x1, y1), (x2, y2), box_color, 2)
                    cv2.putText(frame, lbl, (x1, max(y1 - 8, 18)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, box_color, 2)
                    cv2.circle(frame, (cx, cy), 4, (255, 255, 255), -1)

            # Cleanup expired track history
            for old_id in list(previous_positions.keys()):
                if old_id not in current_active_ids:
                    del previous_positions[old_id]

            # -----------------------------------------------------------------
            # Visual Optical Gate Line (Apple visionOS Cobalt Blue)
            # -----------------------------------------------------------------
            cv2.line(frame, (0, gate_y), (w, gate_y), (235, 99, 37), 2)
            cv2.putText(frame, f"[OPTICAL GATE 1 • DECISION LINE]", (16, gate_y - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (235, 99, 37), 2)

            # -----------------------------------------------------------------
            # Live Telemetry HUD Strip
            # -----------------------------------------------------------------
            cv2.rectangle(frame, (0, 0), (w, 54), (16, 21, 33), -1)
            cv2.line(frame, (0, 54), (w, 54), (255, 255, 255), 1)

            defect_rate = (defect_count / max(total_inspected, 1)) * 100
            hud_line1 = f"INSPECTED: {total_inspected}  |  GOOD: {good_count}  |  REJECTED: {defect_count} ({defect_rate:.1f}%)  |  FPS: {fps:.1f}"
            cv2.putText(frame, hud_line1, (16, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (248, 250, 252), 2)

            if latest_defect:
                hud_line2 = f"LATEST DEFECT: {latest_defect['id']} [{latest_defect['type'].upper()} {latest_defect['conf']*100:.0f}%] -> STATUS: {latest_defect['status']}"
                cv2.putText(frame, hud_line2, (16, 46), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 80, 255), 2)
            else:
                hud_line2 = "STATUS: LINE ACTIVE • NOMINAL RUNNING"
                cv2.putText(frame, hud_line2, (16, 46), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 200, 0), 1)

            cv2.imshow("SORTEX PRO - AI Packaging Line Defect Sorter", frame)

            # -----------------------------------------------------------------
            # Keyboard Controls
            # -----------------------------------------------------------------
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                break
            elif key == ord('t'):
                print("[MANUAL TEST] Triggering pusher override...")
                actuator.trigger_reject("manual_test", custom_delay=0.1)
            elif key == ord('r'):
                total_inspected = 0
                good_count = 0
                defect_count = 0
                defect_breakdown = {d: 0 for d in defect_breakdown}
                latest_defect = None
                inspected_ids.clear()
                previous_positions.clear()
                print("[INFO] Counters reset to 0.")

    finally:
        cap.release()
        cv2.destroyAllWindows()
        actuator.close()
        print("[INFO] Pipeline safely shut down.")


if __name__ == "__main__":
    main()
