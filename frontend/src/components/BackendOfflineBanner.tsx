import React from 'react';
import { AlertCircle, RefreshCw, ExternalLink, Terminal } from 'lucide-react';

interface BackendOfflineBannerProps {
  isOffline: boolean;
  onRetry: () => void;
  isRetrying: boolean;
}

export const BackendOfflineBanner: React.FC<BackendOfflineBannerProps> = ({
  isOffline,
  onRetry,
  isRetrying,
}) => {
  if (!isOffline) return null;

  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';

  return (
    <div
      role="alert"
      className="w-full bg-[#180a0c] border-b border-[#ef4444] text-[#fca5a5] px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm font-mono z-50 animate-fadeIn"
    >
      <div className="flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-[#ef4444] shrink-0" />
        <div>
          <div className="flex items-center gap-2">
            <strong className="text-white font-semibold">Backend Offline:</strong>
            <span>FastAPI server at <code className="bg-[#240c0f] text-[#f87171] px-1.5 py-0.5 border border-[#ef4444]/40 font-mono">http://127.0.0.1:8000</code> is unreachable.</span>
          </div>
          {isHttps ? (
            <p className="text-[11px] text-[#fca5a5]/80 mt-1">
              Browsers block HTTPS pages from calling local HTTP servers. For full YOLOv8 inference & physical webcam control, open the local dashboard directly:
            </p>
          ) : (
            <p className="text-[11px] text-[#fca5a5]/80 mt-1">
              Run <code className="bg-[#240c0f] text-white px-1 py-0.5 border border-[#ef4444]/30">python backend/api_server.py</code> in your project directory to activate YOLOv8.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <a
          href="http://127.0.0.1:8000"
          target="_blank"
          rel="noopener noreferrer"
          className="interactive-target h-8 px-3 text-xs font-semibold bg-[#2563eb] hover:bg-[#1d4ed8] text-white border border-[#3b82f6] flex items-center gap-1.5 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Open http://127.0.0.1:8000</span>
        </a>

        <button
          onClick={onRetry}
          disabled={isRetrying}
          className="interactive-target h-8 px-3 text-xs font-semibold bg-[#2b0d10] hover:bg-[#3d1317] text-[#fca5a5] border border-[#ef4444] flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
          <span>{isRetrying ? 'Retrying...' : 'Retry Connection'}</span>
        </button>
      </div>
    </div>
  );
};
