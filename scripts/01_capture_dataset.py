"""
=============================================================================
Project: AI-Driven Packaging Line Defect Sorter
Script: 01_capture_dataset.py
Purpose: Capture dataset images from a USB webcam with auto-numbering,
         class switching, conveyor alignment overlay, and auto-burst mode.
=============================================================================
"""

import cv2
import os
import sys
import time
import argparse
from pathlib import Path

# Available classes for packaging defect detection
CLASSES = {
    "1": "good",
    "2": "dent",
    "3": "label_missing",
    "4": "seal_broken",
    "5": "wrong_print"
}

# Color palette for HUD display (BGR format)
CLASS_COLORS = {
    "good": (0, 200, 0),          # Green
    "dent": (0, 140, 255),        # Orange
    "label_missing": (0, 0, 255), # Red
    "seal_broken": (255, 0, 255), # Magenta
    "wrong_print": (255, 255, 0)  # Cyan
}


def get_next_filename(folder: Path, class_name: str) -> tuple[Path, int]:
    """
    Finds existing files in the directory and returns the next auto-incremented
    file path so existing captures are never overwritten.
    """
    folder.mkdir(parents=True, exist_ok=True)
    existing_files = list(folder.glob(f"{class_name}_*.jpg"))
    
    max_num = 0
    for f in existing_files:
        stem = f.stem  # e.g., "dent_0042"
        parts = stem.split("_")
        if len(parts) >= 2 and parts[-1].isdigit():
            num = int(parts[-1])
            if num > max_num:
                max_num = num
                
    next_num = max_num + 1
    next_filename = folder / f"{class_name}_{next_num:04d}.jpg"
    return next_filename, next_num


def open_webcam(camera_index: int = 0) -> cv2.VideoCapture:
    """
    Initializes webcam with cv2.CAP_DSHOW for fast startup on Windows.
    Falls back to default backend if DSHOW fails.
    """
    print(f"[INFO] Opening camera index {camera_index}...")
    # On Windows, cv2.CAP_DSHOW prevents 10-15s startup delays
    cap = cv2.VideoCapture(camera_index, cv2.CAP_DSHOW)
    
    if not cap.isOpened():
        print(f"[WARN] CAP_DSHOW failed. Trying standard backend for camera index {camera_index}...")
        cap = cv2.VideoCapture(camera_index)

    if not cap.isOpened():
        print(f"[ERROR] Could not open camera {camera_index}!")
        print(" -> Check if webcam is plugged in.")
        print(" -> Check Windows Privacy Settings > Camera > Allow desktop apps.")
        print(" -> Try camera index 1 or 2 if using an external USB webcam.")
        sys.exit(1)

    # Set preferred resolution (720p is ideal for YOLOv9 inspection)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    cap.set(cv2.CAP_PROP_FPS, 30)
    return cap


