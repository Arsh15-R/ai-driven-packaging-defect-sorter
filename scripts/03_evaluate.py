"""
=============================================================================
Project: AI-Driven Packaging Line Defect Sorter
Script: 03_evaluate.py
Purpose: Comprehensive model evaluation on validation/test datasets.
         Calculates mAP50, mAP50-95, Precision, Recall, confusion matrix,
         and renders visual predictions on sample images.
=============================================================================
"""

import os
import sys
from pathlib import Path
import argparse
import matplotlib.pyplot as plt
import cv2
import torch
from ultralytics import YOLO


def evaluate_model(
    model_path: str = "models/best.pt",
    data_yaml: str = "data.yaml",
    imgsz: int = 640,
    split: str = "val"
):
    """
    Evaluates the trained YOLOv8 model on validation or test split.
    """
    print("\n" + "=" * 65)
    print("      PACKAGING DEFECT SORTER - MODEL EVALUATION SUITE      ")
    print("=" * 65)

    model_file = Path(model_path)
    # Check if models/best.pt or run weights exist
    if not model_file.exists():
        fallback_path = Path("runs/detect/packaging_defect_model/weights/best.pt")
        if fallback_path.exists():
            model_file = fallback_path
        else:
            print(f"[ERROR] Trained weights not found at '{model_path}' or '{fallback_path}'!")
            print("Please run 'python scripts/02_train.py' first to train your model.")
            sys.exit(1)

    print(f"[INFO] Loading model weights from: {model_file.resolve()}")
    model = YOLO(str(model_file))

    data_file = Path(data_yaml).resolve()
    if not data_file.exists():
        print(f"[ERROR] data.yaml not found at '{data_file}'!")
        sys.exit(1)

    print(f"[INFO] Running validation metrics on split: '{split}'...")
    print("-" * 65)

    # Run YOLOv8 validation
    metrics = model.val(
        data=str(data_file),
        split=split,
        imgsz=imgsz,
        batch=16,
        conf=0.25,
        iou=0.60,
        plots=True,          # Generates confusion matrix, PR curves, F1 curves
        device=0 if torch.cuda.is_available() else 'cpu'
    )

    # Extract overall metrics
    precision = metrics.box.mp
    recall = metrics.box.mr
    map50 = metrics.box.map50
    map50_95 = metrics.box.map

    print("\n" + "=" * 65)
    print("                   OVERALL PERFORMANCE METRICS               ")
    print("=" * 65)
    print(f" Mean Precision (P)    : {precision * 100:.2f}%")
    print(f" Mean Recall (R)       : {recall * 100:.2f}%")
    print(f" mAP @ 0.50            : {map50 * 100:.2f}%")
    print(f" mAP @ 0.50:0.95       : {map50_95 * 100:.2f}%")
    print("=" * 65)

    # Class-wise metrics table
    print("\nCLASS-WISE BREAKDOWN:")
    print(f"{'Class Name':<20} | {'Precision':<12} | {'Recall':<12} | {'mAP@50':<12}")
    print("-" * 65)

    class_names = model.names
    for cls_id, cls_name in class_names.items():
        if cls_id < len(metrics.box.p):
            cls_p = metrics.box.p[cls_id]
            cls_r = metrics.box.r[cls_id]
            cls_map50 = metrics.box.ap50[cls_id]
            print(f"{cls_name:<20} | {cls_p * 100:>10.2f}% | {cls_r * 100:>10.2f}% | {cls_map50 * 100:>10.2f}%")

    print("-" * 65)

    # Locate generated plots
    save_dir = Path(metrics.save_dir)
    cm_path = save_dir / "confusion_matrix.png"
    pr_path = save_dir / "PR_curve.png"
    f1_path = save_dir / "F1_curve.png"

    print("\n[INFO] Generated Evaluation Plots saved to:")
    if cm_path.exists():
        print(f"  -> Confusion Matrix : {cm_path.resolve()}")
    if pr_path.exists():
        print(f"  -> Precision-Recall : {pr_path.resolve()}")
    if f1_path.exists():
        print(f"  -> F1-Confidence    : {f1_path.resolve()}")

    print("=" * 65 + "\n")
    return metrics


def test_single_images(model_path: str = "models/best.pt", test_dir: str = "dataset/images/test", num_samples: int = 5):
    """
    Runs quick visual inference on sample test images and displays them.
    """
    model_file = Path(model_path)
    if not model_file.exists():
        return

    test_path = Path(test_dir)
    image_files = list(test_path.glob("*.jpg")) + list(test_path.glob("*.png"))
    if not image_files:
        print(f"[INFO] No test sample images found in {test_dir} for visual preview.")
        return

    print(f"[INFO] Running visual prediction on {min(len(image_files), num_samples)} sample images...")
    model = YOLO(str(model_file))
    
    output_dir = Path("runs/detect/eval_samples")
    output_dir.mkdir(parents=True, exist_ok=True)

    for img_path in image_files[:num_samples]:
        results = model.predict(source=str(img_path), conf=0.4, save=True, project="runs/detect", name="eval_samples", exist_ok=True)
        print(f"  - Predicted: {img_path.name}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate YOLOv8 Packaging Defect Model")
    parser.add_argument("--model", type=str, default="models/best.pt", help="Path to best.pt weights")
    parser.add_argument("--data", type=str, default="data.yaml", help="Path to data.yaml")
    parser.add_argument("--split", type=str, default="val", choices=["val", "test"], help="Dataset split to evaluate")
    parser.add_argument("--imgsz", type=int, default=640, help="Image resolution")
    args = parser.parse_args()

    evaluate_model(
        model_path=args.model,
        data_yaml=args.data,
        imgsz=args.imgsz,
        split=args.split
    )
