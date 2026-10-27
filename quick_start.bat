@echo off
title AI-Driven Packaging Line Defect Sorter (React + Arc UI)
color 0B
:menu
cls
echo =====================================================================
echo    AI-DRIVEN PACKAGING LINE DEFECT SORTER - REACT + ARC UI
echo =====================================================================
echo.
echo   --- REACT + ARC UI MODERN DASHBOARD ---
echo   [1] Launch React + Arc UI Fullstack App (FastAPI + React Frontend)
echo   [2] Run React Dev Server (Vite Hot-Reload at localhost:3000)
echo.
echo   --- 100%% SOFTWARE SIMULATION (NO HARDWARE NEEDED) ---
echo   [3] Run Standalone OpenCV Conveyor Sorter (Window with Pusher Physics)
echo   [4] Generate Synthetic Dataset (75 Box Images & YOLO Labels)
echo   [5] Train YOLOv8s Model on GPU / CUDA (Uses Synthetic Dataset)
echo   [6] Evaluate Model Performance (mAP, Precision, Recall, Confusion Matrix)
echo.
echo   --- HARDWARE MODE (WHEN WEBCAM / ARDUINO READY) ---
echo   [7] Run Physical Webcam & Arduino Sorter
echo   [8] Capture Real Dataset from Webcam (Auto-Numbering)
echo   [9] Run Hardware & System Pre-Flight Diagnostics
echo   [Q] Quit
echo.
echo =====================================================================
set /p choice="Select an option (1-9 or Q): "

if "%choice%"=="1" goto react_app
if "%choice%"=="2" goto react_dev
if "%choice%"=="3" goto virtual_cv
if "%choice%"=="4" goto synth
if "%choice%"=="5" goto train
if "%choice%"=="6" goto eval
if "%choice%"=="7" goto webcam
if "%choice%"=="8" goto capture
if "%choice%"=="9" goto diag
if /i "%choice%"=="q" exit
goto menu

:react_app
cls
echo Starting FastAPI Backend + React Arc UI Dashboard...
echo Open your browser at: http://localhost:8000
echo Live Stream URL: http://localhost:8000/api/stream
start "" "http://localhost:8000"
python backend\api_server.py
pause
goto menu

:react_dev
cls
echo Starting Vite React Dev Server...
echo Make sure backend is running in another window!
cd frontend
npm run dev
pause
cd ..
goto menu

:virtual_cv
cls
echo Starting OpenCV Conveyor Sorter...
echo Press 'T' to manually test pusher, 'R' to reset counts, 'Q' to exit.
python scripts\04_realtime_detect.py --source virtual --conf 0.45 --delay 2.8
pause
goto menu

:synth
cls
echo Generating Synthetic Dataset...
python scripts\generate_sample_boxes.py
pause
goto menu

:train
cls
echo Starting YOLOv8s Training on RTX 3050...
python scripts\02_train.py --epochs 30 --batch 16
pause
goto menu

:eval
cls
echo Evaluating Model...
python scripts\03_evaluate.py --split val
pause
goto menu

:webcam
cls
echo Starting Physical Webcam & Arduino Sorter...
python scripts\04_realtime_detect.py --source 0 --conf 0.50 --delay 1.2
pause
goto menu

:capture
cls
echo Starting Webcam Image Collector...
python scripts\01_capture_dataset.py --camera 0
pause
goto menu

:diag
cls
echo Running Diagnostics...
python scripts\test_env.py
pause
goto menu
