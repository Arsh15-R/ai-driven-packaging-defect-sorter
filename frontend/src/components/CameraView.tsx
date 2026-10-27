import React, { useRef, useState, useEffect } from 'react';
import { Camera, CameraOff, AlertTriangle, AlertCircle, RefreshCw, CheckCircle2, Sliders, Shield } from 'lucide-react';
import { CameraErrorType } from '../types';

interface CameraViewProps {
  onFrameCaptured: (imageDataUrl: string) => void;
  isCapturing?: boolean;
}

export const CameraView: React.FC<CameraViewProps> = ({ onFrameCaptured, isCapturing = false }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<CameraErrorType>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(false);
  const [flashActive, setFlashActive] = useState(false);
  const [videoResolution, setVideoResolution] = useState<{ width: number; height: number } | null>(null);

  // Start webcam stream using navigator.mediaDevices.getUserMedia
  const startCamera = async () => {
    setIsInitializing(true);
    setCameraError(null);
    setErrorMessage('');

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('WebRTC / mediaDevices API is not supported in this browser environment.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            setVideoResolution({
              width: videoRef.current.videoWidth,
              height: videoRef.current.videoHeight,
            });
            videoRef.current.play().catch(e => console.warn('Video play error:', e));
          }
        };
      }
      setIsCameraActive(true);
    } catch (err: any) {
      console.error('Camera acquisition error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('NotAllowedError');
        setErrorMessage('Camera access was denied. Please allow camera permissions in your browser.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('NotFoundError');
        setErrorMessage('No webcam device was found on this system. Please connect an external camera.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setCameraError('NotReadableError');
        setErrorMessage('Camera hardware is currently in use by another application.');
      } else {
        setCameraError('GeneralError');
        setErrorMessage(err.message || 'Failed to initialize camera.');
      }
      setIsCameraActive(false);
    } finally {
      setIsInitializing(false);
    }
  };

  // Stop camera and release tracks
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setVideoResolution(null);
  };

  // Auto-start camera on mount
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  // Frame Capture: Grabs current frame onto an offscreen canvas and converts to high-quality JPEG
  const handleCapture = () => {
    if (!videoRef.current || !isCameraActive) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw video frame to offscreen canvas
    ctx.drawImage(video, 0, 0, w, h);

    // Visual shutter flash effect
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 120);

    // Convert to high-quality JPEG data URL (0.92 quality)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    onFrameCaptured(dataUrl);
  };

  return (
    <div className="w-full flat-panel bg-[#0d121f] border border-[#1e2638] flex flex-col">
      {/* Viewport Header Bar */}
      <div className="px-4 py-3 border-b border-[#1e2638] bg-[#0a0e19] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isCameraActive ? 'bg-[#10b981] animate-pulse' : 'bg-slate-500'
              }`}
            />
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-200">
              {isCameraActive ? 'LIVE OPTICAL FEED' : 'OPTICAL GATE OFFLINE'}
            </span>
          </div>

          {videoResolution && isCameraActive && (
            <span className="text-[11px] font-mono text-slate-400 bg-[#162035] px-2 py-0.5 border border-[#1e2638]">
              {videoResolution.width} × {videoResolution.height} • 30 FPS
            </span>
          )}
        </div>

        {/* Start / Stop Toggle */}
        <div className="flex items-center gap-2">
          {isCameraActive ? (
            <button
              onClick={stopCamera}
              className="interactive-target h-8 px-3 text-xs font-mono font-bold uppercase tracking-wider bg-[#2a1318] hover:bg-[#3b1820] text-[#fca5a5] border border-[#ef4444]/60 flex items-center gap-1.5 transition-colors"
            >
              <CameraOff className="w-3.5 h-3.5" />
              <span>STOP CAMERA</span>
            </button>
          ) : (
            <button
              onClick={startCamera}
              disabled={isInitializing}
              className="interactive-target h-8 px-3 text-xs font-mono font-bold uppercase tracking-wider bg-[#132238] hover:bg-[#1a3152] text-[#93c5fd] border border-[#3b82f6]/60 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{isInitializing ? 'INITIALIZING...' : 'START CAMERA'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Video Viewport Area */}
      <div className="relative w-full aspect-video bg-[#03060d] flex items-center justify-center overflow-hidden border-b border-[#1e2638]">
        {/* Shutter Flash Animation */}
        {flashActive && (
          <div className="absolute inset-0 bg-white/40 z-30 pointer-events-none transition-opacity duration-100" />
        )}

        {/* Video Element */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            isCameraActive ? 'opacity-100' : 'opacity-0 hidden'
          }`}
        />

        {/* Optical Targeting Reticle & HUD Overlays */}
        {isCameraActive && (
          <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
            {/* Viewfinder Bounding Box (Central Inspection Region of Interest) */}
            <div className="relative w-[70%] h-[72%] border border-cyan-500/30">
              {/* Apple VisionOS / Industrial Corner Brackets */}
              {/* Top-Left */}
              <div className="absolute -top-1 -left-1 w-7 h-7 border-t-2 border-l-2 border-cyan-400" />
              {/* Top-Right */}
              <div className="absolute -top-1 -right-1 w-7 h-7 border-t-2 border-r-2 border-cyan-400" />
              {/* Bottom-Left */}
              <div className="absolute -bottom-1 -left-1 w-7 h-7 border-b-2 border-l-2 border-cyan-400" />
              {/* Bottom-Right */}
              <div className="absolute -bottom-1 -right-1 w-7 h-7 border-b-2 border-r-2 border-cyan-400" />

              {/* Center Crosshair */}
              <div className="absolute inset-0 flex items-center justify-center opacity-40">
                <div className="w-8 h-[1px] bg-cyan-400" />
                <div className="h-8 w-[1px] bg-cyan-400 absolute" />
              </div>

              {/* Sub-alignment Grid ticks */}
              <div className="absolute top-1/2 left-0 -translate-y-1/2 w-2 h-[1px] bg-cyan-400" />
              <div className="absolute top-1/2 right-0 -translate-y-1/2 w-2 h-[1px] bg-cyan-400" />
              <div className="absolute top-0 left-1/2 -translate-x-1/2 h-2 w-[1px] bg-cyan-400" />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-2 w-[1px] bg-cyan-400" />

              {/* Optical Laser Scanning Line */}
              <div className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-75 animate-scanCurtain" />

              {/* Telemetry Tag */}
              <div className="absolute top-2 left-3 font-mono text-[10px] tracking-widest text-cyan-400/90 font-bold bg-[#0d121f]/80 px-1.5 py-0.5 border border-cyan-500/20">
                OPTICAL GATE 1 • TARGETING ACTIVE
              </div>
            </div>
          </div>
        )}

        {/* Inactive Standby Screen */}
        {!isCameraActive && !cameraError && (
          <div className="text-center p-6 space-y-3 z-10">
            <div className="w-14 h-14 mx-auto rounded-full bg-[#162035] border border-[#1e2638] flex items-center justify-center text-slate-400">
              <Camera className="w-7 h-7 text-slate-300" />
            </div>
            <div>
              <div className="font-mono text-sm font-bold text-slate-200 uppercase tracking-wider">
                WEBCAM DISCONNECTED / STANDBY
              </div>
              <div className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Click &ldquo;Start Camera&rdquo; above to enable your laptop webcam for real-time defect classification.
              </div>
            </div>
            <button
              onClick={startCamera}
              className="mt-2 interactive-target h-10 px-5 text-xs font-mono font-bold uppercase tracking-wider bg-[#2563eb] hover:bg-[#1d4ed8] text-white border border-[#3b82f6] transition-colors"
            >
              ACTIVATE CAMERA
            </button>
          </div>
        )}

        {/* Error State Overlays */}
        {cameraError === 'NotAllowedError' && (
          <div className="absolute inset-0 z-20 bg-[#14080a]/95 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 bg-[#2d0f12] border border-[#ef4444] rounded-full flex items-center justify-center mb-3">
              <AlertTriangle className="w-6 h-6 text-[#ef4444]" />
            </div>
            <h3 className="font-mono text-sm font-bold text-red-200 uppercase tracking-wider">
              Camera Permission Denied
            </h3>
            <p className="text-xs text-slate-300 max-w-md mt-2 leading-relaxed">
              Your browser blocked access to the webcam. To inspect products, please allow camera permissions:
            </p>
            <div className="mt-3 bg-[#0d121f] border border-[#2d0f12] text-left p-3.5 max-w-md text-xs font-mono space-y-2 text-slate-300">
              <div className="flex items-start gap-2">
                <span className="text-[#3b82f6] font-bold">1.</span>
                <span>Click the tune / lock icon on the left side of your browser URL bar.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#3b82f6] font-bold">2.</span>
                <span>Toggle the <strong>Camera</strong> permission to <strong>Allow</strong>.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#3b82f6] font-bold">3.</span>
                <span>Click the button below to re-request camera initialization.</span>
              </div>
            </div>
            <button
              onClick={startCamera}
              className="mt-4 interactive-target h-9 px-4 text-xs font-mono font-bold uppercase bg-[#ef4444] hover:bg-[#dc2626] text-white transition-colors"
            >
              RETRY CAMERA PERMISSION
            </button>
          </div>
        )}

        {cameraError === 'NotFoundError' && (
          <div className="absolute inset-0 z-20 bg-[#14080a]/95 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 bg-[#2d0f12] border border-[#ef4444] rounded-full flex items-center justify-center mb-3">
              <AlertCircle className="w-6 h-6 text-[#ef4444]" />
            </div>
            <h3 className="font-mono text-sm font-bold text-red-200 uppercase tracking-wider">
              No Webcam Hardware Detected
            </h3>
            <p className="text-xs text-slate-300 max-w-md mt-2 leading-relaxed">
              No integrated webcam or USB video capture device was detected on your operating system.
              Please connect a USB camera or verify device drivers.
            </p>
            <button
              onClick={startCamera}
              className="mt-4 interactive-target h-9 px-4 text-xs font-mono font-bold uppercase bg-[#ef4444] hover:bg-[#dc2626] text-white transition-colors"
            >
              RE-SCAN DEVICES
            </button>
          </div>
        )}

        {(cameraError === 'NotReadableError' || cameraError === 'GeneralError') && (
          <div className="absolute inset-0 z-20 bg-[#14080a]/95 flex flex-col items-center justify-center p-6 text-center">
            <AlertCircle className="w-8 h-8 text-[#ef4444] mb-2" />
            <div className="font-mono text-xs font-bold text-red-300 uppercase">
              {errorMessage || 'Camera Stream Error'}
            </div>
            <button
              onClick={startCamera}
              className="mt-3 interactive-target h-8 px-3 text-xs font-mono font-bold uppercase bg-[#ef4444] text-white"
            >
              RETRY INITIALIZATION
            </button>
          </div>
        )}
      </div>

      {/* Action Footer: Frame Capture Trigger */}
      <div className="p-4 bg-[#0a0e19] flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-mono text-slate-400">
          Position product package inside reticle and click capture.
        </div>

        <button
          onClick={handleCapture}
          disabled={!isCameraActive || isCapturing}
          className="interactive-target h-11 px-6 text-xs font-mono font-bold uppercase tracking-wider bg-[#2563eb] hover:bg-[#1d4ed8] text-white border border-[#3b82f6] shadow-lg flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Camera className="w-4 h-4" />
          <span>CAPTURE CURRENT FRAME</span>
        </button>
      </div>
    </div>
  );
};
