"""
=============================================================================
Project: AI-Driven Packaging Line Defect Sorter
Script: arduino_controller.py
Purpose: USB Serial interface for Arduino conveyor reject mechanism.
         Features auto-port detection, non-blocking conveyor transit delay,
         and hardware simulation fallback if Arduino is unplugged.
=============================================================================
"""

import time
import threading
from typing import Optional
import serial
import serial.tools.list_ports


class ConveyorActuator:
    """
    Manages serial communication with the Arduino pusher actuator.
    Supports asynchronous conveyor travel delays (Camera -> Rejecter distance / Belt speed).
    """

    def __init__(
        self,
        port: Optional[str] = None,
        baudrate: int = 115200,
        transit_delay_seconds: float = 1.2,
        simulate: bool = False
    ):
        """
        :param port: Specific COM port (e.g. 'COM3'). If None, attempts auto-detection.
        :param baudrate: Must match Serial.begin() in Arduino sketch (default: 115200).
        :param transit_delay_seconds: Time taken for package to travel from camera to pusher arm.
        :param simulate: If True, simulates servo actuation in console without hardware.
        """
        self.baudrate = baudrate
        self.transit_delay = transit_delay_seconds
        self.serial_conn: Optional[serial.Serial] = None
        self.simulation_mode = simulate
        self.lock = threading.Lock()

        if not self.simulation_mode:
            target_port = port if port else self.auto_detect_arduino_port()
            if target_port:
                self.connect(target_port)
            else:
                print("[WARN] No Arduino found on USB ports. Falling back to SIMULATION MODE.")
                self.simulation_mode = True

    def auto_detect_arduino_port(self) -> Optional[str]:
        """
        Scans available COM ports for Arduino or common USB-UART chips (CH340, CP2102, FTDI).
        """
        available_ports = list(serial.tools.list_ports.comports())
        print(f"[INFO] Scanning {len(available_ports)} COM ports...")

        keywords = ["arduino", "ch340", "usb-serial", "cp210", "ftdi", "usb serial port"]
        for p in available_ports:
            desc = f"{p.device} - {p.description}".lower()
            print(f"  - Found: {p.device}: {p.description}")
            for kw in keywords:
                if kw in desc:
                    print(f"[INFO] Auto-detected Arduino candidate: {p.device}")
                    return p.device

        # If only 1 COM port is available (and it's not standard COM1), try it
        other_ports = [p.device for p in available_ports if p.device.upper() != "COM1"]
        if len(other_ports) == 1:
            print(f"[INFO] Using detected port: {other_ports[0]}")
            return other_ports[0]

        return None

    def connect(self, port: str):
        """
        Establishes connection to the Arduino and executes handshake.
        """
        try:
            print(f"[INFO] Connecting to Arduino on {port} @ {self.baudrate} baud...")
            self.serial_conn = serial.Serial(port=port, baudrate=self.baudrate, timeout=1.0)
            
            # Arduino resets on DTR connection; wait 2.0s for bootloader
            time.sleep(2.0)
            
            # Handshake check
            self.serial_conn.reset_input_buffer()
            self.serial_conn.write(b"PING\n")
            time.sleep(0.1)
            response = self.serial_conn.readline().decode('utf-8', errors='ignore').strip()
            print(f"[INFO] Arduino Handshake Response: '{response}'")
            print(f"[SUCCESS] Arduino connected successfully on {port}!")
            self.simulation_mode = False

        except serial.SerialException as e:
            print(f"[ERROR] Failed to connect to {port}: {e}")
            print("  -> Ensure Arduino IDE Serial Monitor is CLOSED.")
            print("  -> Switching to SIMULATION MODE for testing.")
            self.simulation_mode = True
            self.serial_conn = None

    def _send_reject_now(self, defect_type: str):
        """
        Dispatches the physical reject command to Arduino.
        """
        with self.lock:
            if self.simulation_mode or self.serial_conn is None:
                print(f"[SIMULATION ACTUATOR] >>> PUSHER EXTENDED! Defect '{defect_type}' knocked off belt! <<<")
                return

            try:
                self.serial_conn.write(b"REJECT\n")
                self.serial_conn.flush()
                print(f"[HARDWARE ACTUATOR] >>> REJECT signal sent for '{defect_type}'! Pusher activated. <<<")
            except Exception as e:
                print(f"[WARN] Serial communication error: {e}. Gracefully falling back to SIMULATION MODE.")
                try:
                    if self.serial_conn and self.serial_conn.is_open:
                        self.serial_conn.close()
                except Exception:
                    pass
                self.serial_conn = None
                self.simulation_mode = True
                print(f"[SIMULATION ACTUATOR] >>> PUSHER EXTENDED! Defect '{defect_type}' knocked off belt! <<<")

    def trigger_reject(self, defect_type: str = "defect", custom_delay: Optional[float] = None):
        """
        Schedules pusher actuation after conveyor transit delay (non-blocking).
        """
        delay = custom_delay if custom_delay is not None else self.transit_delay
        print(f"[SCHEDULER] Box with '{defect_type}' flagged. Pusher scheduled to trigger in {delay:.2f}s...")
        
        # Non-blocking Timer ensures video FPS remains smooth
        timer = threading.Timer(delay, self._send_reject_now, args=[defect_type])
        timer.daemon = True
        timer.start()

    def indicate_good(self):
        """
        Signals Arduino to briefly flash the green OK indicator.
        """
        with self.lock:
            if self.simulation_mode or self.serial_conn is None:
                return
            try:
                self.serial_conn.write(b"GOOD\n")
                self.serial_conn.flush()
            except Exception as e:
                print(f"[WARN] Serial indicate_good failed: {e}. Falling back to SIMULATION MODE.")
                try:
                    if self.serial_conn and self.serial_conn.is_open:
                        self.serial_conn.close()
                except Exception:
                    pass
                self.serial_conn = None
                self.simulation_mode = True

    def close(self):
        """
        Safely closes the serial connection.
        """
        with self.lock:
            if self.serial_conn:
                try:
                    if self.serial_conn.is_open:
                        self.serial_conn.close()
                except Exception as e:
                    print(f"[WARN] Error closing serial port: {e}")
                finally:
                    self.serial_conn = None
                    print("[INFO] Arduino serial port closed.")


if __name__ == "__main__":
    # Test script standalone
    print("Testing Conveyor Actuator...")
    actuator = ConveyorActuator(transit_delay_seconds=1.0)
    print("Sending test reject command...")
    actuator.trigger_reject("dent_test", custom_delay=0.5)
    time.sleep(2.0)
    actuator.close()
