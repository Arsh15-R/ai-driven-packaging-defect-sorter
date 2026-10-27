"""
=============================================================================
Project: AI-Driven Packaging Line Defect Sorter
Script: conveyor_simulator.py (100% Software Digital Twin)
Purpose: Simulates a physical packaging conveyor belt on screen:
         - Moving conveyor belt with dynamic packaging boxes
         - Spawns Good, Dent, Label Missing, Broken Seal, and Wrong Print items
         - Features a simulated Camera Station and Animated Servo Pusher
         - Allows complete end-to-end testing without any physical hardware!
=============================================================================
"""

import time
import random
import math
from pathlib import Path
import cv2
import numpy as np

CLASSES = ["good", "dent", "label_missing", "seal_broken", "wrong_print"]


class ConveyorItem:
    def __init__(self, x_pos: float, y_pos: float, width: int = 150, height: int = 180, defect_type: str = "good"):
        self.x = x_pos
        self.y = y_pos
        self.width = width
        self.height = height
        self.defect_type = defect_type
        self.speed = 120.0  # pixels per second
        self.is_rejected = False
        self.reject_velocity_y = 0.0  # Moves down into reject bin when pushed
        self.inspected = False
        self.item_id = f"PKG-{random.randint(1000, 9999)}"

    def update(self, dt: float):
        if not self.is_rejected:
            self.x += self.speed * dt
        else:
            # Pushed into reject bin
            self.y += self.reject_velocity_y * dt
            self.x += (self.speed * 0.3) * dt  # slow forward drift

    def draw(self, frame: np.ndarray):
        bx1 = int(self.x - self.width // 2)
        by1 = int(self.y - self.height // 2)
        bx2 = int(self.x + self.width // 2)
        by2 = int(self.y + self.height // 2)

        # Check frame boundaries
        if bx2 < 0 or bx1 > frame.shape[1] or by1 > frame.shape[0]:
            return

        # Main Box Body (Cardboard white/beige)
        cv2.rectangle(frame, (bx1, by1), (bx2, by2), (235, 235, 235), -1)
        cv2.rectangle(frame, (bx1, by1), (bx2, by2), (90, 90, 90), 2)

        # Header Branding
        hdr_h = 32
        cv2.rectangle(frame, (bx1 + 8, by1 + 10), (bx2 - 8, by1 + 10 + hdr_h), (210, 45, 45), -1)
        cv2.putText(frame, "MED-PACK", (bx1 + 16, by1 + 33),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)

        # Barcode / Label
        if self.defect_type != "label_missing":
            lx1, ly1 = bx1 + 15, by1 + 55
            lx2, ly2 = bx2 - 15, by1 + 115
            cv2.rectangle(frame, (lx1, ly1), (lx2, ly2), (255, 255, 255), -1)
            cv2.rectangle(frame, (lx1, ly1), (lx2, ly2), (180, 180, 180), 1)

            # Barcode stripes
            for sx in range(lx1 + 8, lx2 - 8, 5):
                cv2.line(frame, (sx, ly1 + 8), (sx, ly1 + 38), (30, 30, 30), 2)

            if self.defect_type == "wrong_print":
                cv2.putText(frame, "EXP: #ERR!", (lx1 + 5, ly2 - 8),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 0, 220), 2)
            else:
                cv2.putText(frame, "EXP: 12/28", (lx1 + 5, ly2 - 8),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.42, (40, 40, 40), 1)

        # Seal
        seal_x1, seal_y1 = bx1 + self.width // 3, by1 - 5
        seal_x2, seal_y2 = bx1 + (2 * self.width) // 3, by1 + 8
        if self.defect_type == "seal_broken":
            cv2.rectangle(frame, (seal_x1, seal_y1), (seal_x1 + 12, seal_y2), (0, 0, 220), -1)
            cv2.line(frame, (seal_x1 + 12, seal_y1), (seal_x1 + 22, seal_y2 + 6), (0, 0, 0), 2)
        else:
            cv2.rectangle(frame, (seal_x1, seal_y1), (seal_x2, seal_y2), (40, 180, 220), -1)

        # Dent Defect
        if self.defect_type == "dent":
            dent_poly = np.array([
                [bx2 - 25, by2 - 40],
                [bx2 + 8, by2 - 25],
                [bx2 - 12, by2 + 8],
                [bx2 - 45, by2]
            ], np.int32)
            cv2.fillPoly(frame, [dent_poly], (60, 60, 60))
            cv2.polylines(frame, [dent_poly], True, (20, 20, 20), 2)

        # ID Tag
        cv2.putText(frame, self.item_id, (bx1 + 10, by2 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (100, 100, 100), 1)


class VirtualConveyorEnvironment:
    """
    Virtual factory conveyor line with animated belt, camera inspection zone,
    and mechanical servo reject pusher arm.
    """

    def __init__(self, width: int = 1280, height: int = 600):
        self.width = width
        self.height = height
        self.items: list[ConveyorItem] = []
        self.belt_y1 = 150
        self.belt_y2 = 450
        self.belt_center_y = (self.belt_y1 + self.belt_y2) // 2
        self.belt_offset = 0

        # Camera Station Location (Pixels)
        self.cam_station_x = 420
        self.cam_zone_w = 260
        self.cam_zone_h = 280

        # Pusher Reject Station Location (Pixels)
        self.pusher_x = 920
        self.pusher_y = self.belt_y1 - 10
        self.pusher_angle = 0.0      # 0 deg (retracted), 90 deg (push)
        self.pusher_target_angle = 0.0
        self.is_pusher_active = False

        self.last_spawn_time = time.time()
        self.spawn_interval = 2.4   # seconds between new boxes

    def trigger_pusher(self):
        """Actuates the virtual servo pusher arm."""
        self.pusher_target_angle = 90.0
        self.is_pusher_active = True

    def reset_pusher(self):
        """Retracts the virtual servo pusher arm."""
        self.pusher_target_angle = 0.0
        self.is_pusher_active = False

    def update(self, dt: float):
        # Update belt animation texture
        self.belt_offset = (self.belt_offset + int(120 * dt)) % 40

        # Smooth servo angle motion
        if abs(self.pusher_angle - self.pusher_target_angle) > 1.0:
            step = 380.0 * dt
            if self.pusher_angle < self.pusher_target_angle:
                self.pusher_angle = min(self.pusher_angle + step, self.pusher_target_angle)
            else:
                self.pusher_angle = max(self.pusher_angle - step, self.pusher_target_angle)
        elif self.pusher_target_angle == 90.0:
            # Auto-retract after holding
            self.pusher_target_angle = 0.0

        # Spawn new boxes
        now = time.time()
        if now - self.last_spawn_time >= self.spawn_interval:
            self.last_spawn_time = now
            # 50% Good, 50% Defects evenly divided
            if random.random() < 0.50:
                defect = "good"
            else:
                defect = random.choice(["dent", "label_missing", "seal_broken", "wrong_print"])

            new_box = ConveyorItem(
                x_pos=-80,
                y_pos=self.belt_center_y + random.randint(-15, 15),
                defect_type=defect
            )
            self.items.append(new_box)

        # Update items & check pusher collision
        surviving_items = []
        for item in self.items:
            item.update(dt)

            # Check if pusher hits defective box at pusher station
            if self.pusher_angle > 45.0 and not item.is_rejected:
                if abs(item.x - self.pusher_x) < 70:
                    item.is_rejected = True
                    item.reject_velocity_y = 300.0  # Push downward into reject bin

            # Keep items that are still on screen
            if item.x < self.width + 100 and item.y < self.height + 150:
                surviving_items.append(item)

        self.items = surviving_items

    def render(self) -> np.ndarray:
        frame = np.full((self.height, self.width, 3), 32, dtype=np.uint8)

        # 1. Conveyor Belt Track
        cv2.rectangle(frame, (0, self.belt_y1), (self.width, self.belt_y2), (48, 48, 52), -1)
        # Conveyor metal side guardrails
        cv2.rectangle(frame, (0, self.belt_y1 - 8), (self.width, self.belt_y1), (120, 125, 130), -1)
        cv2.rectangle(frame, (0, self.belt_y2), (self.width, self.belt_y2 + 8), (120, 125, 130), -1)

        # Conveyor belt roller texture (moving lines)
        for rx in range(-40 + self.belt_offset, self.width + 40, 40):
            cv2.line(frame, (rx, self.belt_y1), (rx, self.belt_y2), (40, 40, 44), 2)

        # Conveyor direction arrows
        for ax in range(100, self.width - 100, 250):
            cv2.arrowedLine(frame, (ax, self.belt_center_y), (ax + 50, self.belt_center_y),
                            (70, 70, 75), 2, tipLength=0.3)

        # 2. Camera Station Overlay (Virtual Inspection Zone)
        cam_x1 = self.cam_station_x - self.cam_zone_w // 2
        cam_y1 = self.belt_center_y - self.cam_zone_h // 2
        cam_x2 = self.cam_station_x + self.cam_zone_w // 2
        cam_y2 = self.belt_center_y + self.cam_zone_h // 2

        # Draw semi-transparent cyan field for Camera FOV
        overlay = frame.copy()
        cv2.rectangle(overlay, (cam_x1, cam_y1), (cam_x2, cam_y2), (255, 200, 0), -1)
        cv2.addWeighted(overlay, 0.12, frame, 0.88, 0, frame)
        cv2.rectangle(frame, (cam_x1, cam_y1), (cam_x2, cam_y2), (255, 200, 0), 2)
        cv2.putText(frame, "[CAMERA STATION 1: AI VISION]", (cam_x1 + 10, cam_y1 - 15),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 200, 0), 2)

        # 3. Reject Bin Chute below pusher
        bin_x1 = self.pusher_x - 70
        bin_y1 = self.belt_y2 + 8
        bin_x2 = self.pusher_x + 90
        bin_y2 = self.height - 20
        cv2.rectangle(frame, (bin_x1, bin_y1), (bin_x2, bin_y2), (25, 25, 90), -1)
        cv2.rectangle(frame, (bin_x1, bin_y1), (bin_x2, bin_y2), (0, 0, 200), 2)
        cv2.putText(frame, "REJECT BIN", (bin_x1 + 12, bin_y2 - 15),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 100, 255), 2)

        # 4. Draw Passing Packaging Boxes
        for item in self.items:
            item.draw(frame)

        # 5. Servo Pusher Arm (Pivoting mechanical arm)
        arm_len = 160
        # Calculate arm tip based on servo angle (0 deg = flat against rail, 90 deg = across belt)
        rad = math.radians(self.pusher_angle)
        # Pivot point
        pivot_x = self.pusher_x - 30
        pivot_y = self.belt_y1 - 4
        tip_x = int(pivot_x + arm_len * math.cos(rad))
        tip_y = int(pivot_y + arm_len * math.sin(rad))

        # Servo mounting base
        cv2.rectangle(frame, (pivot_x - 25, pivot_y - 30), (pivot_x + 25, pivot_y + 4), (80, 80, 80), -1)
        cv2.circle(frame, (pivot_x, pivot_y), 10, (200, 200, 0), -1)

        # Pusher arm paddle
        paddle_color = (0, 0, 255) if self.pusher_angle > 20 else (0, 140, 255)
        cv2.line(frame, (pivot_x, pivot_y), (tip_x, tip_y), paddle_color, 8)
        cv2.circle(frame, (tip_x, tip_y), 12, paddle_color, -1)
        cv2.putText(frame, f"[STATION 2: SERVO PUSHER ({int(self.pusher_angle)}*)]",
                    (self.pusher_x - 100, self.belt_y1 - 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 200, 255), 2)

        return frame

    def get_camera_frame(self) -> tuple[np.ndarray, list[ConveyorItem]]:
        """
        Extracts cropped high-res image corresponding to Camera Station 1
        so the YOLO detector can inspect it like a real webcam!
        """
        cam_x1 = max(self.cam_station_x - self.cam_zone_w // 2, 0)
        cam_y1 = max(self.belt_center_y - self.cam_zone_h // 2, 0)
        cam_x2 = min(self.cam_station_x + self.cam_zone_w // 2, self.width)
        cam_y2 = min(self.belt_center_y + self.cam_zone_h // 2, self.height)

        full_render = self.render()
        cam_crop = full_render[cam_y1:cam_y2, cam_x1:cam_x2].copy()

        # Find items currently under the camera
        active_items = [
            it for it in self.items
            if (cam_x1 <= it.x <= cam_x2) and not it.inspected
        ]
        return cam_crop, active_items
