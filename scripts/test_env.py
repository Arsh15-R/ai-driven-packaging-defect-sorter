"""
=============================================================================
Project: AI-Driven Packaging Line Defect Sorter
Script: test_env.py
Purpose: Test camera connectivity, CUDA GPU availability, and installed
         packages to ensure everything is ready before data collection & training.
=============================================================================
"""

import sys

def run_diagnostics():
    print("=" * 60)
    print("       PACKAGING LINE DEFECT SORTER - PRE-FLIGHT CHECK      ")
    print("=" * 60)

    # 1. Python Version
    print(f"[1/4] Python Version: {sys.version.split()[0]}")

    # 2. PyTorch & CUDA Check
    print("\n[2/4] PyTorch & NVIDIA GPU Check:")
    try:
        import torch
        print(f"      - PyTorch installed : v{torch.__version__}")
        cuda_ok = torch.cuda.is_available()
        print(f"      - CUDA available   : {cuda_ok}")
        if cuda_ok:
            print(f"      - GPU Device Name  : {torch.cuda.get_device_name(0)}")
            vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
            print(f"      - Dedicated VRAM   : {vram_gb:.2f} GB (RTX 3050)")
            print("      -> STATUS: GPU ACCELERATION READY [OK]")
        else:
            print("      -> STATUS: RUNNING ON CPU ONLY [WARNING]")
            print("         Run this in terminal to install CUDA PyTorch:")
            print("         pip uninstall -y torch torchvision")
            print("         pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124")
    except ImportError:
        print("      -> ERROR: PyTorch is NOT installed!")

    # 3. Ultralytics YOLO Check
    print("\n[3/4] Ultralytics YOLOv9 Check:")
    try:
        import ultralytics
        print(f"      - Ultralytics version: v{ultralytics.__version__} [OK]")
    except ImportError:
        print("      -> ERROR: ultralytics is not installed! Run: pip install ultralytics")

    # 4. Camera Detection Check
    print("\n[4/4] Scanning Available Webcams (Index 0 to 3)...")
    try:
        import cv2
        found_cams = []
        for idx in range(4):
            cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
            if cap.isOpened():
                ret, _ = cap.read()
                if ret:
                    found_cams.append(idx)
                cap.release()
        
        if found_cams:
            print(f"      - Accessible camera indices: {found_cams} [OK]")
            print(f"      -> Recommended capture command: python scripts/01_capture_dataset.py --camera {found_cams[0]}")
        else:
            print("      -> WARNING: No working webcams detected.")
            print("         Check USB connection and Windows camera permissions.")
    except ImportError:
        print("      -> ERROR: OpenCV (cv2) is not installed! Run: pip install opencv-python")

    print("\n" + "=" * 60)
    print("Pre-flight check completed.")
    print("=" * 60 + "\n")

if __name__ == "__main__":
    run_diagnostics()
