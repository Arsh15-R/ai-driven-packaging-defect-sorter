import React, { useRef, useState, useEffect } from 'react';
import { Camera, CameraOff, AlertTriangle, AlertCircle, RefreshCw, CheckCircle2, Shield, Eye, Sparkles } from 'lucide-react';
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
            videoRef.current.play().catch((e) => console.warn('Video play error:', e));
          }
        };
      }
      setIsCameraActive(true);
    } catch (err: any) {
      console.error('Camera acquisition error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('NotAllowedError');
        setErrorMessage('Camera access was denied. Please allow camera permissions in your browser URL bar.');
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
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    // Tactile Shutter Flash Feedback
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 120);

    onFrameCaptured(dataUrl);
  };

  return (
    <div className="apple-glass overflow-hidden rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] flex flex-col relative">
      {/* Top Telemetry Header */}
      <div className="px-5 py-3 border-b border-white/10 bg-white/[0.02] backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-pulse" />
          <span className="text-xs font-semibold tracking-tight text-white flex items-center gap-1.5">
            Optical Sensor
            <span className="text-[10px] text-slate-400 font-mono font-normal">
              {videoResolution ? `${videoResolution.width}×${videoResolution.height}` : 'HD 720p'}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isCameraActive ? (
            <button
              onClick={stopCamera}
              className="apple-btn-secondary px-3 py-1 text-xs font-medium text-rose-300 hover:text-rose-200 border-rose-500/30 flex items-center gap-1.5"
            >
              <CameraOff className="w-3.5 h-3.5" />
              <span>Pause</span>
            </button>
          ) : (
            <button
              onClick={startCamera}
              disabled={isInitializing}
              className="apple-btn-primary px-3 py-1 text-xs font-medium flex items-center gap-1.5"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{isInitializing ? 'Connecting...' : 'Start Camera'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Video Viewport Area */}
      <div className="relative w-full aspect-video bg-[#03060f] flex items-center justify-center overflow-hidden">
        {/* Shutter Flash Animation */}
        {flashActive && (
          <div className="absolute inset-0 bg-white/50 z-30 pointer-events-none transition-opacity duration-100" />
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
            {/* Viewfinder Bounding Box */}
            <div className="relative w-[72%] h-[74%] border border-cyan-400/25 rounded-2xl">
              {/* Apple VisionOS Corner Brackets */}
              <div className="absolute -top-1 -left-1 w-6 h-6 border-t-2 border-l-2 border-cyan-400 rounded-tl-lg shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
              <div className="absolute -top-1 -right-1 w-6 h-6 border-t-2 border-r-2 border-cyan-400 rounded-tr-lg shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
              <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-2 border-l-2 border-cyan-400 rounded-bl-lg shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-2 border-r-2 border-cyan-400 rounded-br-lg shadow-[0_0_8px_rgba(34,211,238,0.5)]" />

              {/* Center Crosshair */}
              <div className="absolute inset-0 flex items-center justify-center opacity-40">
                <div className="w-8 h-[1px] bg-cyan-400" />
                <div className="h-8 w-[1px] bg-cyan-400 absolute" />
              </div>

              {/* Optical Laser Scanning Line */}
              <div className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-75 animate-scanCurtain" />

              {/* Telemetry Tag */}
              <div className="absolute top-2.5 left-3 text-[10px] tracking-wide text-cyan-300 font-medium bg-black/50 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-cyan-400/30 flex items-center gap-1.5 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                <span>INSPECTION GATE ACTIVE</span>
              </div>
            </div>
          </div>
        )}

        {/* Floating VisionOS Shutter Action Dock */}
        {isCameraActive && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
            <div className="apple-glass-pill px-5 py-2.5 flex items-center gap-4 bg-slate-950/70 backdrop-blur-2xl border border-white/20 shadow-[0_12px_32px_rgba(0,0,0,0.6)]">
              <span className="text-[11px] font-medium text-slate-300 hidden sm:inline">
                Align Product
              </span>

              {/* Apple Camera Shutter Button */}
              <button
                onClick={handleCapture}
                disabled={isCapturing}
                className="w-12 h-12 rounded-full border-2 border-white/40 bg-white hover:bg-slate-100 active:scale-90 transition-all flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.4)] disabled:opacity-50"
                title="Capture Current Frame"
                aria-label="Capture Current Frame"
              >
                <div className="w-9 h-9 rounded-full border border-slate-300 bg-gradient-to-b from-white to-slate-200" />
              </button>

              <span className="text-[11px] font-medium text-slate-300 hidden sm:inline">
                Tap to Inspect
              </span>
            </div>
          </div>
        )}

        {/* Inactive Standby Screen */}
        {!isCameraActive && !cameraError && (
          <div className="text-center p-8 space-y-4 z-10 max-w-sm">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-white/[0.05] border border-white/10 backdrop-blur-md flex items-center justify-center text-slate-300 shadow-inner">
              <Camera className="w-8 h-8 text-cyan-400" />
            </div>
            <div>
              <div className="text-base font-semibold text-white tracking-tight">
                Camera Standby
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Start your webcam to begin real-time product defect detection with YOLOv9.
              </p>
            </div>
            <button
              onClick={startCamera}
              className="apple-btn-primary px-5 py-2 text-xs font-semibold inline-flex items-center gap-2"
            >
              <Camera className="w-4 h-4" />
              <span>Enable Camera</span>
            </button>
          </div>
        )}

        {/* Error State Overlays */}
        {cameraError === 'NotAllowedError' && (
          <div className="absolute inset-0 z-20 bg-slate-950/90 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center">
            <div className="w-14 h-14 bg-rose-500/15 border border-rose-500/30 rounded-2xl flex items-center justify-center mb-3 shadow-[0_0_20px_rgba(244,63,94,0.2)]">
              <AlertCircle className="w-7 h-7 text-rose-400" />
            </div>
            <h3 className="text-sm font-semibold text-white">Camera Access Denied</h3>
            <p className="text-xs text-slate-300 mt-1.5 max-w-sm leading-relaxed">
              Browser blocked camera access. Please click the lock icon in your address bar and allow camera permissions.
            </p>
            <button
              onClick={startCamera}
              className="mt-4 apple-btn-primary px-4 py-2 text-xs font-medium"
            >
              Try Again
            </button>
          </div>
        )}

        {cameraError && cameraError !== 'NotAllowedError' && (
          <div className="absolute inset-0 z-20 bg-slate-950/90 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center">
            <div className="w-14 h-14 bg-amber-500/15 border border-amber-500/30 rounded-2xl flex items-center justify-center mb-3 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
              <AlertTriangle className="w-7 h-7 text-amber-400" />
            </div>
            <h3 className="text-sm font-semibold text-white">Camera Unavailable</h3>
            <p className="text-xs text-slate-300 mt-1 max-w-sm">{errorMessage}</p>
            <button
              onClick={startCamera}
              className="mt-4 apple-btn-secondary px-4 py-2 text-xs font-medium"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
