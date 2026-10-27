/*
 =============================================================================
 Project: AI-Driven Packaging Line Defect Sorter
 File: conveyor_reject.ino
 Hardware: Arduino Uno / Nano / ESP32
 Actuator: Servo Motor (SG90 or MG995) on Pin 9
 Indicators: Green LED (Good) on Pin 7, Red LED (Reject) on Pin 8
 Sensor (Optional): IR Proximity Sensor on Pin 2
 =============================================================================
 Description:
   Listens for USB serial commands from the Python OpenCV AI detection script.
   When defect command 'R' or 'REJECT' is received:
     1. Lights Red LED
     2. Sweeps servo pusher arm from 0° (Retracted) to 90° (Ejected)
     3. Holds briefly to push the defective box off the conveyor into reject bin
     4. Returns servo arm to 0° (Retracted)
     5. Turns off Red LED and sends ACK back to Python
 =============================================================================
*/

#include <Servo.h>

// --- Pin Definitions ---
const int SERVO_PIN    = 9;  // PWM pin for Pusher Servo
const int LED_GREEN    = 7;  // Indicator for normal / good package
const int LED_RED      = 8;  // Indicator for defect / pusher active
const int BUZZER_PIN   = 6;  // Optional active buzzer (set to -1 if not used)
const int IR_PIN       = 2;  // Optional IR entry proximity sensor

// --- Servo Configuration ---
Servo rejectServo;
const int POS_RETRACTED = 0;   // Rest / Clear position (out of conveyor path)
const int POS_REJECT    = 95;  // Extended push position (pushes box off belt)
const int PUSH_HOLD_MS  = 350; // Milliseconds to hold at extended position

// --- State Variables ---
bool isRejecting = false;
unsigned long rejectStartTime = 0;

void setup() {
  // Initialize USB Serial communication at 115200 baud
  Serial.begin(115200);
  while (!Serial && millis() < 3000) {
    ; // Wait for serial port to connect (needed for native USB boards)
  }

  // Configure output pins
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  if (BUZZER_PIN > 0) {
    pinMode(BUZZER_PIN, OUTPUT);
  }
  pinMode(IR_PIN, INPUT_PULLUP);

  // Initialize Servo
  rejectServo.attach(SERVO_PIN);
  rejectServo.write(POS_RETRACTED); // Ensure pusher starts retracted
  delay(300);

  // Initial LED self-test flash
  digitalWrite(LED_GREEN, HIGH);
  digitalWrite(LED_RED, HIGH);
  delay(400);
  digitalWrite(LED_RED, LOW);
  digitalWrite(LED_GREEN, HIGH); // Green stays ON (System Ready)

  Serial.println("ARDUINO_READY:Packaging Defect Sorter Actuator Online");
}

void loop() {
  // 1. Check for incoming Serial commands from Python
  if (Serial.available() > 0) {
    String command = Serial.readStringUntil('\n');
    command.trim(); // Remove whitespace and \r

    if (command == "R" || command == "REJECT") {
      executeRejectPusher();
    }
    else if (command == "G" || command == "GOOD") {
      indicateGoodPackage();
    }
    else if (command == "P" || command == "PING") {
      Serial.println("PONG");
    }
    else if (command == "STATUS") {
      Serial.print("STATUS:Ready,ServoPos:");
      Serial.print(rejectServo.read());
      Serial.print(",IR:");
      Serial.println(digitalRead(IR_PIN) == LOW ? "DETECTED" : "CLEAR");
    }
  }

  // 2. Non-blocking reset for the pusher
  if (isRejecting && (millis() - rejectStartTime >= PUSH_HOLD_MS)) {
    // Return servo to rest position
    rejectServo.write(POS_RETRACTED);
    digitalWrite(LED_RED, LOW);
    digitalWrite(LED_GREEN, HIGH);
    if (BUZZER_PIN > 0) digitalWrite(BUZZER_PIN, LOW);
    isRejecting = false;
    Serial.println("REJECT_COMPLETE");
  }
}

/**
 * Triggers the servo actuator to knock the defective box off the belt.
 */
void executeRejectPusher() {
  if (isRejecting) return; // Prevent double trigger while currently moving

  Serial.println("REJECT_TRIGGERED");
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_RED, HIGH);
  if (BUZZER_PIN > 0) digitalWrite(BUZZER_PIN, HIGH);

  // Extend pusher arm across conveyor belt
  rejectServo.write(POS_REJECT);

  isRejecting = true;
  rejectStartTime = millis();
}

/**
 * Visual flash when a good package passes without defects.
 */
void indicateGoodPackage() {
  digitalWrite(LED_GREEN, LOW);
  delay(80);
  digitalWrite(LED_GREEN, HIGH);
  Serial.println("GOOD_ACK");
}
