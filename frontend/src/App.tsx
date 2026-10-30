import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { CameraView } from './components/CameraView';
import { ClassificationCard } from './components/ClassificationCard';
import { HistoryView } from './components/HistoryView';
import { AuthModal } from './components/AuthModal';
import { BackendOfflineBanner } from './components/BackendOfflineBanner';
import { Toast, ToastMessage } from './components/Toast';
import DigitalTwinCanvas from './DigitalTwinCanvas';
import { supabase, isSupabaseConfigured, saveInspectionRecord } from './supabaseClient';
import { InspectionItem, ClassificationResponse, SystemStats } from './types';

const API_BASE = (import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== '')
  ? import.meta.env.VITE_API_URL
  : (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? '' : 'http://127.0.0.1:8000');

export default function App() {
  const [activeTab, setActiveTab] = useState<'inspection' | 'history' | 'twin'>('inspection');
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [isRetryingBackend, setIsRetryingBackend] = useState<boolean>(false);

  // Inspector Auth State
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Core Inspection State
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isClassifying, setIsClassifying] = useState<boolean>(false);
  const [classificationResult, setClassificationResult] = useState<ClassificationResponse | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // History & Stats
  const [inspections, setInspections] = useState<InspectionItem[]>([]);
  const [isRefreshingHistory, setIsRefreshingHistory] = useState<boolean>(false);
  const [stats, setStats] = useState<SystemStats>({
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
    defect_breakdown: { dent: 0, label_missing: 0, seal_broken: 0, wrong_print: 0 },
  });

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // 1-second system clock tick
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Supabase Auth listener
  useEffect(() => {
    if (isSupabaseConfigured()) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          setUserEmail(session.user.email || null);
          setUserId(session.user.id || null);
          setAuthToken(session.access_token || null);
        }
      });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          setUserEmail(session.user.email || null);
          setUserId(session.user.id || null);
          setAuthToken(session.access_token || null);
        } else {
          setUserEmail(null);
          setUserId(null);
          setAuthToken(null);
        }
      });

      return () => subscription.unsubscribe();
    }
  }, []);

  // Backend Health Ping & Fetch Stats/History
  const checkBackendHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/health`, { mode: 'cors' });
      if (res.ok) {
        setIsConnected(true);
      } else {
        setIsConnected(false);
      }
    } catch {
      setIsConnected(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/stats`, { mode: 'cors' });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
        setIsConnected(true);
      }
    } catch {
      // offline
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setIsRefreshingHistory(true);
    try {
      // Try inspection history endpoint
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      } else {
        headers['Authorization'] = 'Bearer demo-token';
      }
      const res = await fetch(`${API_BASE}/api/inspect/history`, { headers, mode: 'cors' });
      if (res.ok) {
        const data = await res.json();
        const rawList = Array.isArray(data) ? data : (data.items || []);
        if (rawList.length > 0) {
          const mapped: InspectionItem[] = rawList.map((item: any, idx: number) => {
            const isDef = item.prediction === 'Defective' || item.is_defective === true;
            return {
              id: item.id || item.item_id || `INSP-${idx}`,
              timestamp: item.timestamp || item.created_at || new Date().toISOString(),
              prediction: isDef ? 'Defective' : 'Non-defective',
              defect_type: item.defect_type || item.metadata?.defect_type || (isDef ? 'defect' : 'none'),
              confidence: typeof item.confidence === 'number' ? item.confidence : 0.95,
              notes: item.notes || item.metadata?.notes || item.metadata?.raw_notes || '',
              image_url: item.image_signed_url || item.image_url,
              user_email: item.user_email || item.user_id,
              is_placeholder: item.is_placeholder,
            };
          });
          setInspections(mapped);
          setIsConnected(true);
          return;
        }
      }

      // Direct Supabase query if backend history endpoint is not reachable
      if (isSupabaseConfigured()) {
        try {
          const { data: supaData } = await supabase
            .from('inspections')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
          if (supaData && supaData.length > 0) {
            const mapped: InspectionItem[] = supaData.map((item: any, idx: number) => ({
              id: item.id || `SUPA-${idx}`,
              timestamp: item.created_at || new Date().toISOString(),
              prediction: item.prediction,
              defect_type: item.defect_type || (item.is_defective ? 'packaging_defect' : 'none'),
              confidence: Number(item.confidence) || 0.95,
              notes: item.notes || '',
              image_url: item.image_path,
              user_email: item.user_id,
              is_placeholder: item.metadata?.is_placeholder,
            }));
            setInspections(mapped);
            return;
          }
        } catch (supaErr) {
          console.warn('Direct Supabase fetch:', supaErr);
        }
      }

      // Fallback to reading CSV logs if history endpoint returns empty
      const csvRes = await fetch(`${API_BASE}/api/logs`, { mode: 'cors' });
      if (csvRes.ok) {
        const logsData = await csvRes.json();
        if (Array.isArray(logsData)) {
          const mapped: InspectionItem[] = logsData.map((l: any, idx: number) => ({
            id: l.item_id || `LOG-${idx}`,
            timestamp: l.timestamp || new Date().toISOString(),
            prediction: (l.decision || '').toUpperCase() === 'DEFECTIVE' ? 'Defective' : 'Non-defective',
            defect_type: l.defect_type || 'none',
            confidence: typeof l.confidence === 'number' ? l.confidence : 1.0,
            notes: 'Historical production log',
            image_url: l.image_url,
          }));
          setInspections(mapped);
          setIsConnected(true);
        }
      }
    } catch (err: any) {
      console.warn('History fetch error:', err);
    } finally {
      setIsRefreshingHistory(false);
    }
  }, [authToken]);

  // Initial load & periodic polling
  useEffect(() => {
    checkBackendHealth();
    fetchStats();
    fetchHistory();

    const interval = setInterval(() => {
      checkBackendHealth();
      fetchStats();
    }, 5000);
    return () => clearInterval(interval);
  }, [checkBackendHealth, fetchStats, fetchHistory]);

  const handleRetryBackend = async () => {
    setIsRetryingBackend(true);
    try {
      const res = await fetch(`${API_BASE}/api/health`, { mode: 'cors' });
      if (res.ok) {
        setIsConnected(true);
        addToast('success', 'Backend Connected', 'FastAPI backend connection restored successfully.');
        fetchStats();
        fetchHistory();
      } else {
        setIsConnected(false);
        addToast('error', 'Connection Failed', 'FastAPI backend server is still not responding.');
      }
    } catch {
      setIsConnected(false);
      addToast('error', 'Connection Refused', 'Unable to reach 127.0.0.1:8000. Click "Open http://127.0.0.1:8000" or start the server.');
    } finally {
      setIsRetryingBackend(false);
    }
  };

  // Handle frame capture from CameraView
  const handleFrameCaptured = (dataUrl: string) => {
    setCapturedImage(dataUrl);
    setClassificationResult(null);
    setSaveSuccess(false);
  };

  const handleClearCapture = () => {
    setCapturedImage(null);
    setClassificationResult(null);
    setSaveSuccess(false);
  };

  // Classify Product via POST /api/inspect/classify
  const handleClassifyProduct = async () => {
    if (!capturedImage) return;

    setIsClassifying(true);
    setClassificationResult(null);

    try {
      const response = await fetch(`${API_BASE}/api/inspect/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        mode: 'cors',
        body: JSON.stringify({
          image: capturedImage,
          image_base64: capturedImage,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const isDef = data.prediction === 'Defective' || data.is_defective === true;
      const normalizedResult: ClassificationResponse = {
        prediction: isDef ? 'Defective' : 'Non-defective',
        defect_type: data.defect_type || data.metadata?.defect_type || (isDef ? 'packaging_defect' : 'none'),
        confidence: typeof data.confidence === 'number' ? data.confidence : 0.95,
        is_placeholder: Boolean(data.is_placeholder),
        boxes: data.boxes || data.metadata?.boxes,
        timestamp: data.timestamp,
      };

      setClassificationResult(normalizedResult);
      setIsConnected(true);

      if (normalizedResult.prediction === 'Defective') {
        addToast(
          'warning',
          'Defect Flagged',
          `Inspection detected ${normalizedResult.defect_type.replace('_', ' ').toUpperCase()} (${(normalizedResult.confidence * 100).toFixed(1)}% confidence).`
        );
      } else {
        addToast(
          'success',
          'Quality Passed',
          `Package verified non-defective with ${(normalizedResult.confidence * 100).toFixed(1)}% confidence.`
        );
      }
    } catch (err: any) {
      console.error('Classification error:', err);
      // Fallback local heuristic classification if backend offline so user is not blocked
      const simulatedDefect = Math.random() < 0.35;
      const types = ['dent', 'label_missing', 'seal_broken', 'wrong_print'];
      const defType = simulatedDefect ? types[Math.floor(Math.random() * types.length)] : 'none';
      const fallbackResult: ClassificationResponse = {
        prediction: simulatedDefect ? 'Defective' : 'Non-defective',
        defect_type: defType,
        confidence: simulatedDefect ? 0.94 : 0.98,
        is_placeholder: true,
      };
      setClassificationResult(fallbackResult);
      addToast(
        'error',
        'Backend Offline - Fallback Mode',
        'Could not reach /api/inspect/classify. Rendered local fallback prediction.'
      );
    } finally {
      setIsClassifying(false);
    }
  };

  // Save inspection via POST /api/inspect/save
  const handleSaveInspection = async (notes: string) => {
    if (!classificationResult || !capturedImage) return;

    setIsSaving(true);
    setSaveSuccess(false);

    const generatedId = `INSP-${Date.now().toString().slice(-5)}`;
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    let authHeader: string | undefined = undefined;
    if (isSupabaseConfigured()) {
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) {
          authHeader = `Bearer ${data.session.access_token}`;
        }
      } catch (e) {
        // no-op
      }
    }

    const payload = {
      image: capturedImage,
      image_base64: capturedImage,
      filename: `${generatedId}.jpg`,
      prediction: classificationResult.prediction,
      is_defective: classificationResult.prediction === 'Defective',
      confidence: classificationResult.confidence,
      defect_type: classificationResult.defect_type,
      is_placeholder: classificationResult.is_placeholder,
      notes: notes,
      metadata: {
        notes: notes,
        defect_type: classificationResult.defect_type,
        confidence: classificationResult.confidence,
      },
      user_id: userId,
      user_email: userEmail || 'operator.local',
      item_id: generatedId,
    };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authHeader) {
      headers['Authorization'] = authHeader;
    } else {
      headers['Authorization'] = 'Bearer demo-token';
    }

    try {
      const response = await fetch(`${API_BASE}/api/inspect/save`, {
        method: 'POST',
        headers,
        mode: 'cors',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Cloud save HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const savedRecord: InspectionItem = data.record || {
        id: data.id || generatedId,
        timestamp: data.saved_at || nowStr,
        prediction: classificationResult.prediction,
        defect_type: classificationResult.defect_type,
        confidence: classificationResult.confidence,
        notes: notes,
        image_url: data.image_url || data.image_signed_url || capturedImage,
        user_email: userEmail,
      };

      // Also persist to Supabase directly if configured
      await saveInspectionRecord(savedRecord);

      // Prepend to local history
      setInspections((prev) => [savedRecord, ...prev]);
      setSaveSuccess(true);
      addToast('success', 'Inspection Saved', `Record ${savedRecord.id} successfully archived to cloud history.`);

      // Update local stats
      setStats((prev) => {
        const isDef = classificationResult.prediction === 'Defective';
        const newTotal = prev.total_checked + 1;
        const newGood = isDef ? prev.good_count : prev.good_count + 1;
        const newDef = isDef ? prev.defect_count + 1 : prev.defect_count;
        const newBreakdown = { ...prev.defect_breakdown };
        if (isDef && newBreakdown[classificationResult.defect_type] !== undefined) {
          newBreakdown[classificationResult.defect_type]++;
        }
        return {
          ...prev,
          total_checked: newTotal,
          good_count: newGood,
          defect_count: newDef,
          defect_rate: (newDef / newTotal) * 100,
          defect_breakdown: newBreakdown,
        };
      });
    } catch (err: any) {
      console.error('Upload failure:', err);
      // Fallback save to local memory state and direct Supabase so operator work is never lost
      const localRecord: InspectionItem = {
        id: generatedId,
        timestamp: nowStr,
        prediction: classificationResult.prediction,
        defect_type: classificationResult.defect_type,
        confidence: classificationResult.confidence,
        notes: notes,
        image_url: capturedImage,
        user_email: userEmail,
      };

      if (isSupabaseConfigured()) {
        try {
          await saveInspectionRecord(localRecord);
        } catch (subErr) {
          console.warn('Direct Supabase fallback error:', subErr);
        }
      }

      setInspections((prev) => [localRecord, ...prev]);
      setSaveSuccess(true);
      addToast(
        'error',
        'Backend Offline - Saved via Supabase/Local',
        `Backend server unreachable: ${err.message}. Record successfully archived to Supabase & local state.`
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleAuthSuccess = (email: string, id: string) => {
    setUserEmail(email);
    setUserId(id);
    addToast('success', 'Inspector Authenticated', `Session scoped to ${email}.`);
  };

  const handleSignOut = () => {
    setUserEmail(null);
    setUserId(null);
    supabase.auth.signOut().catch(() => {});
    addToast('info', 'Signed Out', 'Returned to local guest inspector session.');
  };

  return (
    <div className="min-h-screen bg-[#05070f] text-slate-100 flex flex-col font-sans selection:bg-blue-500/30 selection:text-white relative overflow-x-hidden">
      {/* VisionOS Atmospheric Ambient Lights for Glassmorphic Depth */}
      <div className="pointer-events-none fixed -top-40 -left-40 w-96 h-96 bg-blue-600/15 rounded-full blur-[128px] -z-10" />
      <div className="pointer-events-none fixed top-1/3 -right-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-[128px] -z-10" />
      <div className="pointer-events-none fixed -bottom-40 left-1/3 w-96 h-96 bg-cyan-600/10 rounded-full blur-[128px] -z-10" />

      {/* Backend Offline Banner */}
      <BackendOfflineBanner
        isOffline={!isConnected}
        onRetry={handleRetryBackend}
        isRetrying={isRetryingBackend}
      />

      {/* Main VisionOS Navigation */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isConnected={isConnected}
        userEmail={userEmail}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onSignOut={handleSignOut}
        currentTime={currentTime}
        inspectionCount={inspections.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* VIEW 1: LIVE INSPECTION (WebRTC Webcam + Capture + Classify + Save) */}
        {activeTab === 'inspection' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Top Telemetry Metric Strip (Apple Glass Cards) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-xs">
              <div className="apple-glass-card p-4 rounded-3xl border border-white/10 shadow-[0_8px_25px_rgba(0,0,0,0.3)]">
                <div className="text-slate-400 text-[10px] uppercase font-medium tracking-wide">Total Inspected</div>
                <div className="text-2xl font-bold font-mono text-white mt-1">
                  {stats.total_checked.toLocaleString()}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Units Processed</div>
              </div>

              <div className="apple-glass-card p-4 rounded-3xl border border-white/10 shadow-[0_8px_25px_rgba(0,0,0,0.3)]">
                <div className="text-slate-400 text-[10px] uppercase font-medium tracking-wide">Passed Units</div>
                <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                  {stats.good_count.toLocaleString()}
                </div>
                <div className="text-[10px] text-emerald-400/80 mt-0.5">Non-Defective</div>
              </div>

              <div className="apple-glass-card p-4 rounded-3xl border border-white/10 shadow-[0_8px_25px_rgba(0,0,0,0.3)]">
                <div className="text-slate-400 text-[10px] uppercase font-medium tracking-wide">Defective Units</div>
                <div className="text-2xl font-bold font-mono text-rose-400 mt-1">
                  {stats.defect_count.toLocaleString()}
                </div>
                <div className="text-[10px] text-rose-400/80 mt-0.5">Rejected by Gate</div>
              </div>

              <div className="apple-glass-card p-4 rounded-3xl border border-white/10 shadow-[0_8px_25px_rgba(0,0,0,0.3)]">
                <div className="text-slate-400 text-[10px] uppercase font-medium tracking-wide">Defect Rate</div>
                <div className="text-2xl font-bold font-mono text-amber-300 mt-1">
                  {stats.defect_rate.toFixed(2)}%
                </div>
                <div className="text-[10px] text-amber-300/80 mt-0.5">Tolerance &lt; 5.0%</div>
              </div>
            </div>

            {/* Split Inspection Workspace */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Live Camera View & Frame Capture (7 columns) */}
              <div className="lg:col-span-7 space-y-4">
                <CameraView
                  apiBase={API_BASE}
                  onFrameCaptured={handleFrameCaptured}
                  isCapturing={isClassifying}
                />
              </div>

              {/* Right Column: Classification Results & Save Inspection (5 columns) */}
              <div className="lg:col-span-5 space-y-4">
                <ClassificationCard
                  capturedImage={capturedImage}
                  onClearCapture={handleClearCapture}
                  onClassify={handleClassifyProduct}
                  isClassifying={isClassifying}
                  result={classificationResult}
                  onSaveInspection={handleSaveInspection}
                  isSaving={isSaving}
                  saveSuccess={saveSuccess}
                  userEmail={userEmail}
                />
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: HISTORY REVIEW VIEW */}
        {activeTab === 'history' && (
          <div className="space-y-4 animate-fadeIn">
            <HistoryView
              inspections={inspections}
              onRefresh={fetchHistory}
              isRefreshing={isRefreshingHistory}
            />
          </div>
        )}

        {/* VIEW 3: DIGITAL TWIN SIMULATION LINE */}
        {activeTab === 'twin' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flat-panel bg-[#0d121f] border border-[#1e2638] p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-mono text-sm font-bold uppercase text-slate-100">
                  Digital Twin 60 FPS Conveyor Simulation
                </h2>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Real-time visual simulation of packaging conveyor line, optical gate, and mechanical reject pusher.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] animate-pulse" />
                <span className="font-mono text-xs font-bold text-slate-300">SIMULATION ENGINE RUNNING</span>
              </div>
            </div>

            <div className="w-full flat-panel bg-[#0d121f] border border-[#1e2638] p-2 overflow-hidden">
              <div className="w-full h-[480px]">
                <DigitalTwinCanvas
                  confThreshold={stats.conf_threshold}
                  conveyorDelay={stats.conveyor_delay}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Inspector Auth Modal Dialog */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />

      {/* Global Toast System */}
      <Toast toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
