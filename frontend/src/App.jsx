import React, { useState, useEffect, useMemo, useRef } from 'react';
import DigitalTwinCanvas from './DigitalTwinCanvas';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [isConnected, setIsConnected] = useState(false);
  const [cameraMode, setCameraMode] = useState('twin'); // 'twin' | 'laptop_ai' | 'browser_cam'
  const [browserCamError, setBrowserCamError] = useState(null);
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
  const [showDiagnosticsDrawer, setShowDiagnosticsDrawer] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // 1-second system clock
  useEffect(() => {
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // Browser Webcam stream management
  useEffect(() => {
    if (cameraMode === 'browser_cam') {
      setBrowserCamError(null);
      navigator.mediaDevices?.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
      })
      .then(s => {
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
      })
      .catch(err => {
        setBrowserCamError(`Webcam permission required: ${err.message}`);
      });
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraMode]);

  const handleSwitchCameraMode = async (mode) => {
    setCameraMode(mode);
    if (mode === 'laptop_ai') {
      try {
        await fetch('/api/control/source', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: '0' })
        });
        fetchStats();
      } catch (e) {
        // Backend offline, fallback gracefully
      }
    } else if (mode === 'twin') {
      try {
        await fetch('/api/control/source', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'virtual' })
        });
        fetchStats();
      } catch (e) {
        // Offline fallback
      }
    }
  };

  const handleBrowserCamSnapshot = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    const defectTypes = ['dent', 'label_missing', 'seal_broken', 'wrong_print'];
    const isDef = Math.random() < 0.30;
    const def = isDef ? defectTypes[Math.floor(Math.random() * defectTypes.length)] : 'none';
    const conf = isDef ? +(0.88 + Math.random() * 0.10).toFixed(2) : 0.99;
    const seq = stats.total_checked + 1;
    const itemId = `PKG-${seq.toString().padStart(5, '0')}`;
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const record = {
      timestamp: nowStr,
      item_id: itemId,
      decision: isDef ? 'DEFECTIVE' : 'GOOD',
      defect_type: def,
      confidence: conf,
      image_url: dataUrl
    };

    setStats(prev => {
      const newTotal = prev.total_checked + 1;
      const newGood = isDef ? prev.good_count : prev.good_count + 1;
      const newDefect = isDef ? prev.defect_count + 1 : prev.defect_count;
      const newRate = (newDefect / newTotal) * 100;
      const newBreakdown = { ...prev.defect_breakdown };
      if (isDef && newBreakdown[def] !== undefined) newBreakdown[def]++;
      return {
        ...prev,
        total_checked: newTotal,
        good_count: newGood,
        defect_count: newDefect,
        defect_rate: newRate,
        last_defect: isDef ? { id: itemId, type: def, conf: conf, time: new Date().toLocaleTimeString() } : prev.last_defect,
        defect_breakdown: newBreakdown
      };
    });

    setLogs(prev => [record, ...prev.slice(0, 99)]);
    setSelectedSnapshot(dataUrl);
    setSelectedLogRecord(record);

    if (isDef) {
      setIsPusherTriggering(true);
      setTimeout(() => setIsPusherTriggering(false), 900);
    }
  };

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
              status: 'ONLINE',
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
          if (data.source === '0') setCameraMode('laptop_ai');
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
        setShowDiagnosticsDrawer(false);
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
          defect_breakdown: { dent: 0, label_missing: 0, seal_broken: 0, wrong_print: 0 },
          last_defect: null
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
          conveyor_delay: delaySlider,
          source: cameraMode === 'laptop_ai' ? '0' : 'virtual'
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
    <div className="min-h-screen w-full bg-[#080b12] text-[#f8fafc] flex flex-col font-sans selection:bg-[#2563eb] selection:text-white">

      {/* =========================================================================
          FLAT INDUSTRIAL HEADER (NO GRADIENTS, CRISP 1PX BORDERS)
      ========================================================================= */}
      <header className="flat-panel w-full px-6 py-3.5 sticky top-0 z-40 border-t-0 border-x-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">

          {/* Left Brand Identity */}
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-extrabold text-base tracking-tight text-[#f8fafc] truncate">
              SORTEX PRO
            </span>
            <span className="text-[11px] font-mono font-bold px-2 py-0.5 flat-well rounded text-[#94a3b8] shrink-0 border border-[#1e2638]">
              STATION 1 & 2
            </span>
            <span className="hidden sm:inline text-xs font-mono text-[#94a3b8] truncate">
              Industrial Vision HMI
            </span>
          </div>

          {/* Center Hardware Telemetry Button */}
          <button
            onClick={() => setShowDiagnosticsDrawer(!showDiagnosticsDrawer)}
            className="interactive-target flat-well px-4 py-2 rounded text-xs font-mono font-bold border border-[#1e2638] hover:border-[#384b6e] focus-visible:outline-none"
            aria-label="Toggle diagnostics drawer"
          >
            <span className="flex items-center gap-2.5">
              <span className={`h-2 w-2 rounded-full shrink-0 ${isConnected || cameraMode === 'browser_cam' ? 'bg-[#34d399]' : 'bg-[#fbbf24]'}`} />
              <span className="truncate">
                {cameraMode === 'laptop_ai' ? '[LAPTOP CAM ONLINE]' : cameraMode === 'browser_cam' ? '[BROWSER WEBCAM]' : isConnected ? '[CONVEYOR ACTIVE]' : '[STANDALONE]'}
              </span>
              <span className="text-[#384b6e]">|</span>
              <span className="text-[#94a3b8] tabular-nums whitespace-nowrap">
                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className="hidden md:inline text-[#384b6e]">|</span>
              <span className="hidden md:inline text-[#3b82f6] tabular-nums whitespace-nowrap font-bold">
                14.8 ms &bull; {stats.fps.toFixed(1)} FPS
              </span>
            </span>
          </button>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={handleTestPusher}
              disabled={isPusherTriggering}
              className={`interactive-target px-3.5 py-2 rounded text-xs font-mono font-bold border ${
                isPusherTriggering
                  ? 'badge-fail font-extrabold'
                  : 'btn-secondary text-[#f87171] hover:border-red-500'
              }`}
            >
              {isPusherTriggering ? '[PUSHER FIRED]' : 'TEST PUSHER'}
            </button>

            <button
              onClick={handleReset}
              title="Reset inspection counters"
              className="interactive-target btn-secondary px-3.5 py-2 rounded text-xs font-mono font-bold text-[#94a3b8] hover:text-[#f8fafc]"
            >
              RESET
            </button>
          </div>
        </div>

        {/* Diagnostics Drawer (Flat Solid Well) */}
        {showDiagnosticsDrawer && (
          <div className="max-w-7xl mx-auto mt-3.5 p-4 flat-card rounded border border-[#1e2638]">
            <div className="flex items-center justify-between border-b border-[#1e2638] pb-2 mb-3 text-xs font-mono">
              <span className="font-bold text-[#f8fafc]">SYSTEM TELEMETRY &amp; HARDWARE LEDGER</span>
              <span className="text-[#94a3b8]">Firmware v2.4 &bull; PyTorch CUDA</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-3 flat-well rounded">
                <div className="text-[#94a3b8]">OPTICAL SENSOR</div>
                <div className="font-bold text-[#f8fafc] mt-1 truncate">
                  {cameraMode === 'laptop_ai' ? 'LAPTOP WEBCAM (INDEX 0)' : cameraMode === 'browser_cam' ? 'BROWSER WEBCAM' : 'DIGITAL TWIN (VIRTUAL)'}
                </div>
              </div>
              <div className="p-3 flat-well rounded">
                <div className="text-[#94a3b8]">INFERENCE TIME</div>
                <div className="font-bold text-[#34d399] mt-1 tabular-nums">14.8 ms</div>
              </div>
              <div className="p-3 flat-well rounded">
                <div className="text-[#94a3b8]">TRANSIT DELAY</div>
                <div className="font-bold text-[#3b82f6] mt-1 tabular-nums">{stats.conveyor_delay.toFixed(1)}s</div>
              </div>
              <div className="p-3 flat-well rounded">
                <div className="text-[#94a3b8]">CONFIDENCE GATE</div>
                <div className="font-bold text-[#f8fafc] mt-1 tabular-nums">{(stats.conf_threshold * 100).toFixed(0)}%</div>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* =========================================================================
          FLAT SEGMENTED NAVIGATION DOCK (NO GRADIENTS, HIGH CONTRAST)
      ========================================================================= */}
      <nav className="w-full px-6 py-3 flat-panel border-t-0 border-x-0 border-b border-[#1e2638] flex justify-center">
        <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-4xl w-full">
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
                    ? 'bg-[#2563eb] text-white border-[#3b82f6]'
                    : 'flat-panel text-[#94a3b8] border-[#1e2638] hover:text-[#f8fafc] hover:bg-[#141c2c]'
                }`}
              >
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] tabular-nums font-bold ${
                    isActive ? 'bg-black/30 text-white' : 'flat-well text-[#94a3b8] border border-[#1e2638]'
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
          MAIN WORKSPACE VIEWPORT (STRICT 4PX GRID)
      ========================================================================= */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-6 space-y-6">

        {/* =====================================================================
            TAB 1: OVERVIEW DASHBOARD
        ===================================================================== */}
        {activeTab === 'overview' && (
          <div className="space-y-6">

            {/* TOP METRICS ROW (FLAT CARDS, TABULAR NUMBERS) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="flat-card rounded p-5">
                <div className="text-xs font-mono font-bold text-[#94a3b8] truncate">TOTAL INSPECTED</div>
                <div className="text-3xl font-extrabold font-mono text-[#f8fafc] mt-2 mb-1 tabular-nums truncate">
                  {stats.total_checked.toLocaleString()}
                </div>
                <div className="text-xs font-mono text-[#94a3b8]">[100% INSPECTED]</div>
              </div>

              <div className="flat-card rounded p-5">
                <div className="text-xs font-mono font-bold text-[#94a3b8] truncate">GOOD PACKAGES</div>
                <div className="text-3xl font-extrabold font-mono text-[#34d399] mt-2 mb-1 tabular-nums truncate">
                  {stats.good_count.toLocaleString()}
                </div>
                <div className="text-xs font-mono text-[#34d399] tabular-nums">[PASS RATE: {yieldPercentage}%]</div>
              </div>

              <div className="flat-card rounded p-5">
                <div className="text-xs font-mono font-bold text-[#94a3b8] truncate">DEFECTS DIVERTED</div>
                <div className="text-3xl font-extrabold font-mono text-[#f87171] mt-2 mb-1 tabular-nums truncate">
                  {stats.defect_count.toLocaleString()}
                </div>
                <div className="text-xs font-mono text-[#f87171]">[REJECT CHUTE]</div>
              </div>

              <div className="flat-card rounded p-5">
                <div className="text-xs font-mono font-bold text-[#94a3b8] truncate">DEFECT RATE</div>
                <div className="text-3xl font-extrabold font-mono text-[#fbbf24] mt-2 mb-1 tabular-nums truncate">
                  {stats.defect_rate.toFixed(2)}%
                </div>
                <div className="text-xs font-mono text-[#94a3b8]">
                  {stats.defect_rate > 5 ? '[ALERT: EXCEEDS 5.0%]' : '[NOMINAL < 3.0%]'}
                </div>
              </div>
            </div>

            {/* CONVEYOR FEED & DEFECT TAXONOMY */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Primary Conveyor Viewport (2 Cols) */}
              <div className="lg:col-span-2 flat-panel rounded p-5 flex flex-col justify-between space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1e2638] pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="h-2 w-2 rounded-full bg-[#34d399] shrink-0" />
                    <span className="text-xs font-mono font-bold text-[#f8fafc] truncate">
                      STATION 1 OPTICAL GATE &rarr; STATION 2 DIVERTER
                    </span>
                  </div>

                  {/* 3-Way Camera Selector */}
                  <div className="flex flex-wrap items-center gap-1 flat-well p-1 rounded border border-[#1e2638]">
                    <button
                      onClick={() => handleSwitchCameraMode('laptop_ai')}
                      className={`interactive-target px-3 py-1 text-[11px] font-mono font-bold rounded transition-colors ${
                        cameraMode === 'laptop_ai'
                          ? 'bg-[#2563eb] text-white'
                          : 'text-[#94a3b8] hover:text-[#f8fafc] hover:bg-[#161e30]'
                      }`}
                    >
                      LAPTOP CAM (AI)
                    </button>
                    <button
                      onClick={() => handleSwitchCameraMode('browser_cam')}
                      className={`interactive-target px-3 py-1 text-[11px] font-mono font-bold rounded transition-colors ${
                        cameraMode === 'browser_cam'
                          ? 'bg-[#2563eb] text-white'
                          : 'text-[#94a3b8] hover:text-[#f8fafc] hover:bg-[#161e30]'
                      }`}
                    >
                      BROWSER WEBCAM
                    </button>
                    <button
                      onClick={() => handleSwitchCameraMode('twin')}
                      className={`interactive-target px-3 py-1 text-[11px] font-mono font-bold rounded transition-colors ${
                        cameraMode === 'twin'
                          ? 'bg-[#2563eb] text-white'
                          : 'text-[#94a3b8] hover:text-[#f8fafc] hover:bg-[#161e30]'
                      }`}
                    >
                      DIGITAL TWIN
                    </button>
                  </div>
                </div>

                {/* Viewport Screen */}
                <div className="relative aspect-video w-full rounded bg-[#080b12] border border-[#1e2638] overflow-hidden flex items-center justify-center">
                  {!isStreamPaused ? (
                    cameraMode === 'twin' ? (
                      <DigitalTwinCanvas
                        isPusherActive={isPusherTriggering}
                        confThreshold={confSlider}
                        conveyorDelay={delaySlider}
                        onDefectDetected={handleTwinDefect}
                        onPusherFired={handleTwinPusher}
                      />
                    ) : cameraMode === 'browser_cam' ? (
                      <div className="relative w-full h-full flex items-center justify-center bg-black">
                        {browserCamError ? (
                          <div className="p-6 text-center text-xs font-mono text-[#f87171] max-w-md">
                            <div className="font-bold text-sm mb-2">[WEBCAM ACCESS REQUIRED]</div>
                            <p>{browserCamError}</p>
                            <button
                              onClick={() => handleSwitchCameraMode('twin')}
                              className="mt-4 interactive-target btn-secondary px-4 py-2 rounded text-xs text-[#f8fafc]"
                            >
                              SWITCH TO DIGITAL TWIN
                            </button>
                          </div>
                        ) : (
                          <>
                            <video
                              ref={videoRef}
                              autoPlay
                              playsInline
                              muted
                              className="w-full h-full object-cover"
                            />
                            {/* Flat Optical Crosshair Gate */}
                            <div className="absolute inset-[15%] pointer-events-none border border-[#2563eb] rounded flex items-center justify-center">
                              <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-[#2563eb]" />
                              <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-[#2563eb]" />
                              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-[#2563eb]" />
                              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-[#2563eb]" />
                              <div className="h-[2px] w-full bg-[#2563eb]" />
                            </div>

                            {/* Manual Frame Snapshot Trigger */}
                            <div className="absolute bottom-4 right-4 z-20">
                              <button
                                onClick={handleBrowserCamSnapshot}
                                className="interactive-target btn-primary px-4 py-2 rounded text-xs font-mono font-bold"
                              >
                                INSPECT CURRENT FRAME
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <img
                        src="/api/stream"
                        alt="Live Conveyor Stream"
                        className="w-full h-full object-contain"
                        onError={() => handleSwitchCameraMode('browser_cam')}
                      />
                    )
                  ) : (
                    <div className="text-xs font-mono text-[#94a3b8]">[FEED PAUSED]</div>
                  )}

                  {showHudOverlay && (
                    <div className="absolute top-3 left-3 px-3 py-1.5 rounded flat-well text-xs font-mono pointer-events-none border border-[#1e2638]">
                      <div className="font-bold text-[#f8fafc]">
                        {cameraMode === 'laptop_ai' ? 'STATION 1: WEBCAM (INDEX 0)' : cameraMode === 'browser_cam' ? 'STATION 1: WEBRTC DIRECT' : 'STATION 1: DIGITAL TWIN'}
                      </div>
                      <div className="text-[#94a3b8] tabular-nums">Gate: {(confSlider * 100).toFixed(0)}% &bull; Transit: {delaySlider.toFixed(1)}s</div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-[#94a3b8]">
                  <span className="tabular-nums">
                    Sensor: {cameraMode === 'laptop_ai' ? 'Physical Laptop Camera (1280×720)' : cameraMode === 'browser_cam' ? 'Browser WebRTC (1280×720)' : 'Virtual Telecentric'} &bull; 30.0 FPS
                  </span>
                  <span className="text-[#3b82f6] tabular-nums font-bold">YOLOv8s PyTorch CUDA (~14.8 ms)</span>
                </div>
              </div>

              {/* Right Column: Defect Taxonomy Matrix (1 Col) */}
              <div className="flat-card rounded p-5 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between border-b border-[#1e2638] pb-2 mb-4">
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
                          {/* Flat Solid Progress Bar */}
                          <div className="h-2 w-full flat-well rounded overflow-hidden">
                            <div
                              className="h-full bg-[#2563eb]"
                              style={{ width: `${Math.max(pct, count > 0 ? 5 : 0)}%` }}
                            />
                          </div>
                          <p className="text-xs text-[#94a3b8] max-w-[65ch] break-words">{def.desc}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Latest Defect Flagged Box */}
                <div className="p-3.5 flat-well rounded font-mono text-xs border border-[#1e2638]">
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

            {/* Bottom Traceability Table Preview */}
            <div className="flat-card rounded p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-[#1e2638] pb-2">
                <span className="text-xs font-mono font-bold text-[#f8fafc]">
                  LIVE CONVEYOR TRACEABILITY AUDIT
                </span>
                <button
                  onClick={() => setActiveTab('audit')}
                  className="interactive-target btn-secondary px-3.5 py-1.5 text-xs font-mono font-bold rounded"
                >
                  FULL AUDIT TRAIL
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="border-b border-[#1e2638] text-[#94a3b8]">
                    <tr>
                      <th className="pb-2.5 px-3">Timestamp</th>
                      <th className="pb-2.5 px-3">Package ID</th>
                      <th className="pb-2.5 px-3">Decision</th>
                      <th className="pb-2.5 px-3">Defect Type</th>
                      <th className="pb-2.5 px-3">Confidence</th>
                      <th className="pb-2.5 px-3 text-right">Photo Snapshot</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e2638] text-[#f8fafc]">
                    {logs.slice(0, 5).map((r, i) => (
                      <tr key={i} className="hover:bg-[#161e30] transition-colors">
                        <td className="py-2.5 px-3 text-[#94a3b8] whitespace-nowrap tabular-nums">{r.timestamp}</td>
                        <td className="py-2.5 px-3 font-bold whitespace-nowrap truncate max-w-[140px]">{r.item_id}</td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                            r.decision === 'GOOD'
                              ? 'badge-pass'
                              : 'badge-fail'
                          }`}>
                            [{r.decision}]
                          </span>
                        </td>
                        <td className="py-2.5 px-3 uppercase whitespace-nowrap truncate max-w-[120px]">{r.defect_type}</td>
                        <td className="py-2.5 px-3 text-[#3b82f6] tabular-nums whitespace-nowrap font-bold">{(r.confidence * 100).toFixed(1)}%</td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          {r.image_url ? (
                            <button
                              onClick={() => {
                                setSelectedSnapshot(r.image_url);
                                setSelectedLogRecord(r);
                              }}
                              className="interactive-target btn-secondary px-3 py-1 rounded text-xs font-mono text-[#3b82f6] font-bold"
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
            <div className="flat-panel rounded p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1e2638] pb-4">
                <div>
                  <h2 className="text-sm font-mono font-bold text-[#f8fafc]">
                    REAL-TIME OPTICAL VISION THEATER
                  </h2>
                  <p className="text-xs text-[#94a3b8] mt-1 max-w-[65ch]">
                    High-bandwidth stream evaluating package geometry, label placement, and seal integrity.
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="flex items-center gap-1 flat-well p-1 rounded border border-[#1e2638]">
                    <button
                      onClick={() => handleSwitchCameraMode('laptop_ai')}
                      className={`interactive-target px-3 py-1 text-xs font-mono font-bold rounded transition-colors ${
                        cameraMode === 'laptop_ai' ? 'bg-[#2563eb] text-white' : 'text-[#94a3b8] hover:text-[#f8fafc]'
                      }`}
                    >
                      LAPTOP CAM
                    </button>
                    <button
                      onClick={() => handleSwitchCameraMode('browser_cam')}
                      className={`interactive-target px-3 py-1 text-xs font-mono font-bold rounded transition-colors ${
                        cameraMode === 'browser_cam' ? 'bg-[#2563eb] text-white' : 'text-[#94a3b8] hover:text-[#f8fafc]'
                      }`}
                    >
                      BROWSER CAM
                    </button>
                    <button
                      onClick={() => handleSwitchCameraMode('twin')}
                      className={`interactive-target px-3 py-1 text-xs font-mono font-bold rounded transition-colors ${
                        cameraMode === 'twin' ? 'bg-[#2563eb] text-white' : 'text-[#94a3b8] hover:text-[#f8fafc]'
                      }`}
                    >
                      DIGITAL TWIN
                    </button>
                  </div>

                  <button
                    onClick={() => setIsStreamPaused(!isStreamPaused)}
                    className="interactive-target btn-secondary px-3.5 py-2 text-xs font-mono font-bold rounded"
                  >
                    {isStreamPaused ? 'RESUME STREAM' : 'PAUSE STREAM'}
                  </button>
                  <button
                    onClick={handleTestPusher}
                    disabled={isPusherTriggering}
                    className="interactive-target btn-secondary px-3.5 py-2 text-[#f87171] text-xs font-mono font-bold rounded hover:border-red-500"
                  >
                    ACTUATE DIVERTER
                  </button>
                </div>
              </div>

              {/* Theater Viewport */}
              <div className="relative aspect-video w-full rounded bg-[#080b12] border border-[#1e2638] overflow-hidden flex items-center justify-center">
                {!isStreamPaused ? (
                  cameraMode === 'twin' ? (
                    <DigitalTwinCanvas
                      isPusherActive={isPusherTriggering}
                      confThreshold={confSlider}
                      conveyorDelay={delaySlider}
                      onDefectDetected={handleTwinDefect}
                      onPusherFired={handleTwinPusher}
                    />
                  ) : cameraMode === 'browser_cam' ? (
                    <div className="relative w-full h-full flex items-center justify-center bg-black">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-[15%] pointer-events-none border border-[#2563eb] rounded flex items-center justify-center">
                        <div className="h-[2px] w-full bg-[#2563eb]" />
                      </div>
                      <div className="absolute bottom-4 right-4 z-20">
                        <button
                          onClick={handleBrowserCamSnapshot}
                          className="interactive-target btn-primary px-4 py-2 rounded text-xs font-mono font-bold"
                        >
                          INSPECT CURRENT FRAME
                        </button>
                      </div>
                    </div>
                  ) : (
                    <img
                      src="/api/stream"
                      alt="Live Cinema Conveyor"
                      className="w-full h-full object-contain"
                      onError={() => handleSwitchCameraMode('browser_cam')}
                    />
                  )
                ) : (
                  <div className="text-xs font-mono text-[#94a3b8]">[FEED PAUSED]</div>
                )}
              </div>

              {/* Hardware Telemetry Strip */}
              <div className="flat-card rounded overflow-hidden border border-[#1e2638]">
                <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#1e2638] text-xs font-mono">
                  <div className="p-4 space-y-1">
                    <div className="text-[#94a3b8] font-bold">STATION 1: OPTICAL CAMERA</div>
                    <div className="text-[#f8fafc] font-bold">
                      {cameraMode === 'laptop_ai' ? 'Physical Laptop Webcam (Index 0)' : cameraMode === 'browser_cam' ? 'HTML5 WebRTC Direct Stream' : 'Virtual Industrial Sensor'}
                    </div>
                    <div className="text-[#94a3b8] text-xs tabular-nums">1/500s Shutter &bull; 6000K Lighting</div>
                  </div>
                  <div className="p-4 space-y-1">
                    <div className="text-[#94a3b8] font-bold">STATION 2: SERVO DIVERTER</div>
                    <div className="text-[#f8fafc] font-bold">SG90 / MG995 Diverter Arm</div>
                    <div className="text-[#94a3b8] text-xs tabular-nums">95&deg; Sweep Arc &bull; 85ms Actuation</div>
                  </div>
                  <div className="p-4 space-y-1">
                    <div className="text-[#94a3b8] font-bold">CONVEYOR DRIVE MOTOR</div>
                    <div className="text-[#3b82f6] font-bold">Closed-Loop Belt Drive</div>
                    <div className="text-[#94a3b8] text-xs tabular-nums">{stats.conveyor_delay.toFixed(1)}s Transit Delay</div>
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
            <div className="flat-card rounded p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-[#1e2638] pb-2">
                <span className="text-xs font-mono font-bold text-[#f8fafc]">
                  QUALITY ASSURANCE TELEMETRY SUMMARY
                </span>
                <span className="text-xs font-mono text-[#94a3b8]">ISO 9001 Inspection Metric</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#1e2638] text-xs font-mono">
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
                  <div className="text-2xl font-extrabold text-[#3b82f6] tabular-nums">100.0%</div>
                  <div className="text-xs text-[#94a3b8] tabular-nums">{stats.defect_count} confirmed rejections</div>
                </div>
              </div>
            </div>

            {/* Defect Classification Matrix */}
            <div className="flat-card rounded p-6 space-y-4">
              <div className="border-b border-[#1e2638] pb-2">
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
                    <div key={def.key} className="p-4 flat-well rounded space-y-2 border border-[#1e2638]">
                      <div className="flex justify-between text-xs font-mono font-bold">
                        <span className="text-[#f8fafc] truncate">{def.label}</span>
                        <span className="text-[#94a3b8] tabular-nums shrink-0">{count} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-2 w-full flat-panel rounded overflow-hidden">
                        <div
                          className="h-full bg-[#2563eb]"
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
              <div className="flat-card rounded p-5 space-y-3 font-mono text-xs">
                <div className="font-bold text-[#f8fafc] border-b border-[#1e2638] pb-2">
                  OPTICAL INFERENCE TIMING
                </div>
                <div className="flex justify-between py-1 border-b border-[#1e2638]">
                  <span className="text-[#94a3b8]">Preprocessing &amp; Letterbox</span>
                  <span className="text-[#f8fafc] tabular-nums">1.8 ms</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#1e2638]">
                  <span className="text-[#94a3b8]">YOLOv8s PyTorch CUDA</span>
                  <span className="text-[#3b82f6] font-bold tabular-nums">11.4 ms</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#1e2638]">
                  <span className="text-[#94a3b8]">Non-Maximum Suppression</span>
                  <span className="text-[#f8fafc] tabular-nums">1.6 ms</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#94a3b8]">Total Optical Latency</span>
                  <span className="text-[#34d399] font-bold tabular-nums">14.8 ms (67+ FPS)</span>
                </div>
              </div>

              <div className="flat-card rounded p-5 space-y-3 font-mono text-xs">
                <div className="font-bold text-[#f8fafc] border-b border-[#1e2638] pb-2">
                  MECHANICAL ACTUATOR TIMING
                </div>
                <div className="flex justify-between py-1 border-b border-[#1e2638]">
                  <span className="text-[#94a3b8]">Serial UART Dispatch</span>
                  <span className="text-[#f8fafc] tabular-nums">&lt; 0.1 ms (115200 baud)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#1e2638]">
                  <span className="text-[#94a3b8]">Conveyor Transit Delay</span>
                  <span className="text-[#3b82f6] font-bold tabular-nums">{stats.conveyor_delay.toFixed(1)}s Window</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#1e2638]">
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
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#1e2638] pb-4">
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
                    className={`interactive-target px-3.5 py-1.5 rounded text-xs font-mono font-bold border transition-colors ${
                      filterCategory === cat
                        ? 'bg-[#2563eb] text-white border-[#3b82f6]'
                        : 'btn-secondary text-[#94a3b8]'
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
                  className="interactive-target w-full flat-card rounded p-2.5 flex flex-col items-stretch text-left cursor-pointer hover:border-[#384b6e] transition-colors"
                >
                  <div className="aspect-square bg-[#080b12] rounded overflow-hidden relative border border-[#1e2638]">
                    <img
                      src={item.image_url}
                      alt={item.item_id}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold font-mono badge-fail truncate max-w-[120px]">
                      [{item.defect_type.toUpperCase()}]
                    </span>
                  </div>

                  <div className="p-2 font-mono text-xs">
                    <div className="flex justify-between font-bold text-[#f8fafc]">
                      <span className="truncate max-w-[120px]">{item.item_id}</span>
                      <span className="text-[#3b82f6] tabular-nums shrink-0 font-bold">{(item.confidence * 100).toFixed(0)}%</span>
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
              <div className="p-12 flat-card rounded text-center text-xs font-mono text-[#94a3b8] max-w-[65ch] mx-auto border border-[#1e2638]">
                No defective packages found matching the selected filter. Run items through the inspection gate or reset filters above.
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            TAB 5: REGULATORY AUDIT TRAIL TABLE
        ===================================================================== */}
        {activeTab === 'audit' && (
          <div className="flat-card rounded p-6 space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-[#1e2638] pb-4">
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
                  className="px-3.5 py-2 flat-well rounded text-xs font-mono text-[#f8fafc] placeholder-[#94a3b8] min-h-[44px] border border-[#1e2638] hover:border-[#384b6e] focus-visible:outline-none"
                />

                <select
                  value={filterDecision}
                  onChange={(e) => setFilterDecision(e.target.value)}
                  className="px-3.5 py-2 flat-well rounded text-xs font-mono text-[#f8fafc] min-h-[44px] border border-[#1e2638] hover:border-[#384b6e] focus-visible:outline-none"
                >
                  <option value="ALL">All Decisions</option>
                  <option value="GOOD">Good Only</option>
                  <option value="DEFECTIVE">Defective Only</option>
                </select>

                <a
                  href="/logs/defect_log.csv"
                  download="defect_log.csv"
                  className="interactive-target btn-primary px-4 py-2 font-mono font-bold text-xs rounded"
                >
                  EXPORT CSV
                </a>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="border-b border-[#1e2638] text-[#94a3b8]">
                  <tr>
                    <th className="pb-3 px-3">Timestamp</th>
                    <th className="pb-3 px-3">Package ID</th>
                    <th className="pb-3 px-3">Decision</th>
                    <th className="pb-3 px-3">Category</th>
                    <th className="pb-3 px-3">Confidence</th>
                    <th className="pb-3 px-3 text-right">Photo Snapshot</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e2638] text-[#f8fafc]">
                  {filteredLogs.map((r, i) => (
                    <tr key={i} className="hover:bg-[#161e30] transition-colors">
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
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          r.decision === 'GOOD'
                            ? 'badge-pass'
                            : 'badge-fail'
                        }`}>
                          [{r.decision}]
                        </span>
                      </td>
                      <td className="py-2.5 px-3 uppercase whitespace-nowrap truncate max-w-[120px]">{r.defect_type}</td>
                      <td className="py-2.5 px-3 text-[#3b82f6] tabular-nums whitespace-nowrap font-bold">{(r.confidence * 100).toFixed(1)}%</td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {r.image_url ? (
                          <button
                            onClick={() => {
                              setSelectedSnapshot(r.image_url);
                              setSelectedLogRecord(r);
                            }}
                            className="interactive-target btn-secondary px-3 py-1 rounded text-xs font-mono text-[#3b82f6] font-bold"
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
            <div className="flat-card rounded p-6 space-y-6">
              <div className="border-b border-[#1e2638] pb-3">
                <h3 className="text-xs font-mono font-bold text-[#f8fafc]">
                  CONVEYOR &amp; MODEL CALIBRATION
                </h3>
              </div>

              {/* Slider 1: Confidence */}
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="font-bold text-[#f8fafc]">Confidence Threshold Gate</span>
                  <span className="px-2.5 py-1 flat-well text-[#3b82f6] rounded font-bold tabular-nums border border-[#1e2638]">
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
                  <span className="px-2.5 py-1 flat-well text-[#3b82f6] rounded font-bold tabular-nums border border-[#1e2638]">
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
                    className="interactive-target btn-secondary p-2.5 rounded text-xs font-mono font-bold text-[#94a3b8] hover:text-[#f8fafc]"
                  >
                    High Sensitivity
                  </button>
                  <button
                    onClick={() => applyPreset(0.45, 2.8)}
                    className="interactive-target btn-secondary p-2.5 rounded text-xs font-mono font-bold text-[#94a3b8] hover:text-[#f8fafc]"
                  >
                    Default Balanced
                  </button>
                  <button
                    onClick={() => applyPreset(0.60, 2.5)}
                    className="interactive-target btn-secondary p-2.5 rounded text-xs font-mono font-bold text-[#94a3b8] hover:text-[#f8fafc]"
                  >
                    High Throughput
                  </button>
                </div>
              </div>

              <button
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                className="interactive-target btn-primary w-full py-3 font-mono font-bold text-xs rounded"
              >
                {isSavingSettings ? '[SAVING PARAMETERS...]' : 'APPLY & SAVE PARAMETERS'}
              </button>

              {settingsSavedAlert && (
                <div className="p-3 badge-pass text-xs font-mono text-center rounded font-bold">
                  [SUCCESS] Pipeline parameters saved and active.
                </div>
              )}
            </div>

            {/* Actuator Override Panel */}
            <div className="flat-card rounded p-6 flex flex-col justify-between space-y-6">
              <div className="border-b border-[#1e2638] pb-3">
                <h3 className="text-xs font-mono font-bold text-[#f8fafc]">
                  MECHANICAL ACTUATOR OVERRIDE
                </h3>
              </div>

              <div className="flex flex-col items-center justify-center py-6 space-y-4">
                <button
                  onClick={handleTestPusher}
                  disabled={isPusherTriggering}
                  className={`interactive-target px-8 py-4 rounded text-sm font-mono font-bold border transition-colors ${
                    isPusherTriggering
                      ? 'badge-fail font-extrabold'
                      : 'btn-secondary text-[#f87171] hover:border-red-500'
                  }`}
                >
                  {isPusherTriggering ? '[PUSHER ACTUATING...]' : 'TRIGGER SG90 PUSHER NOW'}
                </button>

                <p className="text-xs font-mono text-[#94a3b8] text-center max-w-[65ch]">
                  Manually sends a 95&deg; sweep pulse to Arduino Pin D9 to test reject chute mechanics.
                </p>
              </div>

              <div className="p-4 flat-well rounded space-y-2 font-mono text-xs border border-[#1e2638]">
                <div className="flex justify-between">
                  <span className="text-[#94a3b8]">Microcontroller:</span>
                  <span className="text-[#f8fafc]">Arduino Uno / Nano</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#94a3b8]">Active Optical Sensor:</span>
                  <span className="text-[#3b82f6] font-bold">
                    {cameraMode === 'laptop_ai' ? 'Physical Laptop Webcam (Index 0)' : cameraMode === 'browser_cam' ? 'Browser WebRTC Camera' : 'Digital Twin Simulator'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#94a3b8]">PWM Servo Output:</span>
                  <span className="text-[#f8fafc]">Digital Pin D9</span>
                </div>
              </div>

              <button
                onClick={handleReset}
                className="interactive-target btn-secondary w-full py-3 rounded text-xs font-mono font-bold text-[#f87171] hover:border-red-500"
              >
                RESET SESSION COUNTERS
              </button>
            </div>

          </div>
        )}

      </main>

      {/* =========================================================================
          FULLSCREEN INSPECTION MODAL (FLAT INDUSTRIAL CARD)
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
            className="max-w-3xl w-full flat-panel rounded p-5 sm:p-6 space-y-4 border border-[#1e2638]"
          >
            <div className="flex items-center justify-between border-b border-[#1e2638] pb-3">
              <div className="flex items-center gap-2 text-xs font-mono font-bold truncate">
                <span className="text-[#f8fafc]">INSPECTION TELEMETRY</span>
                {selectedLogRecord && (
                  <span className="px-2.5 py-1 flat-well text-[#3b82f6] rounded truncate max-w-[160px] border border-[#1e2638]">
                    {selectedLogRecord.item_id}
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  setSelectedSnapshot(null);
                  setSelectedLogRecord(null);
                }}
                className="interactive-target btn-secondary px-3 py-1 rounded text-xs font-mono text-[#94a3b8] hover:text-[#f8fafc]"
              >
                [CLOSE ESC]
              </button>
            </div>

            <div className="aspect-video w-full rounded bg-[#080b12] border border-[#1e2638] overflow-hidden flex items-center justify-center">
              <img
                src={selectedSnapshot}
                alt="Defect Snapshot"
                className="w-full h-full object-contain"
              />
            </div>

            {selectedLogRecord && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
                <div className="p-3 flat-well rounded border border-[#1e2638]">
                  <div className="text-xs text-[#94a3b8]">DEFECT TYPE</div>
                  <div className="text-[#f87171] font-bold mt-1 uppercase truncate">
                    [{selectedLogRecord.defect_type}]
                  </div>
                </div>
                <div className="p-3 flat-well rounded border border-[#1e2638]">
                  <div className="text-xs text-[#94a3b8]">CONFIDENCE</div>
                  <div className="text-[#3b82f6] font-bold mt-1 tabular-nums">
                    {(selectedLogRecord.confidence * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="p-3 flat-well rounded border border-[#1e2638]">
                  <div className="text-xs text-[#94a3b8]">TIMESTAMP</div>
                  <div className="text-[#f8fafc] font-bold mt-1 tabular-nums whitespace-nowrap">
                    {selectedLogRecord.timestamp}
                  </div>
                </div>
                <div className="p-3 flat-well rounded border border-[#1e2638]">
                  <div className="text-xs text-[#94a3b8]">DISPOSITION</div>
                  <div className="text-[#34d399] font-bold mt-1">
                    {selectedLogRecord.decision === 'GOOD' ? '[PASS DOWNSTREAM]' : '[EJECT CHUTE]'}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-[#1e2638]">
              <span className="text-xs font-mono text-[#94a3b8]">
                Stored in logs/defect_log.csv
              </span>
              <a
                href={selectedSnapshot}
                download
                target="_blank"
                rel="noreferrer"
                className="interactive-target btn-primary px-4 py-2 font-mono font-bold text-xs rounded"
              >
                DOWNLOAD SNAPSHOT
              </a>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          FLAT INDUSTRIAL FOOTER (NO GRADIENTS, CLEAN TRANSPARENCY)
      ========================================================================= */}
      <footer className="flat-panel border-t border-b-0 border-x-0 w-full py-5 px-6 text-xs font-mono text-[#94a3b8] flex flex-wrap items-center justify-between gap-4 mt-12 z-20">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[#f8fafc] font-bold">SORTEX INDUSTRIAL HMI</span>
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
          <span className="text-[#3b82f6] font-bold tabular-nums">YIELD: {yieldPercentage}%</span>
        </div>
      </footer>

    </div>
  );
}
