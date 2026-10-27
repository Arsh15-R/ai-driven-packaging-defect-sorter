"""
=============================================================================
Project: SORTEX PRO - AI Packaging Line Defect Sorter
Script: gate_detector.py (Steps 1 to 4)
Purpose: Robust camera acquisition, YOLOv8 inference, ByteTrack multi-object
         tracking, and single-decision virtual optical gate logic.
=============================================================================
"""

import time
from pathlib import Path
import cv2
import numpy as np
import torch
from ultralytics import YOLO

# =============================================================================
# 1. CONFIGURATION & DEFECT CLASS MAPPING
# =============================================================================
MODEL_PATH = "models/best.pt"         # Path to your trained weights
CONF_THRESHOLD = 0.50                 # Minimum confidence to flag a defect
GATE_POSITION = 0.50                  # Virtual gate line at 50% frame height (Y-axis)

# Defect class names from your training dataset
DEFECT_CLASSES = {"dent", "missing_label", "label_missing", "broken_seal", "seal_broken", "wrong_print"}


# =============================================================================
# STEP 1: ROBUST CAMERA ACQUISITION (AUTO-INDEX & DIRECTSHOW)
# =============================================================================
def get_camera_feed(preferred_index=0):
    """
    Safely opens webcam with DirectShow on Windows.
    If preferred_index fails (e.g. laptop cam is index 1), it auto-probes 0, 1, 2.
    """
    for idx in [preferred_index, 0, 1, 2]:
        print(f"[CAMERA] Attempting to open camera index {idx} with CAP_DSHOW...")
        cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
        
        if not cap.isOpened():
            # Fallback without CAP_DSHOW
            cap = cv2.VideoCapture(idx)

        if cap.isOpened():
            # Test reading a single frame to ensure it's not busy/black
            ret, test_frame = cap.read()
            if ret and test_frame is not None and test_frame.size > 0:
                # Set ideal resolution for conveyor inspection
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimal buffer for zero latency
                actual_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                actual_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                print(f"[CAMERA] Successfully connected to Camera Index {idx} ({actual_w}x{actual_h})")
                return cap, idx
            else:
                cap.release()

    raise RuntimeError(
        "Could not access any webcam! Please check:\n"
        "1. Camera privacy permissions in Windows Settings -> Privacy & Security -> Camera.\n"
        "2. Close apps using the camera (Zoom, Teams, Chrome, Camera App)."
    )


# =============================================================================
# STEP 2: LOAD MODEL WITH GPU ACCELERATION (AUTODETECT)
# =============================================================================
def load_defect_model(weights_path: str):
    """
    Loads custom YOLOv8 model onto available GPU with CPU fallback.
    """
    path = Path(weights_path)
    if not path.exists():
        fallback = Path("yolov8s.pt")
        print(f"[WARN] Custom weights '{weights_path}' not found! Falling back to '{fallback}'.")
        path = fallback

    device = 0 if torch.cuda.is_available() else "cpu"
    print(f"[MODEL] Loading YOLOv8 from '{path}' on device [{device}]...")
    
    model = YOLO(str(path))
    model.to(device)
    print(f"[MODEL] Model classes registered: {model.names}")
    return model, device


