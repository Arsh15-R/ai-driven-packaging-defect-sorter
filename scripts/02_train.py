"""
=============================================================================
Project: AI-Driven Packaging Line Defect Sorter
Script: 02_train.py
Purpose: Train YOLOv8s model with hardware-tailored settings for
         NVIDIA RTX 3050 (6 GB VRAM) on Windows, including conveyor-line
         augmentations and automatic checkpoint management.
=============================================================================
"""

import sys
import shutil
from pathlib import Path
import argparse
import torch
from ultralytics import YOLO


def check_cuda_environment():
    """
    Verifies PyTorch CUDA installation and GPU VRAM availability.
    Provides actionable guidance if PyTorch is running in CPU mode.
    """
    print("\n" + "=" * 60)
    print("           SYSTEM HARDWARE & CUDA VERIFICATION             ")
    print("=" * 60)

    cuda_available = torch.cuda.is_available()
    print(f"[INFO] PyTorch Version  : {torch.__version__}")
    print(f"[INFO] CUDA Available    : {cuda_available}")

    if not cuda_available:
        print("\n[CRITICAL WARNING] PyTorch is running in CPU mode!")
        print("Training on CPU will be extremely slow (hours instead of minutes).")
        print("Your RTX 3050 GPU was NOT detected by PyTorch.")
        print("\nFix this by running this command in your terminal:")
        print("  pip uninstall -y torch torchvision")
        print("  pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124")
        print("=" * 60 + "\n")
        if sys.stdin and sys.stdin.isatty():
            response = input("Do you still want to proceed with CPU training? (y/n): ").strip().lower()
            if response != 'y':
                sys.exit(1)
        else:
            print("[WARN] Non-interactive environment detected. Proceeding with CPU training.")
        device = "cpu"
    else:
        gpu_name = torch.cuda.get_device_name(0)
        total_vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
        print(f"[INFO] Detected GPU     : {gpu_name}")
        print(f"[INFO] Dedicated VRAM   : {total_vram_gb:.2f} GB")
        print("[INFO] CUDA is ready! Training will run on your RTX 3050.")
        print("=" * 60 + "\n")
        device = 0

    return device


def train_defect_detector(
    data_yaml: str = "data.yaml",
    model_name: str = "yolov8s.pt",
    epochs: int = 60,
    batch_size: int = 16,
    imgsz: int = 640,
    project_name: str = "runs/detect",
    run_name: str = "packaging_defect_model"
):
    """
    Trains YOLOv8s with hyperparameters optimized for 6GB VRAM and conveyor datasets.
    """
    device = check_cuda_environment()
    data_path = Path(data_yaml).resolve()

    if not data_path.exists():
        print(f"[ERROR] '{data_yaml}' not found at {data_path}!")
        print("Please make sure data.yaml exists in your project root.")
        sys.exit(1)

    print(f"[INFO] Loading baseline model: {model_name}...")
    model = YOLO(model_name)

    print(f"[INFO] Initiating training on {data_path.name}...")
    print(f"       Epochs: {epochs} | Batch: {batch_size} | Image Size: {imgsz}x{imgsz}")

    try:
        # Hyperparameters tuned for RTX 3050 6GB + Packaging Conveyor Belt:
        # - batch=16 fits comfortably within 4.0 - 4.5 GB VRAM with amp=True (FP16)
        # - workers=2 prevents Windows multiprocessing worker crashes
        # - augmentations simulate lighting flickers, conveyor vibration, and slight tilts
        results = model.train(
            data=str(data_path),
            epochs=epochs,
            batch=batch_size,
            imgsz=imgsz,
            device=device,
            workers=2,              # Safe setting for Windows OS
            patience=15,            # Early stopping if no mAP improvement for 15 epochs
            save=True,
            save_period=10,         # Save checkpoint every 10 epochs
            project=project_name,
            name=run_name,
            exist_ok=True,
            amp=True,               # Automatic Mixed Precision (FP16) reduces VRAM usage
            
            # --- Packaging Line Specific Augmentation Settings ---
            degrees=10.0,           # Box orientation jitter on conveyor (-10 to +10 deg)
            translate=0.10,         # Box shift horizontally or vertically
            scale=0.15,             # Box distance slight change
            shear=2.0,              # Small shear distortion
            hsv_h=0.015,            # Subtle color hue shift
            hsv_s=0.5,              # Lighting saturation variations (fluorescent/LED lighting)
            hsv_v=0.4,              # Lighting brightness/shadow variations
            fliplr=0.5,             # Left-right mirror flip
            flipud=0.0,             # No upside-down flip (packages sit upright on belt)
            mosaic=1.0,             # Mosaic augmentation (combines 4 images into 1)
            mixup=0.1,              # Mixup augmentation for blending defects
            close_mosaic=10,        # Turn off mosaic for final 10 epochs for crisp bounding boxes
            verbose=True
        )

        print("\n" + "=" * 60)
        print("                 TRAINING COMPLETE!                        ")
        print("=" * 60)

        # Locate best weights
        weights_dir = Path(project_name) / run_name / "weights"
        best_pt = weights_dir / "best.pt"
        last_pt = weights_dir / "last.pt"

        if best_pt.exists():
            print(f"[SUCCESS] Best model weights saved to:\n  -> {best_pt.resolve()}")
            
            # Create a convenience copy at models/best.pt for downstream scripts
            dest_models_dir = Path("models")
            dest_models_dir.mkdir(parents=True, exist_ok=True)
            saved_copy = dest_models_dir / "best.pt"
            shutil.copy(best_pt, saved_copy)
            print(f"[COPIED] Quick-access copy created at:\n  -> {saved_copy.resolve()}")
        else:
            print(f"[WARN] Training finished, but best.pt was not found at {best_pt}")

        print("=" * 60 + "\n")
        return results

    except torch.cuda.OutOfMemoryError:
        print("\n" + "!" * 60)
        print("[CUDA OUT OF MEMORY ERROR]")
        print("Your 6 GB VRAM ran out of memory with batch size 16.")
        print("Fix:")
        print("  Run again with batch size 8:")
        print("  python scripts/02_train.py --batch 8")
        print("!" * 60 + "\n")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train YOLOv8 on Packaging Line Defect Dataset")
    parser.add_argument("--data", type=str, default="data.yaml", help="Path to data.yaml")
    parser.add_argument("--model", type=str, default="yolov8s.pt", help="Base model (yolov8n.pt or yolov8s.pt)")
    parser.add_argument("--epochs", type=int, default=60, help="Number of training epochs")
    parser.add_argument("--batch", type=int, default=16, help="Batch size (16 for 6GB VRAM, reduce to 8 if OOM)")
    parser.add_argument("--imgsz", type=int, default=640, help="Image resolution for training")
    args = parser.parse_args()

    train_defect_detector(
        data_yaml=args.data,
        model_name=args.model,
        epochs=args.epochs,
        batch_size=args.batch,
        imgsz=args.imgsz
    )
