import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Cpu,
  CloudUpload,
  AlertTriangle,
  RotateCcw,
  CheckCircle,
  FileText,
  Sparkles,
  Info,
} from 'lucide-react';
import { ClassificationResponse } from '../types';

interface ClassificationCardProps {
  capturedImage: string | null;
  onClearCapture: () => void;
  onClassify: () => Promise<void>;
  isClassifying: boolean;
  result: ClassificationResponse | null;
  onSaveInspection: (notes: string) => Promise<void>;
  isSaving: boolean;
  saveSuccess: boolean;
  userEmail?: string | null;
}

export const ClassificationCard: React.FC<ClassificationCardProps> = ({
  capturedImage,
  onClearCapture,
  onClassify,
  isClassifying,
  result,
  onSaveInspection,
  isSaving,
  saveSuccess,
  userEmail,
}) => {
  const [notes, setNotes] = useState('');

  if (!capturedImage) {
    return (
      <div className="w-full flat-panel bg-[#0d121f] border border-[#1e2638] p-8 flex flex-col items-center justify-center text-center min-h-[380px]">
        <div className="w-16 h-16 rounded-full bg-[#111728] border border-[#1e2638] flex items-center justify-center text-slate-500 mb-4">
          <Cpu className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-slate-200">
          AWAITING PRODUCT CAPTURE
        </h3>
        <p className="text-xs text-slate-400 mt-2 max-w-sm leading-relaxed">
          Position a package in the optical reticle and press &ldquo;CAPTURE CURRENT FRAME&rdquo; to begin AI inspection and classification.
        </p>
      </div>
    );
  }

  const isDefective = result?.prediction === 'Defective';
  const confidencePercent = result ? (result.confidence * 100).toFixed(1) : null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveInspection(notes);
  };

  return (
    <div className="w-full flat-panel bg-[#0d121f] border border-[#1e2638] flex flex-col">
      {/* Card Header */}
      <div className="px-5 py-3 border-b border-[#1e2638] bg-[#0a0e19] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[#3b82f6]" />
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-200">
            FRAME CLASSIFICATION & TELEMETRY
          </span>
        </div>
        <button
          onClick={onClearCapture}
          className="text-xs font-mono text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>RE-CAPTURE</span>
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Captured Image Preview + Action Bar */}
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <div className="relative w-full sm:w-44 aspect-video sm:aspect-square bg-black border border-[#1e2638] shrink-0 overflow-hidden group">
            <img
              src={capturedImage}
              alt="Captured Frame for Inspection"
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-1 right-1 bg-black/80 px-1.5 py-0.5 font-mono text-[9px] text-slate-300">
              FRAME CAPTURED
            </div>
          </div>

          <div className="flex-1 space-y-3 w-full">
            <div>
              <div className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                Optical Frame Status
              </div>
              <div className="text-sm font-semibold text-slate-200 mt-0.5">
                Ready for Deep Neural Inference (YOLOv8 Edge Model)
              </div>
            </div>

            {!result && (
              <button
                onClick={onClassify}
                disabled={isClassifying}
                className="w-full sm:w-auto interactive-target h-10 px-6 text-xs font-mono font-bold uppercase tracking-wider bg-[#2563eb] hover:bg-[#1d4ed8] text-white border border-[#3b82f6] flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4 text-cyan-300" />
                <span>{isClassifying ? 'ANALYZING SURFACE MATRIX...' : 'CLASSIFY PRODUCT'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Loading Indicator */}
        {isClassifying && (
          <div className="flat-well p-4 border border-[#3b82f6]/40 flex items-center gap-3 animate-pulse">
            <div className="w-5 h-5 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
            <div className="font-mono text-xs text-slate-300">
              Executing tensor convolution pass against packaging defect classes...
            </div>
          </div>
        )}

        {/* Results Presentation Section */}
        {result && (
          <div className="space-y-4 pt-1 animate-fadeIn">
            {/* 1. Prominent Status Card: Defective (High contrast Red) vs Non-defective (High contrast Green) */}
            <div
              className={`p-4 border-2 transition-colors ${
                isDefective
                  ? 'bg-[#2b0d10] border-[#ef4444] text-[#fca5a5]'
                  : 'bg-[#062617] border-[#10b981] text-[#a7f3d0]'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isDefective ? (
                    <div className="w-10 h-10 bg-[#450a0a] border border-[#ef4444] flex items-center justify-center text-[#ef4444]">
                      <ShieldAlert className="w-6 h-6 text-[#ef4444]" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 bg-[#052e16] border border-[#10b981] flex items-center justify-center text-[#10b981]">
                      <ShieldCheck className="w-6 h-6 text-[#10b981]" />
                    </div>
                  )}

                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-widest opacity-80">
                      INSPECTION CLASSIFICATION
                    </div>
                    <div className="text-xl sm:text-2xl font-mono font-extrabold tracking-tight">
                      {isDefective ? 'DEFECTIVE' : 'NON-DEFECTIVE'}
                    </div>
                  </div>
                </div>

                {/* Defect Type Pill */}
                {isDefective && (
                  <div className="font-mono text-xs uppercase px-3 py-1 font-bold bg-[#450a0a] text-[#fca5a5] border border-[#ef4444]">
                    TYPE: {result.defect_type.replace('_', ' ')}
                  </div>
                )}
                {!isDefective && (
                  <div className="font-mono text-xs uppercase px-3 py-1 font-bold bg-[#052e16] text-[#a7f3d0] border border-[#10b981]">
                    QUALITY PASS
                  </div>
                )}
              </div>
            </div>

            {/* 2. Confidence Score Display with Visual Metric Bar */}
            <div className="flat-card p-4 border border-[#1e2638] space-y-2">
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="text-slate-400 uppercase tracking-wider font-semibold">
                  CONFIDENCE SCORE
                </span>
                <span className="text-base font-bold text-slate-100">{confidencePercent}%</span>
              </div>

              {/* Visual Metric Bar */}
              <div className="w-full h-3 bg-[#080b12] border border-[#1e2638] overflow-hidden p-0.5">
                <div
                  className={`h-full transition-all duration-500 ease-out ${
                    isDefective ? 'bg-[#ef4444]' : 'bg-[#10b981]'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, result.confidence * 100))}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>0.0%</span>
                <span>DECISION THRESHOLD: 45.0%</span>
                <span>100.0%</span>
              </div>
            </div>

            {/* 3. Placeholder Warning when is_placeholder === true */}
            {result.is_placeholder && (
              <div className="p-3 bg-[#241705] border border-[#f59e0b] text-[#fef08a] text-xs font-mono flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-amber-300">
                    ⚠️ DEMO / PLACEHOLDER PREDICTION - Connect trained weights for production
                  </div>
                  <div className="text-[11px] text-amber-200/80 mt-0.5">
                    Live inference is running on base YOLOv8 or heuristic synthetic weights.
                    Place custom trained weights at <code className="text-amber-100">models/best.pt</code> to enable production packaging classification.
                  </div>
                </div>
              </div>
            )}

            {/* 4. Prominent Disclaimer */}
            <div className="p-3 flat-well border border-[#1e2638] text-slate-400 text-xs font-mono flex items-start gap-2">
              <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span>
                <strong>Notice:</strong> Model predictions should be validated against a representative test set before production use.
              </span>
            </div>

            {/* 5. Save Inspection: Notes input field + "Save to Cloud" button */}
            <form onSubmit={handleSave} className="flat-card p-4 border border-[#1e2638] space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-[#3b82f6]" />
                  <span>INSPECTION OBSERVATIONS / NOTES</span>
                </label>
                {userEmail && (
                  <span className="text-[11px] font-mono text-slate-400">
                    Inspector: <strong className="text-slate-200">{userEmail}</strong>
                  </span>
                )}
              </div>

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional notes: e.g. Surface dent detected on top carton flap. Verified at optical gate."
                className="w-full bg-[#080b12] border border-[#1e2638] focus:border-[#3b82f6] focus:outline-none p-2.5 text-xs font-mono text-slate-100 placeholder:text-slate-600 resize-none transition-colors"
              />

              <div className="flex items-center justify-between pt-1">
                {saveSuccess ? (
                  <div className="flex items-center gap-1.5 text-xs font-mono text-[#10b981] font-semibold animate-fadeIn">
                    <CheckCircle className="w-4 h-4 text-[#10b981]" />
                    <span>Inspection archived to cloud record</span>
                  </div>
                ) : (
                  <div className="text-[11px] font-mono text-slate-500">
                    Saves telemetry, prediction, confidence, and image payload.
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSaving}
                  className="interactive-target h-9 px-5 text-xs font-mono font-bold uppercase tracking-wider bg-[#162035] hover:bg-[#1f2e4d] text-cyan-300 border border-cyan-500/50 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <CloudUpload className="w-4 h-4" />
                  <span>{isSaving ? 'SAVING TO CLOUD...' : 'SAVE TO CLOUD'}</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
