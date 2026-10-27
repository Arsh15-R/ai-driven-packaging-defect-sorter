"""
=============================================================================
Project: AI-Driven Packaging Line Defect Sorter
Script: simulate_line_run.py (Headless Conveyor Batch Simulator)
Purpose: Runs a batch simulation of 25 packaging items passing through
         the AI inspection zone and the reject pusher. Populates
         logs/defect_log.csv and logs/defect_images/ so the dashboard
         has rich real-time data immediately!
=============================================================================
"""

import sys
import random
import csv
from datetime import datetime, timedelta
from pathlib import Path

# Add script directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

import cv2
import numpy as np

from conveyor_simulator import VirtualConveyorEnvironment, ConveyorItem, CLASSES

DEFECT_CLASSES = ["dent", "label_missing", "seal_broken", "wrong_print"]

def run_headless_simulation(num_items: int = 25):
    print("=" * 65)
    print(f"   SIMULATING PACKAGING CONVEYOR INSPECTION RUN ({num_items} ITEMS)   ")
    print("=" * 65)

    env = VirtualConveyorEnvironment(width=1280, height=600)
    csv_path = Path("logs/defect_log.csv")
    img_dir = Path("logs/defect_images")
    img_dir.mkdir(parents=True, exist_ok=True)
    csv_path.parent.mkdir(parents=True, exist_ok=True)

    # Initialize CSV header if needed
    if not csv_path.exists():
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["Timestamp", "Item_ID", "Decision", "Defect_Type", "Confidence", "Image_Path"])

    total_checked = 0
    good_count = 0
    defect_count = 0

    base_time = datetime.now() - timedelta(minutes=num_items * 2)

    cam_x1 = env.cam_station_x - env.cam_zone_w // 2
    cam_x2 = env.cam_station_x + env.cam_zone_w // 2
    cam_y1 = env.belt_center_y - env.cam_zone_h // 2
    cam_y2 = env.belt_center_y + env.cam_zone_h // 2

    # Pre-generate 25 conveyor items
    for i in range(num_items):
        item_time = base_time + timedelta(seconds=i * 5)
        timestamp_str = item_time.strftime("%Y-%m-%d %H:%M:%S")
        file_ts = item_time.strftime("%Y%m%d_%H%M%S")
        item_id = f"PKG-{1000 + i}"

        # 55% good, 45% defects distributed across defect classes
        if random.random() < 0.55:
            defect = "good"
        else:
            defect = random.choice(DEFECT_CLASSES)

        # Create virtual item right in the camera zone for snapshot
        item = ConveyorItem(
            x_pos=env.cam_station_x,
            y_pos=env.belt_center_y + random.randint(-10, 10),
            defect_type=defect
        )
        item.item_id = item_id

        # Render on conveyor
        env.items = [item]
        full_render = env.render()
        crop = full_render[cam_y1:cam_y2, cam_x1:cam_x2].copy()

        total_checked += 1

        if defect in DEFECT_CLASSES:
            defect_count += 1
            conf = random.uniform(0.86, 0.98)
            decision = "DEFECTIVE"
            img_filename = f"{file_ts}_{item_id}_{defect}.jpg"
            img_path = img_dir / img_filename

            # Annotate defect box on snapshot
            ch, cw = crop.shape[:2]
            cv2.rectangle(crop, (cw // 4, ch // 5), (3 * cw // 4, 4 * ch // 5), (0, 0, 255), 2)
            cv2.putText(crop, f"{defect.upper()} {conf*100:.0f}%", (cw // 4, ch // 5 - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
            cv2.imwrite(str(img_path), crop)

            with open(csv_path, "a", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow([timestamp_str, item_id, decision, defect, f"{conf:.2f}", str(img_path)])

            print(f" [REJECT] Item #{total_checked:02d} ({item_id}) -> {defect.upper():<14} (Conf: {conf*100:.1f}%) [Pusher Actuated]")
        else:
            good_count += 1
            decision = "GOOD"
            with open(csv_path, "a", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow([timestamp_str, item_id, decision, "none", "1.00", ""])

            print(f" [PASS]   Item #{total_checked:02d} ({item_id}) -> GOOD PACKAGE   (Status: Cleared)")

    defect_rate = (defect_count / total_checked) * 100.0
    print("\n" + "=" * 65)
    print("                    SIMULATION RUN SUMMARY                    ")
    print("=" * 65)
    print(f" Total Packages Checked : {total_checked}")
    print(f" Good Packages Passed   : {good_count}")
    print(f" Defective Rejected     : {defect_count}")
    print(f" Defect Rate            : {defect_rate:.1f}%")
    print(f" Audit Log CSV          : {csv_path.resolve()}")
    print(f" Saved Defect Images    : {img_dir.resolve()} ({defect_count} images)")
    print("=" * 65 + "\n")

if __name__ == "__main__":
    run_headless_simulation(num_items=25)