def main():
    parser = argparse.ArgumentParser(description="Capture dataset images for packaging defect detection.")
    parser.add_argument("--camera", type=int, default=0, help="Webcam index (0 = default/laptop, 1 = USB webcam)")
    parser.add_argument("--class-id", type=str, default="1", choices=["1", "2", "3", "4", "5"],
                        help="Initial class (1:good, 2:dent, 3:label_missing, 4:seal_broken, 5:wrong_print)")
    parser.add_argument("--output-dir", type=str, default="dataset/raw_captured", help="Root folder for raw captures")
    args = parser.parse_args()

    base_output_dir = Path(args.output_dir)
    current_key = args.class_id
    current_class = CLASSES[current_key]

    cap = open_webcam(args.camera)

    auto_mode = False
    last_auto_capture_time = 0.0
    auto_capture_interval = 0.8  # captures 1 frame every 0.8s in auto mode
    session_captures = 0

    print("\n" + "=" * 60)
    print("      AI PACKAGING DEFECT SORTER - IMAGE CAPTURE TOOL      ")
    print("=" * 60)
    print(" Keyboard Controls:")
    print("  [SPACE] or [C] : Capture single image")
    print("  [A]            : Toggle Auto-Burst capture mode ON/OFF")
    print("  [1] to [5]     : Switch active class:")
    for k, v in CLASSES.items():
        print(f"                   [{k}] -> {v}")
    print("  [Q] or [ESC]   : Quit program")
    print("=" * 60 + "\n")

    window_name = "Packaging Line Dataset Collector (Press 'Q' to Exit)"
    cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(window_name, 1024, 600)

    try:
        while True:
            ret, frame = cap.read()
            if not ret or frame is None:
                print("[ERROR] Failed to grab frame from camera. Exiting...")
                break

            display_frame = frame.copy()
            h, w = frame.shape[:2]

            # Conveyor Inspection ROI Box (Center 50% of the frame)
            roi_x1, roi_y1 = int(w * 0.25), int(h * 0.15)
            roi_x2, roi_y2 = int(w * 0.75), int(h * 0.85)
            class_color = CLASS_COLORS.get(current_class, (0, 255, 0))

            # Draw alignment rectangle where items pass on the belt
            cv2.rectangle(display_frame, (roi_x1, roi_y1), (roi_x2, roi_y2), class_color, 2)
            cv2.putText(display_frame, "CONVEYOR INSPECTION ZONE", (roi_x1 + 10, roi_y1 + 25),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, class_color, 2)

            # Auto-mode trigger logic
            now = time.time()
            trigger_capture = False

            if auto_mode and (now - last_auto_capture_time >= auto_capture_interval):
                trigger_capture = True
                last_auto_capture_time = now

            # Top HUD bar
            cv2.rectangle(display_frame, (0, 0), (w, 70), (25, 25, 25), -1)
            cv2.putText(display_frame, f"CLASS [{current_key}]: {current_class.upper()}", (20, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, class_color, 2)

            target_folder = base_output_dir / current_class
            _, next_num = get_next_filename(target_folder, current_class)
            cv2.putText(display_frame, f"Next File: {current_class}_{next_num:04d}.jpg  |  Session Saved: {session_captures}",
                        (20, 58), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (220, 220, 220), 1)

            # Auto mode indicator
            mode_text = "AUTO: ON (0.8s)" if auto_mode else "AUTO: OFF"
            mode_color = (0, 255, 255) if auto_mode else (150, 150, 150)
            cv2.putText(display_frame, mode_text, (w - 220, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, mode_color, 2)

            # Bottom instructions bar
            cv2.rectangle(display_frame, (0, h - 35), (w, h), (25, 25, 25), -1)
            cv2.putText(display_frame, "SPACE/C: Snap | A: Auto Mode | 1-5: Change Class | Q: Exit",
                        (20, h - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 200, 200), 1)

            cv2.imshow(window_name, display_frame)

            key = cv2.waitKey(1) & 0xFF

            # Handle user keys
            if key in [ord('q'), 27]:  # 'q' or ESC
                print("[INFO] Quitting capture tool...")
                break

            elif key in [ord('1'), ord('2'), ord('3'), ord('4'), ord('5')]:
                current_key = chr(key)
                current_class = CLASSES[current_key]
                print(f"[SWITCH] Active class changed to: {current_class}")

            elif key in [ord(' '), ord('c'), ord('C')]:
                trigger_capture = True

            elif key in [ord('a'), ord('A')]:
                auto_mode = not auto_mode
                last_auto_capture_time = time.time()
                print(f"[MODE] Auto-Burst mode: {'ENABLED' if auto_mode else 'DISABLED'}")

            # Perform image saving
            if trigger_capture:
                filepath, saved_index = get_next_filename(target_folder, current_class)
                # Save the raw frame without HUD drawings for training
                cv2.imwrite(str(filepath), frame)
                session_captures += 1
                print(f"[SAVED] ({session_captures}) -> {filepath}")

                # Visual flash feedback
                flash = display_frame.copy()
                cv2.rectangle(flash, (0, 0), (w, h), (255, 255, 255), -1)
                cv2.addWeighted(flash, 0.35, display_frame, 0.65, 0, display_frame)
                cv2.imshow(window_name, display_frame)
                cv2.waitKey(40)

    finally:
        cap.release()
        cv2.destroyAllWindows()
        print(f"\n[DONE] Image capture finished. Total images saved this session: {session_captures}")
        print(f"Images are saved in: {base_output_dir.resolve()}\n")


if __name__ == "__main__":
    main()
