import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

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

  return (
    <div
      role="alert"
      className="w-full bg-[#381014] border-b border-[#ef4444] text-[#fca5a5] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm font-mono z-50 animate-fadeIn"
    >
      <div className="flex items-center gap-2.5">
        <AlertCircle className="w-4 h-4 text-[#ef4444] shrink-0" />
        <span>
          <strong className="text-white font-semibold">Backend Offline:</strong> FastAPI inspection server at{' '}
          <code className="bg-[#1e1013] text-[#f87171] px-1.5 py-0.5 border border-[#ef4444]/40 font-mono">
            http://127.0.0.1:8000
          </code>{' '}
          is currently unreachable. Cloud classification & live persistence may fail.
        </span>
      </div>
      <button
        onClick={onRetry}
        disabled={isRetrying}
        className="interactive-target h-8 px-3 text-xs font-semibold bg-[#21090c] hover:bg-[#2e0d11] text-[#fca5a5] border border-[#ef4444] flex items-center gap-1.5 transition-colors"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
        <span>{isRetrying ? 'Retrying...' : 'Retry Connection'}</span>
      </button>
    </div>
  );
};
