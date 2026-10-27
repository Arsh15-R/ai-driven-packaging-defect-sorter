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
  CheckCircle2,
  XCircle,
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
      <div className="apple-glass rounded-3xl p-8 flex flex-col items-center justify-center text-center min-h-[380px] shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
        <div className="w-16 h-16 rounded-3xl bg-white/[0.05] border border-white/10 backdrop-blur-xl flex items-center justify-center text-slate-300 mb-4 shadow-inner">
          <Cpu className="w-8 h-8 text-cyan-400" />
        </div>
        <h3 className="text-sm font-semibold tracking-tight text-white">
          Awaiting Inspection Target
        </h3>
        <p className="text-xs text-slate-400 mt-2 max-w-sm leading-relaxed">
          Position a moving carton or product into the optical targeting reticle and tap the shutter to capture a frame.
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
    <div className="apple-glass rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col">
      {/* Card Header */}
      <div className="px-5 py-3.5 border-b border-white/10 bg-white/[0.02] backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold tracking-tight text-white">
            Neural Classification
          </span>
        </div>
        <button
          onClick={onClearCapture}
          className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>New Capture</span>
        </button>
      </div>

      <div className="p-5 sm:p-6 space-y-5">
        {/* Captured Image Preview + Action Bar */}
        <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
          <div className="relative w-full sm:w-40 aspect-video sm:aspect-square rounded-2xl bg-black/60 border border-white/10 shrink-0 overflow-hidden shadow-md">
            <img
              src={capturedImage}
              alt="Captured Frame for Inspection"
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-1.5 right-1.5 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded-full text-[9px] font-mono text-slate-200 border border-white/10">
              FRAME READY
            </div>
          </div>

          <div className="flex-1 space-y-3 w-full">
            <div>
              <div className="text-xs text-slate-400 font-medium">
                Analysis Target
              </div>
              <div className="text-sm font-semibold text-white tracking-tight mt-0.5">
                Carton Surface / Packaging Seal
              </div>
            </div>

            {!result && (
              <button
                onClick={onClassify}
                disabled={isClassifying}
                className="apple-btn-primary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-2 shadow-lg"
              >
                <Cpu className={`w-4 h-4 ${isClassifying ? 'animate-spin' : ''}`} />
                <span>{isClassifying ? 'Analyzing Frame...' : 'Run Defect Classification'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Prediction Result Display */}
        {result && (
          <div className="space-y-4 pt-1 border-t border-white/10">
            {/* Primary Status Card */}
            <div
              className={`p-4 rounded-2xl backdrop-blur-xl border flex items-center justify-between transition-all ${
                isDefective
                  ? 'glass-badge-fail'
                  : 'glass-badge-pass'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                    isDefective
                      ? 'bg-rose-500/20 text-rose-300'
                      : 'bg-emerald-500/20 text-emerald-300'
                  }`}
                >
                  {isDefective ? (
                    <XCircle className="w-6 h-6" />
                  ) : (
                    <CheckCircle2 className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <div className="text-base font-bold tracking-tight">
                    {result.prediction}
                  </div>
                  <div className="text-xs opacity-90 capitalize font-medium">
                    {isDefective
                      ? `Defect: ${result.defect_type.replace('_', ' ')}`
                      : 'Integrity Verified: Good Package'}
                  </div>
                </div>
              </div>

              {/* Confidence Readout */}
              <div className="text-right">
                <div className="text-xl font-bold font-mono tracking-tight">
                  {confidencePercent}%
                </div>
                <div className="text-[10px] uppercase opacity-75 font-medium">
                  Confidence
                </div>
              </div>
            </div>

            {/* Confidence Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-400 font-medium">
                <span>Inference Confidence</span>
                <span className="font-mono text-slate-200">{confidencePercent}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/[0.08] overflow-hidden p-[1px]">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isDefective
                      ? 'bg-gradient-to-r from-rose-500 to-red-400 shadow-[0_0_10px_rgba(244,63,94,0.6)]'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_10px_rgba(16,185,129,0.6)]'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, result.confidence * 100))}%` }}
                />
              </div>
            </div>

            {/* Placeholder / Demo Mode Warning Banner */}
            {result.is_placeholder && (
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 backdrop-blur-md flex items-start gap-2.5 text-xs text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-semibold text-amber-300">Demo / Heuristic Mode</div>
                  <div className="text-[11px] text-amber-200/80 leading-relaxed">
                    This prediction is generated by the placeholder engine. Connect your trained model weights for production inference.
                  </div>
                </div>
              </div>
            )}

            {/* Validation Disclaimer Notice */}
            <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-white/[0.02] p-2.5 rounded-xl border border-white/5">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>Model predictions should be validated against a representative test set before production use.</span>
            </div>

            {/* Save Inspection Section */}
            <form onSubmit={handleSave} className="space-y-3 pt-2">
              <div>
                <label
                  htmlFor="inspection-notes"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  Observation Notes (Optional)
                </label>
                <textarea
                  id="inspection-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Minor crease along top edge, batch #1042..."
                  className="apple-glass-input w-full px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 resize-none"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={isSaving || saveSuccess}
                  className={`apple-btn-primary flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-2 ${
                    saveSuccess ? 'bg-emerald-600 border-emerald-400' : ''
                  }`}
                >
                  {saveSuccess ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-white" />
                      <span>Saved to Cloud</span>
                    </>
                  ) : (
                    <>
                      <CloudUpload className={`w-4 h-4 ${isSaving ? 'animate-bounce' : ''}`} />
                      <span>{isSaving ? 'Uploading to Supabase...' : 'Save Inspection'}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onClearCapture}
                  className="apple-btn-secondary px-4 py-2.5 text-xs font-medium"
                >
                  Clear
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
