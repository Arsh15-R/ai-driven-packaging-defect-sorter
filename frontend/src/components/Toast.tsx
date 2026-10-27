import React from 'react';
import { CheckCircle2, AlertCircle, X, AlertTriangle, Info } from 'lucide-react';

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
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        let borderClass = 'border-blue-400/30';
        let bgClass = 'bg-slate-900/80';
        let icon = <CheckCircle2 className="w-5 h-5 text-blue-400 shrink-0" />;

        if (toast.type === 'error') {
          borderClass = 'border-rose-500/35';
          bgClass = 'bg-rose-950/70 text-rose-200';
          icon = <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />;
        } else if (toast.type === 'success') {
          borderClass = 'border-emerald-500/35';
          bgClass = 'bg-emerald-950/70 text-emerald-200';
          icon = <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />;
        } else if (toast.type === 'warning') {
          borderClass = 'border-amber-500/35';
          bgClass = 'bg-amber-950/70 text-amber-200';
          icon = <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />;
        } else if (toast.type === 'info') {
          borderClass = 'border-cyan-500/35';
          bgClass = 'bg-cyan-950/70 text-cyan-200';
          icon = <Info className="w-5 h-5 text-cyan-400 shrink-0" />;
        }

        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto apple-glass border p-3.5 rounded-2xl shadow-2xl flex items-start gap-3 backdrop-blur-2xl animate-fadeIn ${bgClass} ${borderClass}`}
          >
            {icon}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-white tracking-tight">
                {toast.title}
              </div>
              <div className="text-xs text-slate-300 mt-0.5 break-words leading-relaxed">
                {toast.message}
              </div>
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-white/10 shrink-0 transition-colors"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
