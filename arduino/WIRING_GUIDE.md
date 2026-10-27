# Hardware Wiring Guide & Circuit Schematic
## AI-Driven Packaging Line Defect Sorter

---

### 1. Bill of Materials (BOM)

| Component | Quantity | Purpose |
| :--- | :--- | :--- |
| **Arduino Uno / Nano** | 1 | Microcontroller handling servo actuation & sensors |
| **Servo Motor** (SG90 or MG995) | 1 | Mechanical pusher arm to reject defective boxes |
| **IR Proximity Sensor** (FC-51 or E18-D80NK) | 1 | Optional entry trigger / package position detector |
| **Green LED** | 1 | System Healthy / Good package pass indicator |
| **Red LED** | 1 | Defect detected / Pusher active indicator |
| **Resistors (220Ω - 330Ω)** | 2 | Current-limiting resistors for LEDs |
| **External 5V DC Power Source** | 1 | Power supply for the servo motor (prevents Arduino resets) |
| **USB Type-A/B Cable** | 1 | Connects Arduino to Laptop for Serial Communication |
| **Jumper Wires & Breadboard** | 1 set | Interconnections |

---

### 2. Critical Power Isolation Rule (Common Ground)

> [!WARNING]
> **DO NOT power the servo motor directly from the Arduino's 5V pin!**
> When the pusher arm actuates, a standard servo draws between **500 mA and 1.2 A** of stall current. The Arduino's onboard 5V regulator can only output ~400 mA. Powering the servo directly from the Arduino will cause voltage brownouts, resetting the Arduino and corrupting USB serial communication!

#### The Golden Rule:
1. Connect the **Servo (+) Red wire** to an **External 5V/6V Power Supply** (e.g. 5V 2A phone charger adapter or breadboard power module).
2. Connect the **Servo (-) Brown/Black wire** to the **External Power Supply Ground**.
3. **MANDATORY**: Connect the **External Power Supply Ground to the Arduino GND pin**. A shared common ground is required for the PWM signal on Pin 9 to have a common voltage reference.

---

### 3. Pin Connection Table

| Peripheral | Peripheral Pin / Wire | Connects to Arduino Pin | Notes |
| :--- | :--- | :--- | :--- |
| **Servo Motor** | Signal (Yellow / Orange) | **Pin D9** (PWM) | Controls pusher angle (0° to 95°) |
| | VCC (Red) | **External 5V (+)** | **DO NOT connect to Arduino 5V** |
| | GND (Brown / Black) | **External GND (-)** | **Bridge with Arduino GND** |
| **IR Sensor** (FC-51) | VCC | **Arduino 5V** | Sensors draw < 20 mA (Safe for Arduino 5V) |
| | GND | **Arduino GND** | |
| | OUT | **Pin D2** | Digital LOW when box is present |
| **Green LED** | Anode (+) via 220Ω resistor | **Pin D7** | High = Good Package Passed |
| | Cathode (-) | **Arduino GND** | |
| **Red LED** | Anode (+) via 220Ω resistor | **Pin D8** | High = Defective Box Ejecting |
| | Cathode (-) | **Arduino GND** | |
| **Buzzer** (Optional)| (+) | **Pin D6** | Emits beep during rejection |
| | (-) | **Arduino GND** | |

---

### 4. ASCII Circuit Schematic

```text
       +--------------------+
       |  EXTERNAL 5V / 2A  |
       |    POWER SUPPLY    |
       +---------+----------+
            (+)  |       |  (-)
             |   |       +------------------------------------+
             |   |                                            |
             |   +--------+ (Red VCC)                         |
             |            |                                   |
             |      +-----+------+                            |
             |      | SERVO      |                            |
             |      | (SG90 /    |                            |
             |      |  MG995)    |                            |
             |      +-----+------+                            |
             | (Orange)   | (Brown GND)                       |
             |    |       +-------------------+               |
             |    |                           |               |
             |    |                           v               v
    +--------+----+---------------------------+---------------+-------+
    |                                        GND             GND      |
    |                                                                 |
    |                    ARDUINO UNO / NANO                           |
    |                                                                 |
    |      D9 (PWM)       D7            D8           D2         5V    |
    +-------+--------------+-------------+------------+----------+----+
            |              |             |            |          |
            |              |             |            |          +---> IR Sensor VCC
            +-> Servo Sig  |             |            |
                           v             v            +--------------> IR Sensor OUT
                         [220Ω]        [220Ω]         |
                           |             |            +--------------> IR Sensor GND -> Arduino GND
                         ( + )         ( + )
                       GREEN LED      RED LED
                         ( - )         ( - )
                           |             |
                           +------+------+
                                  |
                                  v
                             Arduino GND
```

---

### 5. Mechanical Pusher Alignment on the Conveyor

1. **Camera Placement**: Mount the webcam 25–35 cm directly above the conveyor belt pointing straight down at the inspection zone.
2. **Pusher Placement**: Mount the servo motor on the side rail of the conveyor, **15 to 25 cm downstream** from the camera view.
3. **Pusher Arm**: Attach a lightweight acrylic or 3D-printed paddle to the servo horn. At 0°, the paddle rests flush with the conveyor rail (clear of passing boxes). At 90°, it swings across the belt, knocking the defective box into a reject bin.
4. **Transit Delay Calibration**:
   $$\text{Delay (seconds)} = \frac{\text{Distance from Camera to Pusher (cm)}}{\text{Conveyor Speed (cm/s)}}$$
   *(Example: Distance = 24 cm, Speed = 20 cm/s $\rightarrow$ Delay = 1.20 seconds).*
   You can adjust this delay directly with `--delay 1.2` when launching [`scripts/04_realtime_detect.py`](file:///d:/ai-driven%20packaging/scripts/04_realtime_detect.py).