# =============================================================================
# STEPS 3 & 4: TRACKING & VIRTUAL GATE DECISION PIPELINE
# =============================================================================
def main():
    # 1. Initialize camera and model
    cap, cam_idx = get_camera_feed(preferred_index=0)
    model, device = load_defect_model(MODEL_PATH)

    # 2. Gate line tracking state
    # previous_positions: { track_id: (center_x, center_y) }
    previous_positions = {}
    
    # inspected_ids: { track_id: {"decision": "GOOD"|"DEFECTIVE", "defect": str, "conf": float, "time": str} }
    # Ensures EVERY package ID is decided EXACTLY ONCE
    inspected_ids = {}

    # Performance counters
    total_inspected = 0
    good_count = 0
    defect_count = 0

    fps = 30.0
    prev_time = time.time()

    print("\n" + "=" * 65)
    print(" SORTEX PRO: REAL-TIME TRACKING & OPTICAL GATE RUNNING")
    print(" Press 'q' in the video window to quit, or 'r' to reset counters.")
    print("=" * 65 + "\n")

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret or frame is None:
            print("[WARN] Camera frame drop. Reconnecting...")
            time.sleep(0.05)
            continue

        h, w = frame.shape[:2]
        gate_y = int(h * GATE_POSITION)  # Virtual gate coordinate

        # Measure FPS
        curr_time = time.time()
        fps = 0.9 * fps + 0.1 * (1.0 / max(curr_time - prev_time, 0.001))
        prev_time = curr_time

        # ---------------------------------------------------------------------
        # STEP 3: YOLOv8 TRACKING WITH BYTETRACK
        # persist=True preserves unique IDs across consecutive frames
        # ---------------------------------------------------------------------
        results = model.track(
            source=frame,
            conf=0.35,              # Lower threshold so ByteTrack catches boxes early
            persist=True,
            tracker="bytetrack.yaml",
            verbose=False,
            device=device,
            half=True if device == 0 else False  # FP16 speedup when GPU active
        )[0]

        # ---------------------------------------------------------------------
        # STEP 4: VIRTUAL GATE CROSSING LOGIC
        # ---------------------------------------------------------------------
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

                # Determine if this box has a defect class
                is_defect_class = label_name in DEFECT_CLASSES and conf >= CONF_THRESHOLD

                # Check if package crossed the optical gate line (from y < gate_y to y >= gate_y)
                if track_id in previous_positions:
                    prev_cx, prev_cy = previous_positions[track_id]

                    # Trigger condition: Package crossed the line AND has never been decided before
                    crossed_line = (prev_cy < gate_y <= cy) or (prev_cy <= gate_y < cy)

                    if crossed_line and (track_id not in inspected_ids):
                        total_inspected += 1

                        if is_defect_class:
                            defect_count += 1
                            decision = "DEFECTIVE"
                            inspected_ids[track_id] = {
                                "decision": decision,
                                "defect": label_name,
                                "conf": float(conf),
                                "time": time.strftime("%H:%M:%S")
                            }
                            print(f"🚨 [GATE TRIGGER] PKG #{track_id:04d} -> DEFECTIVE: {label_name.upper()} ({conf*100:.1f}%) [REJECT]")
                        else:
                            good_count += 1
                            decision = "GOOD"
                            inspected_ids[track_id] = {
                                "decision": decision,
                                "defect": "none",
                                "conf": float(conf),
                                "time": time.strftime("%H:%M:%S")
                            }
                            print(f"✅ [GATE TRIGGER] PKG #{track_id:04d} -> GOOD PACKAGE [PASS]")

                # Save current center for the next frame
                previous_positions[track_id] = (cx, cy)

                # Visual Bounding Box styling
                if track_id in inspected_ids:
                    # Color based on permanent gate decision
                    dec = inspected_ids[track_id]["decision"]
                    box_color = (0, 200, 0) if dec == "GOOD" else (0, 0, 255)
                    status_text = f"PKG #{track_id:04d} [{dec}]"
                else:
                    # In transit towards gate
                    box_color = (255, 140, 0)
                    status_text = f"PKG #{track_id:04d} {label_name.upper()} {conf*100:.0f}%"

                cv2.rectangle(frame, (x1, y1), (x2, y2), box_color, 2)
                cv2.putText(frame, status_text, (x1, max(y1 - 8, 18)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, box_color, 2)
                cv2.circle(frame, (cx, cy), 4, (255, 255, 255), -1)

        # Clean up stale tracks no longer visible
        for old_id in list(previous_positions.keys()):
            if old_id not in current_active_ids:
                del previous_positions[old_id]

        # ---------------------------------------------------------------------
        # DRAW VIRTUAL OPTICAL GATE LINE & HUD
        # ---------------------------------------------------------------------
        # Gate line
        cv2.line(frame, (0, gate_y), (w, gate_y), (235, 99, 37), 2)
        cv2.putText(frame, f"[OPTICAL GATE LINE: Y={gate_y}px]", (16, gate_y - 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (235, 99, 37), 2)

        # Header Telemetry Strip
        cv2.rectangle(frame, (0, 0), (w, 42), (18, 14, 10), -1)
        defect_rate = (defect_count / max(total_inspected, 1)) * 100
        hud_text = f"TOTAL: {total_inspected}  |  GOOD: {good_count}  |  DEFECT: {defect_count} ({defect_rate:.1f}%)  |  INFERENCE: {fps:.1f} FPS"
        cv2.putText(frame, hud_text, (16, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (240, 246, 252), 2)

        # Display Live Window
        cv2.imshow("SORTEX PRO - Optical Inspection Gate (Steps 1 to 4)", frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('r'):
            # Reset counters
            total_inspected = 0
            good_count = 0
            defect_count = 0
            inspected_ids.clear()
            previous_positions.clear()
            print("[INFO] Inspection counters reset to zero.")

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
