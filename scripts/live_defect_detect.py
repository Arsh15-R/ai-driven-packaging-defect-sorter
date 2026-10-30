"""
=============================================================================
Project: AI-Driven Packaging Line Defect Sorter (SORTEX PRO)
Script: live_defect_detect.py
Purpose: High-performance real-time packaging defect detection with YOLOv9.
         Uses NVIDIA RTX 3050 CUDA GPU with filled visual tags matching standard
         COCO/YOLO visualizer aesthetics.
=============================================================================
"""

import os
import sys
import time
from pathlib import Path

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import cv2
import numpy as np
import torch
from ultralytics import YOLO

# Vibrant Color Palette (BGR format) matching your defect classes
COLORS = {
    "good": (0, 220, 0),             # Vivid Green
    "dent": (0, 0, 255),             # Bright Red
    "label_missing": (0, 140, 255),   # Orange
    "missing_label": (0, 140, 255),   # Orange Alias
    "seal_broken": (255, 0, 255),     # Magenta
    "broken_seal": (255, 0, 255),     # Magenta Alias
    "wrong_print": (0, 255, 255),     # Bright Yellow / Cyan
}

DEFAULT_COLOR = (240, 240, 240)


def draw_styled_box(frame, x1, y1, x2, y2, label_text, color, thickness=2):
    """
    Renders high-visibility bounding boxes with solid filled header badges,
    matching standard professional object-detection visualizers.
    """
    h_frame, w_frame = frame.shape[:2]

    # 1. Outer Bounding Rectangle
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, thickness)

    # 2. Compute Text Dimensions
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.55
    text_thickness = 2
    (text_w, text_h), baseline = cv2.getTextSize(label_text, font, font_scale, text_thickness)

    # 3. Position Header Tag (flip inside if near top edge)
    tag_pad = 4
    tag_h = text_h + tag_pad * 2 + baseline
    tag_w = text_w + tag_pad * 2

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

    # 4. Draw Solid Filled Label Background
    cv2.rectangle(frame, (tag_x1, tag_y1), (tag_x2, tag_y2), color, -1)

    # 5. Contrast Text: Black text on bright badges for maximum readability
    # For dark colors, switch to white text automatically
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


