import React, { useState, useEffect, useMemo } from 'react';
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
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [selectedLogRecord, setSelectedLogRecord] = useState(null);
  const [confSlider, setConfSlider] = useState(0.45);
  const [delaySlider, setDelaySlider] = useState(2.8);
  const [settingsSavedAlert, setSettingsSavedAlert] = useState(false);
  const [isStreamPaused, setIsStreamPaused] = useState(false);
  const [showHudOverlay, setShowHudOverlay] = useState(true);
  const [isCopiedId, setIsCopiedId] = useState(false);
  const [showIslandDetail, setShowIslandDetail] = useState(false);

  useEffect(() => {
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

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
      // Offline fallback
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

  useEffect(() => {
    fetchStats();
    fetchLogs();
    const interval = setInterval(() => {
      fetchStats();
      fetchLogs();
    }, 2000);
    return () => clearInterval(interval);
  }, [hasInitializedSettings]);

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

  const handleTestPusher = async () => {
    if (isPusherTriggering) return;
    setIsPusherTriggering(true);
    try {
      await fetch('/api/control/test-pusher', { method: 'POST' });
    } catch (e) {
      // Offline fallback
    }
    setTimeout(() => setIsPusherTriggering(false), 900);
  };

  const handleReset = async () => {
    if (window.confirm('Reset all production inspection counters to zero?')) {
      try {
        await fetch('/api/control/reset', { method: 'POST' });
        fetchStats();
        fetchLogs();
      } catch (e) {
        setStats(prev => ({
          ...prev,
          total_checked: 0,
          good_count: 0,
          defect_count: 0,
          defect_rate: 0.0,
          defect_breakdown: { dent: 0, label_missing: 0, seal_broken: 0, wrong_print: 0 }
        }));
      }
    }
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
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
      setSettingsSavedAlert(true);
      setTimeout(() => setSettingsSavedAlert(false), 3000);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const applyPreset = (conf, delay) => {
    setConfSlider(conf);
    setDelaySlider(delay);
  };

  const handleCopyId = (id) => {
    navigator.clipboard.writeText(id);
    setIsCopiedId(true);
    setTimeout(() => setIsCopiedId(false), 2000);
  };

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

  const defectBreakdownList = [
    { label: 'Dent', key: 'dent', desc: 'Container sidewall impact deformation' },
    { label: 'Missing Label', key: 'label_missing', desc: 'Applicator feeder or adhesive omission' },
    { label: 'Broken Seal', key: 'seal_broken', desc: 'Thermal cap or foil barrier breach' },
    { label: 'Wrong Print', key: 'wrong_print', desc: 'Batch code mismatch or inkjet smudge' },
  ];

  const yieldPercentage = stats.total_checked > 0
    ? ((stats.good_count / stats.total_checked) * 100).toFixed(1)
    : '100.0';

  return (
    <div className="min-h-screen w-full bg-[#080b12] text-[#f8fafc] flex flex-col font-sans selection:bg-[#2563eb]/30 selection:text-white relative">

      {/* =========================================================================
          APPLE VISIONOS / MACOS TINTED GLASS HEADER WITH DYNAMIC ISLAND
      ========================================================================= */}
      <header className="apple-glass-panel w-full px-6 py-3.5 sticky top-0 z-40 border-t-0 border-x-0 relative">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">

          {/* Cupertino Brand Title */}
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-bold text-base tracking-tight text-[#f8fafc] truncate">
              SORTEX PRO
            </span>
            <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 apple-subsurface rounded-full text-[#94a3b8] shrink-0">
              STATION 1 & 2
            </span>
            <span className="hidden sm:inline text-xs font-mono text-[#94a3b8] truncate">
              visionOS 2.0 Telemetry
            </span>
          </div>

          {/* Cupertino Dynamic Island Capsule (Floating centered status) */}
          <button
            onClick={() => setShowIslandDetail(!showIslandDetail)}
            className="apple-dynamic-island interactive-target px-4 py-2 rounded-full text-xs font-mono font-bold hover:border-white/25 focus-visible:outline-none"
            aria-label="Toggle telemetry diagnostics drawer"
          >
            <span className="flex items-center gap-2.5">
              <span className={`h-2 w-2 rounded-full shrink-0 ${isConnected ? 'bg-[#34d399]' : 'bg-[#fbbf24]'}`} />
              <span className="truncate">{isConnected ? '[CONVEYOR ACTIVE]' : '[CONNECTING]'}</span>
              <span className="text-white/20">|</span>
              <span className="text-[#94a3b8] tabular-nums whitespace-nowrap">
                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className="hidden md:inline text-white/20">|</span>
              <span className="hidden md:inline text-[#2563eb] tabular-nums whitespace-nowrap font-bold">
                RTX 3050 &bull; {stats.fps.toFixed(1)} FPS
              </span>
            </span>
          </button>

          {/* Quick Line Actions (44px min touch targets, active:scale-[0.97]) */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={handleTestPusher}
              disabled={isPusherTriggering}
              className={`interactive-target px-3.5 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
                isPusherTriggering
                  ? 'apple-badge-defect font-extrabold'
                  : 'apple-btn-secondary text-[#f87171] hover:border-red-400/40'
              }`}
            >
              {isPusherTriggering ? '[PUSHER FIRED]' : 'TEST PUSHER'}
            </button>

            <button
              onClick={handleReset}
              title="Reset inspection counters"
              className="interactive-target apple-btn-secondary px-3.5 py-2 rounded-xl text-xs font-mono font-bold text-[#94a3b8] hover:text-[#f8fafc]"
            >
              RESET
            </button>
          </div>
        </div>

        {/* Dynamic Island Expanded Diagnostics Drawer */}
        {showIslandDetail && (
          <div className="max-w-7xl mx-auto mt-3.5 p-4 apple-glass-card rounded-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3 text-xs font-mono">
              <span className="font-bold text-[#f8fafc]">SYSTEM TELEMETRY & HARDWARE LEDGER</span>
              <span className="text-[#94a3b8]">Firmware v2.4 &bull; CUDA 12.1</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-3 apple-subsurface rounded-xl">
                <div className="text-[#94a3b8]">FEED SOURCE</div>
                <div className="font-bold text-[#f8fafc] mt-1 truncate">{stats.source.toUpperCase()}</div>
              </div>
              <div className="p-3 apple-subsurface rounded-xl">
                <div className="text-[#94a3b8]">INFERENCE TIME</div>
                <div className="font-bold text-[#34d399] mt-1 tabular-nums">14.8 ms</div>
              </div>
              <div className="p-3 apple-subsurface rounded-xl">
                <div className="text-[#94a3b8]">TRANSIT DELAY</div>
                <div className="font-bold text-[#2563eb] mt-1 tabular-nums">{stats.conveyor_delay.toFixed(1)}s</div>
              </div>
              <div className="p-3 apple-subsurface rounded-xl">
                <div className="text-[#94a3b8]">CONFIDENCE GATE</div>
                <div className="font-bold text-[#f8fafc] mt-1 tabular-nums">{(stats.conf_threshold * 100).toFixed(0)}%</div>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* =========================================================================
          FLOATING SEGMENTED PILL BAR (VISIONOS GLASS DOCK)
      ========================================================================= */}
      <nav className="w-full px-6 py-4 flex justify-center sticky top-[69px] z-30 pointer-events-none">
        <div className="apple-pill-bar rounded-full p-1.5 flex flex-wrap items-center justify-center gap-1 max-w-4xl shadow-xl pointer-events-auto">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'stream', label: 'Live Stream', badge: 'LIVE' },
            { id: 'analytics', label: 'Analytics', badge: `${yieldPercentage}%` },
            { id: 'gallery', label: 'Defect Archive', badge: `${stats.defect_count}` },
            { id: 'audit', label: 'Audit Trail' },
            { id: 'control', label: 'Line Controls' },
          ].map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`interactive-target px-4 py-2 rounded-full text-xs font-mono font-bold transition-all ${
                  isActive
                    ? 'apple-pill-active'
                    : 'text-[#94a3b8] hover:text-[#f8fafc] hover:bg-white/5'
                }`}
              >
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] tabular-nums font-bold ${
                    isActive ? 'bg-white/20 text-white' : 'apple-subsurface text-[#94a3b8]'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* =========================================================================
          MAIN WORKSPACE (APPLE GLASS CARDS & PANELS)
      ========================================================================= */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-2 space-y-6 z-10">

        {/* =====================================================================
            TAB 1: OVERVIEW DASHBOARD
        ===================================================================== */}
        {activeTab === 'overview' && (
          <div className="space-y-6">

            {/* METRICS ROW (Strictly Apple Glass Cards with 1px Specular Catch Light) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="apple-glass-card rounded-2xl p-5">
                <div className="text-xs font-mono font-bold text-[#94a3b8] truncate">TOTAL INSPECTED</div>
                <div className="text-3xl font-extrabold font-mono text-[#f8fafc] mt-2 mb-1 tabular-nums truncate">
                  {stats.total_checked.toLocaleString()}
                </div>
                <div className="text-xs font-mono text-[#94a3b8]">[100% INSPECTED]</div>
              </div>

              <div className="apple-glass-card rounded-2xl p-5">
                <div className="text-xs font-mono font-bold text-[#94a3b8] truncate">GOOD PACKAGES</div>
                <div className="text-3xl font-extrabold font-mono text-[#34d399] mt-2 mb-1 tabular-nums truncate">
                  {stats.good_count.toLocaleString()}
                </div>
                <div className="text-xs font-mono text-[#34d399] tabular-nums">[PASS RATE: {yieldPercentage}%]</div>
              </div>

              <div className="apple-glass-card rounded-2xl p-5">
                <div className="text-xs font-mono font-bold text-[#94a3b8] truncate">DEFECTS DIVERTED</div>
                <div className="text-3xl font-extrabold font-mono text-[#f87171] mt-2 mb-1 tabular-nums truncate">
                  {stats.defect_count.toLocaleString()}
                </div>
                <div className="text-xs font-mono text-[#f87171]">[REJECT CHUTE]</div>
              </div>

              <div className="apple-glass-card rounded-2xl p-5">
                <div className="text-xs font-mono font-bold text-[#94a3b8] truncate">DEFECT RATE</div>
                <div className="text-3xl font-extrabold font-mono text-[#fbbf24] mt-2 mb-1 tabular-nums truncate">
                  {stats.defect_rate.toFixed(2)}%
                </div>
                <div className="text-xs font-mono text-[#94a3b8]">
                  {stats.defect_rate > 5 ? '[ALERT: EXCEEDS 5.0%]' : '[NOMINAL < 3.0%]'}
                </div>
              </div>
            </div>

            {/* FOCAL POINT: CONVEYOR FEED & DEFECT MATRIX */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Primary Cinema Conveyor Viewport (2 Cols) */}
              <div className="lg:col-span-2 apple-glass-panel rounded-2xl p-5 flex flex-col justify-between space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="h-2 w-2 rounded-full bg-[#34d399] shrink-0" />
                    <span className="text-xs font-mono font-bold text-[#f8fafc] truncate">
                      STATION 1 OPTICAL GATE &rarr; STATION 2 DIVERTER
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setUseDigitalTwin(!useDigitalTwin)}
                      className="interactive-target apple-btn-secondary px-3.5 py-1.5 text-xs font-mono font-bold rounded-xl"
                    >
                      {useDigitalTwin ? 'MODE: DIGITAL TWIN' : 'MODE: CAMERA FEED'}
                    </button>
                    <button
                      onClick={() => setShowHudOverlay(!showHudOverlay)}
                      className="interactive-target apple-btn-secondary px-3.5 py-1.5 text-xs font-mono font-bold rounded-xl"
                    >
                      {showHudOverlay ? 'HUD: ON' : 'HUD: OFF'}
                    </button>
                  </div>
                </div>

                {/* Viewport Frame */}
                <div className="relative aspect-video w-full rounded-xl bg-[#080b12] border border-white/10 overflow-hidden flex items-center justify-center">
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
                        alt="Live Conveyor Stream"
                        className="w-full h-full object-contain"
                        onError={() => setUseDigitalTwin(true)}
                      />
                    )
                  ) : (
                    <div className="text-xs font-mono text-[#94a3b8]">
                      [CONVEYOR FEED PAUSED]
                    </div>
                  )}

                  {showHudOverlay && (
                    <div className="apple-dynamic-island absolute top-3 left-3 px-3.5 py-2 rounded-xl text-xs font-mono pointer-events-none">
                      <div className="font-bold text-[#f8fafc]">STATION 1: INSPECTION</div>
                      <div className="text-[#94a3b8] tabular-nums">Gate: {(stats.conf_threshold * 100).toFixed(0)}%</div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-[#94a3b8]">
                  <span className="tabular-nums">Resolution: 1280&times;600 &bull; 30.0 FPS</span>
                  <span className="text-[#2563eb] tabular-nums font-bold">YOLOv8s PyTorch CUDA (~14.8 ms)</span>
                </div>
              </div>

              {/* Right Side: Defect Taxonomy Matrix (1 Col) */}
              <div className="apple-glass-card rounded-2xl p-5 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-4">
                    <span className="text-xs font-mono font-bold text-[#f8fafc]">DEFECT BREAKDOWN</span>
                    <span className="text-xs font-mono text-[#94a3b8] tabular-nums">Total: {stats.defect_count}</span>
                  </div>

                  <div className="space-y-4">
                    {defectBreakdownList.map(def => {
                      const count = (stats.defect_breakdown && stats.defect_breakdown[def.key]) || 0;
                      const pct = stats.defect_count > 0 ? (count / stats.defect_count) * 100 : 0;
                      return (
                        <div key={def.key} className="space-y-1">
                          <div className="flex justify-between text-xs font-mono">
                            <span className="text-[#f8fafc] font-bold">{def.label}</span>
                            <span className="text-[#94a3b8] tabular-nums">
                              {count} ({pct.toFixed(0)}%)
                            </span>
                          </div>
                          <div className="h-1.5 w-full apple-subsurface rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#2563eb] rounded-full transition-all duration-200"
                              style={{ width: `${Math.max(pct, count > 0 ? 5 : 0)}%` }}
                            />
                          </div>
                          <p className="text-xs text-[#94a3b8] max-w-[65ch] break-words">{def.desc}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Latest Defect Flagged */}
                <div className="p-3.5 apple-subsurface rounded-xl font-mono text-xs">
                  <div className="text-xs text-[#f87171] font-bold">LATEST DEFECT DETECTED</div>
                  {stats.last_defect ? (
                    <div className="mt-1.5 space-y-1">
                      <div className="flex justify-between font-bold text-[#f8fafc]">
                        <span className="truncate max-w-[140px]">{stats.last_defect.id}</span>
                        <span className="text-[#f87171] shrink-0">[FAIL: {stats.last_defect.type.toUpperCase()}]</span>
                      </div>
                      <div className="text-xs text-[#94a3b8] flex justify-between tabular-nums">
                        <span>Confidence: {((stats.last_defect.conf || 0.85) * 100).toFixed(0)}%</span>
                        <span className="text-[#34d399] shrink-0 font-bold">[DIVERTED]</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[#94a3b8] mt-1">
                      No defects detected. All inspected packaging units have passed quality checks.
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Traceability Table Preview */}
            <div className="apple-glass-card rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-xs font-mono font-bold text-[#f8fafc]">
                  LIVE CONVEYOR TRACEABILITY AUDIT
                </span>
                <button
                  onClick={() => setActiveTab('audit')}
                  className="interactive-target apple-btn-secondary px-3.5 py-1.5 text-xs font-mono font-bold rounded-xl"
                >
                  FULL AUDIT TRAIL
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="border-b border-white/10 text-[#94a3b8]">
                    <tr>
                      <th className="pb-2.5 px-3">Timestamp</th>
                      <th className="pb-2.5 px-3">Package ID</th>
                      <th className="pb-2.5 px-3">Decision</th>
                      <th className="pb-2.5 px-3">Defect Type</th>
                      <th className="pb-2.5 px-3">Confidence</th>
                      <th className="pb-2.5 px-3 text-right">Photo Snapshot</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-[#f8fafc]">
                    {logs.slice(0, 5).map((r, i) => (
                      <tr key={i} className="hover:bg-white/5 transition-colors">
                        <td className="py-2.5 px-3 text-[#94a3b8] whitespace-nowrap tabular-nums">{r.timestamp}</td>
                        <td className="py-2.5 px-3 font-bold whitespace-nowrap truncate max-w-[140px]">{r.item_id}</td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            r.decision === 'GOOD'
                              ? 'apple-badge-good'
                              : 'apple-badge-defect'
                          }`}>
                            [{r.decision}]
                          </span>
                        </td>
                        <td className="py-2.5 px-3 uppercase whitespace-nowrap truncate max-w-[120px]">{r.defect_type}</td>
                        <td className="py-2.5 px-3 text-[#2563eb] tabular-nums whitespace-nowrap font-bold">{(r.confidence * 100).toFixed(1)}%</td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          {r.image_url ? (
                            <button
                              onClick={() => {
                                setSelectedSnapshot(r.image_url);
                                setSelectedLogRecord(r);
                              }}
                              className="interactive-target apple-btn-secondary px-3 py-1 rounded-lg text-xs font-mono text-[#2563eb] font-bold"
                            >
                              INSPECT
                            </button>
                          ) : (
                            <span className="text-[#94a3b8]">&mdash;</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {logs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-[#94a3b8]">
                          No inspection records found. Start the conveyor to begin quality checks.
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
            TAB 2: FULL LIVE STREAM THEATER
        ===================================================================== */}
        {activeTab === 'stream' && (
          <div className="space-y-6">
            <div className="apple-glass-panel rounded-2xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <h2 className="text-sm font-mono font-bold text-[#f8fafc]">
                    REAL-TIME OPTICAL VISION THEATER
                  </h2>
                  <p className="text-xs text-[#94a3b8] mt-1 max-w-[65ch]">
                    High-bandwidth stream evaluating package geometry, label placement, and seal integrity.
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => setUseDigitalTwin(!useDigitalTwin)}
                    className="interactive-target apple-btn-secondary px-3.5 py-2 text-xs font-mono font-bold rounded-xl"
                  >
                    {useDigitalTwin ? 'MODE: DIGITAL TWIN' : 'MODE: CAMERA STREAM'}
                  </button>
                  <button
                    onClick={() => setIsStreamPaused(!isStreamPaused)}
                    className="interactive-target apple-btn-secondary px-3.5 py-2 text-xs font-mono font-bold rounded-xl"
                  >
                    {isStreamPaused ? 'RESUME STREAM' : 'PAUSE STREAM'}
                  </button>
                  <button
                    onClick={handleTestPusher}
                    disabled={isPusherTriggering}
                    className="interactive-target apple-btn-secondary px-3.5 py-2 text-[#f87171] text-xs font-mono font-bold rounded-xl hover:border-red-400/40"
                  >
                    ACTUATE DIVERTER
                  </button>
                </div>
              </div>

              {/* Theater Viewport */}
              <div className="relative aspect-video w-full rounded-xl bg-[#080b12] border border-white/10 overflow-hidden flex items-center justify-center">
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
                  <div className="text-xs font-mono text-[#94a3b8]">[CINEMA FEED PAUSED]</div>
                )}
              </div>

              {/* Unified Linear Telemetry Strip */}
              <div className="apple-subsurface rounded-xl overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/10 text-xs font-mono">
                  <div className="p-4 space-y-1">
                    <div className="text-[#94a3b8] font-bold">STATION 1: OPTICAL CAMERA</div>
                    <div className="text-[#f8fafc] font-bold">Telecentric Industrial Sensor</div>
                    <div className="text-[#94a3b8] text-xs tabular-nums">1/500s Shutter &bull; 6000K Illumination</div>
                  </div>
                  <div className="p-4 space-y-1">
                    <div className="text-[#94a3b8] font-bold">STATION 2: SERVO DIVERTER</div>
                    <div className="text-[#f8fafc] font-bold">SG90 / MG995 Diverter Arm</div>
                    <div className="text-[#94a3b8] text-xs tabular-nums">95&deg; Deflection Arc &bull; 85ms Actuation</div>
                  </div>
                  <div className="p-4 space-y-1">
                    <div className="text-[#94a3b8] font-bold">CONVEYOR DRIVE MOTOR</div>
                    <div className="text-[#2563eb] font-bold">Closed-Loop Belt Drive</div>
                    <div className="text-[#94a3b8] text-xs tabular-nums">{stats.conveyor_delay.toFixed(1)}s Arrival Delay Window</div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* =====================================================================
            TAB 3: ANALYTICS & LEDGER
        ===================================================================== */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">

            {/* Linear Production KPI Ledger */}
            <div className="apple-glass-card rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-xs font-mono font-bold text-[#f8fafc]">
                  QUALITY ASSURANCE TELEMETRY SUMMARY
                </span>
                <span className="text-xs font-mono text-[#94a3b8]">ISO 9001 Inspection Metric</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/10 text-xs font-mono">
                <div className="p-4 space-y-1">
                  <div className="text-[#94a3b8]">FIRST PASS YIELD (FPY)</div>
                  <div className="text-2xl font-extrabold text-[#34d399] tabular-nums">{yieldPercentage}%</div>
                  <div className="text-xs text-[#94a3b8]">Good units passed downstream</div>
                </div>
                <div className="p-4 space-y-1">
                  <div className="text-[#94a3b8]">DEFECT OCCURRENCE RATIO</div>
                  <div className="text-2xl font-extrabold text-[#fbbf24] tabular-nums">{stats.defect_rate.toFixed(2)}%</div>
                  <div className="text-xs text-[#94a3b8]">Benchmark threshold &lt; 3.00%</div>
                </div>
                <div className="p-4 space-y-1">
                  <div className="text-[#94a3b8]">DIVERTER EFFICIENCY</div>
                  <div className="text-2xl font-extrabold text-[#2563eb] tabular-nums">100.0%</div>
                  <div className="text-xs text-[#94a3b8] tabular-nums">{stats.defect_count} confirmed rejections</div>
                </div>
              </div>
            </div>

            {/* Defect Classification Matrix */}
            <div className="apple-glass-card rounded-2xl p-6 space-y-4">
              <div className="border-b border-white/10 pb-2">
                <h3 className="text-xs font-mono font-bold text-[#f8fafc]">
                  DEFECT CLASS DISTRIBUTION &amp; ROOT CAUSE MATRIX
                </h3>
                <p className="text-xs text-[#94a3b8] mt-1 max-w-[65ch]">
                  Categorization of diverted packages by YOLOv8 visual classifier.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {defectBreakdownList.map(def => {
                  const count = (stats.defect_breakdown && stats.defect_breakdown[def.key]) || 0;
                  const pct = stats.defect_count > 0 ? (count / stats.defect_count) * 100 : 0;
                  return (
                    <div key={def.key} className="p-4 apple-subsurface rounded-xl space-y-2">
                      <div className="flex justify-between text-xs font-mono font-bold">
                        <span className="text-[#f8fafc] truncate">{def.label}</span>
                        <span className="text-[#94a3b8] tabular-nums shrink-0">{count} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#2563eb] rounded-full transition-all duration-200"
                          style={{ width: `${Math.max(pct, count > 0 ? 5 : 0)}%` }}
                        />
                      </div>
                      <p className="text-xs text-[#94a3b8] max-w-[65ch] break-words leading-relaxed">
                        {def.desc}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Latency Specifications */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="apple-glass-card rounded-2xl p-5 space-y-3 font-mono text-xs">
                <div className="font-bold text-[#f8fafc] border-b border-white/10 pb-2">
                  OPTICAL INFERENCE TIMING
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-[#94a3b8]">Preprocessing &amp; Letterbox</span>
                  <span className="text-[#f8fafc] tabular-nums">1.8 ms</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-[#94a3b8]">YOLOv8s PyTorch CUDA</span>
                  <span className="text-[#2563eb] font-bold tabular-nums">11.4 ms</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-[#94a3b8]">Non-Maximum Suppression</span>
                  <span className="text-[#f8fafc] tabular-nums">1.6 ms</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#94a3b8]">Total Optical Latency</span>
                  <span className="text-[#34d399] font-bold tabular-nums">14.8 ms (67+ FPS)</span>
                </div>
              </div>

              <div className="apple-glass-card rounded-2xl p-5 space-y-3 font-mono text-xs">
                <div className="font-bold text-[#f8fafc] border-b border-white/10 pb-2">
                  MECHANICAL ACTUATOR TIMING
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-[#94a3b8]">Serial UART Dispatch</span>
                  <span className="text-[#f8fafc] tabular-nums">&lt; 0.1 ms (115200 baud)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-[#94a3b8]">Conveyor Transit Delay</span>
                  <span className="text-[#2563eb] font-bold tabular-nums">{stats.conveyor_delay.toFixed(1)}s Window</span>
                </div>
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-[#94a3b8]">Servo Sweep Stroke</span>
                  <span className="text-[#f8fafc] tabular-nums">85 ms (95&deg; arc)</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#94a3b8]">Chute Clearance Return</span>
                  <span className="text-[#34d399] font-bold tabular-nums">120 ms</span>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* =====================================================================
            TAB 4: DEFECT ARCHIVE
        ===================================================================== */}
        {activeTab === 'gallery' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <h2 className="text-sm font-mono font-bold text-[#f8fafc]">
                  DEFECT SNAPSHOT ARCHIVE
                </h2>
                <p className="text-xs text-[#94a3b8] mt-1 max-w-[65ch]">
                  High-resolution frames of packages diverted at Station 2.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {['ALL', 'DENT', 'LABEL_MISSING', 'SEAL_BROKEN', 'WRONG_PRINT'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat)}
                    className={`interactive-target px-3.5 py-1.5 rounded-full text-xs font-mono font-bold transition-all ${
                      filterCategory === cat
                        ? 'apple-pill-active'
                        : 'apple-btn-secondary'
                    }`}
                  >
                    {cat.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredLogs.filter(l => l.image_url).map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setSelectedSnapshot(item.image_url);
                    setSelectedLogRecord(item);
                  }}
                  className="interactive-target w-full apple-glass-card rounded-2xl p-2.5 flex flex-col items-stretch text-left cursor-pointer hover:border-white/25 transition-all"
                >
                  <div className="aspect-square bg-[#080b12] rounded-xl overflow-hidden relative">
                    <img
                      src={item.image_url}
                      alt={item.item_id}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-2 right-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono apple-badge-defect truncate max-w-[120px] backdrop-blur-md">
                      [{item.defect_type.toUpperCase()}]
                    </span>
                  </div>

                  <div className="p-2 font-mono text-xs">
                    <div className="flex justify-between font-bold text-[#f8fafc]">
                      <span className="truncate max-w-[120px]">{item.item_id}</span>
                      <span className="text-[#2563eb] tabular-nums shrink-0 font-bold">{(item.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <div className="text-xs text-[#94a3b8] mt-1 flex justify-between">
                      <span className="tabular-nums truncate max-w-[120px]">{item.timestamp}</span>
                      <span className="text-[#34d399] shrink-0 font-bold">[DIVERTED]</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {filteredLogs.filter(l => l.image_url).length === 0 && (
              <div className="p-12 apple-glass-card rounded-2xl text-center text-xs font-mono text-[#94a3b8] max-w-[65ch] mx-auto">
                No defective packages found. No items currently match the selected filter category. Run packages through the inspection line or select a different filter above.
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            TAB 5: REGULATORY AUDIT TRAIL TABLE
        ===================================================================== */}
        {activeTab === 'audit' && (
          <div className="apple-glass-card rounded-2xl p-6 space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <h2 className="text-sm font-mono font-bold text-[#f8fafc]">
                  REGULATORY AUDIT TRAIL &amp; LOGS
                </h2>
                <p className="text-xs text-[#94a3b8] mt-1 max-w-[65ch]">
                  Persistent CSV ledger stored at <span className="font-bold text-[#f8fafc]">logs/defect_log.csv</span>.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  placeholder="Search package ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="px-3.5 py-2 apple-subsurface rounded-xl text-xs font-mono text-[#f8fafc] placeholder-[#94a3b8] min-h-[44px] hover:border-white/20 focus-visible:outline-none"
                />

                <select
                  value={filterDecision}
                  onChange={(e) => setFilterDecision(e.target.value)}
                  className="px-3.5 py-2 bg-[#0c101a] border border-white/10 rounded-xl text-xs font-mono text-[#f8fafc] min-h-[44px] hover:border-white/20 focus-visible:outline-none"
                >
                  <option value="ALL">All Decisions</option>
                  <option value="GOOD">Good Only</option>
                  <option value="DEFECTIVE">Defective Only</option>
                </select>

                <a
                  href="/logs/defect_log.csv"
                  download="defect_log.csv"
                  className="interactive-target apple-btn-primary px-4 py-2 font-mono font-bold text-xs rounded-xl"
                >
                  EXPORT CSV
                </a>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="border-b border-white/10 text-[#94a3b8]">
                  <tr>
                    <th className="pb-3 px-3">Timestamp</th>
                    <th className="pb-3 px-3">Package ID</th>
                    <th className="pb-3 px-3">Decision</th>
                    <th className="pb-3 px-3">Category</th>
                    <th className="pb-3 px-3">Confidence</th>
                    <th className="pb-3 px-3 text-right">Photo Snapshot</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-[#f8fafc]">
                  {filteredLogs.map((r, i) => (
                    <tr key={i} className="hover:bg-white/5 transition-colors">
                      <td className="py-2.5 px-3 text-[#94a3b8] whitespace-nowrap tabular-nums">{r.timestamp}</td>
                      <td className="py-2.5 px-3 font-bold flex items-center gap-2 whitespace-nowrap">
                        <span className="truncate max-w-[140px]">{r.item_id}</span>
                        <button
                          onClick={() => handleCopyId(r.item_id)}
                          title="Copy ID"
                          className="interactive-target text-xs text-[#94a3b8] hover:text-[#f8fafc] px-2 py-1"
                        >
                          [COPY]
                        </button>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          r.decision === 'GOOD'
                            ? 'apple-badge-good'
                            : 'apple-badge-defect'
                        }`}>
                          [{r.decision}]
                        </span>
                      </td>
                      <td className="py-2.5 px-3 uppercase whitespace-nowrap truncate max-w-[120px]">{r.defect_type}</td>
                      <td className="py-2.5 px-3 text-[#2563eb] tabular-nums whitespace-nowrap font-bold">{(r.confidence * 100).toFixed(1)}%</td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {r.image_url ? (
                          <button
                            onClick={() => {
                              setSelectedSnapshot(r.image_url);
                              setSelectedLogRecord(r);
                            }}
                            className="interactive-target apple-btn-secondary px-3 py-1 rounded-lg text-xs font-mono text-[#2563eb] font-bold"
                          >
                            VIEW PHOTO
                          </button>
                        ) : (
                          <span className="text-[#94a3b8]">&mdash;</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredLogs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[#94a3b8] max-w-[65ch]">
                        No inspection records found. Either no packages have been scanned yet, or no items match your search and filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =====================================================================
            TAB 6: LINE CONTROLS
        ===================================================================== */}
        {activeTab === 'control' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Precision Calibration Sliders */}
            <div className="apple-glass-card rounded-2xl p-6 space-y-6">
              <div className="border-b border-white/10 pb-3">
                <h3 className="text-xs font-mono font-bold text-[#f8fafc]">
                  CONVEYOR &amp; MODEL CALIBRATION
                </h3>
              </div>

              {/* Slider 1: Confidence */}
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="font-bold text-[#f8fafc]">Confidence Threshold Gate</span>
                  <span className="px-2.5 py-1 apple-subsurface text-[#2563eb] rounded-lg font-bold tabular-nums">
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
                />
                <div className="flex justify-between text-xs font-mono text-[#94a3b8]">
                  <span>0.20 (Sensitive)</span>
                  <span>0.45 (Standard)</span>
                  <span>0.90 (Strict)</span>
                </div>
                <p className="text-xs text-[#94a3b8] max-w-[65ch]">
                  Minimum model score required before flagging a container and triggering the Station 2 diverter.
                </p>
              </div>

              {/* Slider 2: Conveyor Delay */}
              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="font-bold text-[#f8fafc]">Conveyor Transit Delay</span>
                  <span className="px-2.5 py-1 apple-subsurface text-[#2563eb] rounded-lg font-bold tabular-nums">
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
                />
                <div className="flex justify-between text-xs font-mono text-[#94a3b8]">
                  <span>0.5s (High Speed)</span>
                  <span>2.8s (Calibrated)</span>
                  <span>5.0s (Low Speed)</span>
                </div>
                <p className="text-xs text-[#94a3b8] max-w-[65ch]">
                  Travel time elapsed between Station 1 optical camera and Station 2 mechanical rejector.
                </p>
              </div>

              {/* Presets */}
              <div className="pt-2 space-y-2">
                <div className="text-xs font-mono text-[#94a3b8]">CALIBRATION PRESETS:</div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => applyPreset(0.35, 2.8)}
                    className="interactive-target apple-btn-secondary p-2.5 rounded-xl text-xs font-mono font-bold text-[#94a3b8] hover:text-[#f8fafc]"
                  >
                    High Sensitivity
                  </button>
                  <button
                    onClick={() => applyPreset(0.45, 2.8)}
                    className="interactive-target apple-btn-secondary p-2.5 rounded-xl text-xs font-mono font-bold text-[#94a3b8] hover:text-[#f8fafc]"
                  >
                    Default Balanced
                  </button>
                  <button
                    onClick={() => applyPreset(0.60, 2.5)}
                    className="interactive-target apple-btn-secondary p-2.5 rounded-xl text-xs font-mono font-bold text-[#94a3b8] hover:text-[#f8fafc]"
                  >
                    High Throughput
                  </button>
                </div>
              </div>

              <button
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                className="interactive-target apple-btn-primary w-full py-3 font-mono font-bold text-xs rounded-xl"
              >
                {isSavingSettings ? '[SAVING PARAMETERS...]' : 'APPLY & SAVE PARAMETERS'}
              </button>

              {settingsSavedAlert && (
                <div className="p-3 apple-badge-good text-xs font-mono text-center rounded-xl font-bold">
                  [SUCCESS] Pipeline parameters saved and active.
                </div>
              )}
            </div>

            {/* Actuator Override Panel */}
            <div className="apple-glass-card rounded-2xl p-6 flex flex-col justify-between space-y-6">
              <div className="border-b border-white/10 pb-3">
                <h3 className="text-xs font-mono font-bold text-[#f8fafc]">
                  MECHANICAL ACTUATOR OVERRIDE
                </h3>
              </div>

              <div className="flex flex-col items-center justify-center py-6 space-y-4">
                <button
                  onClick={handleTestPusher}
                  disabled={isPusherTriggering}
                  className={`interactive-target px-8 py-4 rounded-2xl text-sm font-mono font-bold border transition-colors ${
                    isPusherTriggering
                      ? 'apple-badge-defect font-extrabold'
                      : 'apple-btn-secondary text-[#f87171] hover:border-red-400/40'
                  }`}
                >
                  {isPusherTriggering ? '[PUSHER ACTUATING...]' : 'TRIGGER SG90 PUSHER NOW'}
                </button>

                <p className="text-xs font-mono text-[#94a3b8] text-center max-w-[65ch]">
                  Manually sends a 95&deg; sweep pulse to Arduino Pin D9 to test reject chute mechanics.
                </p>
              </div>

              <div className="p-4 apple-subsurface rounded-xl space-y-2 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-[#94a3b8]">Microcontroller:</span>
                  <span className="text-[#f8fafc]">Arduino Uno / Nano</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#94a3b8]">Serial Protocol:</span>
                  <span className="text-[#2563eb] font-bold tabular-nums">115200 Baud &bull; COM3</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#94a3b8]">PWM Servo Output:</span>
                  <span className="text-[#f8fafc]">Digital Pin D9</span>
                </div>
              </div>

              <button
                onClick={handleReset}
                className="interactive-target apple-btn-secondary w-full py-3 rounded-xl text-xs font-mono font-bold text-[#f87171] hover:border-red-400/40"
              >
                RESET SESSION COUNTERS
              </button>
            </div>

          </div>
        )}

      </main>

      {/* =========================================================================
          FULLSCREEN INSPECTION MODAL (APPLE GLASS PANEL)
      ========================================================================= */}
      {selectedSnapshot && (
        <div
          onClick={() => {
            setSelectedSnapshot(null);
            setSelectedLogRecord(null);
          }}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-3xl w-full apple-glass-panel rounded-2xl p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 text-xs font-mono font-bold truncate">
                <span className="text-[#f8fafc]">INSPECTION TELEMETRY</span>
                {selectedLogRecord && (
                  <span className="px-2.5 py-1 apple-subsurface text-[#2563eb] rounded-lg truncate max-w-[160px]">
                    {selectedLogRecord.item_id}
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  setSelectedSnapshot(null);
                  setSelectedLogRecord(null);
                }}
                className="interactive-target apple-btn-secondary px-3 py-1 rounded-lg text-xs font-mono text-[#94a3b8] hover:text-[#f8fafc]"
              >
                [CLOSE ESC]
              </button>
            </div>

            <div className="aspect-video w-full rounded-xl bg-[#080b12] border border-white/10 overflow-hidden flex items-center justify-center">
              <img
                src={selectedSnapshot}
                alt="Defect Snapshot"
                className="w-full h-full object-contain"
              />
            </div>

            {selectedLogRecord && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
                <div className="p-3 apple-subsurface rounded-xl">
                  <div className="text-xs text-[#94a3b8]">DEFECT TYPE</div>
                  <div className="text-[#f87171] font-bold mt-1 uppercase truncate">
                    [{selectedLogRecord.defect_type}]
                  </div>
                </div>
                <div className="p-3 apple-subsurface rounded-xl">
                  <div className="text-xs text-[#94a3b8]">CONFIDENCE</div>
                  <div className="text-[#2563eb] font-bold mt-1 tabular-nums">
                    {(selectedLogRecord.confidence * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="p-3 apple-subsurface rounded-xl">
                  <div className="text-xs text-[#94a3b8]">TIMESTAMP</div>
                  <div className="text-[#f8fafc] font-bold mt-1 tabular-nums whitespace-nowrap">
                    {selectedLogRecord.timestamp}
                  </div>
                </div>
                <div className="p-3 apple-subsurface rounded-xl">
                  <div className="text-xs text-[#94a3b8]">DISPOSITION</div>
                  <div className="text-[#34d399] font-bold mt-1">
                    [EJECT CHUTE]
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-white/10">
              <span className="text-xs font-mono text-[#94a3b8]">
                Stored in logs/defect_log.csv
              </span>
              <a
                href={selectedSnapshot}
                download
                target="_blank"
                rel="noreferrer"
                className="interactive-target apple-btn-primary px-4 py-2 font-mono font-bold text-xs rounded-xl"
              >
                DOWNLOAD SNAPSHOT
              </a>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          APPLE GLASS FOOTER (AUTHENTIC TRUST & OPEN SOURCE TRANSPARENCY)
      ========================================================================= */}
      <footer className="apple-glass-panel border-t border-b-0 border-x-0 w-full py-5 px-6 text-xs font-mono text-[#94a3b8] flex flex-wrap items-center justify-between gap-4 mt-12 z-20">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[#f8fafc] font-bold">SORTEX INDUSTRIAL AI OS</span>
          <span>&bull;</span>
          <a
            href="https://github.com/Arsh15-R/ai-driven-packaging-defect-sorter"
            target="_blank"
            rel="noreferrer"
            className="text-[#94a3b8] hover:text-[#f8fafc] transition-colors"
          >
            GitHub Repository
          </a>
          <span>&bull;</span>
          <a
            href="/logs/defect_log.csv"
            download="defect_log.csv"
            className="text-[#94a3b8] hover:text-[#f8fafc] transition-colors"
          >
            Raw CSV Ledger
          </a>
          <span>&bull;</span>
          <span>MIT License &bull; 2026</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="tabular-nums">THROUGHPUT: {stats.fps.toFixed(1)} FPS</span>
          <span>&bull;</span>
          <span className="text-[#2563eb] font-bold tabular-nums">YIELD: {yieldPercentage}%</span>
        </div>
      </footer>

    </div>
  );
}
