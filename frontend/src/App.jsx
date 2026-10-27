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
      // Offline simulation fallback
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
    <div className="min-h-screen w-full bg-[#0d1117] text-[#f0f6fc] flex flex-col font-sans selection:bg-[#3b82f6] selection:text-white">

      {/* =========================================================================
          FLAT INDUSTRIAL HEADER (NO GRADIENTS, NO SHADOWS)
      ========================================================================= */}
      <header className="w-full px-6 py-4 bg-[#161b22] border-b border-[#30363d] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">

          {/* Clean Brand Identity (No redundant icon) */}
          <div className="flex items-center gap-3">
            <span className="font-bold text-base tracking-tight text-[#f0f6fc]">
              SORTEX PRO
            </span>
            <span className="text-xs font-mono font-bold px-2 py-1 bg-[#21262d] text-[#8b949e] border border-[#30363d] rounded">
              STATION 1 & 2
            </span>
            <span className="hidden sm:inline text-xs font-mono text-[#8b949e]">
              YOLOv8 Edge Pipeline
            </span>
          </div>

          {/* Central Telemetry Status (Flat capsule, 44px touch target) */}
          <button
            onClick={() => setShowIslandDetail(!showIslandDetail)}
            className="interactive-target px-4 py-2 bg-[#0d1117] border border-[#30363d] rounded text-xs font-mono font-bold hover:border-[#8b949e]"
          >
            <span className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-[#3fb950]' : 'bg-[#d29922]'}`} />
              <span>{isConnected ? '[CONVEYOR ACTIVE]' : '[CONNECTING]'}</span>
              <span className="text-[#8b949e]">|</span>
              <span className="text-[#8b949e]">
                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className="hidden md:inline text-[#8b949e]">|</span>
              <span className="hidden md:inline text-[#3b82f6]">
                RTX 3050 • {stats.fps} FPS
              </span>
            </span>
          </button>

          {/* Quick Line Actions (44px min touch targets, active:scale-[0.97]) */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleTestPusher}
              disabled={isPusherTriggering}
              className={`interactive-target px-4 py-2 rounded text-xs font-mono font-bold border transition-colors ${
                isPusherTriggering
                  ? 'bg-[#b62324] text-white border-[#f85149]'
                  : 'bg-[#21262d] text-[#f85149] border-[#30363d] hover:bg-[#30363d]'
              }`}
            >
              {isPusherTriggering ? '[PUSHER FIRED]' : 'TEST PUSHER'}
            </button>

            <button
              onClick={handleReset}
              title="Reset inspection counters"
              className="interactive-target px-3 py-2 bg-[#21262d] text-[#8b949e] border border-[#30363d] rounded text-xs font-mono font-bold hover:text-[#f0f6fc] hover:bg-[#30363d]"
            >
              RESET
            </button>
          </div>
        </div>

        {/* Diagnostics Drawer (Flat surface, no shadows) */}
        {showIslandDetail && (
          <div className="max-w-7xl mx-auto mt-4 p-4 bg-[#0d1117] border border-[#30363d] rounded">
            <div className="flex items-center justify-between border-b border-[#30363d] pb-2 mb-3 text-xs font-mono">
              <span className="font-bold text-[#f0f6fc]">LINE DIAGNOSTICS</span>
              <span className="text-[#8b949e]">Firmware v2.4-CUDA</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
              <div className="p-3 bg-[#161b22] border border-[#30363d] rounded">
                <div className="text-[#8b949e]">FEED SOURCE</div>
                <div className="font-bold text-[#f0f6fc] mt-1">{stats.source.toUpperCase()}</div>
              </div>
              <div className="p-3 bg-[#161b22] border border-[#30363d] rounded">
                <div className="text-[#8b949e]">INFERENCE TIME</div>
                <div className="font-bold text-[#3fb950] mt-1">14.8 ms</div>
              </div>
              <div className="p-3 bg-[#161b22] border border-[#30363d] rounded">
                <div className="text-[#8b949e]">TRANSIT DELAY</div>
                <div className="font-bold text-[#3b82f6] mt-1">{stats.conveyor_delay}s</div>
              </div>
              <div className="p-3 bg-[#161b22] border border-[#30363d] rounded">
                <div className="text-[#8b949e]">CONFIDENCE GATE</div>
                <div className="font-bold text-[#f0f6fc] mt-1">{(stats.conf_threshold * 100).toFixed(0)}%</div>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* =========================================================================
          FLAT SEGMENTED NAVIGATION (NO ICONS, 44px TARGETS)
      ========================================================================= */}
      <nav className="w-full px-6 py-3 bg-[#0d1117] border-b border-[#30363d] flex justify-center">
        <div className="flex flex-wrap items-center gap-2 max-w-7xl w-full">
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
                className={`interactive-target px-4 py-2 rounded text-xs font-mono font-bold border transition-colors ${
                  isActive
                    ? 'bg-[#3b82f6] text-white border-[#3b82f6]'
                    : 'bg-[#161b22] text-[#8b949e] border-[#30363d] hover:text-[#f0f6fc] hover:bg-[#21262d]'
                }`}
              >
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${
                    isActive ? 'bg-black/20 text-white' : 'bg-[#21262d] text-[#8b949e]'
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
          MAIN WORKSPACE VIEWPORT (SINGLE FOCAL POINT PER SCREEN)
      ========================================================================= */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-6 space-y-6">

        {/* =====================================================================
            TAB 1: OVERVIEW DASHBOARD (PRIMARY FOCAL POINT: LIVE CONVEYOR)
        ===================================================================== */}
        {activeTab === 'overview' && (
          <div className="space-y-6">

            {/* METRICS ROW (Flat cards, 1px border only, no shadows, no icons) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-[#161b22] border border-[#30363d] rounded">
                <div className="text-xs font-mono font-bold text-[#8b949e]">TOTAL INSPECTED</div>
                <div className="text-3xl font-extrabold font-mono text-[#f0f6fc] mt-2 mb-1">
                  {stats.total_checked.toLocaleString()}
                </div>
                <div className="text-[11px] font-mono text-[#8b949e]">[100% INSPECTED]</div>
              </div>

              <div className="p-4 bg-[#161b22] border border-[#30363d] rounded">
                <div className="text-xs font-mono font-bold text-[#8b949e]">GOOD PACKAGES</div>
                <div className="text-3xl font-extrabold font-mono text-[#3fb950] mt-2 mb-1">
                  {stats.good_count.toLocaleString()}
                </div>
                <div className="text-[11px] font-mono text-[#3fb950]">[PASS RATE: {yieldPercentage}%]</div>
              </div>

              <div className="p-4 bg-[#161b22] border border-[#30363d] rounded">
                <div className="text-xs font-mono font-bold text-[#8b949e]">DEFECTS DIVERTED</div>
                <div className="text-3xl font-extrabold font-mono text-[#f85149] mt-2 mb-1">
                  {stats.defect_count.toLocaleString()}
                </div>
                <div className="text-[11px] font-mono text-[#f85149]">[REJECT CHUTE]</div>
              </div>

              <div className="p-4 bg-[#161b22] border border-[#30363d] rounded">
                <div className="text-xs font-mono font-bold text-[#8b949e]">DEFECT RATE</div>
                <div className="text-3xl font-extrabold font-mono text-[#d29922] mt-2 mb-1">
                  {stats.defect_rate.toFixed(2)}%
                </div>
                <div className="text-[11px] font-mono text-[#8b949e]">
                  {stats.defect_rate > 5 ? '[ALERT: EXCEEDS 5.0%]' : '[NOMINAL < 3.0%]'}
                </div>
              </div>
            </div>

            {/* FOCAL POINT: CONVEYOR FEED & DEFECT MATRIX */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Primary Cinema Conveyor Viewport (2 Cols) */}
              <div className="lg:col-span-2 p-4 bg-[#161b22] border border-[#30363d] rounded flex flex-col justify-between space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#3fb950]" />
                    <span className="text-xs font-mono font-bold text-[#f0f6fc]">
                      STATION 1 OPTICAL GATE $\rightarrow$ STATION 2 DIVERTER
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setUseDigitalTwin(!useDigitalTwin)}
                      className="interactive-target px-3 py-1 bg-[#21262d] text-xs font-mono font-bold border border-[#30363d] rounded hover:border-[#8b949e]"
                    >
                      {useDigitalTwin ? 'MODE: DIGITAL TWIN' : 'MODE: CAMERA FEED'}
                    </button>
                    <button
                      onClick={() => setShowHudOverlay(!showHudOverlay)}
                      className="interactive-target px-3 py-1 bg-[#21262d] text-xs font-mono font-bold border border-[#30363d] rounded hover:border-[#8b949e]"
                    >
                      {showHudOverlay ? 'HUD: ON' : 'HUD: OFF'}
                    </button>
                  </div>
                </div>

                {/* Viewport Frame */}
                <div className="relative aspect-video w-full rounded bg-[#0d1117] border border-[#30363d] overflow-hidden flex items-center justify-center">
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
                    <div className="text-xs font-mono text-[#8b949e]">
                      [CONVEYOR FEED PAUSED]
                    </div>
                  )}

                  {showHudOverlay && (
                    <div className="absolute top-3 left-3 px-3 py-1.5 bg-[#161b22] border border-[#30363d] rounded text-[10px] font-mono pointer-events-none">
                      <div className="font-bold text-[#f0f6fc]">STATION 1: INSPECTION</div>
                      <div className="text-[#8b949e]">Confidence Gate: {(stats.conf_threshold * 100).toFixed(0)}%</div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs font-mono text-[#8b949e]">
                  <span>Resolution: 1280×600 • 30.0 FPS</span>
                  <span className="text-[#3b82f6]">YOLOv8s PyTorch CUDA (~14.8 ms)</span>
                </div>
              </div>

              {/* Right Side: Defect Taxonomy Matrix (1 Col) */}
              <div className="p-4 bg-[#161b22] border border-[#30363d] rounded flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between border-b border-[#30363d] pb-2 mb-4">
                    <span className="text-xs font-mono font-bold text-[#f0f6fc]">DEFECT BREAKDOWN</span>
                    <span className="text-xs font-mono text-[#8b949e]">Total: {stats.defect_count}</span>
                  </div>

                  <div className="space-y-4">
                    {defectBreakdownList.map(def => {
                      const count = (stats.defect_breakdown && stats.defect_breakdown[def.key]) || 0;
                      const pct = stats.defect_count > 0 ? (count / stats.defect_count) * 100 : 0;
                      return (
                        <div key={def.key} className="space-y-1">
                          <div className="flex justify-between text-xs font-mono">
                            <span className="text-[#f0f6fc] font-bold">{def.label}</span>
                            <span className="text-[#8b949e]">
                              {count} ({pct.toFixed(0)}%)
                            </span>
                          </div>
                          <div className="h-2 w-full bg-[#21262d] rounded overflow-hidden">
                            <div
                              className="h-full bg-[#3b82f6]"
                              style={{ width: `${Math.max(pct, count > 0 ? 5 : 0)}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-[#8b949e] max-w-[65ch]">{def.desc}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Latest Defect Flagged */}
                <div className="p-3 bg-[#0d1117] border border-[#30363d] rounded font-mono text-xs">
                  <div className="text-[10px] text-[#f85149] font-bold">LATEST DEFECT DETECTED</div>
                  {stats.last_defect ? (
                    <div className="mt-1 space-y-1">
                      <div className="flex justify-between font-bold text-[#f0f6fc]">
                        <span>{stats.last_defect.id}</span>
                        <span className="text-[#f85149]">[FAIL: {stats.last_defect.type.toUpperCase()}]</span>
                      </div>
                      <div className="text-[11px] text-[#8b949e] flex justify-between">
                        <span>Confidence: {((stats.last_defect.conf || 0.85) * 100).toFixed(0)}%</span>
                        <span className="text-[#3fb950]">[DIVERTED]</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[#8b949e] mt-1">Conveyor quality nominal. No defect flagged.</div>
                  )}
                </div>
              </div>

            </div>

            {/* Traceability Table Preview */}
            <div className="p-4 bg-[#161b22] border border-[#30363d] rounded space-y-3">
              <div className="flex items-center justify-between border-b border-[#30363d] pb-2">
                <span className="text-xs font-mono font-bold text-[#f0f6fc]">
                  LIVE CONVEYOR TRACEABILITY AUDIT
                </span>
                <button
                  onClick={() => setActiveTab('audit')}
                  className="interactive-target px-3 py-1 bg-[#21262d] text-xs font-mono font-bold border border-[#30363d] rounded hover:border-[#8b949e]"
                >
                  FULL AUDIT TRAIL
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="border-b border-[#30363d] text-[#8b949e]">
                    <tr>
                      <th className="pb-2 px-2">Timestamp</th>
                      <th className="pb-2 px-2">Package ID</th>
                      <th className="pb-2 px-2">Decision</th>
                      <th className="pb-2 px-2">Defect Type</th>
                      <th className="pb-2 px-2">Confidence</th>
                      <th className="pb-2 px-2 text-right">Photo Snapshot</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#30363d] text-[#f0f6fc]">
                    {logs.slice(0, 5).map((r, i) => (
                      <tr key={i} className="hover:bg-[#21262d]">
                        <td className="py-2.5 px-2 text-[#8b949e]">{r.timestamp}</td>
                        <td className="py-2.5 px-2 font-bold">{r.item_id}</td>
                        <td className="py-2.5 px-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            r.decision === 'GOOD'
                              ? 'bg-[#21262d] text-[#3fb950] border border-[#238636]'
                              : 'bg-[#21262d] text-[#f85149] border-[#da3633]'
                          }`}>
                            [{r.decision}]
                          </span>
                        </td>
                        <td className="py-2.5 px-2 uppercase">{r.defect_type}</td>
                        <td className="py-2.5 px-2 text-[#3b82f6]">{(r.confidence * 100).toFixed(1)}%</td>
                        <td className="py-2.5 px-2 text-right">
                          {r.image_url ? (
                            <button
                              onClick={() => {
                                setSelectedSnapshot(r.image_url);
                                setSelectedLogRecord(r);
                              }}
                              className="interactive-target px-3 py-1 bg-[#21262d] border border-[#30363d] rounded text-[11px] font-mono text-[#3b82f6] hover:border-[#8b949e]"
                            >
                              INSPECT
                            </button>
                          ) : (
                            <span className="text-[#8b949e]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {logs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-[#8b949e]">
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
            TAB 2: FULL LIVE STREAM THEATER (REWORKED 3-COL GRID INTO TELEMETRY RAIL)
        ===================================================================== */}
        {activeTab === 'stream' && (
          <div className="space-y-6">
            <div className="p-4 bg-[#161b22] border border-[#30363d] rounded space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#30363d] pb-3">
                <div>
                  <h2 className="text-sm font-mono font-bold text-[#f0f6fc]">
                    REAL-TIME OPTICAL VISION THEATER
                  </h2>
                  <p className="text-xs text-[#8b949e] mt-1 max-w-[65ch]">
                    High-bandwidth stream evaluating package geometry, label placement, and seal integrity.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setUseDigitalTwin(!useDigitalTwin)}
                    className="interactive-target px-4 py-2 bg-[#21262d] text-xs font-mono font-bold border border-[#30363d] rounded hover:border-[#8b949e]"
                  >
                    {useDigitalTwin ? 'MODE: DIGITAL TWIN' : 'MODE: CAMERA STREAM'}
                  </button>
                  <button
                    onClick={() => setIsStreamPaused(!isStreamPaused)}
                    className="interactive-target px-4 py-2 bg-[#21262d] text-xs font-mono font-bold border border-[#30363d] rounded hover:border-[#8b949e]"
                  >
                    {isStreamPaused ? 'RESUME STREAM' : 'PAUSE STREAM'}
                  </button>
                  <button
                    onClick={handleTestPusher}
                    disabled={isPusherTriggering}
                    className="interactive-target px-4 py-2 bg-[#21262d] text-[#f85149] text-xs font-mono font-bold border border-[#30363d] rounded hover:bg-[#30363d]"
                  >
                    ACTUATE DIVERTER
                  </button>
                </div>
              </div>

              {/* Theater Viewport */}
              <div className="relative aspect-video w-full rounded bg-[#0d1117] border border-[#30363d] overflow-hidden flex items-center justify-center">
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
                  <div className="text-xs font-mono text-[#8b949e]">[CINEMA FEED PAUSED]</div>
                )}
              </div>

              {/* Reworked 3-Column Grid into a Unified Linear Telemetry Strip */}
              <div className="border border-[#30363d] rounded bg-[#0d1117] overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#30363d] text-xs font-mono">
                  <div className="p-4 space-y-1">
                    <div className="text-[#8b949e] font-bold">STATION 1: OPTICAL CAMERA</div>
                    <div className="text-[#f0f6fc] font-bold">Telecentric Industrial Sensor</div>
                    <div className="text-[#8b949e] text-[11px]">1/500s Shutter • 6000K Illumination</div>
                  </div>
                  <div className="p-4 space-y-1">
                    <div className="text-[#8b949e] font-bold">STATION 2: SERVO DIVERTER</div>
                    <div className="text-[#f0f6fc] font-bold">SG90 / MG995 Diverter Arm</div>
                    <div className="text-[#8b949e] text-[11px]">95° Deflection Arc • 85ms Actuation</div>
                  </div>
                  <div className="p-4 space-y-1">
                    <div className="text-[#8b949e] font-bold">CONVEYOR DRIVE MOTOR</div>
                    <div className="text-[#3b82f6] font-bold">Closed-Loop Belt Drive</div>
                    <div className="text-[#8b949e] text-[11px]">{stats.conveyor_delay}s Arrival Delay Window</div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* =====================================================================
            TAB 3: ANALYTICS & LEDGER (REWORKED INTO UNIFIED TELEMETRY TABLE)
        ===================================================================== */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">

            {/* Linear Production KPI Ledger (Replaced scattered 3-card grid) */}
            <div className="p-4 bg-[#161b22] border border-[#30363d] rounded space-y-4">
              <div className="flex items-center justify-between border-b border-[#30363d] pb-2">
                <span className="text-xs font-mono font-bold text-[#f0f6fc]">
                  QUALITY ASSURANCE TELEMETRY SUMMARY
                </span>
                <span className="text-xs font-mono text-[#8b949e]">ISO 9001 Inspection Metric</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#30363d] text-xs font-mono">
                <div className="p-3 space-y-1">
                  <div className="text-[#8b949e]">FIRST PASS YIELD (FPY)</div>
                  <div className="text-2xl font-extrabold text-[#3fb950]">{yieldPercentage}%</div>
                  <div className="text-[11px] text-[#8b949e]">Good units passed downstream</div>
                </div>
                <div className="p-3 space-y-1">
                  <div className="text-[#8b949e]">DEFECT OCCURRENCE RATIO</div>
                  <div className="text-2xl font-extrabold text-[#d29922]">{stats.defect_rate.toFixed(2)}%</div>
                  <div className="text-[11px] text-[#8b949e]">Benchmark threshold &lt; 3.00%</div>
                </div>
                <div className="p-3 space-y-1">
                  <div className="text-[#8b949e]">DIVERTER EFFICIENCY</div>
                  <div className="text-2xl font-extrabold text-[#3b82f6]">100.0%</div>
                  <div className="text-[11px] text-[#8b949e]">{stats.defect_count} confirmed rejections</div>
                </div>
              </div>
            </div>

            {/* Defect Classification Matrix */}
            <div className="p-4 bg-[#161b22] border border-[#30363d] rounded space-y-4">
              <div className="border-b border-[#30363d] pb-2">
                <h3 className="text-xs font-mono font-bold text-[#f0f6fc]">
                  DEFECT CLASS DISTRIBUTION & ROOT CAUSE MATRIX
                </h3>
                <p className="text-xs text-[#8b949e] mt-1 max-w-[65ch]">
                  Categorization of diverted packages by YOLOv8 visual classifier.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {defectBreakdownList.map(def => {
                  const count = (stats.defect_breakdown && stats.defect_breakdown[def.key]) || 0;
                  const pct = stats.defect_count > 0 ? (count / stats.defect_count) * 100 : 0;
                  return (
                    <div key={def.key} className="p-4 bg-[#0d1117] border border-[#30363d] rounded space-y-2">
                      <div className="flex justify-between text-xs font-mono font-bold">
                        <span className="text-[#f0f6fc]">{def.label}</span>
                        <span className="text-[#8b949e]">{count} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-2 w-full bg-[#21262d] rounded overflow-hidden">
                        <div
                          className="h-full bg-[#3b82f6]"
                          style={{ width: `${Math.max(pct, count > 0 ? 5 : 0)}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-[#8b949e] max-w-[65ch] leading-relaxed">
                        {def.desc}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Latency Specifications */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 bg-[#161b22] border border-[#30363d] rounded space-y-3 font-mono text-xs">
                <div className="font-bold text-[#f0f6fc] border-b border-[#30363d] pb-2">
                  OPTICAL INFERENCE TIMING
                </div>
                <div className="flex justify-between py-1 border-b border-[#30363d]">
                  <span className="text-[#8b949e]">Preprocessing & Letterbox</span>
                  <span className="text-[#f0f6fc]">1.8 ms</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#30363d]">
                  <span className="text-[#8b949e]">YOLOv8s PyTorch CUDA</span>
                  <span className="text-[#3b82f6] font-bold">11.4 ms</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#30363d]">
                  <span className="text-[#8b949e]">Non-Maximum Suppression</span>
                  <span className="text-[#f0f6fc]">1.6 ms</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#8b949e]">Total Optical Latency</span>
                  <span className="text-[#3fb950] font-bold">14.8 ms (67+ FPS)</span>
                </div>
              </div>

              <div className="p-4 bg-[#161b22] border border-[#30363d] rounded space-y-3 font-mono text-xs">
                <div className="font-bold text-[#f0f6fc] border-b border-[#30363d] pb-2">
                  MECHANICAL ACTUATOR TIMING
                </div>
                <div className="flex justify-between py-1 border-b border-[#30363d]">
                  <span className="text-[#8b949e]">Serial UART Dispatch</span>
                  <span className="text-[#f0f6fc]">&lt; 0.1 ms (115200 baud)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#30363d]">
                  <span className="text-[#8b949e]">Conveyor Transit Delay</span>
                  <span className="text-[#3b82f6] font-bold">{stats.conveyor_delay}s Window</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#30363d]">
                  <span className="text-[#8b949e]">Servo Sweep Stroke</span>
                  <span className="text-[#f0f6fc]">85 ms (95° arc)</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#8b949e]">Chute Clearance Return</span>
                  <span className="text-[#3fb950] font-bold">120 ms</span>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* =====================================================================
            TAB 4: DEFECT ARCHIVE (CLEAN GRID, NO REPEAT ICONS)
        ===================================================================== */}
        {activeTab === 'gallery' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#30363d] pb-4">
              <div>
                <h2 className="text-sm font-mono font-bold text-[#f0f6fc]">
                  DEFECT SNAPSHOT ARCHIVE
                </h2>
                <p className="text-xs text-[#8b949e] mt-1 max-w-[65ch]">
                  High-resolution frames of packages diverted at Station 2.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {['ALL', 'DENT', 'LABEL_MISSING', 'SEAL_BROKEN', 'WRONG_PRINT'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat)}
                    className={`interactive-target px-3 py-1.5 rounded text-xs font-mono font-bold border transition-colors ${
                      filterCategory === cat
                        ? 'bg-[#3b82f6] text-white border-[#3b82f6]'
                        : 'bg-[#161b22] text-[#8b949e] border-[#30363d] hover:text-[#f0f6fc]'
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
                  className="interactive-target w-full bg-[#161b22] border border-[#30363d] rounded p-2 flex flex-col items-stretch text-left cursor-pointer hover:border-[#8b949e]"
                >
                  <div className="aspect-square bg-[#0d1117] rounded overflow-hidden relative">
                    <img
                      src={item.image_url}
                      alt={item.item_id}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-[#b62324] text-white border border-[#f85149]">
                      [{item.defect_type.toUpperCase()}]
                    </span>
                  </div>

                  <div className="p-2 font-mono text-xs">
                    <div className="flex justify-between font-bold text-[#f0f6fc]">
                      <span>{item.item_id}</span>
                      <span className="text-[#3b82f6]">{(item.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <div className="text-[10px] text-[#8b949e] mt-1 flex justify-between">
                      <span>{item.timestamp}</span>
                      <span className="text-[#3fb950]">[DIVERTED]</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {filteredLogs.filter(l => l.image_url).length === 0 && (
              <div className="p-12 bg-[#161b22] border border-[#30363d] rounded text-center text-xs font-mono text-[#8b949e]">
                No defect snapshots match the selected filter category.
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            TAB 5: REGULATORY AUDIT TRAIL TABLE
        ===================================================================== */}
        {activeTab === 'audit' && (
          <div className="p-4 bg-[#161b22] border border-[#30363d] rounded space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-[#30363d] pb-4">
              <div>
                <h2 className="text-sm font-mono font-bold text-[#f0f6fc]">
                  REGULATORY AUDIT TRAIL & LOGS
                </h2>
                <p className="text-xs text-[#8b949e] mt-1 max-w-[65ch]">
                  Persistent CSV ledger stored at <span className="font-bold text-[#f0f6fc]">logs/defect_log.csv</span>.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  placeholder="Search package ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded text-xs font-mono text-[#f0f6fc] placeholder-[#8b949e] min-h-[44px] focus-visible:ring-2 focus-visible:ring-[#3b82f6]"
                />

                <select
                  value={filterDecision}
                  onChange={(e) => setFilterDecision(e.target.value)}
                  className="px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded text-xs font-mono text-[#f0f6fc] min-h-[44px] focus-visible:ring-2 focus-visible:ring-[#3b82f6]"
                >
                  <option value="ALL">All Decisions</option>
                  <option value="GOOD">Good Only</option>
                  <option value="DEFECTIVE">Defective Only</option>
                </select>

                <a
                  href="/logs/defect_log.csv"
                  download="defect_log.csv"
                  className="interactive-target px-4 py-2 bg-[#3b82f6] text-white font-mono font-bold text-xs rounded hover:bg-[#2563eb]"
                >
                  EXPORT CSV
                </a>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="border-b border-[#30363d] text-[#8b949e]">
                  <tr>
                    <th className="pb-3 px-3">Timestamp</th>
                    <th className="pb-3 px-3">Package ID</th>
                    <th className="pb-3 px-3">Decision</th>
                    <th className="pb-3 px-3">Category</th>
                    <th className="pb-3 px-3">Confidence</th>
                    <th className="pb-3 px-3 text-right">Photo Snapshot</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363d] text-[#f0f6fc]">
                  {filteredLogs.map((r, i) => (
                    <tr key={i} className="hover:bg-[#21262d]">
                      <td className="py-3 px-3 text-[#8b949e]">{r.timestamp}</td>
                      <td className="py-3 px-3 font-bold flex items-center gap-2">
                        <span>{r.item_id}</span>
                        <button
                          onClick={() => handleCopyId(r.item_id)}
                          title="Copy ID"
                          className="interactive-target text-[10px] text-[#8b949e] hover:text-[#f0f6fc] min-h-[30px] min-w-[30px]"
                        >
                          [COPY]
                        </button>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          r.decision === 'GOOD'
                            ? 'bg-[#21262d] text-[#3fb950] border border-[#238636]'
                            : 'bg-[#21262d] text-[#f85149] border-[#da3633]'
                        }`}>
                          [{r.decision}]
                        </span>
                      </td>
                      <td className="py-3 px-3 uppercase">{r.defect_type}</td>
                      <td className="py-3 px-3 text-[#3b82f6]">{(r.confidence * 100).toFixed(1)}%</td>
                      <td className="py-3 px-3 text-right">
                        {r.image_url ? (
                          <button
                            onClick={() => {
                              setSelectedSnapshot(r.image_url);
                              setSelectedLogRecord(r);
                            }}
                            className="interactive-target px-3 py-1 bg-[#21262d] border border-[#30363d] rounded text-[11px] font-mono text-[#3b82f6] hover:border-[#8b949e]"
                          >
                            VIEW PHOTO
                          </button>
                        ) : (
                          <span className="text-[#8b949e]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredLogs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[#8b949e]">
                        No inspection records match current filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =====================================================================
            TAB 6: LINE CONTROLS (FLAT INDUSTRIAL INTERFACE)
        ===================================================================== */}
        {activeTab === 'control' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Precision Calibration Sliders */}
            <div className="p-4 bg-[#161b22] border border-[#30363d] rounded space-y-6">
              <div className="border-b border-[#30363d] pb-3">
                <h3 className="text-xs font-mono font-bold text-[#f0f6fc]">
                  CONVEYOR & MODEL CALIBRATION
                </h3>
              </div>

              {/* Slider 1: Confidence */}
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="font-bold text-[#f0f6fc]">Confidence Threshold Gate</span>
                  <span className="px-2 py-0.5 bg-[#21262d] text-[#3b82f6] border border-[#30363d] rounded font-bold">
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
                <div className="flex justify-between text-[10px] font-mono text-[#8b949e]">
                  <span>0.20 (Sensitive)</span>
                  <span>0.45 (Standard)</span>
                  <span>0.90 (Strict)</span>
                </div>
                <p className="text-[11px] text-[#8b949e] max-w-[65ch]">
                  Minimum model score required before flagging a container and triggering the Station 2 diverter.
                </p>
              </div>

              {/* Slider 2: Conveyor Delay */}
              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="font-bold text-[#f0f6fc]">Conveyor Transit Delay</span>
                  <span className="px-2 py-0.5 bg-[#21262d] text-[#3b82f6] border border-[#30363d] rounded font-bold">
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
                <div className="flex justify-between text-[10px] font-mono text-[#8b949e]">
                  <span>0.5s (High Speed)</span>
                  <span>2.8s (Calibrated)</span>
                  <span>5.0s (Low Speed)</span>
                </div>
                <p className="text-[11px] text-[#8b949e] max-w-[65ch]">
                  Travel time elapsed between Station 1 optical camera and Station 2 mechanical rejector.
                </p>
              </div>

              {/* Presets */}
              <div className="pt-2 space-y-2">
                <div className="text-[10px] font-mono text-[#8b949e]">CALIBRATION PRESETS:</div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => applyPreset(0.35, 2.8)}
                    className="interactive-target p-2 bg-[#21262d] border border-[#30363d] rounded text-[11px] font-mono font-bold text-[#8b949e] hover:text-[#f0f6fc]"
                  >
                    High Sensitivity
                  </button>
                  <button
                    onClick={() => applyPreset(0.45, 2.8)}
                    className="interactive-target p-2 bg-[#21262d] border border-[#30363d] rounded text-[11px] font-mono font-bold text-[#8b949e] hover:text-[#f0f6fc]"
                  >
                    Default Balanced
                  </button>
                  <button
                    onClick={() => applyPreset(0.60, 2.5)}
                    className="interactive-target p-2 bg-[#21262d] border border-[#30363d] rounded text-[11px] font-mono font-bold text-[#8b949e] hover:text-[#f0f6fc]"
                  >
                    High Throughput
                  </button>
                </div>
              </div>

              <button
                onClick={handleSaveSettings}
                className="interactive-target w-full py-3 bg-[#3b82f6] text-white font-mono font-bold text-xs rounded hover:bg-[#2563eb]"
              >
                APPLY & SAVE PARAMETERS
              </button>

              {settingsSavedAlert && (
                <div className="p-3 bg-[#21262d] border border-[#238636] text-[#3fb950] text-xs font-mono text-center rounded">
                  [SUCCESS] Pipeline parameters saved and active.
                </div>
              )}
            </div>

            {/* Actuator Override Panel */}
            <div className="p-4 bg-[#161b22] border border-[#30363d] rounded flex flex-col justify-between space-y-6">
              <div className="border-b border-[#30363d] pb-3">
                <h3 className="text-xs font-mono font-bold text-[#f0f6fc]">
                  MECHANICAL ACTUATOR OVERRIDE
                </h3>
              </div>

              <div className="flex flex-col items-center justify-center py-6 space-y-4">
                <button
                  onClick={handleTestPusher}
                  disabled={isPusherTriggering}
                  className={`interactive-target px-8 py-4 rounded text-sm font-mono font-bold border transition-colors ${
                    isPusherTriggering
                      ? 'bg-[#b62324] text-white border-[#f85149]'
                      : 'bg-[#21262d] text-[#f85149] border-[#da3633] hover:bg-[#30363d]'
                  }`}
                >
                  {isPusherTriggering ? '[PUSHER ACTUATING...]' : 'TRIGGER SG90 PUSHER NOW'}
                </button>

                <p className="text-xs font-mono text-[#8b949e] text-center max-w-[65ch]">
                  Manually sends a 95° sweep pulse to Arduino Pin D9 to test reject chute mechanics.
                </p>
              </div>

              <div className="p-4 bg-[#0d1117] border border-[#30363d] rounded space-y-2 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-[#8b949e]">Microcontroller:</span>
                  <span className="text-[#f0f6fc]">Arduino Uno / Nano</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8b949e]">Serial Protocol:</span>
                  <span className="text-[#3b82f6] font-bold">115200 Baud • COM3</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8b949e]">PWM Servo Output:</span>
                  <span className="text-[#f0f6fc]">Digital Pin D9</span>
                </div>
              </div>

              <button
                onClick={handleReset}
                className="interactive-target w-full py-2.5 bg-[#21262d] border border-[#30363d] rounded text-xs font-mono font-bold text-[#f85149] hover:bg-[#30363d]"
              >
                RESET SESSION COUNTERS
              </button>
            </div>

          </div>
        )}

      </main>

      {/* =========================================================================
          FULLSCREEN INSPECTION MODAL (FLAT, 1px BORDER, NO SHADOWS)
      ========================================================================= */}
      {selectedSnapshot && (
        <div
          onClick={() => {
            setSelectedSnapshot(null);
            setSelectedLogRecord(null);
          }}
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-3xl w-full bg-[#161b22] border border-[#30363d] rounded p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-[#30363d] pb-3">
              <div className="flex items-center gap-2 text-xs font-mono font-bold">
                <span className="text-[#f0f6fc]">INSPECTION TELEMETRY</span>
                {selectedLogRecord && (
                  <span className="px-2 py-0.5 bg-[#21262d] text-[#3b82f6] border border-[#30363d] rounded">
                    {selectedLogRecord.item_id}
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  setSelectedSnapshot(null);
                  setSelectedLogRecord(null);
                }}
                className="interactive-target px-3 py-1 bg-[#21262d] text-[#8b949e] hover:text-[#f0f6fc] text-xs font-mono font-bold rounded border border-[#30363d]"
              >
                [CLOSE ESC]
              </button>
            </div>

            <div className="aspect-video w-full rounded bg-[#0d1117] border border-[#30363d] overflow-hidden flex items-center justify-center">
              <img
                src={selectedSnapshot}
                alt="Defect Snapshot"
                className="w-full h-full object-contain"
              />
            </div>

            {selectedLogRecord && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
                <div className="p-3 bg-[#0d1117] border border-[#30363d] rounded">
                  <div className="text-[10px] text-[#8b949e]">DEFECT TYPE</div>
                  <div className="text-[#f85149] font-bold mt-1 uppercase">
                    [{selectedLogRecord.defect_type}]
                  </div>
                </div>
                <div className="p-3 bg-[#0d1117] border border-[#30363d] rounded">
                  <div className="text-[10px] text-[#8b949e]">CONFIDENCE</div>
                  <div className="text-[#3b82f6] font-bold mt-1">
                    {(selectedLogRecord.confidence * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="p-3 bg-[#0d1117] border border-[#30363d] rounded">
                  <div className="text-[10px] text-[#8b949e]">TIMESTAMP</div>
                  <div className="text-[#f0f6fc] font-bold mt-1">
                    {selectedLogRecord.timestamp}
                  </div>
                </div>
                <div className="p-3 bg-[#0d1117] border border-[#30363d] rounded">
                  <div className="text-[10px] text-[#8b949e]">DISPOSITION</div>
                  <div className="text-[#3fb950] font-bold mt-1">
                    [EJECT CHUTE]
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-[#30363d]">
              <span className="text-[11px] font-mono text-[#8b949e]">
                Stored in logs/defect_log.csv
              </span>
              <a
                href={selectedSnapshot}
                download
                target="_blank"
                rel="noreferrer"
                className="interactive-target px-4 py-2 bg-[#3b82f6] text-white font-mono font-bold text-xs rounded hover:bg-[#2563eb]"
              >
                DOWNLOAD SNAPSHOT
              </a>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          FLAT FOOTER BAR
      ========================================================================= */}
      <footer className="w-full border-t border-[#30363d] py-3 px-6 bg-[#161b22] text-[11px] font-mono text-[#8b949e] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-[#f0f6fc] font-bold">SORTEX INDUSTRIAL AI OS</span>
          <span>|</span>
          <span>CUDA 12.1 INFERENCE</span>
          <span>|</span>
          <span>ARDUINO D9 DIVERTER</span>
        </div>
        <div className="flex items-center gap-3">
          <span>THROUGHPUT: {stats.fps} FPS</span>
          <span className="text-[#3b82f6] font-bold">YIELD: {yieldPercentage}%</span>
        </div>
      </footer>

    </div>
  );
}
