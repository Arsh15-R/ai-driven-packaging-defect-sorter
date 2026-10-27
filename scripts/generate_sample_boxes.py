"""
=============================================================================
Project: AI-Driven Packaging Line Defect Sorter
Script: generate_sample_boxes.py
Purpose: Generates synthetic sample packaging box images with YOLO label
         annotations so you can immediately test training, evaluation,
         and the real-time pipeline before physically capturing on the conveyor.
=============================================================================
"""

import os
import random
from pathlib import Path
import cv2
import numpy as np

# Class Definitions
# 0: good, 1: dent, 2: label_missing, 3: seal_broken, 4: wrong_print
CLASSES = ["good", "dent", "label_missing", "seal_broken", "wrong_print"]

def create_box_image(img_size=(640, 640), defect_type="good"):
    """Creates a synthetic packaging box against a conveyor belt background."""
    # Dark conveyor belt background
    belt_color = random.randint(30, 45)
    img = np.full((img_size[1], img_size[0], 3), belt_color, dtype=np.uint8)

    # Box dimensions (centered on conveyor)
    box_w = random.randint(240, 320)
    box_h = random.randint(280, 360)
    bx1 = (img_size[0] - box_w) // 2 + random.randint(-20, 20)
    by1 = (img_size[1] - box_h) // 2 + random.randint(-20, 20)
    bx2 = bx1 + box_w
    by2 = by1 + box_h

    # Cardboard / White Box Body
    box_color = (random.randint(220, 245), random.randint(220, 245), random.randint(220, 245))
    cv2.rectangle(img, (bx1, by1), (bx2, by2), box_color, -1)
    cv2.rectangle(img, (bx1, by1), (bx2, by2), (100, 100, 100), 2)

    # Product Branding / Header
    cv2.rectangle(img, (bx1 + 15, by1 + 20), (bx2 - 15, by1 + 65), (200, 50, 50), -1)
    cv2.putText(img, "MED-PACK 100", (bx1 + 25, by1 + 52),
                cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2)

    # Label Sticker (Barcode / QR zone)
    label_x1, label_y1 = bx1 + 30, by1 + 90
    label_x2, label_y2 = bx2 - 30, by1 + 190

    if defect_type != "label_missing":
        # Draw label
        cv2.rectangle(img, (label_x1, label_y1), (label_x2, label_y2), (250, 250, 250), -1)
        cv2.rectangle(img, (label_x1, label_y1), (label_x2, label_y2), (180, 180, 180), 1)

        # Barcode stripes
        for x in range(label_x1 + 15, label_x2 - 15, 6):
            if random.random() > 0.3:
                cv2.line(img, (x, label_y1 + 15), (x, label_y1 + 75), (20, 20, 20), random.choice([1, 2, 3]))

        # Text on label
        if defect_type == "wrong_print":
            # Smudged or inverted print defect
            cv2.putText(img, "EXP: ERROR##!?", (label_x1 + 10, label_y2 - 15),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 180), 2)
            cv2.line(img, (label_x1 + 5, label_y2 - 20), (label_x2 - 10, label_y2 - 20), (0, 0, 0), 4)
        else:
            cv2.putText(img, "EXP: 12/2028", (label_x1 + 10, label_y2 - 15),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (40, 40, 40), 1)

    # Top Security Seal Flap
    seal_x1, seal_y1 = bx1 + box_w // 4, by1 - 8
    seal_x2, seal_y2 = bx1 + (3 * box_w) // 4, by1 + 12

    if defect_type == "seal_broken":
        # Ripped seal
        cv2.rectangle(img, (seal_x1, seal_y1), (seal_x1 + 25, seal_y2), (0, 0, 200), -1)
        cv2.line(img, (seal_x1 + 25, seal_y1), (seal_x1 + 45, seal_y2 + 10), (0, 0, 0), 3)
    else:
        # Intact holographic / golden seal
        cv2.rectangle(img, (seal_x1, seal_y1), (seal_x2, seal_y2), (50, 180, 220), -1)

    # Dent Defect (crushed corner / side deformation)
    if defect_type == "dent":
        dent_pts = np.array([
            [bx2 - 40, by2 - 60],
            [bx2 + 10, by2 - 40],
            [bx2 - 20, by2 + 15],
            [bx2 - 70, by2]
        ], np.int32)
        cv2.fillPoly(img, [dent_pts], (60, 60, 60))
        cv2.polylines(img, [dent_pts], True, (20, 20, 20), 2)

    # Compute YOLO normalized bounding box (class_id, x_center, y_center, width, height)
    cls_id = CLASSES.index(defect_type)
    x_c = ((bx1 + bx2) / 2.0) / img_size[0]
    y_c = ((by1 + by2) / 2.0) / img_size[1]
    norm_w = box_w / img_size[0]
    norm_h = box_h / img_size[1]

    yolo_annotation = f"{cls_id} {x_c:.6f} {y_c:.6f} {norm_w:.6f} {norm_h:.6f}\n"

    return img, yolo_annotation


def generate_synthetic_dataset(samples_per_class=12):
    """Generates synthetic dataset split directly into train, val, test."""
    print(f"[INFO] Generating synthetic packaging dataset ({samples_per_class} per class)...")
    base_dir = Path("dataset")
    
    for split in ["train", "val", "test"]:
        (base_dir / "images" / split).mkdir(parents=True, exist_ok=True)
        (base_dir / "labels" / split).mkdir(parents=True, exist_ok=True)

    counts = {"train": 0, "val": 0, "test": 0}

    for defect_type in CLASSES:
        for i in range(samples_per_class):
            img, label_line = create_box_image(defect_type=defect_type)
            
            # 70% train, 20% val, 10% test
            r = random.random()
            if r < 0.70:
                split = "train"
            elif r < 0.90:
                split = "val"
            else:
                split = "test"

            filename = f"synth_{defect_type}_{i:03d}"
            img_path = base_dir / "images" / split / f"{filename}.jpg"
            lbl_path = base_dir / "labels" / split / f"{filename}.txt"

            cv2.imwrite(str(img_path), img)
            with open(lbl_path, "w") as f:
                f.write(label_line)

            counts[split] += 1

    print(f"[SUCCESS] Synthetic dataset created: Train={counts['train']}, Val={counts['val']}, Test={counts['test']}")
    print(f"Location: {base_dir.resolve()}")


if __name__ == "__main__":
    generate_synthetic_dataset(samples_per_class=15)
