"""
=============================================================================
Project: AI-Driven Packaging Line Defect Sorter
Script: dataset_splitter.py (Utility Helper)
Purpose: Automatically split annotated images & label txt files into
         train (70%), val (20%), and test (10%) sets for YOLOv9.
=============================================================================
"""

import os
import shutil
import random
from pathlib import Path
import argparse


def split_dataset(source_images_dir: Path, source_labels_dir: Path, target_dir: Path, train_ratio=0.70, val_ratio=0.20):
    test_ratio = 1.0 - (train_ratio + val_ratio)
    print(f"[INFO] Splitting dataset: Train={train_ratio*100:.0f}%, Val={val_ratio*100:.0f}%, Test={test_ratio*100:.0f}%")

    image_extensions = [".jpg", ".jpeg", ".png", ".bmp"]
    all_images = [p for p in source_images_dir.rglob("*") if p.suffix.lower() in image_extensions]

    if not all_images:
        print(f"[ERROR] No images found in {source_images_dir}")
        return

    random.seed(42)  # Reproducible split
    random.shuffle(all_images)

    total = len(all_images)
    n_train = int(total * train_ratio)
    n_val = int(total * val_ratio)

    splits = {
        "train": all_images[:n_train],
        "val": all_images[n_train:n_train + n_val],
        "test": all_images[n_train + n_val:]
    }

    for split_name, split_files in splits.items():
        img_dest = target_dir / "images" / split_name
        lbl_dest = target_dir / "labels" / split_name
        img_dest.mkdir(parents=True, exist_ok=True)
        lbl_dest.mkdir(parents=True, exist_ok=True)

        copied = 0
        for img_path in split_files:
            # Copy image
            shutil.copy(img_path, img_dest / img_path.name)
            
            # Find and copy corresponding label txt file
            label_file = source_labels_dir / f"{img_path.stem}.txt"
            if label_file.exists():
                shutil.copy(label_file, lbl_dest / label_file.name)
            else:
                # If an image has no labels (e.g. background or good sample with no defect boxes), create empty txt
                open(lbl_dest / f"{img_path.stem}.txt", 'a').close()
            copied += 1

        print(f"[OK] {split_name.upper():5s} : {copied} images & labels copied to {img_dest.name}/")

    print("[DONE] Dataset split completed successfully.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Split annotated dataset into train/val/test")
    parser.add_argument("--images", type=str, default="dataset/raw_captured", help="Path to input images folder")
    parser.add_argument("--labels", type=str, default="dataset/raw_labels", help="Path to input labels folder (.txt files)")
    parser.add_argument("--dest", type=str, default="dataset", help="Destination dataset folder")
    args = parser.parse_args()

    split_dataset(Path(args.images), Path(args.labels), Path(args.dest))
