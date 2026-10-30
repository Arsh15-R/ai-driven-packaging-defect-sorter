import React, { useRef, useEffect } from 'react';

/**
 * DigitalTwinCanvas: Flat industrial 60 FPS simulation of the
 * packaging inspection line with zero decorative gradients.
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
    pusherAngle: 0,
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

    const updateSize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    updateSize();
    window.addEventListener('resize', updateSize);

    const defectTypes = ['dent', 'label_missing', 'seal_broken', 'wrong_print'];

    if (stateRef.current.boxes.length === 0) {
      stateRef.current.boxes = [
        { id: 'PKG-1048', x: 120, status: 'GOOD', defect: null, conf: 0.98, scanned: true, diverted: false },
        { id: 'PKG-1049', x: 380, status: 'DEFECTIVE', defect: 'dent', conf: 0.94, scanned: true, diverted: false },
      ];
    }

    let lastTime = performance.now();

    const isReducedMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const render = (now) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const state = stateRef.current;

      const beltSpeed = 110;
      state.beltOffset = (state.beltOffset + beltSpeed * dt) % 40;

      // Laser oscillation at Station 1
      state.laserPos += state.laserDir * 80 * dt;
      if (state.laserPos > 40) {
        state.laserPos = 40;
        state.laserDir = -1;
      } else if (state.laserPos < -40) {
        state.laserPos = -40;
        state.laserDir = 1;
      }

      const targetPusherAngle = isPusherActive ? 95 : 0;
      state.pusherAngle += (targetPusherAngle - state.pusherAngle) * Math.min(1, dt * 18);

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

      const station1X = w * 0.32;
      const station2X = w * 0.72;

      for (let i = state.boxes.length - 1; i >= 0; i--) {
        const b = state.boxes[i];
        if (!b.diverted) {
          b.x += beltSpeed * dt;
        } else {
          b.x += beltSpeed * 0.4 * dt;
          b.yOffset += 160 * dt;
        }

        if (!b.scanned && b.x >= station1X - 25) {
          b.scanned = true;
          if (b.status === 'DEFECTIVE' && onDefectDetected) {
            onDefectDetected(b);
          }
        }

        if (!b.diverted && b.status === 'DEFECTIVE' && b.x >= station2X - 20 && b.x <= station2X + 40) {
          if (state.pusherAngle > 40) {
            b.diverted = true;
            if (onPusherFired) onPusherFired(b);
          }
        }

        if (b.x > w + 80 || b.yOffset > h) {
          state.boxes.splice(i, 1);
        }
      }

      // FLAT CANVAS DRAWING (Single background family: #0d1117 / #161b22)
      ctx.clearRect(0, 0, w, h);

      // Floor
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, 0, w, h);

      // Floor grid
      ctx.strokeStyle = '#21262d';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      // Conveyor Bed (Flat surfaces)
      const beltY = h * 0.52;
      const beltH = 68;

      ctx.fillStyle = '#161b22';
      ctx.fillRect(0, beltY - 12, w, beltH + 24);
      ctx.strokeStyle = '#30363d';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, beltY - 12, w, beltH + 24);

      // Rails
      ctx.fillStyle = '#21262d';
      ctx.fillRect(0, beltY - 12, w, 8);
      ctx.fillRect(0, beltY + beltH + 4, w, 8);

      // Belt surface
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, beltY, w, beltH);

      // Slats
      ctx.strokeStyle = '#21262d';
      ctx.lineWidth = 2;
      for (let x = -state.beltOffset; x < w; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, beltY);
        ctx.lineTo(x, beltY + beltH);
        ctx.stroke();
      }

      // Reject Chute
      ctx.save();
      ctx.fillStyle = '#161b22';
      ctx.beginPath();
      ctx.moveTo(station2X - 10, beltY + beltH);
      ctx.lineTo(station2X + 65, beltY + beltH);
      ctx.lineTo(station2X + 90, h);
      ctx.lineTo(station2X - 25, h);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#30363d';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#f85149';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('[REJECT CHUTE]', station2X - 5, h - 14);
      ctx.restore();

      // Station 1: Overhead Optical Vision Camera & Scan Line (Accent: #3b82f6)
      ctx.save();
      ctx.strokeStyle = '#30363d';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(station1X, 0);
      ctx.lineTo(station1X, beltY - 60);
      ctx.stroke();

      // Camera housing (flat)
      ctx.fillStyle = '#21262d';
      ctx.fillRect(station1X - 28, beltY - 95, 56, 35);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1;
      ctx.strokeRect(station1X - 28, beltY - 95, 56, 35);

      // Lens
      ctx.fillStyle = '#30363d';
      ctx.fillRect(station1X - 12, beltY - 60, 24, 12);

      // Station 1 Label
      ctx.fillStyle = '#f0f6fc';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('STATION 1: OPTICAL GATE', station1X, beltY - 105);

      // Flat scan line
      const scanX = station1X + state.laserPos;
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(scanX, beltY);
      ctx.lineTo(scanX, beltY + beltH);
      ctx.stroke();
      ctx.restore();

      // Boxes on Conveyor
      state.boxes.forEach((b) => {
        const boxW = 54;
        const boxH = 44;
        const boxY = beltY + (beltH - boxH) / 2 + (b.yOffset || 0);

        ctx.save();
        ctx.translate(b.x, boxY);

        // Cardboard package
        ctx.fillStyle = '#8d5b28';
        ctx.fillRect(0, 0, boxW, boxH);
        ctx.strokeStyle = '#5c3a17';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, boxW, boxH);

        // Package label
        ctx.fillStyle = '#f0f6fc';
        ctx.fillRect(6, 12, 18, 14);
        ctx.fillStyle = '#0d1117';
        ctx.fillRect(8, 15, 14, 2);
        ctx.fillRect(8, 19, 10, 2);

        // Defect markings
        if (b.status === 'DEFECTIVE') {
          if (b.defect === 'dent') {
            ctx.fillStyle = '#381e09';
            ctx.fillRect(boxW - 14, 8, 10, 10);
          } else if (b.defect === 'label_missing') {
            ctx.fillStyle = '#8d5b28';
            ctx.fillRect(6, 12, 18, 14);
          } else if (b.defect === 'seal_broken') {
            ctx.strokeStyle = '#f85149';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(boxW / 2 - 6, 2);
            ctx.lineTo(boxW / 2 + 6, 14);
            ctx.stroke();
          } else if (b.defect === 'wrong_print') {
            ctx.fillStyle = '#f85149';
            ctx.font = 'bold 9px monospace';
            ctx.fillText('ERR', 6, 24);
          }
        }

        // Flat Bounding Box
        if (b.scanned) {
          const isGood = b.status === 'GOOD';
          const tagColor = isGood ? '#3fb950' : '#f85149';

          ctx.strokeStyle = tagColor;
          ctx.lineWidth = 2;
          ctx.strokeRect(-4, -4, boxW + 8, boxH + 8);

          ctx.fillStyle = tagColor;
          ctx.fillRect(-4, -20, boxW + 28, 16);
          ctx.fillStyle = '#0d1117';
          ctx.font = 'bold 9px monospace';
          const tagText = isGood ? 'PASS' : `FAIL:${(b.defect || 'DEFECT').toUpperCase()}`;
          ctx.fillText(`${tagText} ${(b.conf * 100).toFixed(0)}%`, -1, -8);
        }

        ctx.restore();
      });

      // Station 2: SG90 Pusher Assembly
      ctx.save();
      ctx.strokeStyle = '#30363d';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(station2X, 0);
      ctx.lineTo(station2X, beltY - 35);
      ctx.stroke();

      // Servo Housing (flat)
      ctx.fillStyle = '#21262d';
      ctx.fillRect(station2X - 16, beltY - 55, 32, 28);
      ctx.strokeStyle = '#30363d';
      ctx.lineWidth = 1;
      ctx.strokeRect(station2X - 16, beltY - 55, 32, 28);

      ctx.fillStyle = '#f0f6fc';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('STATION 2: DIVERTER', station2X, beltY - 65);

      // Servo Arm
      ctx.save();
      ctx.translate(station2X, beltY - 27);
      const rad = (state.pusherAngle * Math.PI) / 180;
      ctx.rotate(rad);

      ctx.fillStyle = '#30363d';
      ctx.fillRect(-4, 0, 8, 48);

      ctx.fillStyle = '#f85149';
      ctx.fillRect(-18, 44, 36, 12);
      ctx.restore();
      ctx.restore();

      // Telemetry HUD Banner (Flat)
      ctx.save();
      ctx.fillStyle = '#161b22';
      ctx.fillRect(8, 8, 230, 38);
      ctx.strokeStyle = '#30363d';
      ctx.lineWidth = 1;
      ctx.strokeRect(8, 8, 230, 38);

      ctx.fillStyle = '#f0f6fc';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('FEED: 1280×600 @ 30 FPS', 16, 22);

      ctx.fillStyle = '#8b949e';
      ctx.font = '9px monospace';
      ctx.fillText(`YOLOv9 • Gate: ${(confThreshold * 100).toFixed(0)}%`, 16, 36);
      ctx.restore();

      if (!isReducedMotion) {
        animationId = requestAnimationFrame(render);
      }
    };

    render(performance.now());

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      window.removeEventListener('resize', updateSize);
    };
  }, [isPusherActive, confThreshold, conveyorDelay, onDefectDetected, onPusherFired]);

  return (
    <div className="relative w-full h-full min-h-[300px] overflow-hidden bg-[#080b12] rounded-xl border border-white/10 flex items-center justify-center">
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}
