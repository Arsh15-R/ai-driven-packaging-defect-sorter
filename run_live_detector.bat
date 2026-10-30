@echo off
title SORTEX PRO - Live YOLOv9 Defect Detector (RTX 3050 CUDA)
color 0A
cls
echo ====================================================================
echo      SORTEX PRO - LIVE WEBCAM DEFECT DETECTOR (YOLOv9 + CUDA)
echo ====================================================================
echo.
echo  Model   : models/best.pt
echo  Device  : NVIDIA GeForce RTX 3050 (CUDA)
echo  Source  : Laptop Webcam (Index 0)
echo.
echo  Controls:
echo    [ESC / Q] : Exit Window
echo    [SPACE]   : Pause / Resume Stream
echo    [+] / [-] : Adjust Confidence Threshold in Real Time
echo    [S]       : Save Current Snapshot to logs/screenshots/
echo ====================================================================
echo.

set PYTHON_EXE=python
if exist ".venv\Scripts\python.exe" set PYTHON_EXE=".venv\Scripts\python.exe"

%PYTHON_EXE% scripts\live_defect_detect.py --source 0 --conf 0.50
pause
