import React from 'react';
import { Camera, History, Box, ShieldCheck, User, LogIn, LogOut, Clock, Activity } from 'lucide-react';

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
    <header className="w-full bg-[#080b12] border-b border-[#1e2638] sticky top-0 z-40">
      {/* Top Utility Telemetry Bar */}
      <div className="px-4 py-2 bg-[#04060a] border-b border-[#141b29] flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-400 gap-2">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-bold text-slate-200">
            <span className="w-2 h-2 rounded-full bg-[#3b82f6]" />
            <span>ISO 9001 AI DEFECT INSPECTION SYSTEM</span>
          </span>
          <span className="text-slate-600">|</span>
          <span className="flex items-center gap-1">
            <Activity className="w-3 h-3 text-cyan-400" />
            <span>GATE: OPTICAL-1</span>
          </span>
          <span className="text-slate-600 hidden sm:inline">|</span>
          <span className="hidden sm:inline">
            ARCHIVED: <strong className="text-slate-200">{inspectionCount}</strong> RECORDS
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* Status Indicator */}
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-[#10b981]' : 'bg-[#ef4444]'
              }`}
            />
            <span className="font-bold text-slate-300">
              {isConnected ? 'BACKEND 200 OK' : 'BACKEND DISCONNECTED'}
            </span>
          </div>

          {/* System Clock */}
          <div className="hidden md:flex items-center gap-1.5 text-slate-400">
            <Clock className="w-3 h-3 text-slate-500" />
            <span>{currentTime.toLocaleTimeString()} UTC</span>
          </div>

          {/* Inspector Auth State */}
          <div className="flex items-center gap-2">
            {userEmail ? (
              <div className="flex items-center gap-2">
                <span className="bg-[#111728] px-2 py-0.5 border border-[#1e2638] text-slate-200 flex items-center gap-1">
                  <User className="w-3 h-3 text-cyan-400" />
                  <span className="max-w-[130px] truncate">{userEmail}</span>
                </span>
                <button
                  onClick={onSignOut}
                  className="hover:text-red-300 text-slate-400 flex items-center gap-1 p-0.5 transition-colors"
                  title="Sign out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">SIGN OUT</span>
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenAuth}
                className="interactive-target h-6 px-2 text-[10px] font-bold uppercase bg-[#162035] hover:bg-[#1f2e4d] text-cyan-300 border border-cyan-500/40 flex items-center gap-1 transition-colors"
              >
                <LogIn className="w-3 h-3" />
                <span>SIGN IN / AUTH</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#111728] border border-[#1e2638] flex items-center justify-center font-mono font-bold text-cyan-400 text-base shadow-sm">
            AI
          </div>
          <div>
            <h1 className="font-mono text-sm font-extrabold uppercase tracking-wider text-slate-100 leading-tight">
              AI Packaging Defect Sorter
            </h1>
            <div className="text-[10px] font-mono text-slate-400 tracking-wider">
              REAL-TIME WEBRTC COMPUTER VISION & AUDIT HMI
            </div>
          </div>
        </div>

        {/* View Selection Tabs */}
        <nav className="flex items-center gap-1 border border-[#1e2638] bg-[#04060a] p-1 font-mono text-xs">
          <button
            onClick={() => onSelectTab('inspection')}
            className={`interactive-target h-8 px-4 font-bold uppercase flex items-center gap-2 transition-colors ${
              activeTab === 'inspection'
                ? 'bg-[#2563eb] text-white border border-[#3b82f6]'
                : 'text-slate-400 hover:text-slate-100 hover:bg-[#0d121f]'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>LIVE INSPECTION</span>
          </button>

          <button
            onClick={() => onSelectTab('history')}
            className={`interactive-target h-8 px-4 font-bold uppercase flex items-center gap-2 transition-colors ${
              activeTab === 'history'
                ? 'bg-[#2563eb] text-white border border-[#3b82f6]'
                : 'text-slate-400 hover:text-slate-100 hover:bg-[#0d121f]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>HISTORY REVIEW</span>
            {inspectionCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-[#080b12] text-[10px] border border-[#1e2638]">
                {inspectionCount}
              </span>
            )}
          </button>

          <button
            onClick={() => onSelectTab('twin')}
            className={`interactive-target h-8 px-4 font-bold uppercase flex items-center gap-2 transition-colors ${
              activeTab === 'twin'
                ? 'bg-[#2563eb] text-white border border-[#3b82f6]'
                : 'text-slate-400 hover:text-slate-100 hover:bg-[#0d121f]'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            <span>DIGITAL TWIN LINE</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