def main():
    import argparse
    parser = argparse.ArgumentParser(description="SORTEX PRO - Live YOLOv9 Defect Detector")
    parser.add_argument("--source", type=str, default="0", help="Webcam index (0) or path to video file (.mp4)")
    parser.add_argument("--model", type=str, default="models/best.pt", help="Path to YOLOv9 weights")
    parser.add_argument("--conf", type=float, default=0.50, help="Confidence threshold (default: 0.50)")
    args = parser.parse_args()

    # 1. Device Selection (RTX 3050 CUDA preferred)
    if torch.cuda.is_available():
        device = "cuda:0"
        gpu_name = torch.cuda.get_device_name(0)
        print(f"[INFO] GPU Acceleration ACTIVE on: {gpu_name}")
    else:
        device = "cpu"
        gpu_name = "CPU Mode"
        print("[WARN] CUDA not detected. Falling back to CPU inference.")

    # 2. Load Model
    model_path = Path(args.model)
    if not model_path.exists():
        print(f"[WARN] Trained model '{model_path}' not found! Falling back to 'yolov9s.pt'...")
        model_path = PROJECT_ROOT / "yolov9s.pt"

    print(f"[INFO] Loading YOLOv9 model: {model_path}")
    model = YOLO(str(model_path))
    model.to(device)

    # 3. Open Video Stream
    source_val = int(args.source) if args.source.isdigit() else args.source
    if isinstance(source_val, int):
        # On Windows, cv2.CAP_DSHOW eliminates 10s webcam delay
        cap = cv2.VideoCapture(source_val, cv2.CAP_DSHOW)
        if not cap.isOpened():
            cap = cv2.VideoCapture(source_val)
    else:
        cap = cv2.VideoCapture(source_val)

    if not cap.isOpened():
        print(f"[ERROR] Could not open video source '{args.source}'!")
        print(" -> If using webcam, check if another app or browser tab is locking camera 0.")
        sys.exit(1)

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    print("\n" + "=" * 60)
    print("   SORTEX PRO - LIVE PACKAGING DEFECT DETECTOR")
    print("=" * 60)
    print(f" Model    : {model_path.name}")
    print(f" Device   : {gpu_name}")
    print(f" Source   : {args.source}")
    print(f" Conf Thresh: {args.conf:.2f} (Use [+] / [-] to adjust)")
    print(" Controls : [ESC / Q] Quit  |  [SPACE] Pause  |  [S] Save Snapshot")
    print("=" * 60 + "\n")

    conf_threshold = args.conf
    prev_time = time.time()
    fps = 30.0
    paused = False

    while True:
        if not paused:
            ret, frame = cap.read()
            if not ret or frame is None:
                if not isinstance(source_val, int):
                    # Loop video file for continuous demonstration
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                else:
                    time.sleep(0.02)
                    continue

            # Calculate Rolling FPS
            now = time.time()
            dt = max(now - prev_time, 0.001)
            prev_time = now
            fps = 0.9 * fps + 0.1 * (1.0 / dt)

            # Perform YOLOv9 Inference
            results = model.predict(
                source=frame,
                conf=conf_threshold,
                device=device,
                verbose=False
            )[0]

            defects_found = 0
            good_found = 0

            # Draw Detections with filled header badges
            for box in results.boxes:
                cls_id = int(box.cls[0])
                conf = float(box.conf[0])
                raw_name = model.names.get(cls_id, str(cls_id)).lower()

                # Clean display label
                display_name = raw_name.replace("_", " ").upper()
                label = f"{display_name} {conf:.2f}"

                # Match color
                color = COLORS.get(raw_name, DEFAULT_COLOR)
                if raw_name == "good":
                    good_found += 1
                else:
                    defects_found += 1

                x1, y1, x2, y2 = map(int, box.xyxy[0])
                draw_styled_box(frame, x1, y1, x2, y2, label, color, thickness=2)

            # Top Telemetry HUD Bar
            cv2.rectangle(frame, (10, 10), (430, 85), (20, 20, 25), -1)
            cv2.rectangle(frame, (10, 10), (430, 85), (70, 75, 90), 1)

            # FPS and Hardware Status
            hw_color = (0, 255, 128) if "cuda" in device else (200, 200, 200)
            cv2.putText(frame, f"SORTEX PRO | FPS: {fps:.1f}", (20, 36), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)
            cv2.putText(frame, f"{gpu_name} (Conf: {conf_threshold:.2f})", (20, 58), cv2.FONT_HERSHEY_SIMPLEX, 0.45, hw_color, 1)

            # Quality Counts
            status_text = f"Defects: {defects_found}  |  Passed: {good_found}"
            cv2.putText(frame, status_text, (20, 76), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (160, 200, 255), 1)

            cv2.imshow("SORTEX PRO - Real-Time YOLOv9 Packaging Inspector", frame)

        # Keyboard Interactivity
        key = cv2.waitKey(1) & 0xFF
        if key in [ord("q"), ord("Q"), 27]:  # ESC or Q
            break
        elif key == 32:  # SPACE to Pause/Resume
            paused = not paused
            print("[INFO] Paused" if paused else "[INFO] Resumed")
        elif key in [ord("+"), ord("=")]:  # Increase confidence
            conf_threshold = min(0.95, conf_threshold + 0.05)
            print(f"[INFO] Confidence threshold raised to: {conf_threshold:.2f}")
        elif key in [ord("-"), ord("_")]:  # Decrease confidence
            conf_threshold = max(0.10, conf_threshold - 0.05)
            print(f"[INFO] Confidence threshold lowered to: {conf_threshold:.2f}")
        elif key in [ord("s"), ord("S")]:  # Save Snapshot
            out_dir = PROJECT_ROOT / "logs" / "screenshots"
            out_dir.mkdir(parents=True, exist_ok=True)
            ts = time.strftime("%Y%m%d_%H%M%S")
            snap_path = out_dir / f"snapshot_{ts}.jpg"
            cv2.imwrite(str(snap_path), frame)
            print(f"[SAVED] Screenshot -> {snap_path}")

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
