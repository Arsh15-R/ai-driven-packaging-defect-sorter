@echo off
title SORTEX PRO - AI Packaging Inspection Pipeline (RTX 3050 CUDA)
color 0B
cls
echo ====================================================================
echo        SORTEX PRO - AI PACKAGING DEFECT SORTER PIPELINE
echo ====================================================================
echo.
echo  Tracking  : ByteTrack Object Tracking (Unique Persistent ID)
echo  Decision  : Virtual Gate Line (One Decision per Package ID)
echo  Actuation : Virtual Pusher (with Arduino plug-in ready)
echo  Model     : models/best.pt (YOLOv9 on RTX 3050 CUDA)
echo.
echo  Controls:
echo    [ESC / Q] : Exit Pipeline
echo    [T]       : Test Pusher Simulation
echo    [R]       : Reset Production Counters
echo    [+] / [-] : Adjust Confidence Threshold in Real Time
echo ====================================================================
echo.

set PYTHON_EXE=python
if exist ".venv\Scripts\python.exe" set PYTHON_EXE=".venv\Scripts\python.exe"

%PYTHON_EXE% scripts\sortex_pro_pipeline.py --source 0 --conf 0.50
pause
