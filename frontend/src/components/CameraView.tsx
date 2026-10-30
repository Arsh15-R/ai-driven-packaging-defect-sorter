import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Camera,
  CameraOff,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Video,
  Radio,
  Unlock,
  Sparkles,
  Layers,
  ArrowRight
} from 'lucide-react';
import { CameraErrorType } from '../types';

export type CameraMode = 'webrtc' | 'backend';

interface CameraViewProps {
  onFrameCaptured: (imageDataUrl: string) => void;
  isCapturing?: boolean;
  apiBase?: string;
}

export const CameraView: React.FC<CameraViewProps> = ({
  onFrameCaptured,
  isCapturing = false,
  apiBase = 'http://127.0.0.1:8000',
}) => {
  const [cameraMode, setCameraMode] = useState<CameraMode>('webrtc');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<CameraErrorType>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(false);
  const [isReleasingLock, setIsReleasingLock] = useState(false);
  const [isCapturingSnapshot, setIsCapturingSnapshot] = useState(false);
  const [flashActive, setFlashActive] = useState(false);
  const [videoResolution, setVideoResolution] = useState<{ width: number; height: number } | null>(null);

  // Backend MJPEG Stream Status
  const [streamError, setStreamError] = useState(false);
  const [streamLoaded, setStreamLoaded] = useState(false);
  const [streamKey, setStreamKey] = useState<number>(Date.now());

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const backendImgRef = useRef<HTMLImageElement | null>(null);

  // Normalize API base without trailing slash
  const cleanApiBase = (apiBase || '').replace(/\/+$/, '');

  // Helper: Request backend to release hardware lock on index 0
  const releaseBackendCameraLock = useCallback(async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1800);
      const res = await fetch(`${cleanApiBase}/api/camera/release`, {
        method: 'POST',
        signal: controller.signal,
        mode: 'cors',
      });
      clearTimeout(timeoutId);
      return res.ok;
    } catch {
      // Backend may be offline or unreachable; fail gracefully
      return false;
    }
  }, [cleanApiBase]);

  // Helper: Inform backend to reclaim camera if needed
  const claimBackendCameraLock = useCallback(async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1800);
      const res = await fetch(`${cleanApiBase}/api/camera/claim`, {
        method: 'POST',
        signal: controller.signal,
        mode: 'cors',
      });
      clearTimeout(timeoutId);
      return res.ok;
    } catch {
      return false;
    }
  }, [cleanApiBase]);

  // Stop WebRTC camera and release all hardware media tracks
  const stopWebRTCTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn('Error stopping track:', e);
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setVideoResolution(null);
  }, []);

  // Start local webcam via WebRTC (navigator.mediaDevices.getUserMedia)
  const startWebRTCCamera = useCallback(async () => {
    setIsInitializing(true);
    setCameraError(null);
    setErrorMessage('');

    try {
      // Proactive Conflict Resolution:
      // Instruct backend to release physical camera index 0 before WebRTC binds it
      await releaseBackendCameraLock();

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
      const errName = err?.name || '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setCameraError('NotAllowedError');
        setErrorMessage('Camera access was denied. Please allow camera permissions in your browser URL bar.');
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setCameraError('NotFoundError');
        setErrorMessage('No webcam device was found on this system. Please connect an external camera.');
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        setCameraError('NotReadableError');
        setErrorMessage('Camera hardware is currently in use by another application or the backend OpenCV process.');
      } else {
        setCameraError('GeneralError');
        setErrorMessage(err.message || 'Failed to initialize camera.');
      }
      setIsCameraActive(false);
    } finally {
      setIsInitializing(false);
    }
  }, [releaseBackendCameraLock]);

  // Mode Switcher Handler
  const handleSwitchMode = async (targetMode: CameraMode) => {
    if (targetMode === cameraMode) return;

    if (targetMode === 'backend') {
      // 1. Release local WebRTC hardware tracks
      stopWebRTCTracks();
      setCameraError(null);
      setCameraMode('backend');
      setStreamError(false);
      setStreamLoaded(false);
      setStreamKey(Date.now());
      // Inform backend it may claim camera if desired
      await claimBackendCameraLock();
    } else {
      // 1. Switch to WebRTC
      setCameraMode('webrtc');
      setStreamError(false);
      // Proactively release backend camera lock and start local camera
      await startWebRTCCamera();
    }
  };

  // Recovery Action 1: Explicitly release backend lock and re-attempt WebRTC
  const handleReleaseBackendLockAndRetry = async () => {
    setIsReleasingLock(true);
    try {
      await releaseBackendCameraLock();
      // Brief pause to allow Windows DirectShow / MediaFoundation to release descriptor
      await new Promise((r) => setTimeout(r, 400));
      await startWebRTCCamera();
    } finally {
      setIsReleasingLock(false);
    }
  };

  // Auto-start camera when component mounts in WebRTC mode
  useEffect(() => {
    if (cameraMode === 'webrtc') {
      startWebRTCCamera();
    }
    return () => {
      stopWebRTCTracks();
    };
  }, [cameraMode, startWebRTCCamera, stopWebRTCTracks]);

  // Frame Capture: Supports both WebRTC (<video>) and Backend MJPEG Stream
  const handleCapture = async () => {
    if (isCapturing || isCapturingSnapshot) return;

    if (cameraMode === 'webrtc') {
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
    } else {
      // Backend MJPEG Stream Mode Capture
      setIsCapturingSnapshot(true);

      // Strategy 1: Fetch Base64 snapshot directly from backend /api/stream/snapshot/base64
      try {
        const res = await fetch(`${cleanApiBase}/api/stream/snapshot/base64`, { mode: 'cors' });
        if (res.ok) {
          const data = await res.json();
          const dataUrl = data.image || data.image_base64;
          if (dataUrl) {
            setFlashActive(true);
            setTimeout(() => setFlashActive(false), 120);
            onFrameCaptured(dataUrl);
            setIsCapturingSnapshot(false);
            return;
          }
        }
      } catch (err) {
        console.warn('Backend snapshot base64 fetch failed, trying binary blob fallback:', err);
      }

      // Strategy 2: Fetch Binary JPEG Blob from /api/stream/snapshot
      try {
        const res = await fetch(`${cleanApiBase}/api/stream/snapshot`, { mode: 'cors' });
        if (res.ok) {
          const blob = await res.blob();
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result as string;
            setFlashActive(true);
            setTimeout(() => setFlashActive(false), 120);
            onFrameCaptured(dataUrl);
            setIsCapturingSnapshot(false);
          };
          reader.readAsDataURL(blob);
          return;
        }
      } catch (err) {
        console.warn('Backend snapshot binary blob fetch failed, trying canvas fallback:', err);
      }

      // Strategy 3: Capture via offscreen canvas from backend <img> element
      try {
        if (backendImgRef.current) {
          const img = backendImgRef.current;
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || 1280;
          canvas.height = img.naturalHeight || 720;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
            setFlashActive(true);
            setTimeout(() => setFlashActive(false), 120);
            onFrameCaptured(dataUrl);
          }
        }
      } catch (canvasErr) {
        console.error('All snapshot capture strategies failed:', canvasErr);
      } finally {
        setIsCapturingSnapshot(false);
      }
    }
  };

  return (
    <div className="apple-glass overflow-hidden rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] flex flex-col relative border border-white/10 backdrop-blur-2xl">
      {/* Top VisionOS Telemetry & Mode Selector Header */}
      <div className="px-5 py-3 border-b border-white/10 bg-white/[0.02] backdrop-blur-md flex flex-wrap items-center justify-between gap-3">
        {/* Left: Sensor Telemetry Tag */}
        <div className="flex items-center gap-2.5">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              (cameraMode === 'webrtc' && isCameraActive) || (cameraMode === 'backend' && !streamError)
                ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-pulse'
                : 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.6)]'
            }`}
          />
          <span className="text-xs font-semibold tracking-tight text-white flex items-center gap-1.5">
            Optical Sensor
            <span className="text-[10px] text-slate-400 font-mono font-normal">
              {cameraMode === 'webrtc'
                ? videoResolution
                  ? `${videoResolution.width}×${videoResolution.height}`
                  : 'WebRTC HD'
                : 'Backend YOLOv9 (30 FPS)'}
            </span>
          </span>
        </div>

        {/* Center: Sleek Apple VisionOS Segmented Mode Switcher Pill */}
        <div className="flex items-center p-1 rounded-full bg-slate-950/70 border border-white/15 backdrop-blur-2xl shadow-inner">
          <button
            type="button"
            onClick={() => handleSwitchMode('webrtc')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 flex items-center gap-1.5 ${
              cameraMode === 'webrtc'
                ? 'bg-gradient-to-r from-cyan-500/25 to-blue-500/25 text-white border border-cyan-400/40 shadow-[0_0_12px_rgba(34,211,238,0.3)] font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
            }`}
          >
            <Video className="w-3.5 h-3.5 text-cyan-400" />
            <span>WebRTC Camera</span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchMode('backend')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 flex items-center gap-1.5 ${
              cameraMode === 'backend'
                ? 'bg-gradient-to-r from-indigo-500/30 to-purple-500/30 text-white border border-indigo-400/45 shadow-[0_0_12px_rgba(129,140,248,0.3)] font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-indigo-400" />
            <span>Backend MJPEG Stream</span>
          </button>
        </div>

        {/* Right: Quick State Controls */}
        <div className="flex items-center gap-2">
          {cameraMode === 'webrtc' ? (
            isCameraActive ? (
              <button
                type="button"
                onClick={stopWebRTCTracks}
                className="apple-btn-secondary px-3 py-1 text-xs font-medium text-rose-300 hover:text-rose-200 border-rose-500/30 flex items-center gap-1.5"
              >
                <CameraOff className="w-3.5 h-3.5" />
                <span>Pause</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={startWebRTCCamera}
                disabled={isInitializing}
                className="apple-btn-primary px-3 py-1 text-xs font-medium flex items-center gap-1.5"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{isInitializing ? 'Connecting...' : 'Start Camera'}</span>
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => {
                setStreamError(false);
                setStreamKey(Date.now());
              }}
              className="apple-btn-secondary px-3 py-1 text-xs font-medium text-indigo-300 hover:text-indigo-200 border-indigo-500/30 flex items-center gap-1.5"
              title="Refresh Stream Feed"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reload Stream</span>
            </button>
          )}
        </div>
      </div>

      {/* Video / Stream Viewport Area */}
      <div className="relative w-full aspect-video bg-[#03060f] flex items-center justify-center overflow-hidden">
        {/* Shutter Flash Animation */}
        {flashActive && (
          <div className="absolute inset-0 bg-white/60 z-30 pointer-events-none transition-opacity duration-100" />
        )}

        {/* MODE 1: WebRTC Video Element */}
        {cameraMode === 'webrtc' && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              isCameraActive ? 'opacity-100' : 'opacity-0 hidden'
            }`}
          />
        )}

        {/* MODE 2: Backend MJPEG Stream Image */}
        {cameraMode === 'backend' && !streamError && (
          <img
            key={streamKey}
            ref={backendImgRef}
            src={`${cleanApiBase}/api/stream?t=${streamKey}`}
            crossOrigin="anonymous"
            alt="Live Backend MJPEG Stream with YOLOv9"
            className="w-full h-full object-cover"
            onLoad={() => {
              setStreamLoaded(true);
              setStreamError(false);
            }}
            onError={() => {
              setStreamError(true);
              setStreamLoaded(false);
            }}
          />
        )}

        {/* Optical Targeting Reticle & HUD Overlays */}
        {((cameraMode === 'webrtc' && isCameraActive) ||
          (cameraMode === 'backend' && !streamError)) && (
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
              <div className="absolute top-2.5 left-3 text-[10px] tracking-wide text-cyan-300 font-medium bg-black/60 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-cyan-400/30 flex items-center gap-1.5 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                <span>
                  {cameraMode === 'webrtc'
                    ? 'INSPECTION GATE ACTIVE (WEBRTC)'
                    : 'INSPECTION GATE ACTIVE (MJPEG FEED)'}
                </span>
              </div>

              {/* Bottom Telemetry Tag for Backend Mode */}
              {cameraMode === 'backend' && (
                <div className="absolute bottom-2.5 right-3 text-[9px] tracking-wide text-indigo-300 font-mono font-medium bg-indigo-950/60 backdrop-blur-md px-2 py-0.5 rounded-full border border-indigo-400/30 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  <span>YOLOv9 OPTICAL OVERLAY</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Floating VisionOS Shutter Action Dock (Active for Both Modes) */}
        {((cameraMode === 'webrtc' && isCameraActive) ||
          (cameraMode === 'backend' && !streamError)) && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
            <div className="apple-glass-pill px-5 py-2.5 flex items-center gap-4 bg-slate-950/70 backdrop-blur-2xl border border-white/20 shadow-[0_12px_32px_rgba(0,0,0,0.6)]">
              <span className="text-[11px] font-medium text-slate-300 hidden sm:inline">
                Align Product
              </span>

              {/* Apple Camera Shutter Button */}
              <button
                type="button"
                onClick={handleCapture}
                disabled={isCapturing || isCapturingSnapshot}
                className="w-12 h-12 rounded-full border-2 border-white/40 bg-white hover:bg-slate-100 active:scale-90 transition-all flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.4)] disabled:opacity-50"
                title={cameraMode === 'webrtc' ? 'Capture Frame from Webcam' : 'Capture Snapshot from Backend MJPEG Stream'}
                aria-label="Capture Current Frame"
              >
                <div className="w-9 h-9 rounded-full border border-slate-300 bg-gradient-to-b from-white to-slate-200" />
              </button>

              <span className="text-[11px] font-medium text-slate-300 hidden sm:inline">
                {isCapturing || isCapturingSnapshot ? 'Inspecting...' : 'Tap to Inspect'}
              </span>
            </div>
          </div>
        )}

        {/* STANDBY SCREEN: Inactive WebRTC Camera */}
        {cameraMode === 'webrtc' && !isCameraActive && !cameraError && (
          <div className="text-center p-8 space-y-4 z-10 max-w-sm">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-white/[0.05] border border-white/10 backdrop-blur-md flex items-center justify-center text-slate-300 shadow-inner">
              <Camera className="w-8 h-8 text-cyan-400" />
            </div>
            <div>
              <div className="text-base font-semibold text-white tracking-tight">
                Camera Standby
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Start your local webcam to begin real-time product defect detection, or switch to the Backend MJPEG Stream.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={startWebRTCCamera}
                className="apple-btn-primary px-4 py-2 text-xs font-semibold inline-flex items-center gap-2"
              >
                <Camera className="w-4 h-4" />
                <span>Enable Camera</span>
              </button>
              <button
                type="button"
                onClick={() => handleSwitchMode('backend')}
                className="apple-btn-secondary px-4 py-2 text-xs font-semibold inline-flex items-center gap-2 text-indigo-300 hover:text-indigo-200"
              >
                <Radio className="w-4 h-4" />
                <span>Use Backend Stream</span>
              </button>
            </div>
          </div>
        )}

        {/* ERROR STATE: WebRTC NotReadableError / TrackStartError (Camera Conflict Resolution Card) */}
        {cameraMode === 'webrtc' && cameraError === 'NotReadableError' && (
          <div className="absolute inset-0 z-40 bg-slate-950/90 backdrop-blur-2xl flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
            <div className="max-w-md w-full apple-glass-card p-6 rounded-3xl border border-amber-500/30 bg-slate-950/80 shadow-[0_20px_50px_rgba(245,158,11,0.25)] space-y-4">
              <div className="w-14 h-14 mx-auto bg-amber-500/15 border border-amber-500/30 rounded-2xl flex items-center justify-center shadow-[0_0_25px_rgba(245,158,11,0.3)]">
                <AlertTriangle className="w-7 h-7 text-amber-400" />
              </div>

              <div>
                <h3 className="text-base font-semibold text-white tracking-tight">
                  Camera Hardware In Use
                </h3>
                <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                  Your physical laptop camera is currently locked by another application or the backend OpenCV inspection pipeline.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                {/* Action 1: Release Backend Lock & Retry WebRTC */}
                <button
                  type="button"
                  onClick={handleReleaseBackendLockAndRetry}
                  disabled={isReleasingLock}
                  className="w-full apple-btn-primary py-2.5 px-4 text-xs font-semibold flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.4)] disabled:opacity-50"
                >
                  <Unlock className="w-4 h-4 text-slate-950" />
                  <span>
                    {isReleasingLock ? 'Releasing Camera Lock...' : 'Release Backend Camera Lock'}
                  </span>
                </button>

                {/* Action 2: Switch to Backend MJPEG Stream */}
                <button
                  type="button"
                  onClick={() => handleSwitchMode('backend')}
                  className="w-full apple-btn-secondary py-2.5 px-4 text-xs font-semibold flex items-center justify-center gap-2 border border-cyan-400/40 text-cyan-300 hover:bg-cyan-500/10 hover:border-cyan-400/70 shadow-[0_0_15px_rgba(34,211,238,0.2)]"
                >
                  <Radio className="w-4 h-4 text-cyan-400" />
                  <span>Switch to Backend MJPEG Stream</span>
                  <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
                </button>

                {/* Action 3: Simple Retry */}
                <button
                  type="button"
                  onClick={startWebRTCCamera}
                  disabled={isInitializing}
                  className="w-full apple-btn-secondary py-2 px-4 text-xs font-medium text-slate-400 hover:text-white flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry WebRTC Access</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ERROR STATE: WebRTC Permission Denied */}
        {cameraMode === 'webrtc' && cameraError === 'NotAllowedError' && (
          <div className="absolute inset-0 z-40 bg-slate-950/90 backdrop-blur-2xl flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
            <div className="max-w-md w-full apple-glass-card p-6 rounded-3xl border border-rose-500/30 bg-slate-950/80 shadow-[0_20px_50px_rgba(244,63,94,0.25)] space-y-4">
              <div className="w-14 h-14 mx-auto bg-rose-500/15 border border-rose-500/30 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(244,63,94,0.3)]">
                <AlertCircle className="w-7 h-7 text-rose-400" />
              </div>
              <h3 className="text-base font-semibold text-white">Camera Access Denied</h3>
              <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                Browser blocked camera access. Please click the lock or camera icon in your address bar and allow camera permissions.
              </p>
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={startWebRTCCamera}
                  className="apple-btn-primary px-4 py-2 text-xs font-medium"
                >
                  Try Again
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchMode('backend')}
                  className="apple-btn-secondary px-4 py-2 text-xs font-medium text-cyan-300"
                >
                  Switch to Backend Stream
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ERROR STATE: General WebRTC Error */}
        {cameraMode === 'webrtc' &&
          cameraError &&
          cameraError !== 'NotReadableError' &&
          cameraError !== 'NotAllowedError' && (
            <div className="absolute inset-0 z-40 bg-slate-950/90 backdrop-blur-2xl flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
              <div className="max-w-md w-full apple-glass-card p-6 rounded-3xl border border-amber-500/30 bg-slate-950/80 shadow-[0_20px_50px_rgba(245,158,11,0.2)] space-y-4">
                <div className="w-14 h-14 mx-auto bg-amber-500/15 border border-amber-500/30 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                  <AlertTriangle className="w-7 h-7 text-amber-400" />
                </div>
                <h3 className="text-base font-semibold text-white">Camera Unavailable</h3>
                <p className="text-xs text-slate-300 mt-1 max-w-sm">{errorMessage}</p>
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={startWebRTCCamera}
                    className="apple-btn-secondary px-4 py-2 text-xs font-medium"
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchMode('backend')}
                    className="apple-btn-primary px-4 py-2 text-xs font-medium"
                  >
                    Use Backend Stream
                  </button>
                </div>
              </div>
            </div>
          )}

        {/* ERROR STATE: Backend MJPEG Stream Offline */}
        {cameraMode === 'backend' && streamError && (
          <div className="absolute inset-0 z-40 bg-slate-950/90 backdrop-blur-2xl flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
            <div className="max-w-md w-full apple-glass-card p-6 rounded-3xl border border-rose-500/30 bg-slate-950/80 shadow-[0_20px_50px_rgba(244,63,94,0.2)] space-y-4">
              <div className="w-14 h-14 mx-auto bg-rose-500/15 border border-rose-500/30 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(244,63,94,0.3)]">
                <Radio className="w-7 h-7 text-rose-400" />
              </div>
              <h3 className="text-base font-semibold text-white">Backend Stream Offline</h3>
              <p className="text-xs text-slate-300 mt-1 max-w-sm leading-relaxed">
                Could not connect to live MJPEG stream at <code className="text-rose-300 font-mono text-[11px]">{cleanApiBase}/api/stream</code>. Verify the backend server is running.
              </p>
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStreamError(false);
                    setStreamKey(Date.now());
                  }}
                  className="apple-btn-primary px-4 py-2 text-xs font-medium"
                >
                  Retry Stream
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchMode('webrtc')}
                  className="apple-btn-secondary px-4 py-2 text-xs font-medium text-cyan-300"
                >
                  Switch to WebRTC Camera
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
