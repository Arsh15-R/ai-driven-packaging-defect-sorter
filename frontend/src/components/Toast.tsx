import React from 'react';
import { CheckCircle2, AlertCircle, X, AlertTriangle } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none">
      {toasts.map((toast) => {
        let borderClass = 'border-[#3b82f6]';
        let bgClass = 'bg-[#0d121f]';
        let icon = <CheckCircle2 className="w-5 h-5 text-[#3b82f6] shrink-0" />;

        if (toast.type === 'error') {
          borderClass = 'border-[#ef4444]';
          bgClass = 'bg-[#2b0d10]';
          icon = <AlertCircle className="w-5 h-5 text-[#ef4444] shrink-0" />;
        } else if (toast.type === 'success') {
          borderClass = 'border-[#10b981]';
          bgClass = 'bg-[#062617]';
          icon = <CheckCircle2 className="w-5 h-5 text-[#10b981] shrink-0" />;
        } else if (toast.type === 'warning') {
          borderClass = 'border-[#f59e0b]';
          bgClass = 'bg-[#241705]';
          icon = <AlertTriangle className="w-5 h-5 text-[#f59e0b] shrink-0" />;
        }

        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flat-panel border p-3.5 shadow-2xl flex items-start gap-3 animate-slideInRight ${bgClass} ${borderClass}`}
          >
            {icon}
            <div className="flex-1 min-w-0">
              <div className="font-mono text-xs font-bold uppercase tracking-wider text-slate-100">
                {toast.title}
              </div>
              <div className="text-xs text-slate-300 font-mono mt-0.5 break-words">
                {toast.message}
              </div>
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="text-slate-400 hover:text-white p-0.5 shrink-0"
              aria-label="Dismiss toast"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
