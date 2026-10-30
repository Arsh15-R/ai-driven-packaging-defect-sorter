@echo off
title SORTEX PRO - AI Packaging Inspection Backend
color 0A
cls
echo ====================================================================
echo        SORTEX PRO - AI PACKAGING INSPECTION BACKEND SERVER
echo ====================================================================
echo.
echo  FastAPI Server : http://127.0.0.1:8000
echo  Swagger Docs   : http://127.0.0.1:8000/docs
echo  Dashboard UI   : http://127.0.0.1:8000
echo.
echo  Starting server with YOLOv9 weights and physical laptop webcam...
echo ====================================================================
echo.
set PYTHON_EXE=python
if exist ".venv\Scripts\python.exe" set PYTHON_EXE=".venv\Scripts\python.exe"

start "" "http://127.0.0.1:8000"
%PYTHON_EXE% backend\api_server.py
pause
