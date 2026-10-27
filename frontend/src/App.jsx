import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Layers,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Camera,
  Play,
  Pause,
  RotateCcw,
  Download,
  Image as ImageIcon,
  Cpu,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Zap,
  Clock,
  ChevronRight,
  TrendingUp,
  Maximize2,
  Filter,
  Search,
  Gauge,
  BarChart3,
  Eye,
  SlidersHorizontal,
  Sparkles,
  Radio,
  Check,
  Copy,
  ArrowUpRight,
  HardDrive,
  Box,
  Crosshair,
  Volume2
} from 'lucide-react';
import DigitalTwinCanvas from './DigitalTwinCanvas';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [isConnected, setIsConnected] = useState(false);
  const [useDigitalTwin, setUseDigitalTwin] = useState(true);
  const [hasInitializedSettings, setHasInitializedSettings] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [stats, setStats] = useState({
    total_checked: 0,
    good_count: 0,
    defect_count: 0,
    defect_rate: 0.0,
    fps: 30.0,
    status: 'ONLINE',
    source: 'virtual',
    conf_threshold: 0.45,
    conveyor_delay: 2.8,
    last_defect: null,
    defect_breakdown: { dent: 0, label_missing: 0, seal_broken: 0, wrong_print: 0 }
  });
  const [logs, setLogs] = useState([]);
  const [filterDecision, setFilterDecision] = useState('ALL');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPusherTriggering, setIsPusherTriggering] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [selectedLogRecord, setSelectedLogRecord] = useState(null);
  const [confSlider, setConfSlider] = useState(0.45);
  const [delaySlider, setDelaySlider] = useState(2.8);
  const [settingsSavedAlert, setSettingsSavedAlert] = useState(false);
  const [isStreamPaused, setIsStreamPaused] = useState(false);
  const [showHudOverlay, setShowHudOverlay] = useState(true);
  const [isCopiedId, setIsCopiedId] = useState(false);
  const [showIslandDetail, setShowIslandDetail] = useState(false);

  // Live Digital Clock
  useEffect(() => {
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // Poll stats and logs from backend, with automated CSV fallback for static/Vercel hosting
  const fetchCSVFallback = async () => {
    try {
      const res = await fetch('/logs/defect_log.csv');
      if (res.ok) {
        const text = await res.text();
        const lines = text.trim().split('\n');
        if (lines.length > 1) {
          const parsed = [];
          for (let i = lines.length - 1; i >= 1; i--) {
            const row = lines[i].split(',');
            if (row.length >= 5) {
              const timestamp = row[0].trim();
              const item_id = row[1].trim();
              const decision = row[2].trim();
              const defect_type = row[3].trim();
              const confidence = parseFloat(row[4]) || 1.0;
              const imgRaw = (row[5] || '').trim();
              let image_url = null;
              if (imgRaw) {
                const fname = imgRaw.split(/[\\/]/).pop();
                image_url = `/logs/defect_images/${fname}`;
              }
              parsed.push({
                timestamp,
                item_id,
                decision,
                defect_type,
                confidence,
                image_url
              });
            }
          }
          if (parsed.length > 0) {
            setLogs(parsed);
            const total = parsed.length;
            const good = parsed.filter(p => p.decision === 'GOOD').length;
            const defect = parsed.filter(p => p.decision === 'DEFECTIVE').length;
            const rate = total > 0 ? (defect / total) * 100 : 0;
            const breakdown = { dent: 0, label_missing: 0, seal_broken: 0, wrong_print: 0 };
            let lastDefect = null;
            parsed.forEach(p => {
              if (p.decision === 'DEFECTIVE') {
                const dt = (p.defect_type || '').toLowerCase();
                if (breakdown[dt] !== undefined) breakdown[dt]++;
                if (!lastDefect) {
                  lastDefect = {
                    id: p.item_id,
                    type: p.defect_type,
                    conf: p.confidence,
                    time: p.timestamp.split(' ')[1] || p.timestamp
                  };
                }
              }
            });
            setStats(prev => ({
              ...prev,
              total_checked: total,
              good_count: good,
              defect_count: defect,
              defect_rate: rate,
              status: 'VIRTUAL TWIN',
              source: 'Digital Twin',
              last_defect: lastDefect || prev.last_defect,
              defect_breakdown: breakdown
            }));
            setIsConnected(true);
          }
        }
      }
    } catch (e) {
      // Offline fallback silent
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
        setIsConnected(true);
        if (!hasInitializedSettings) {
          if (typeof data.conf_threshold === 'number') setConfSlider(data.conf_threshold);
          if (typeof data.conveyor_delay === 'number') setDelaySlider(data.conveyor_delay);
          setHasInitializedSettings(true);
        }
      } else {
        setIsConnected(false);
        fetchCSVFallback();
      }
    } catch (err) {
      setIsConnected(false);
      fetchCSVFallback();
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/logs?limit=50');
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      } else {
        fetchCSVFallback();
      }
    } catch (err) {
      fetchCSVFallback();
    }
  };

  // Digital twin live event simulation handler
  const handleTwinDefect = (box) => {
    const isDef = box.status === 'DEFECTIVE';
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    setStats(prev => {
      const newTotal = prev.total_checked + 1;
      const newGood = isDef ? prev.good_count : prev.good_count + 1;
      const newDefect = isDef ? prev.defect_count + 1 : prev.defect_count;
      const newRate = (newDefect / newTotal) * 100;
      const newBreakdown = { ...prev.defect_breakdown };
      if (isDef && box.defect && newBreakdown[box.defect] !== undefined) {
        newBreakdown[box.defect] += 1;
      }
      return {
        ...prev,
        total_checked: newTotal,
        good_count: newGood,
        defect_count: newDefect,
        defect_rate: newRate,
        last_defect: isDef ? { id: box.id, type: box.defect, conf: box.conf, time: new Date().toLocaleTimeString() } : prev.last_defect,
        defect_breakdown: newBreakdown,
      };
    });

    // Prepend new record into logs table
    setLogs(prev => [
      {
        timestamp: nowStr,
        item_id: box.id,
        decision: box.status,
        defect_type: box.defect || 'none',
        confidence: box.conf,
        image_url: isDef ? `/logs/defect_images/20261027_170111_PKG-1010_dent.jpg` : null
      },
      ...prev.slice(0, 99)
    ]);

    // If defective, arm pusher with conveyor transit delay
    if (isDef) {
      setTimeout(() => {
        setIsPusherTriggering(true);
        setTimeout(() => setIsPusherTriggering(false), 900);
      }, (delaySlider || 2.8) * 1000 * 0.45);
    }
  };

  const handleTwinPusher = () => {
    setIsPusherTriggering(true);
    setTimeout(() => setIsPusherTriggering(false), 800);
  };

  useEffect(() => {
    fetchStats();
    fetchLogs();
    const interval = setInterval(() => {
      fetchStats();
      fetchLogs();
    }, 2000);
    return () => clearInterval(interval);
  }, [hasInitializedSettings]);

  // Keyboard dismiss modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectedSnapshot(null);
        setSelectedLogRecord(null);
        setShowIslandDetail(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Pusher override trigger
  const handleTestPusher = async () => {
    if (isPusherTriggering) return;
    setIsPusherTriggering(true);
    try {
      await fetch('/api/control/test-pusher', { method: 'POST' });
    } catch (e) {
      console.error('Pusher command error:', e);
    }
    setTimeout(() => setIsPusherTriggering(false), 900);
  };

  // Reset counters
  const handleReset = async () => {
    if (window.confirm('Reset all production inspection counters to zero?')) {
      try {
        await fetch('/api/control/reset', { method: 'POST' });
        fetchStats();
        fetchLogs();
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Save Settings
  const handleSaveSettings = async () => {
    try {
      const res = await fetch('/api/control/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conf_threshold: confSlider,
          conveyor_delay: delaySlider
        })
      });
      if (res.ok) {
        setSettingsSavedAlert(true);
        setTimeout(() => setSettingsSavedAlert(false), 3000);
        fetchStats();
      }
    } catch (e) {
      alert('Failed saving parameters to conveyor backend.');
    }
  };

  // Presets
  const applyPreset = (conf, delay) => {
    setConfSlider(conf);
    setDelaySlider(delay);
  };

  // Copy helper
  const handleCopyId = (id) => {
    navigator.clipboard.writeText(id);
    setIsCopiedId(true);
    setTimeout(() => setIsCopiedId(false), 2000);
  };

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter(item => {
      const matchesDecision = filterDecision === 'ALL' || item.decision === filterDecision;
      const matchesCategory = filterCategory === 'ALL' || (item.defect_type || '').toLowerCase() === filterCategory.toLowerCase();
      const matchesSearch = searchQuery === '' ||
        (item.item_id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.defect_type || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchesDecision && matchesCategory && matchesSearch;
    });
  }, [logs, filterDecision, filterCategory, searchQuery]);

  // Defect snapshots
  const defectSnapshots = useMemo(() => {
    return logs.filter(l => l.image_url);
  }, [logs]);

  // Defect breakdown stats
  const defectBreakdownList = [
    { label: 'Dent Defect', key: 'dent', color: 'from-amber-500 to-orange-600', ring: 'text-amber-400', hex: '#FF9F0A', desc: 'Container wall impact deformity' },
    { label: 'Missing Label', key: 'label_missing', color: 'from-red-500 to-rose-600', ring: 'text-red-400', hex: '#FF453A', desc: 'Applicator feed or adhesive omission' },
    { label: 'Broken Seal', key: 'seal_broken', color: 'from-purple-500 to-fuchsia-600', ring: 'text-purple-400', hex: '#BF5AF2', desc: 'Thermal cap / foil integrity breach' },
    { label: 'Wrong / Smudged Print', key: 'wrong_print', color: 'from-cyan-400 to-blue-600', ring: 'text-cyan-400', hex: '#64D2FF', desc: 'Inkjet smudge or batch code mismatch' },
  ];

  const yieldPercentage = stats.total_checked > 0
    ? ((stats.good_count / stats.total_checked) * 100).toFixed(1)
    : '100.0';

  return (
    <div className="relative min-h-screen w-full bg-[#020408] text-slate-100 font-sans selection:bg-cyan-500/30 selection:text-white flex flex-col overflow-x-hidden">
      
      {/* =========================================================================
          AMBIENT VISION PRO BACKGROUND GLOWS
      ========================================================================= */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Top Center Ambient Azure Bloom */}
        <div className="absolute -top-[15%] left-1/2 -translate-x-1/2 w-[700px] h-[450px] rounded-full bg-gradient-to-b from-cyan-500/15 via-blue-600/10 to-transparent blur-[130px] opacity-75" />
        {/* Top Right Emerald Glow */}
        <div className="absolute top-[10%] -right-[10%] w-[500px] h-[500px] rounded-full bg-emerald-500/10 blur-[150px] opacity-60" />
        {/* Bottom Left Deep Purple Bloom */}
        <div className="absolute bottom-[5%] -left-[10%] w-[600px] h-[600px] rounded-full bg-purple-600/12 blur-[160px] opacity-50" />
        {/* Subtle Precision Grid Lines */}
        <div 
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.4) 1px, transparent 0)`,
            backgroundSize: '40px 40px'
          }}
        />
      </div>

      {/* =========================================================================
          CUPERTINO DYNAMIC ISLAND HEADER
      ========================================================================= */}
      <header className="sticky top-0 z-40 w-full px-4 pt-3 pb-2 backdrop-blur-xl bg-[#020408]/60 border-b border-white/[0.06] transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3">
            <div className="relative group cursor-pointer">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-cyan-400 via-blue-500 to-purple-600 p-[1.5px] shadow-glow-cyan">
                <div className="h-full w-full bg-[#060911] rounded-[14px] flex items-center justify-center">
                  <Box className="h-5 w-5 text-cyan-400 group-hover:scale-110 transition-transform duration-300" />
                </div>
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-[#020408] animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm tracking-tight text-white flex items-center gap-1.5">
                  SORTEX PRO
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-white/[0.08] text-slate-300 border border-white/10">
                    VISION HMI
                  </span>
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
                <span>Station 1 & 2</span>
                <span className="h-1 w-1 rounded-full bg-slate-600" />
                <span className="text-cyan-400">YOLOv8 Edge Pipeline</span>
              </div>
            </div>
          </div>

          {/* Cupertino Floating Dynamic Island (Center Capsule) */}
          <div 
            onClick={() => setShowIslandDetail(!showIslandDetail)}
            className="dynamic-island cursor-pointer px-4 py-2 rounded-full flex items-center gap-4 transition-all duration-300 hover:border-white/25 hover:scale-[1.01]"
          >
            {/* Status Pulse */}
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              </span>
              <span className="text-xs font-semibold tracking-wide text-white font-mono">
                {isConnected ? 'CONVEYOR ACTIVE' : 'CONNECTING...'}
              </span>
            </div>

            <div className="h-3 w-[1px] bg-white/20" />

            {/* Live Clock */}
            <div className="flex items-center gap-1.5 text-xs font-mono text-slate-300">
              <Clock className="h-3.5 w-3.5 text-cyan-400" />
              <span>{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            </div>

            <div className="h-3 w-[1px] bg-white/20 hidden md:block" />

            {/* GPU Telemetry Pill */}
            <div className="hidden md:flex items-center gap-2 text-xs font-mono">
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-400/20 text-[10px] font-bold">
                RTX 3050 • {stats.fps} FPS
              </span>
            </div>
          </div>

          {/* Quick Header Tactile Pusher & Actions */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleTestPusher}
              disabled={isPusherTriggering}
              title="Manual Actuator Test (SG90 Servo Override)"
              className={`tactile-pusher-btn relative px-4 py-2 rounded-full text-xs font-bold tracking-wide flex items-center gap-2 transition-all ${
                isPusherTriggering ? 'scale-95 text-white ring-2 ring-red-400' : 'text-red-100'
              }`}
            >
              <Zap className={`h-3.5 w-3.5 text-red-400 ${isPusherTriggering ? 'animate-bounce text-white' : ''}`} />
              <span className="hidden sm:inline">
                {isPusherTriggering ? 'PUSHER FIRED' : 'TEST PUSHER'}
              </span>
            </button>

            <button
              onClick={handleReset}
              title="Reset inspection counters"
              className="p-2 rounded-full bg-white/[0.05] border border-white/10 text-slate-400 hover:text-white hover:bg-white/[0.1] transition-all"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Dynamic Island Expanded Panel (Toggled) */}
        {showIslandDetail && (
          <div className="max-w-2xl mx-auto mt-3 p-4 rounded-2xl apple-glass border border-white/20 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-cyan-400" />
                <span className="text-xs font-semibold text-white tracking-wide">Vision Line Diagnostics</span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">Firmware v2.4-CUDA</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                <div className="text-[10px] text-slate-400 uppercase">Input Feed</div>
                <div className="text-white font-semibold mt-0.5">{stats.source.toUpperCase()} STREAM</div>
              </div>
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                <div className="text-[10px] text-slate-400 uppercase">Inference Time</div>
                <div className="text-emerald-400 font-semibold mt-0.5">14.8 ms</div>
              </div>
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                <div className="text-[10px] text-slate-400 uppercase">Transit Window</div>
                <div className="text-cyan-400 font-semibold mt-0.5">{stats.conveyor_delay} Seconds</div>
              </div>
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                <div className="text-[10px] text-slate-400 uppercase">Confidence Gate</div>
                <div className="text-amber-400 font-semibold mt-0.5">{(stats.conf_threshold * 100).toFixed(0)}% Min</div>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* =========================================================================
          APPLE FLOATING SEGMENTED NAVIGATION
      ========================================================================= */}
      <div className="sticky top-[61px] z-30 w-full py-3 px-4 flex justify-center backdrop-blur-md bg-[#020408]/40">
        <nav className="segmented-control-bar p-1.5 rounded-full flex items-center gap-1 max-w-full overflow-x-auto shadow-glass">
          {[
            { id: 'overview', label: 'Overview', icon: Gauge },
            { id: 'stream', label: 'Live Stream', icon: Eye, countBadge: 'LIVE' },
            { id: 'analytics', label: 'Analytics', icon: BarChart3, countBadge: `${yieldPercentage}%` },
            { id: 'gallery', label: 'Defect Archive', icon: ImageIcon, countBadge: stats.defect_count },
            { id: 'audit', label: 'Audit Trail', icon: ShieldCheck },
            { id: 'control', label: 'Line Controls', icon: SlidersHorizontal },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-4 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 transition-all duration-200 whitespace-nowrap ${
                  isActive
                    ? 'segmented-pill-active font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.countBadge !== undefined && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    isActive 
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30'
                      : 'bg-white/[0.08] text-slate-400'
                  }`}>
                    {tab.countBadge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* =========================================================================
          MAIN VIEWPORT CONTENT
      ========================================================================= */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 z-10 space-y-6">
        
        {/* =====================================================================
            TAB 1: OVERVIEW DASHBOARD
        ===================================================================== */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            
            {/* LUXURY METRIC CARDS (4 Glass Cards) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Card 1: Total Inspected */}
              <div className="apple-glass-card rounded-3xl p-5 relative overflow-hidden group">
                <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-60" />
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
                    Total Inspected
                  </span>
                  <div className="h-8 w-8 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center border border-cyan-400/20">
                    <Layers className="h-4 w-4" />
                  </div>
                </div>
                <div className="text-3xl lg:text-4xl font-extrabold font-mono text-white tracking-tight mb-2">
                  {stats.total_checked.toLocaleString()}
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span className="flex items-center gap-1 text-cyan-400">
                    <TrendingUp className="h-3 w-3" /> 100% Inspected
                  </span>
                  <span>Optical Gate</span>
                </div>
              </div>

              {/* Card 2: Good Packages (Yield %) */}
              <div className="apple-glass-card rounded-3xl p-5 relative overflow-hidden group">
                <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent opacity-60" />
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
                    Good Packages
                  </span>
                  <div className="h-8 w-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-400/20">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                </div>
                <div className="text-3xl lg:text-4xl font-extrabold font-mono text-emerald-400 tracking-tight mb-2">
                  {stats.good_count.toLocaleString()}
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-400">Line Yield:</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-bold border border-emerald-400/25">
                    {yieldPercentage}% Pass
                  </span>
                </div>
              </div>

              {/* Card 3: Defects Diverted */}
              <div className="apple-glass-card rounded-3xl p-5 relative overflow-hidden group">
                <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-60" />
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
                    Defects Diverted
                  </span>
                  <div className="h-8 w-8 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center border border-red-400/20">
                    <XCircle className="h-4 w-4" />
                  </div>
                </div>
                <div className="text-3xl lg:text-4xl font-extrabold font-mono text-red-400 tracking-tight mb-2">
                  {stats.defect_count.toLocaleString()}
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span className="text-red-400">Chute Diverted</span>
                  <span>Servo Fired: {stats.defect_count}</span>
                </div>
              </div>

              {/* Card 4: Defect Rate % */}
              <div className="apple-glass-card rounded-3xl p-5 relative overflow-hidden group">
                <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-amber-400 to-transparent opacity-60" />
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
                    Defect Rate
                  </span>
                  <div className="h-8 w-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-400/20">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                </div>
                <div className={`text-3xl lg:text-4xl font-extrabold font-mono tracking-tight mb-2 ${
                  stats.defect_rate > 5 ? 'text-red-400' : 'text-amber-400'
                }`}>
                  {stats.defect_rate.toFixed(2)}%
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-400">Target &lt; 3.0%</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    stats.defect_rate > 5 
                      ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                      : 'bg-amber-500/15 text-amber-300 border border-amber-400/25'
                  }`}>
                    {stats.defect_rate > 5 ? 'EXCEEDED' : 'OPTIMAL'}
                  </span>
                </div>
              </div>

            </div>

            {/* CINEMA GLASS VIDEO STREAM + ANALYTICS ROW */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Cinema Glass Video Stream Container (2 Cols) */}
              <div className="lg:col-span-2 apple-glass-card rounded-3xl p-5 border border-white/10 flex flex-col justify-between">
                
                {/* Header Bar */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs font-semibold tracking-wide text-white uppercase font-mono">
                      Station 1 Optical Vision $\rightarrow$ Station 2 Rejector
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setUseDigitalTwin(!useDigitalTwin)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-mono transition-all ${
                        useDigitalTwin
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-400/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                      }`}
                      title="Toggle between Interactive Digital Twin and Live Camera Stream"
                    >
                      {useDigitalTwin ? 'DIGITAL TWIN' : 'LIVE STREAM'}
                    </button>
                    <button
                      onClick={() => setShowHudOverlay(!showHudOverlay)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-mono transition-all ${
                        showHudOverlay 
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30' 
                          : 'bg-white/5 text-slate-400 border border-white/10'
                      }`}
                    >
                      HUD OVERLAY
                    </button>
                    <button
                      onClick={() => setActiveTab('stream')}
                      title="Expand to Full Vision Pro Theater"
                      className="p-1 rounded-full bg-white/5 hover:bg-white/10 text-slate-300"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Video Glass Display Bezel */}
                <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black/90 border border-white/15 shadow-2xl flex items-center justify-center group">
                  
                  {/* Outer Specular Bezel Rim */}
                  <div className="absolute inset-0 pointer-events-none rounded-2xl border border-white/[0.08] shadow-[inset_0_1px_2px_rgba(255,255,255,0.25)] z-20" />

                  {/* MJPEG Stream Image or Digital Twin Canvas */}
                  {!isStreamPaused ? (
                    useDigitalTwin ? (
                      <DigitalTwinCanvas
                        isPusherActive={isPusherTriggering}
                        confThreshold={confSlider}
                        conveyorDelay={delaySlider}
                        onDefectDetected={handleTwinDefect}
                        onPusherFired={handleTwinPusher}
                      />
                    ) : (
                      <img
                        src="/api/stream"
                        alt="Conveyor Feed"
                        className="w-full h-full object-contain"
                        onError={() => {
                          setUseDigitalTwin(true);
                        }}
                      />
                    )
                  ) : (
                    <div className="text-slate-400 text-xs font-mono flex items-center gap-2">
                      <Pause className="h-4 w-4 text-amber-400" />
                      Stream Preview Paused
                    </div>
                  )}

                  {/* Vision Pro Telemetry HUD Overlay (Toggled) */}
                  {showHudOverlay && (
                    <>
                      {/* Top-Left: Station 1 Vision Zone Tag */}
                      <div className="absolute top-3 left-3 px-3 py-1.5 rounded-xl apple-glass border border-white/20 text-[10px] font-mono text-cyan-300 backdrop-blur-md flex items-center gap-2 pointer-events-none">
                        <Crosshair className="h-3 w-3 text-cyan-400 animate-spin" />
                        <div>
                          <div className="font-bold text-white">STATION 1: INSPECTION</div>
                          <div className="text-slate-400 text-[9px]">Conf: {(stats.conf_threshold * 100).toFixed(0)}%</div>
                        </div>
                      </div>

                      {/* Top-Right: Station 2 Actuator Tag */}
                      <div className="absolute top-3 right-3 px-3 py-1.5 rounded-xl apple-glass border border-white/20 text-[10px] font-mono text-red-300 backdrop-blur-md flex items-center gap-2 pointer-events-none">
                        <Zap className="h-3 w-3 text-red-400" />
                        <div>
                          <div className="font-bold text-white">STATION 2: DIVERTER</div>
                          <div className="text-slate-400 text-[9px]">Delay: {stats.conveyor_delay}s</div>
                        </div>
                      </div>

                      {/* Bottom Live Conveyor Transit Pipeline Progress */}
                      <div className="absolute bottom-3 left-3 right-3 px-3 py-2 rounded-xl apple-glass border border-white/15 backdrop-blur-md flex items-center justify-between text-[11px] font-mono pointer-events-none">
                        <div className="flex items-center gap-2 text-slate-300">
                          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                          <span>Vision Optical Gate</span>
                        </div>
                        {/* Conveyor Transit Arrow */}
                        <div className="flex-1 mx-4 flex items-center justify-center relative">
                          <div className="h-[2px] w-full bg-gradient-to-r from-cyan-400 via-amber-400 to-red-400 opacity-60" />
                          <span className="absolute text-[9px] bg-[#020408] px-2 py-0.5 rounded-full border border-white/10 text-slate-300">
                            {stats.conveyor_delay}s Transit Window
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-300">
                          <span>Servo Reject Gate</span>
                          <span className="h-2 w-2 rounded-full bg-red-400" />
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Footer specs */}
                <div className="flex flex-wrap items-center justify-between mt-3 text-[11px] text-slate-400 font-mono">
                  <span>Sensor: 1280×600 • 30.0 FPS • RGB24</span>
                  <span className="text-cyan-400">YOLOv8s In-Memory Inference (~14ms)</span>
                </div>
              </div>

              {/* Defect Classification Analytics & Latest Alert (1 Col) */}
              <div className="apple-glass-card rounded-3xl p-5 border border-white/10 flex flex-col justify-between space-y-4">
                
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-white font-mono flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-purple-400" />
                      Defect Distribution
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-slate-400">
                      Total: {stats.defect_count}
                    </span>
                  </div>

                  {/* Classification Progress Bars */}
                  <div className="space-y-3.5">
                    {defectBreakdownList.map((def) => {
                      const count = (stats.defect_breakdown && stats.defect_breakdown[def.key]) || 0;
                      const pct = stats.defect_count > 0 ? (count / stats.defect_count) * 100 : 0;
                      return (
                        <div key={def.key} className="space-y-1.5">
                          <div className="flex justify-between text-xs font-mono">
                            <span className="text-slate-300 flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: def.hex }} />
                              {def.label}
                            </span>
                            <span className="font-bold text-white">
                              {count} <span className="text-slate-500 font-normal">({pct.toFixed(0)}%)</span>
                            </span>
                          </div>
                          <div className="h-2 w-full bg-white/[0.06] rounded-full overflow-hidden p-0.5 border border-white/[0.04]">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${def.color} transition-all duration-700 ease-out`}
                              style={{ width: `${Math.max(pct, count > 0 ? 5 : 0)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Latest Defect Flagged Banner */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-red-950/40 via-red-900/20 to-black/60 border border-red-500/30 backdrop-blur-md">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-red-400 font-mono uppercase tracking-wider font-bold flex items-center gap-1.5">
                      <AlertTriangle className="h-3 w-3" /> Latest Defect Detected
                    </span>
                    {stats.last_defect && (
                      <span className="text-[10px] font-mono text-slate-400">
                        {stats.last_defect.time || 'Live'}
                      </span>
                    )}
                  </div>
                  {stats.last_defect ? (
                    <div className="mt-2 space-y-1">
                      <div className="text-xs font-bold text-white font-mono flex items-center justify-between">
                        <span>{stats.last_defect.id}</span>
                        <span className="text-red-400 uppercase px-2 py-0.5 rounded bg-red-500/20 border border-red-500/30 text-[10px]">
                          {stats.last_defect.type}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-300 font-mono flex items-center justify-between pt-1">
                        <span>Confidence: {((stats.last_defect.conf || 0.85) * 100).toFixed(0)}%</span>
                        <span className="text-emerald-400">Diverter Actuated</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 font-mono py-1">
                      Conveyor running at optimal quality. No active defect alerts.
                    </div>
                  )}
                </div>

              </div>

            </div>

            {/* LIVE CONVEYOR AUDIT LOG PREVIEW TABLE */}
            <div className="apple-glass-card rounded-3xl p-6 border border-white/10 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-white font-mono flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-cyan-400" />
                    Live Conveyor Traceability Log
                  </h3>
                  <p className="text-xs text-slate-400">Recent packaging units evaluated by YOLOv8 vision pipeline</p>
                </div>
                <button
                  onClick={() => setActiveTab('audit')}
                  className="px-3 py-1.5 rounded-full apple-glass border border-white/15 text-xs text-cyan-300 hover:text-white hover:border-cyan-400/40 font-mono flex items-center gap-1.5 transition-all"
                >
                  View Full Audit Trail <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="border-b border-white/10 text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="pb-3 px-2">Timestamp</th>
                      <th className="pb-3 px-2">Package ID</th>
                      <th className="pb-3 px-2">QA Decision</th>
                      <th className="pb-3 px-2">Defect Type</th>
                      <th className="pb-3 px-2">Confidence</th>
                      <th className="pb-3 px-2 text-right">Photo Snapshot</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] text-slate-300">
                    {logs.slice(0, 6).map((r, i) => (
                      <tr key={i} className="hover:bg-white/[0.03] transition-colors">
                        <td className="py-3 px-2 text-slate-400">{r.timestamp}</td>
                        <td className="py-3 px-2 font-bold text-white flex items-center gap-1.5">
                          {r.item_id}
                        </td>
                        <td className="py-3 px-2">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                              r.decision === 'GOOD'
                                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                : 'bg-red-500/15 text-red-300 border border-red-500/30'
                            }`}
                          >
                            {r.decision}
                          </span>
                        </td>
                        <td className="py-3 px-2 uppercase text-slate-300 font-semibold">{r.defect_type}</td>
                        <td className="py-3 px-2 text-cyan-300">{(r.confidence * 100).toFixed(1)}%</td>
                        <td className="py-3 px-2 text-right">
                          {r.image_url ? (
                            <button
                              onClick={() => {
                                setSelectedSnapshot(r.image_url);
                                setSelectedLogRecord(r);
                              }}
                              className="px-2.5 py-1 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-400/30 hover:bg-cyan-500/30 text-[11px] transition-all inline-flex items-center gap-1"
                            >
                              <Eye className="h-3 w-3" /> Inspect
                            </button>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {logs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-500">
                          Awaiting conveyor inspection entries...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* =====================================================================
            TAB 2: FULL VISION PRO CINEMA LIVE STREAM THEATER
        ===================================================================== */}
        {activeTab === 'stream' && (
          <div className="space-y-6">
            
            <div className="apple-glass-card rounded-3xl p-6 border border-white/10 space-y-4">
              
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-ping" />
                    <h2 className="text-sm font-semibold text-white tracking-wide font-mono">
                      Real-Time Optical Vision Theater (Station 1 $\leftrightarrow$ Station 2)
                    </h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Full-bandwidth MJPEG feed streaming from simulated or physical telecentric vision sensor
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setUseDigitalTwin(!useDigitalTwin)}
                    className={`px-3 py-1.5 rounded-full text-xs font-mono transition-all ${
                      useDigitalTwin
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-400/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                    }`}
                  >
                    {useDigitalTwin ? 'Digital Twin Mode' : 'Live Camera Mode'}
                  </button>
                  <button
                    onClick={() => setIsStreamPaused(!isStreamPaused)}
                    className="px-3 py-1.5 rounded-full apple-glass border border-white/15 text-xs text-slate-300 hover:text-white flex items-center gap-1.5"
                  >
                    {isStreamPaused ? <Play className="h-3.5 w-3.5 text-emerald-400" /> : <Pause className="h-3.5 w-3.5 text-amber-400" />}
                    {isStreamPaused ? 'Resume' : 'Pause'}
                  </button>
                  <button
                    onClick={handleTestPusher}
                    disabled={isPusherTriggering}
                    className="tactile-pusher-btn px-4 py-1.5 rounded-full text-xs font-bold text-red-200 flex items-center gap-2"
                  >
                    <Zap className="h-3.5 w-3.5 text-red-400" />
                    Actuate Diverter Now
                  </button>
                </div>
              </div>

              {/* Theater Video Frame Container */}
              <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black border border-white/15 shadow-2xl flex items-center justify-center">
                
                {/* Cinema Ambient Border Rim */}
                <div className="absolute inset-0 pointer-events-none rounded-2xl border border-white/10 shadow-[inset_0_2px_4px_rgba(255,255,255,0.2)] z-20" />

                {!isStreamPaused ? (
                  useDigitalTwin ? (
                    <DigitalTwinCanvas
                      isPusherActive={isPusherTriggering}
                      confThreshold={confSlider}
                      conveyorDelay={delaySlider}
                      onDefectDetected={handleTwinDefect}
                      onPusherFired={handleTwinPusher}
                    />
                  ) : (
                    <img
                      src="/api/stream"
                      alt="Live Cinema Conveyor"
                      className="w-full h-full object-contain"
                      onError={() => setUseDigitalTwin(true)}
                    />
                  )
                ) : (
                  <div className="text-slate-400 text-sm font-mono flex items-center gap-2">
                    <Pause className="h-5 w-5 text-amber-400" />
                    Cinema Feed Paused for Frame Inspection
                  </div>
                )}

                {/* Overlaid Cinema Crosshair HUD */}
                <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                    <div className="px-3 py-1.5 rounded-xl apple-glass border border-white/15 text-[11px] font-mono text-cyan-300">
                      <div>STATION 1: HIGH-SPEED VISION</div>
                      <div className="text-slate-400 text-[10px]">Model: YOLOv8s PyTorch • CUDA 12.1</div>
                    </div>
                    <div className="px-3 py-1.5 rounded-xl apple-glass border border-white/15 text-[11px] font-mono text-red-300 text-right">
                      <div>STATION 2: SERVO DIVERTER</div>
                      <div className="text-slate-400 text-[10px]">SG90 / MG995 PWM Servo • Pin D9</div>
                    </div>
                  </div>

                  {/* Center Guidance Reticle */}
                  <div className="self-center flex items-center justify-center opacity-30">
                    <Crosshair className="h-16 w-16 text-cyan-400" />
                  </div>

                  <div className="flex justify-between items-end text-[10px] font-mono text-slate-400 px-2 py-1 rounded-xl apple-glass border border-white/10">
                    <span>Target Speed: 0.25 m/s</span>
                    <span className="text-cyan-400">Transit: {stats.conveyor_delay}s</span>
                    <span>Resolution: 1280 × 600 @ 30 FPS</span>
                  </div>
                </div>

              </div>

              {/* Hardware Diagnostic Footers */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 text-xs font-mono">
                <div className="p-4 rounded-2xl apple-glass-subtle border border-white/10 space-y-1">
                  <div className="text-slate-400 uppercase text-[10px] font-bold">Station 1: Optical Camera</div>
                  <div className="text-white font-semibold text-sm">Industrial Telecentric Vision</div>
                  <div className="text-slate-400 text-[11px]">6000K Ring Illuminator • 1/500s Shutter</div>
                </div>

                <div className="p-4 rounded-2xl apple-glass-subtle border border-white/10 space-y-1">
                  <div className="text-slate-400 uppercase text-[10px] font-bold">Station 2: Servo Diverter</div>
                  <div className="text-white font-semibold text-sm">SG90 High-Torque Sweep Gate</div>
                  <div className="text-slate-400 text-[11px]">95° Deflection Arc • 80ms Actuation</div>
                </div>

                <div className="p-4 rounded-2xl apple-glass-subtle border border-white/10 space-y-1">
                  <div className="text-slate-400 uppercase text-[10px] font-bold">Conveyor Drive Motor</div>
                  <div className="text-cyan-400 font-semibold text-sm">PWM Closed-Loop Belt Drive</div>
                  <div className="text-slate-400 text-[11px]">{stats.conveyor_delay}s Precise Arrival Delay</div>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* =====================================================================
            TAB 3: ANALYTICS & YIELD INTELLIGENCE
        ===================================================================== */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            
            {/* Top KPI Quality Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              <div className="apple-glass-card rounded-3xl p-6 border border-white/10 space-y-2">
                <div className="text-[11px] font-semibold text-slate-400 uppercase font-mono">First Pass Yield (FPY)</div>
                <div className="text-4xl font-extrabold font-mono text-emerald-400">{yieldPercentage}%</div>
                <div className="text-xs text-slate-400">Total good packaging units passing without defect diversion</div>
              </div>

              <div className="apple-glass-card rounded-3xl p-6 border border-white/10 space-y-2">
                <div className="text-[11px] font-semibold text-slate-400 uppercase font-mono">Overall Defect Ratio</div>
                <div className="text-4xl font-extrabold font-mono text-amber-400">{stats.defect_rate.toFixed(2)}%</div>
                <div className="text-xs text-slate-400">Acceptable threshold benchmark &lt; 3.00%</div>
              </div>

              <div className="apple-glass-card rounded-3xl p-6 border border-white/10 space-y-2">
                <div className="text-[11px] font-semibold text-slate-400 uppercase font-mono">Diverter Efficiency</div>
                <div className="text-4xl font-extrabold font-mono text-cyan-400">100.0%</div>
                <div className="text-xs text-slate-400">Pusher actuated for all {stats.defect_count} confirmed defects</div>
              </div>

            </div>

            {/* Defect Classification Deep-Dive Cards */}
            <div className="apple-glass-card rounded-3xl p-6 border border-white/10 space-y-6">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white font-mono flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-cyan-400" />
                  Defect Class Distribution & Root-Cause Matrix
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Automated visual inspection taxonomy according to ISO 9001 packaging QA standards</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {defectBreakdownList.map((def) => {
                  const count = (stats.defect_breakdown && stats.defect_breakdown[def.key]) || 0;
                  const pct = stats.defect_count > 0 ? (count / stats.defect_count) * 100 : 0;
                  return (
                    <div key={def.key} className="p-4 rounded-2xl apple-glass-subtle border border-white/10 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white font-mono">{def.label}</span>
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: def.hex }} />
                      </div>
                      <div className="text-2xl font-bold font-mono text-white">
                        {count} <span className="text-xs text-slate-400 font-normal">({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${def.color}`}
                          style={{ width: `${Math.max(pct, count > 0 ? 5 : 0)}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">{def.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Industrial Production Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="apple-glass-card rounded-3xl p-6 border border-white/10 space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-white font-mono">
                  Optical Inference Latency
                </h4>
                <div className="space-y-3 font-mono text-xs">
                  <div className="flex justify-between py-1.5 border-b border-white/5">
                    <span className="text-slate-400">Pre-processing (Resize, Normalize)</span>
                    <span className="text-white">1.8 ms</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-white/5">
                    <span className="text-slate-400">YOLOv8s TensorRT / Torch Inference</span>
                    <span className="text-cyan-400 font-bold">11.4 ms</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-white/5">
                    <span className="text-slate-400">NMS & Bounding Box Extraction</span>
                    <span className="text-white">1.6 ms</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-400">Total Optical Latency</span>
                    <span className="text-emerald-400 font-bold">14.8 ms (67+ FPS Headroom)</span>
                  </div>
                </div>
              </div>

              <div className="apple-glass-card rounded-3xl p-6 border border-white/10 space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-white font-mono">
                  Mechanical Actuation Tolerances
                </h4>
                <div className="space-y-3 font-mono text-xs">
                  <div className="flex justify-between py-1.5 border-b border-white/5">
                    <span className="text-slate-400">UART Command Dispatch</span>
                    <span className="text-white">&lt; 0.1 ms (115200 baud)</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-white/5">
                    <span className="text-slate-400">Conveyor Transit Queue Window</span>
                    <span className="text-cyan-400 font-bold">{stats.conveyor_delay}s Dynamic Timer</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-white/5">
                    <span className="text-slate-400">Servo Sweep Travel Time (0° $\to$ 95°)</span>
                    <span className="text-white">85 ms</span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-slate-400">Chute Clearance Return</span>
                    <span className="text-emerald-400 font-bold">120 ms</span>
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* =====================================================================
            TAB 4: DEFECT SNAPSHOT ARCHIVE GALLERY
        ===================================================================== */}
        {activeTab === 'gallery' && (
          <div className="space-y-6">
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-white tracking-wide font-mono flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-cyan-400" />
                  Defect Snapshot Archive
                </h2>
                <p className="text-xs text-slate-400">Auto-captured high-resolution frames of diverted packaging units</p>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5 p-1 rounded-full apple-glass border border-white/10 text-xs font-mono">
                {['ALL', 'DENT', 'LABEL_MISSING', 'SEAL_BROKEN', 'WRONG_PRINT'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat)}
                    className={`px-3 py-1 rounded-full transition-all ${
                      filterCategory === cat
                        ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-400/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {cat.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid of defect snapshot glass cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {filteredLogs.filter(l => l.image_url).map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setSelectedSnapshot(item.image_url);
                    setSelectedLogRecord(item);
                  }}
                  className="apple-glass-card rounded-2xl overflow-hidden cursor-pointer group border border-white/10 hover:border-cyan-400/30 transition-all duration-300"
                >
                  <div className="aspect-square bg-black overflow-hidden relative">
                    <img
                      src={item.image_url}
                      alt={item.item_id}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                      <span className="text-[11px] font-mono text-cyan-300 flex items-center gap-1">
                        Click to Inspect <ArrowUpRight className="h-3 w-3" />
                      </span>
                    </div>
                    <span className="absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-red-500 text-white uppercase shadow-md border border-red-400/30">
                      {item.defect_type}
                    </span>
                  </div>

                  <div className="p-3.5 font-mono text-xs">
                    <div className="font-bold text-white flex justify-between items-center">
                      <span>{item.item_id}</span>
                      <span className="text-cyan-400 font-semibold">{(item.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-between">
                      <span>{item.timestamp}</span>
                      <span className="text-emerald-400">Diverted</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {filteredLogs.filter(l => l.image_url).length === 0 && (
              <div className="apple-glass-card rounded-3xl p-12 text-center text-slate-400 font-mono space-y-3">
                <ImageIcon className="h-12 w-12 mx-auto text-slate-600" />
                <div className="text-sm font-semibold text-white">No Defect Snapshots Match Filter</div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  When defective packaging items are flagged by YOLOv8 at Station 1, high-resolution snapshots are stored here for ISO 9001 compliance.
                </p>
              </div>
            )}

          </div>
        )}

        {/* =====================================================================
            TAB 5: macOS-STYLE REGULATORY AUDIT TRAIL LOG
        ===================================================================== */}
        {activeTab === 'audit' && (
          <div className="apple-glass-card rounded-3xl p-6 border border-white/10 space-y-6">
            
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-white tracking-wide font-mono flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-cyan-400" />
                  Regulatory Audit Trail & Traceability Records
                </h2>
                <p className="text-xs text-slate-400">
                  Persistent immutable CSV ledger stored in <code className="text-slate-300">logs/defect_log.csv</code>
                </p>
              </div>

              {/* Search, Filter & CSV Export Controls */}
              <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                <div className="relative flex-1 md:w-56">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search package ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <select
                  value={filterDecision}
                  onChange={(e) => setFilterDecision(e.target.value)}
                  className="px-3 py-1.5 rounded-full bg-[#0B0F19] border border-white/10 text-xs text-white focus:outline-none"
                >
                  <option value="ALL">All Decisions</option>
                  <option value="GOOD">Good Only</option>
                  <option value="DEFECTIVE">Defective Only</option>
                </select>

                <a
                  href="/logs/defect_log.csv"
                  download="defect_log.csv"
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-cyan-400 text-black font-semibold text-xs hover:bg-cyan-300 transition-all shadow-glow-cyan"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </a>
              </div>
            </div>

            {/* Audit Log Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="border-b border-white/10 text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="pb-3 px-3">Timestamp</th>
                    <th className="pb-3 px-3">Package ID</th>
                    <th className="pb-3 px-3">QA Disposition</th>
                    <th className="pb-3 px-3">Defect Category</th>
                    <th className="pb-3 px-3">Model Confidence</th>
                    <th className="pb-3 px-3 text-right">Photo Snapshot</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06] text-slate-300">
                  {filteredLogs.map((r, i) => (
                    <tr key={i} className="hover:bg-white/[0.03] transition-colors">
                      <td className="py-3 px-3 text-slate-400">{r.timestamp}</td>
                      <td className="py-3 px-3 font-bold text-white flex items-center gap-1.5">
                        {r.item_id}
                        <button
                          onClick={() => handleCopyId(r.item_id)}
                          title="Copy ID"
                          className="opacity-0 hover:opacity-100 text-slate-400 hover:text-white"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            r.decision === 'GOOD'
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-red-500/15 text-red-300 border border-red-500/30'
                          }`}
                        >
                          {r.decision}
                        </span>
                      </td>
                      <td className="py-3 px-3 uppercase text-slate-200 font-semibold">{r.defect_type}</td>
                      <td className="py-3 px-3 text-cyan-300">{(r.confidence * 100).toFixed(1)}%</td>
                      <td className="py-3 px-3 text-right">
                        {r.image_url ? (
                          <button
                            onClick={() => {
                              setSelectedSnapshot(r.image_url);
                              setSelectedLogRecord(r);
                            }}
                            className="px-3 py-1 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-400/30 hover:bg-cyan-500/30 text-[11px] transition-all inline-flex items-center gap-1"
                          >
                            <Eye className="h-3 w-3" /> View Photo
                          </button>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredLogs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        No inspection audit records match current filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          </div>
        )}

        {/* =====================================================================
            TAB 6: SKEUOMORPHIC ACTUATOR & LINE CONTROLS CONSOLE
        ===================================================================== */}
        {activeTab === 'control' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Precision Parameter Glass Sliders */}
            <div className="apple-glass-card rounded-3xl p-6 border border-white/10 space-y-6">
              
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white font-mono flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-cyan-400" />
                  Conveyor & Model Parameters
                </h3>
                <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-400/20">
                  REAL-TIME CALIBRATION
                </span>
              </div>

              {/* Slider 1: Defect Confidence Threshold */}
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-slate-300 font-medium">Defect Confidence Threshold</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-400/30">
                    {confSlider.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.20"
                  max="0.90"
                  step="0.05"
                  value={confSlider}
                  onChange={(e) => setConfSlider(parseFloat(e.target.value))}
                  className="w-full cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-500">
                  <span>0.20 (High Sensitivity)</span>
                  <span>0.45 (Standard)</span>
                  <span>0.90 (Strict)</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Controls minimum detection confidence required before flagging a container and arming the Station 2 diverter.
                </p>
              </div>

              {/* Slider 2: Conveyor Transit Delay */}
              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-slate-300 font-medium">Conveyor Transit Delay</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-400/30">
                    {delaySlider.toFixed(1)}s
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="5.0"
                  step="0.1"
                  value={delaySlider}
                  onChange={(e) => setDelaySlider(parseFloat(e.target.value))}
                  className="w-full cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-500">
                  <span>0.5s (Fast Belt)</span>
                  <span>2.8s (Calibrated)</span>
                  <span>5.0s (Slow Belt)</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Time elapsed between camera snapshot at Station 1 and package arrival in front of the servo rejector at Station 2.
                </p>
              </div>

              {/* Quick Calibration Presets */}
              <div className="pt-2">
                <div className="text-[10px] font-mono text-slate-400 uppercase mb-2">Preset Profiles:</div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => applyPreset(0.35, 2.8)}
                    className="p-2 rounded-xl apple-glass-subtle border border-white/10 text-[11px] font-mono text-slate-300 hover:text-white hover:border-cyan-400/30 text-center"
                  >
                    High Sensitivity
                  </button>
                  <button
                    onClick={() => applyPreset(0.45, 2.8)}
                    className="p-2 rounded-xl apple-glass-subtle border border-white/10 text-[11px] font-mono text-slate-300 hover:text-white hover:border-cyan-400/30 text-center"
                  >
                    Default Balanced
                  </button>
                  <button
                    onClick={() => applyPreset(0.60, 2.5)}
                    className="p-2 rounded-xl apple-glass-subtle border border-white/10 text-[11px] font-mono text-slate-300 hover:text-white hover:border-cyan-400/30 text-center"
                  >
                    High Throughput
                  </button>
                </div>
              </div>

              {/* Save Button */}
              <button
                onClick={handleSaveSettings}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 text-black font-bold text-xs hover:from-cyan-300 hover:to-blue-400 transition-all shadow-glow-cyan flex items-center justify-center gap-2"
              >
                <Check className="h-4 w-4" />
                Apply & Save Parameters to Pipeline
              </button>

              {settingsSavedAlert && (
                <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-mono text-center animate-in fade-in">
                  ✓ Pipeline parameters synced with backend server!
                </div>
              )}

            </div>

            {/* Skeuomorphic Actuator & Hardware Controller */}
            <div className="apple-glass-card rounded-3xl p-6 border border-white/10 flex flex-col justify-between space-y-6">
              
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white font-mono flex items-center gap-2">
                  <Zap className="h-4 w-4 text-red-400" />
                  Skeuomorphic Actuator Console
                </h3>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-400/20">
                  ARMED & READY
                </span>
              </div>

              {/* Large Skeuomorphic Circular Pusher Button */}
              <div className="flex flex-col items-center justify-center py-6">
                
                {/* Machined Metal Bezel Outer Ring */}
                <div className="p-4 rounded-full brushed-metal border-2 border-white/10 shadow-2xl relative">
                  
                  {/* Glowing LED Halo */}
                  <div className={`absolute inset-0 rounded-full transition-all duration-300 ${
                    isPusherTriggering ? 'bg-red-500/30 blur-xl scale-110' : 'bg-red-500/10 blur-md'
                  }`} />

                  {/* Tactile Pusher Button */}
                  <button
                    onClick={handleTestPusher}
                    disabled={isPusherTriggering}
                    className={`tactile-pusher-btn relative h-36 w-36 rounded-full flex flex-col items-center justify-center gap-2 select-none ${
                      isPusherTriggering ? 'scale-95 ring-4 ring-red-400' : ''
                    }`}
                  >
                    <Zap className={`h-8 w-8 text-red-400 ${isPusherTriggering ? 'text-white animate-bounce' : ''}`} />
                    <span className="text-xs font-extrabold tracking-wider text-white font-mono uppercase text-center px-2">
                      {isPusherTriggering ? 'PUSHER FIRED' : 'TEST PUSHER OVERRIDE'}
                    </span>
                    <span className="text-[9px] text-red-300 font-mono">
                      {isPusherTriggering ? 'SWEEP 95°' : 'PRESS TO ACTUATE'}
                    </span>
                  </button>

                </div>

                <div className="text-center mt-4 space-y-1">
                  <div className="text-xs font-bold text-white font-mono">SG90 / MG995 Diverter</div>
                  <div className="text-[11px] text-slate-400">
                    Triggers 95° deflection sweep to divert defective packaging into reject bin
                  </div>
                </div>

              </div>

              {/* Hardware Diagnostic Table */}
              <div className="p-4 rounded-2xl apple-glass-subtle border border-white/10 space-y-2.5 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Controller Architecture:</span>
                  <span className="text-white">Arduino Uno / Nano (ATmega328P)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Baudrate / Protocol:</span>
                  <span className="text-cyan-400 font-semibold">115200 Baud • COM3 Serial</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">PWM Servo Pin:</span>
                  <span className="text-white">Digital Pin D9 (50Hz PWM)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Virtual Twin Fallback:</span>
                  <span className="text-emerald-400 font-semibold">Active & Synced</span>
                </div>
              </div>

              {/* Reset Production Session Button */}
              <button
                onClick={handleReset}
                className="w-full py-2.5 rounded-2xl apple-glass-subtle border border-white/10 text-slate-300 hover:text-white hover:border-red-400/40 text-xs font-mono flex items-center justify-center gap-2 transition-all"
              >
                <RotateCcw className="h-3.5 w-3.5 text-red-400" />
                Reset Inspection Counters to 0
              </button>

            </div>

          </div>
        )}

      </main>

      {/* =========================================================================
          FULLSCREEN INSPECTION SNAPSHOT MODAL (CLICK-TO-ZOOM)
      ========================================================================= */}
      {selectedSnapshot && (
        <div
          onClick={() => {
            setSelectedSnapshot(null);
            setSelectedLogRecord(null);
          }}
          className="fixed inset-0 bg-black/85 backdrop-blur-2xl z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="apple-glass max-w-3xl w-full rounded-3xl overflow-hidden border border-white/20 p-5 shadow-2xl space-y-4"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-sm font-bold font-mono text-white">
                  Inspection Snapshot Telemetry
                </span>
                {selectedLogRecord && (
                  <span className="text-xs font-mono text-cyan-300 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-400/20">
                    {selectedLogRecord.item_id}
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  setSelectedSnapshot(null);
                  setSelectedLogRecord(null);
                }}
                className="text-slate-400 hover:text-white text-xs px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 font-mono transition-all"
              >
                ✕ Esc
              </button>
            </div>

            {/* High-Resolution Frame */}
            <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black border border-white/10 flex items-center justify-center relative">
              <img
                src={selectedSnapshot}
                alt="Defect Snapshot"
                className="w-full h-full object-contain"
              />
            </div>

            {/* Snapshot Metadata Inspector */}
            {selectedLogRecord ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                  <div className="text-[10px] text-slate-400 uppercase">Defect Type</div>
                  <div className="text-red-400 font-bold uppercase mt-1">{selectedLogRecord.defect_type}</div>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                  <div className="text-[10px] text-slate-400 uppercase">Confidence</div>
                  <div className="text-cyan-400 font-bold mt-1">{(selectedLogRecord.confidence * 100).toFixed(1)}%</div>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                  <div className="text-[10px] text-slate-400 uppercase">Audit Time</div>
                  <div className="text-white font-semibold mt-1">{selectedLogRecord.timestamp}</div>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                  <div className="text-[10px] text-slate-400 uppercase">Action</div>
                  <div className="text-emerald-400 font-semibold mt-1">Pusher Diverted</div>
                </div>
              </div>
            ) : null}

            {/* Footer Buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <span className="text-[11px] font-mono text-slate-400">
                Traceability verification logged in defect_log.csv
              </span>
              <a
                href={selectedSnapshot}
                download
                target="_blank"
                rel="noreferrer"
                className="px-4 py-1.5 rounded-full bg-cyan-400 text-black font-semibold text-xs hover:bg-cyan-300 transition-all flex items-center gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                Download High-Res Frame
              </a>
            </div>

          </div>
        </div>
      )}

      {/* =========================================================================
          FOOTER STATUS STRIP
      ========================================================================= */}
      <footer className="w-full border-t border-white/[0.06] py-3 px-6 backdrop-blur-md bg-[#020408]/80 text-[11px] font-mono text-slate-400 flex flex-wrap items-center justify-between gap-4 z-20">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            SORTEX Industrial AI OS
          </span>
          <span className="hidden sm:inline text-slate-600">|</span>
          <span className="hidden sm:inline">CUDA 12.1 Accelerated Inference</span>
          <span className="hidden sm:inline text-slate-600">|</span>
          <span className="hidden sm:inline">Arduino PWM Diverter Link</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Throughput: {stats.fps} FPS</span>
          <span className="text-cyan-400">Yield: {yieldPercentage}%</span>
        </div>
      </footer>

    </div>
  );
}
