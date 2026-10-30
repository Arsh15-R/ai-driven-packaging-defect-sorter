import React from 'react';
import { AlertCircle, RefreshCw, ExternalLink } from 'lucide-react';

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
      className="w-full max-w-7xl mx-auto px-4 sm:px-6 pt-3 animate-fadeIn z-50"
    >
      <div className="apple-glass bg-rose-950/40 border border-rose-500/30 text-rose-200 px-4 sm:px-5 py-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs shadow-[0_10px_30px_rgba(244,63,94,0.15)] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center shrink-0">
            <AlertCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <strong className="text-white font-semibold">Backend Offline:</strong>
              <span>FastAPI server at <code className="bg-black/40 text-rose-300 px-1.5 py-0.5 rounded-md border border-rose-500/30 font-mono text-[11px]">http://127.0.0.1:8000</code> is unreachable.</span>
            </div>
            {isHttps ? (
              <p className="text-[11px] text-rose-200/80 mt-0.5">
                Browsers block HTTPS web pages from calling local HTTP servers. For full YOLOv9 inference & physical camera controls, open your local dashboard directly:
              </p>
            ) : (
              <p className="text-[11px] text-rose-200/80 mt-0.5">
                Run <code className="bg-black/40 text-white px-1.5 py-0.5 rounded border border-rose-500/20 font-mono">python backend/api_server.py</code> in your project directory.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-auto sm:ml-0">
          <a
            href="http://127.0.0.1:8000"
            target="_blank"
            rel="noopener noreferrer"
            className="apple-btn-primary px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open http://127.0.0.1:8000</span>
          </a>

          <button
            onClick={onRetry}
            disabled={isRetrying}
            className="apple-btn-secondary px-3 py-1.5 text-xs font-semibold text-rose-200 border-rose-500/30 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
            <span>{isRetrying ? 'Retrying...' : 'Retry'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
