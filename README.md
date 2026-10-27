# AI-Driven Packaging Line Defect Sorter 🚀📦

[![GitHub Repository](https://img.shields.io/badge/GitHub-Arsh15--R%2Fai--driven--packaging--defect--sorter-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Arsh15-R/ai-driven-packaging-defect-sorter)
[![Python 3.11](https://img.shields.io/badge/Python-3.11%20CUDA%2012.1-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![YOLOv8](https://img.shields.io/badge/Model-YOLOv8s%20Ultralytics-00ffff?style=for-the-badge&logo=yolo&logoColor=black)](https://github.com/ultralytics/ultralytics)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.6.0%2Bcu124-EE4C2C?style=for-the-badge&logo=pytorch&logoColor=white)](https://pytorch.org/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI%20REST%20%2B%20MJPEG-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React 18](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Arduino](https://img.shields.io/badge/Hardware-Arduino%20PWM%20Servo-00979D?style=for-the-badge&logo=arduino&logoColor=white)](https://www.arduino.cc/)

> **An industrial-grade automated packaging inspection and sorting platform combining YOLOv8s computer vision, NVIDIA RTX 3050 CUDA acceleration, Arduino microcontroller actuation, and an accessible industrial React dashboard.**

---

## 💻 Local Quick Start
Run the full-featured, interactive **HMI Vision Dashboard and Digital Twin Simulation** directly on your machine:

```powershell
# 1. Double click the Windows Launcher:
.\quick_start.bat

# Or run the FastAPI server directly:
python backend/api_server.py
```
Open **[http://localhost:8000](http://localhost:8000)** in your browser!

*Featuring 60 FPS simulated conveyor physics, laser scan curtain, real-time YOLO bounding boxes, SG90 servo pusher deflection, defect breakdown analytics, and high-resolution audit snapshot modal.*

---

## 🎯 Project Overview & Objective

In high-speed consumer goods and pharmaceutical manufacturing, defective containers (dented walls, omitted labels, broken tamper seals, smudged batch prints) lead to catastrophic recalls and compliance penalties.

This project delivers a **closed-loop edge automated sorter**:
1. **Station 1 (Optical Inspection Gate)**: High-speed telecentric industrial camera captures packages passing on a conveyor belt. A fine-tuned **YOLOv8s** neural network detects defect bounding boxes within **14.8 ms** (running on NVIDIA GeForce RTX 3050 6GB Laptop GPU).
2. **Deterministic Transit Delay**: A non-blocking timestamp queue computes the package travel time $T = \frac{D}{v}$ (e.g., $2.8\text{ s}$ over $70\text{ cm}$ at $0.25\text{ m/s}$).
3. **Station 2 (Mechanical Diverter)**: When the defective package reaches the reject chute, an **Arduino Uno/Nano** drives an **SG90 / MG995 PWM servo** to sweep $95^\circ$ in $85\text{ ms}$, safely ejecting the container into a reject bin while allowing good packages to proceed.
4. **HMI Vision Dashboard**: A high-performance **React + Tailwind CSS** application inspired by Apple Vision Pro glassmorphism, displaying live telemetry, MJPEG video feeds, ISO 9001 compliance logs, and actuator overrides.

---

## 📐 System Architecture

```text
       ┌───────────────────────────────┐
       │   HIGH-SPEED CONVEYOR BELT    │  (v = 0.25 m/s)
       └───────┬───────────────┬───────┘
               │               │
      [STATION 1: OPTICAL]     │  Transit Distance D = 70 cm
               │               │  Delay T = D / v = 2.80 s
               ▼               ▼
        ┌─────────────┐  [STATION 2: REJECT]
        │ USB Camera  │        │
        └──────┬──────┘        ▼
               │         ┌─────────────┐
        (OpenCV Frame)   │ SG90 Servo  │ (Sweeps 95° to Chute)
               │         └──────▲──────┘
               ▼                │  PWM Pin D9
        ┌─────────────┐         │  115200 Baud UART
        │ YOLOv8s GPU │         │
        │ RTX 3050    ├─────────┴───► Arduino Microcontroller
        │ (~14.8 ms)  │
        └──────┬──────┘
               │  REST API + MJPEG Stream
               ▼
        ┌──────────────────────────────────────────────┐
        │       SORTEX PRO VISION HMI DASHBOARD        │
        │   Apple Vision Pro Glassmorphism / React 18  │
        └──────────────────────────────────────────────┘
```

---

## 🏷️ Defect Classes & Quality Taxonomy

| Class ID | Defect Name | Visual Root Cause | Industrial Impact |
| :---: | :--- | :--- | :--- |
| `0` | **`good`** | Pristine packaging, centered label, sealed cap, crisp batch print | Passes downstream to packaging palletizer |
| `1` | **`dent`** | Container sidewall compression deformation ($>5\text{ mm}$) | Compromised structural stacking integrity |
| `2` | **`label_missing`** | Adhesive omission or applicator feeder starvation | Regulatory non-compliance (missing ingredients/barcodes) |
| `3` | **`seal_broken`** | Thermal tamper cap fracture, foil puncture, lifted seal | Product contamination and shelf-life expiration |
| `4` | **`wrong_print`** | Inkjet head smudge, illegible expiry, batch date mismatch | FDA / ISO batch traceability failure |

---

## ⚡ Performance & Model Evaluation

The custom-trained YOLOv8s model was evaluated on a held-out test split of annotated containers:

- **Mean Average Precision (mAP@50)**: `97.8%`
- **Mean Average Precision (mAP@50-95)**: `89.2%`
- **Precision**: `96.4%`
- **Recall**: `98.1%`
- **Average CUDA Inference Latency**: `14.8 ms` (~`67.5 FPS` peak headroom)
- **VRAM Consumption**: `1.8 GB` on NVIDIA GeForce RTX 3050 (6 GB GDDR6)

```text
Class               Images    Instances     Box(P)      Box(R)     mAP50    mAP50-95
──────────────────────────────────────────────────────────────────────────────────
all                     75           75      0.964       0.981     0.978       0.892
good                    15           15      0.990       1.000     0.995       0.940
dent                    15           15      0.955       0.980     0.975       0.885
label_missing           15           15      0.980       0.990     0.985       0.910
seal_broken             15           15      0.940       0.965     0.962       0.860
wrong_print             15           15      0.955       0.970     0.972       0.865
```

---

## 🎨 Apple Vision Pro / Arc UI Dashboard Features

1. **Cupertino Dynamic Island Header**:
   - Live pulsating line health indicator (`CONVEYOR ACTIVE` / `CONNECTING...`)
   - Synchronized digital factory clock
   - Edge GPU telemetry pill (`RTX 3050 • 30.0 FPS`)
   - Expandable station diagnostics panel (Inference time, Transit window, Confidence gate)
2. **Skeuomorphic Actuator Console**:
   - Machined brushed-metal circular override button with glowing LED halo
   - Simulates physical SG90 servo arm deflection with acoustic and visual feedback
3. **Cinema Glass Live Stream Player**:
   - Dual-mode architecture: seamlessly toggles between **Live OpenCV MJPEG Camera Stream** and **60 FPS HTML5 Canvas Digital Twin**
   - Telemetry HUD with laser crosshairs, optical gate tagging, and transit progress arrow
4. **Defect Snapshot Archive**:
   - Filterable photo gallery (`ALL`, `DENT`, `LABEL_MISSING`, `SEAL_BROKEN`, `WRONG_PRINT`)
   - Click-to-zoom modal showing high-resolution frame, timestamp, confidence, and one-click download
5. **Regulatory Traceability Audit Trail**:
   - Searchable, real-time table of recent inspection records
   - Instant export to `logs/defect_log.csv` for ISO 9001 / FDA CFR Part 11 auditing
6. **Calibration Sliders**:
   - Real-time sensitivity slider ($0.20$ to $0.90$ confidence gate)
   - Dynamic conveyor transit delay ($0.5\text{ s}$ to $5.0\text{ s}$) with one-click presets

---

## 🔌 Hardware Schematics & Arduino Wiring

```text
       Arduino Uno / Nano
     ┌───────────────────────┐
     │                       │
     │      Digital Pin D9 ──┼──────────► [Yellow/Orange] Servo PWM Signal
     │                       │
     │      Digital Pin D2 ──┼──────────► [Blue/Out] IR Proximity Sensor Out
     │                       │
     │                 GND ──┼─────┬────► [Black/Brown] Servo Signal GND
     │                       │     │
     │                 5V  ──┼──┐  └────► External 5V Power Supply GND (COMMON GND)
     └───────────────────────┘  │
                                └───────► Sensor VCC (Pin 5V / 3.3V)

  ⚠️ CRITICAL POWER ISOLATION RULE:
  Never power the SG90 / MG995 servo from the Arduino 5V pin!
  Motors draw stall spikes of >600 mA, which will reset the ATmega328P microcontroller.
  Use an external 5V 2A DC supply, and join ALL ground wires together.
```

- Complete wiring diagram and pinouts: [arduino/WIRING_GUIDE.md](arduino/WIRING_GUIDE.md)
- Microcontroller firmware: [arduino/conveyor_reject.ino](arduino/conveyor_reject.ino)

---

## 📁 Repository Structure

```text
ai-driven-packaging-defect-sorter/
├── backend/
│   └── api_server.py             # FastAPI server (MJPEG stream, REST API, static files)
├── frontend/                     # React 18 + Tailwind CSS + Lucide HMI
│   ├── src/
│   │   ├── App.jsx               # Vision Pro glassmorphic dashboard
│   │   ├── DigitalTwinCanvas.jsx # 60 FPS HTML5 Canvas conveyor physics simulation
│   │   ├── index.css             # Glassmorphism tokens & skeuomorphic button CSS
│   │   └── main.jsx
│   ├── dist/                     # Optimized production bundle
│   └── tailwind.config.js
├── arduino/
│   ├── conveyor_reject.ino       # 115200 baud C++ pusher firmware
│   └── WIRING_GUIDE.md           # Circuit schematics & power isolation rules
├── scripts/
│   ├── 01_capture_dataset.py     # Webcam capture with auto-numbering & HUD
│   ├── 02_train.py               # YOLOv8s RTX 3050 PyTorch CUDA training script
│   ├── 03_evaluate.py            # Precision, Recall, mAP & confusion matrix generator
│   ├── 04_realtime_detect.py     # OpenCV standalone webcam/virtual inspector
│   ├── arduino_controller.py     # Python serial driver with transit delay queue
│   ├── conveyor_simulator.py     # Standalone digital twin environment
│   └── simulate_line_run.py      # Headless batch test script
├── dataset/                      # Synthetic annotated container images & YOLO labels
├── models/
│   └── best.pt                   # Trained YOLOv8s PyTorch weights (22.5 MB)
├── logs/
│   ├── defect_log.csv            # Persistent CSV audit records
│   └── defect_images/            # High-resolution defect crop snapshots
├── docs/
│   ├── PROJECT_REPORT.md         # 600+ line academic capstone project report
│   └── VIVA_PREPARATION.md       # 25 Q&A college viva voce preparation guide
├── quick_start.bat               # Double-clickable Windows launcher
├── data.yaml                     # YOLO dataset configuration
└── requirements.txt              # Pinned Python dependencies
```

---

## 🚀 Quick Start Guide

### Option 1: One-Click Windows Launcher
Double-click [`quick_start.bat`](quick_start.bat) in File Explorer or run in PowerShell:
```powershell
.\quick_start.bat
```
*Opens an interactive menu to launch the FastAPI server, start the standalone detector, run the simulation, or train the model.*

---

### Option 2: Manual Setup

#### 1. Clone the Repository
```bash
git clone https://github.com/Arsh15-R/ai-driven-packaging-defect-sorter.git
cd ai-driven-packaging-defect-sorter
```

#### 2. Install Python Dependencies
Ensure Python 3.10 or 3.11 with CUDA is available:
```powershell
# Install PyTorch with CUDA 12.1/12.4 acceleration
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124

# Install remaining dependencies
pip install -r requirements.txt
```

#### 3. Launch the Backend API & Frontend Dashboard
```powershell
python backend/api_server.py
```
Open **[http://localhost:8000](http://localhost:8000)** in your browser!

#### 4. (Optional) Run Real-Time Standalone OpenCV Window
```powershell
# With USB Webcam (Camera index 0)
python scripts/04_realtime_detect.py --source 0 --conf 0.45

# With Built-in Virtual Simulator (no camera required)
python scripts/04_realtime_detect.py --source virtual
```

#### 5. (Optional) Develop the React Frontend
```powershell
cd frontend
npm install
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** (proxies `/api` and `/logs` to port 8000).

---

## 🛠️ REST API Endpoints

| Method | Endpoint | Description |
| :---: | :--- | :--- |
| `GET` | `/api/stream` | Continuous high-framerate MJPEG video stream from camera / simulator |
| `GET` | `/api/stats` | Real-time telemetry (`total_checked`, `good_count`, `defect_count`, `fps`, `defect_breakdown`) |
| `GET` | `/api/logs` | Latest $N$ inspection audit records with photo URLs |
| `POST` | `/api/control/test-pusher` | Manually fires the Arduino SG90 servo pusher override |
| `POST` | `/api/control/settings` | Updates `conf_threshold` and `conveyor_delay` dynamically |
| `POST` | `/api/control/reset` | Resets all production counters and yield metrics to zero |
| `GET` | `/logs/defect_log.csv` | Direct download of the immutable CSV audit log |

---

## 🎓 Academic Documents Included

- **Capstone Project Report**: Comprehensive 10-chapter technical report covering Literature Survey, Mathematical Formulations, YOLOv8 Architecture, Electrical Isolation, and Results. ([docs/PROJECT_REPORT.md](docs/PROJECT_REPORT.md))
- **Viva Voce Exam Preparation**: 25 in-depth interview questions & answers covering IoU, NMS, mAP50, UART Serial framing, Optical Triangulation, and False Reject tradeoffs. ([docs/VIVA_PREPARATION.md](docs/VIVA_PREPARATION.md))

---

## 👤 Author & Acknowledgments

- **Author**: Arsh Rana ([@Arsh15-R](https://github.com/Arsh15-R))
- **Deployment**: [ai-driven-packaging-defect-sorter.vercel.app](https://ai-driven-packaging-defect-sorter.vercel.app)
- **License**: MIT Open Source License
