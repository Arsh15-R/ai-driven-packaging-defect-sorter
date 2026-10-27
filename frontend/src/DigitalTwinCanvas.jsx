import React, { useRef, useEffect } from 'react';

/**
 * DigitalTwinCanvas: High-fidelity 60 FPS HTML5 Canvas simulation of the
 * AI Packaging Line Conveyor Belt, Optical Vision Gate, and SG90 Servo Diverter.
 */
export default function DigitalTwinCanvas({
  isPusherActive = false,
  confThreshold = 0.45,
  conveyorDelay = 2.8,
  onDefectDetected,
  onPusherFired,
}) {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    boxes: [],
    beltOffset: 0,
    pusherAngle: 0, // 0 deg (retracted) to 95 deg (extended)
    laserPos: 0,
    laserDir: 1,
    lastSpawn: 0,
    seq: 1050,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;

    // Responsive sizing
    const updateSize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    updateSize();
    window.addEventListener('resize', updateSize);

    const defectTypes = ['dent', 'label_missing', 'seal_broken', 'wrong_print'];

    // Spawn initial boxes
    if (stateRef.current.boxes.length === 0) {
      stateRef.current.boxes = [
        { id: 'PKG-1048', x: 120, status: 'GOOD', defect: null, conf: 0.98, scanned: true, diverted: false },
        { id: 'PKG-1049', x: 380, status: 'DEFECTIVE', defect: 'dent', conf: 0.94, scanned: true, diverted: false },
      ];
    }

    let lastTime = performance.now();

    const render = (now) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      const state = stateRef.current;

      // Conveyor speed (pixels per second)
      const beltSpeed = 110;
      state.beltOffset = (state.beltOffset + beltSpeed * dt) % 40;

      // Laser oscillation (Station 1)
      state.laserPos += state.laserDir * 80 * dt;
      if (state.laserPos > 40) {
        state.laserPos = 40;
        state.laserDir = -1;
      } else if (state.laserPos < -40) {
        state.laserPos = -40;
        state.laserDir = 1;
      }

      // Pusher arm angle dynamics
      const targetPusherAngle = isPusherActive ? 95 : 0;
      state.pusherAngle += (targetPusherAngle - state.pusherAngle) * Math.min(1, dt * 18);

      // Spawn periodic boxes
      if (now - state.lastSpawn > 3200) {
        state.lastSpawn = now;
        state.seq += 1;
        const isDefective = Math.random() < 0.28;
        const def = isDefective ? defectTypes[Math.floor(Math.random() * defectTypes.length)] : null;
        const conf = isDefective ? +(0.85 + Math.random() * 0.12).toFixed(2) : +(0.95 + Math.random() * 0.04).toFixed(2);

        state.boxes.push({
          id: `PKG-${state.seq}`,
          x: -60,
          status: isDefective ? 'DEFECTIVE' : 'GOOD',
          defect: def,
          conf: conf,
          scanned: false,
          diverted: false,
          yOffset: 0,
        });
      }

      // Key landmark X positions
      const station1X = w * 0.32; // Inspection zone
      const station2X = w * 0.72; // Reject pusher zone

      // Update boxes
      for (let i = state.boxes.length - 1; i >= 0; i--) {
        const b = state.boxes[i];
        if (!b.diverted) {
          b.x += beltSpeed * dt;
        } else {
          // Diverted sliding down reject chute
          b.x += beltSpeed * 0.4 * dt;
          b.yOffset += 160 * dt;
        }

        // Station 1 scan detection
        if (!b.scanned && b.x >= station1X - 25) {
          b.scanned = true;
          if (b.status === 'DEFECTIVE' && onDefectDetected) {
            onDefectDetected(b);
          }
        }

        // Station 2 divert trigger
        if (!b.diverted && b.status === 'DEFECTIVE' && b.x >= station2X - 20 && b.x <= station2X + 40) {
          if (state.pusherAngle > 40) {
            b.diverted = true;
            if (onPusherFired) onPusherFired(b);
          }
        }

        // Remove offscreen
        if (b.x > w + 80 || b.yOffset > h) {
          state.boxes.splice(i, 1);
        }
      }

      // ==========================================
      // DRAW CANVAS
      // ==========================================
      ctx.clearRect(0, 0, w, h);

      // 1. Dark Factory Floor Background
      ctx.fillStyle = '#070a12';
      ctx.fillRect(0, 0, w, h);

      // Floor grid subtle lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      // 2. Conveyor Assembly
      const beltY = h * 0.52;
      const beltH = 68;

      // Conveyor steel structure frame
      ctx.fillStyle = '#101524';
      ctx.fillRect(0, beltY - 14, w, beltH + 28);
      ctx.strokeStyle = '#222d45';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, beltY - 14, w, beltH + 28);

      // Top & bottom aluminum rails
      const gradRail = ctx.createLinearGradient(0, beltY - 14, 0, beltY);
      gradRail.addColorStop(0, '#3a4763');
      gradRail.addColorStop(1, '#1b2233');
      ctx.fillStyle = gradRail;
      ctx.fillRect(0, beltY - 14, w, 10);
      ctx.fillRect(0, beltY + beltH + 4, w, 10);

      // Belt bed (rubber textured)
      ctx.fillStyle = '#0a0d14';
      ctx.fillRect(0, beltY, w, beltH);

      // Belt slats (moving stripes)
      ctx.strokeStyle = '#182030';
      ctx.lineWidth = 2;
      for (let x = -state.beltOffset; x < w; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, beltY);
        ctx.lineTo(x, beltY + beltH);
        ctx.stroke();
      }

      // Conveyor direction chevrons
      ctx.fillStyle = 'rgba(0, 220, 255, 0.08)';
      ctx.font = '12px monospace';
      for (let x = 60; x < w; x += 140) {
        ctx.fillText('>>>>>>', x, beltY + beltH / 2 + 4);
      }

      // Reject Chute (Under Station 2)
      ctx.save();
      ctx.fillStyle = '#141824';
      ctx.beginPath();
      ctx.moveTo(station2X - 10, beltY + beltH);
      ctx.lineTo(station2X + 65, beltY + beltH);
      ctx.lineTo(station2X + 90, h);
      ctx.lineTo(station2X - 25, h);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#333e5c';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Reject bin label
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('REJECT BIN', station2X + 5, h - 14);
      ctx.restore();

      // 3. Station 1: Overhead Optical Vision Camera & Laser
      ctx.save();
      // Mount bracket
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(station1X, 0);
      ctx.lineTo(station1X, beltY - 60);
      ctx.stroke();

      // Industrial telecentric camera housing
      ctx.fillStyle = '#0b1326';
      ctx.fillRect(station1X - 28, beltY - 95, 56, 35);
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(station1X - 28, beltY - 95, 56, 35);

      // Lens cone
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.moveTo(station1X - 14, beltY - 60);
      ctx.lineTo(station1X + 14, beltY - 60);
      ctx.lineTo(station1X + 8, beltY - 48);
      ctx.lineTo(station1X - 8, beltY - 48);
      ctx.closePath();
      ctx.fill();

      // Camera status LED (green pulse)
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(station1X + 18, beltY - 82, 3, 0, Math.PI * 2);
      ctx.fill();

      // Station 1 Header Label
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('STATION 1: OPTICAL AI', station1X, beltY - 105);

      // Laser Sweep Curtain
      const scanX = station1X + state.laserPos;
      const gradLaser = ctx.createLinearGradient(station1X, beltY - 48, scanX, beltY + beltH);
      gradLaser.addColorStop(0, 'rgba(0, 240, 255, 0.45)');
      gradLaser.addColorStop(1, 'rgba(0, 240, 255, 0.02)');
      ctx.fillStyle = gradLaser;
      ctx.beginPath();
      ctx.moveTo(station1X - 4, beltY - 48);
      ctx.lineTo(station1X + 4, beltY - 48);
      ctx.lineTo(scanX + 12, beltY + beltH);
      ctx.lineTo(scanX - 12, beltY + beltH);
      ctx.closePath();
      ctx.fill();

      // Sharp laser scan line on belt
      ctx.strokeStyle = 'rgba(0, 255, 240, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(scanX, beltY);
      ctx.lineTo(scanX, beltY + beltH);
      ctx.stroke();
      ctx.restore();

      // 4. Draw Boxes on Conveyor
      state.boxes.forEach((b) => {
        const boxW = 54;
        const boxH = 44;
        const boxY = beltY + (beltH - boxH) / 2 + (b.yOffset || 0);

        ctx.save();
        ctx.translate(b.x, boxY);

        // Box shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(4, 4, boxW, boxH);

        // Box cardboard fill
        const gradBox = ctx.createLinearGradient(0, 0, boxW, boxH);
        gradBox.addColorStop(0, '#c28b51');
        gradBox.addColorStop(1, '#8e5e2e');
        ctx.fillStyle = gradBox;
        ctx.fillRect(0, 0, boxW, boxH);

        // Box tape / seam
        ctx.fillStyle = '#dfaf75';
        ctx.fillRect(boxW / 2 - 3, 0, 6, boxH);

        // Package label badge
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(6, 12, 18, 14);
        ctx.fillStyle = '#000000';
        ctx.fillRect(8, 14, 14, 2);
        ctx.fillRect(8, 18, 10, 2);
        ctx.fillRect(8, 22, 12, 2);

        // Specific defect visual cues
        if (b.status === 'DEFECTIVE') {
          if (b.defect === 'dent') {
            ctx.fillStyle = '#451a03';
            ctx.beginPath();
            ctx.arc(boxW - 10, 12, 8, 0, Math.PI * 2);
            ctx.fill();
          } else if (b.defect === 'label_missing') {
            // Label is scratched off / missing
            ctx.fillStyle = '#78350f';
            ctx.fillRect(6, 12, 18, 14);
          } else if (b.defect === 'seal_broken') {
            ctx.strokeStyle = '#dc2626';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(boxW / 2 - 6, 2);
            ctx.lineTo(boxW / 2 + 6, 14);
            ctx.stroke();
          } else if (b.defect === 'wrong_print') {
            ctx.fillStyle = '#dc2626';
            ctx.font = 'bold 9px monospace';
            ctx.fillText('ERR', 6, 24);
          }
        }

        // YOLOv8 Bounding Box & HUD tag if scanned
        if (b.scanned) {
          const isGood = b.status === 'GOOD';
          const hudColor = isGood ? '#10b981' : '#ef4444';

          ctx.strokeStyle = hudColor;
          ctx.lineWidth = 1.8;
          ctx.strokeRect(-4, -4, boxW + 8, boxH + 8);

          // Bounding Box Tag
          ctx.fillStyle = hudColor;
          ctx.fillRect(-4, -20, boxW + 28, 16);
          ctx.fillStyle = '#05070f';
          ctx.font = 'bold 9px monospace';
          const tagText = isGood ? 'GOOD' : (b.defect || 'DEFECT').toUpperCase();
          ctx.fillText(`${tagText} ${(b.conf * 100).toFixed(0)}%`, -1, -8);
        }

        ctx.restore();
      });

      // 5. Station 2: SG90 Pusher / Diverter Assembly
      ctx.save();
      // Mounting bracket from top
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(station2X, 0);
      ctx.lineTo(station2X, beltY - 35);
      ctx.stroke();

      // Servo Housing (blue SG90 acrylic casing)
      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(station2X - 16, beltY - 55, 32, 28);
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(station2X - 16, beltY - 55, 32, 28);

      // Station 2 Header Label
      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('STATION 2: SG90 REJECTOR', station2X, beltY - 65);

      // Servo Output Spline
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(station2X, beltY - 27, 6, 0, Math.PI * 2);
      ctx.fill();

      // Servo Swing Arm (rotates with pusherAngle)
      ctx.save();
      ctx.translate(station2X, beltY - 27);
      const rad = (state.pusherAngle * Math.PI) / 180;
      ctx.rotate(rad);

      // Aluminum linkage arm
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(-4, 0, 8, 48);
      ctx.strokeStyle = '#94a3b8';
      ctx.strokeRect(-4, 0, 8, 48);

      // Tactile pusher paddle at the tip
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(-18, 44, 36, 12);
      ctx.strokeStyle = '#fca5a5';
      ctx.strokeRect(-18, 44, 36, 12);

      ctx.restore();

      // Sparks / actuation halo when active
      if (state.pusherAngle > 30) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.beginPath();
        ctx.arc(station2X + 15, beltY + 20, 35, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fef08a';
        for (let s = 0; s < 5; s++) {
          const sx = station2X + 15 + (Math.random() - 0.5) * 30;
          const sy = beltY + 20 + (Math.random() - 0.5) * 30;
          ctx.fillRect(sx, sy, 2, 2);
        }
      }
      ctx.restore();

      // 6. Visual HUD Overlay Header on Canvas
      ctx.save();
      ctx.fillStyle = 'rgba(5, 7, 15, 0.7)';
      ctx.fillRect(10, 10, 240, 42);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.strokeRect(10, 10, 240, 42);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('OPTICAL TWIN: 1280×600 @ 30 FPS', 18, 26);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px monospace';
      ctx.fillText(`Inference: YOLOv8s (14.2ms) • Gate: ${(confThreshold * 100).toFixed(0)}%`, 18, 42);
      ctx.restore();

      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', updateSize);
    };
  }, [isPusherActive, confThreshold, conveyorDelay, onDefectDetected, onPusherFired]);

  return (
    <div className="relative w-full h-full min-h-[300px] overflow-hidden bg-[#070a12] rounded-2xl flex items-center justify-center">
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}
