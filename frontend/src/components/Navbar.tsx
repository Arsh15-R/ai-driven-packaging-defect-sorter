import React from 'react';
import { Camera, History, Box, ShieldCheck, User, LogIn, LogOut, Clock, Activity, Sparkles } from 'lucide-react';

interface NavbarProps {
  activeTab: 'inspection' | 'history' | 'twin';
  onSelectTab: (tab: 'inspection' | 'history' | 'twin') => void;
  isConnected: boolean;
  userEmail: string | null;
  onOpenAuth: () => void;
  onSignOut: () => void;
  currentTime: Date;
  inspectionCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  isConnected,
  userEmail,
  onOpenAuth,
  onSignOut,
  currentTime,
  inspectionCount,
}) => {
  return (
    <header className="sticky top-3 z-40 w-full max-w-7xl mx-auto px-4 sm:px-6 transition-all duration-300">
      <div className="apple-glass px-4 sm:px-6 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-3 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
        {/* Brand / Title with Apple VisionOS emblem */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 p-[1px] shadow-[0_0_15px_rgba(59,130,246,0.5)]">
            <div className="w-full h-full rounded-[15px] bg-[#0c1020]/90 backdrop-blur-md flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-cyan-300 animate-pulse" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm tracking-tight text-white flex items-center gap-1.5">
                SORTEX <span className="text-cyan-400 font-bold">PRO</span>
              </span>
              <span className="hidden md:inline-flex text-[10px] font-medium tracking-wide uppercase px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-400/30 text-blue-300">
                VisionOS
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-ping' : 'bg-rose-400'}`} />
                <span className={isConnected ? 'text-emerald-400 font-medium' : 'text-rose-400 font-medium'}>
                  {isConnected ? 'Neural Engine Active' : 'Offline Mode'}
                </span>
              </span>
              <span className="text-slate-600">•</span>
              <span>{inspectionCount} Records</span>
            </div>
          </div>
        </div>

        {/* Center: Apple Segmented Pill Switcher */}
        <nav aria-label="Main Navigation" className="order-3 md:order-2 w-full md:w-auto flex items-center justify-center">
          <div className="bg-black/40 backdrop-blur-xl p-1 rounded-full border border-white/10 flex items-center gap-1 shadow-inner">
            <button
              onClick={() => onSelectTab('inspection')}
              className={`interactive-target px-4 py-1.5 rounded-full text-xs font-medium tracking-tight transition-all duration-200 flex items-center gap-1.5 ${
                activeTab === 'inspection'
                  ? 'bg-white/20 text-white shadow-[0_2px_10px_rgba(0,0,0,0.3)] border border-white/25 backdrop-blur-md'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Inspection</span>
            </button>

            <button
              onClick={() => onSelectTab('history')}
              className={`interactive-target px-4 py-1.5 rounded-full text-xs font-medium tracking-tight transition-all duration-200 flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-white/20 text-white shadow-[0_2px_10px_rgba(0,0,0,0.3)] border border-white/25 backdrop-blur-md'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>History</span>
              {inspectionCount > 0 && (
                <span className="ml-1 text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-white/20 text-white">
                  {inspectionCount}
                </span>
              )}
            </button>

            <button
              onClick={() => onSelectTab('twin')}
              className={`interactive-target px-4 py-1.5 rounded-full text-xs font-medium tracking-tight transition-all duration-200 flex items-center gap-1.5 ${
                activeTab === 'twin'
                  ? 'bg-white/20 text-white shadow-[0_2px_10px_rgba(0,0,0,0.3)] border border-white/25 backdrop-blur-md'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              <span>Digital Twin</span>
            </button>
          </div>
        </nav>

        {/* Right: Inspector Auth & System Clock */}
        <div className="order-2 md:order-3 flex items-center gap-2.5">
          <div className="hidden lg:flex items-center gap-1 text-[11px] font-mono text-slate-400 bg-white/[0.03] px-2.5 py-1 rounded-full border border-white/10">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>{currentTime.toLocaleTimeString()}</span>
          </div>

          {userEmail ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-white/[0.05] border border-white/10 px-3 py-1 rounded-full text-xs text-slate-200 shadow-sm backdrop-blur-md">
                <div className="w-2 h-2 rounded-full bg-cyan-400" />
                <span className="max-w-[120px] truncate font-medium">{userEmail}</span>
              </div>
              <button
                onClick={onSignOut}
                className="interactive-target w-8 h-8 rounded-full bg-white/[0.04] hover:bg-rose-500/20 hover:text-rose-300 text-slate-400 border border-white/10 flex items-center justify-center transition-all"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="apple-btn-primary px-3.5 py-1.5 text-xs font-medium flex items-center gap-1.5 shadow-md"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
