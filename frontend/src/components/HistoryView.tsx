import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  FileText,
  User,
  Eye,
  Download,
  X,
  LayoutGrid,
  List,
  RefreshCw,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { InspectionItem } from '../types';

interface HistoryViewProps {
  inspections: InspectionItem[];
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  inspections,
  onRefresh,
  isRefreshing = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterResult, setFilterResult] = useState<'ALL' | 'DEFECTIVE' | 'NON-DEFECTIVE'>('ALL');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [selectedItem, setSelectedItem] = useState<InspectionItem | null>(null);

  // Filtered and searched inspections
  const filteredList = useMemo(() => {
    return inspections.filter((item) => {
      // Result filter
      if (filterResult === 'DEFECTIVE' && item.prediction !== 'Defective') return false;
      if (filterResult === 'NON-DEFECTIVE' && item.prediction !== 'Non-defective') return false;

      // Search query filter (matches ID, notes, or defect_type)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const idMatch = (item.id || '').toLowerCase().includes(query);
        const notesMatch = (item.notes || '').toLowerCase().includes(query);
        const defectMatch = (item.defect_type || '').toLowerCase().includes(query);
        const userMatch = (item.user_email || '').toLowerCase().includes(query);
        if (!idMatch && !notesMatch && !defectMatch && !userMatch) return false;
      }
      return true;
    });
  }, [inspections, filterResult, searchQuery]);

  return (
    <div className="w-full space-y-4">
      {/* Controls Bar: Search & Filters (Apple Glass Capsule) */}
      <div className="apple-glass p-3 sm:p-4 rounded-3xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search inspections by Item ID, observations, defect type, or operator..."
            className="apple-glass-input w-full pl-10 pr-9 py-2 text-xs text-slate-100 placeholder:text-slate-400 rounded-full"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills (Segmented Control) */}
        <div className="flex items-center gap-2 overflow-x-auto">
          <div className="bg-black/40 backdrop-blur-xl p-1 rounded-full border border-white/10 flex items-center gap-1 shadow-inner">
            <button
              onClick={() => setFilterResult('ALL')}
              className={`interactive-target px-3.5 py-1 text-xs font-medium rounded-full transition-all ${
                filterResult === 'ALL'
                  ? 'bg-white/20 text-white shadow-sm border border-white/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({inspections.length})
            </button>

            <button
              onClick={() => setFilterResult('DEFECTIVE')}
              className={`interactive-target px-3.5 py-1 text-xs font-medium rounded-full transition-all ${
                filterResult === 'DEFECTIVE'
                  ? 'bg-rose-500/25 text-rose-200 border border-rose-500/30'
                  : 'text-slate-400 hover:text-rose-300'
              }`}
            >
              Defective
            </button>

            <button
              onClick={() => setFilterResult('NON-DEFECTIVE')}
              className={`interactive-target px-3.5 py-1 text-xs font-medium rounded-full transition-all ${
                filterResult === 'NON-DEFECTIVE'
                  ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-emerald-300'
              }`}
            >
              Passed
            </button>
          </div>

          {/* View Mode Toggle & Refresh */}
          <div className="flex items-center gap-1.5 ml-auto">
            <div className="bg-black/40 backdrop-blur-xl p-1 rounded-full border border-white/10 flex items-center gap-1">
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-full transition-all ${
                  viewMode === 'table'
                    ? 'bg-white/20 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Table View"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded-full transition-all ${
                  viewMode === 'cards'
                    ? 'bg-white/20 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Cards View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="apple-btn-secondary w-8 h-8 rounded-full flex items-center justify-center text-slate-300 hover:text-white"
              title="Refresh History"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Records Container */}
      {filteredList.length === 0 ? (
        <div className="apple-glass rounded-3xl p-12 text-center flex flex-col items-center justify-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.05] border border-white/10 backdrop-blur-md flex items-center justify-center text-slate-400">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-white tracking-tight">No Inspection Records Found</h3>
          <p className="text-xs text-slate-400 max-w-sm">
            {searchQuery
              ? `No inspections matched your filter: "${searchQuery}".`
              : 'Perform your first product inspection from the Camera tab to archive inspection data.'}
          </p>
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW (Apple Glassmorphism Table) */
        <div className="apple-glass rounded-3xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-slate-400 font-medium">
                  <th className="py-3 px-4">Item ID</th>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Classification</th>
                  <th className="py-3 px-4">Confidence</th>
                  <th className="py-3 px-4">Defect Type</th>
                  <th className="py-3 px-4">Observations / Notes</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredList.map((item) => {
                  const isDef = item.prediction === 'Defective';
                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className="hover:bg-white/[0.04] transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-4 font-mono font-medium text-slate-200">
                        {item.id.slice(0, 14)}
                      </td>
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {new Date(item.timestamp).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            isDef ? 'glass-badge-fail' : 'glass-badge-pass'
                          }`}
                        >
                          {isDef ? (
                            <XCircle className="w-3 h-3" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3" />
                          )}
                          <span>{item.prediction}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-200">
                        {(item.confidence * 100).toFixed(1)}%
                      </td>
                      <td className="py-3 px-4 capitalize text-slate-300">
                        {item.defect_type ? item.defect_type.replace('_', ' ') : '—'}
                      </td>
                      <td className="py-3 px-4 max-w-xs truncate text-slate-400">
                        {item.notes || '—'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedItem(item);
                          }}
                          className="apple-btn-secondary px-2.5 py-1 text-[11px] font-medium opacity-80 group-hover:opacity-100 transition-opacity"
                        >
                          View Detail
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* CARDS GRID VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredList.map((item) => {
            const isDef = item.prediction === 'Defective';
            return (
              <div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className="apple-glass-card p-4 rounded-3xl cursor-pointer hover:scale-[1.02] transition-all duration-200 group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                        isDef ? 'glass-badge-fail' : 'glass-badge-pass'
                      }`}
                    >
                      {isDef ? (
                        <XCircle className="w-3 h-3" />
                      ) : (
                        <CheckCircle2 className="w-3 h-3" />
                      )}
                      <span>{item.prediction}</span>
                    </span>
                    <span className="font-mono text-xs font-semibold text-slate-200">
                      {(item.confidence * 100).toFixed(1)}%
                    </span>
                  </div>

                  {item.image_url && (
                    <div className="w-full aspect-video rounded-2xl bg-black/60 overflow-hidden mb-3 border border-white/10">
                      <img
                        src={item.image_url}
                        alt="Inspection snapshot"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  )}

                  <div className="space-y-1 text-xs">
                    <div className="font-mono text-slate-400 text-[11px] truncate">
                      ID: {item.id}
                    </div>
                    {item.defect_type && item.defect_type !== 'none' && (
                      <div className="text-rose-300 font-medium capitalize">
                        Defect: {item.defect_type.replace('_', ' ')}
                      </div>
                    )}
                    {item.notes && (
                      <p className="text-slate-300 line-clamp-2 text-[11px] pt-1">
                        &ldquo;{item.notes}&rdquo;
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
                  <span>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="text-blue-400 group-hover:underline flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    <span>Inspect</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Inspection Modal (Apple VisionOS Glass Sheet) */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-xl apple-glass rounded-3xl p-6 shadow-2xl relative border border-white/15 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-white tracking-tight">
                  Inspection Record Audit
                </h3>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedItem.image_url && (
              <div className="w-full aspect-video rounded-2xl bg-black/80 overflow-hidden border border-white/10">
                <img
                  src={selectedItem.image_url}
                  alt="Full frame"
                  className="w-full h-full object-contain"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="apple-glass-card p-3 rounded-2xl">
                <div className="text-slate-400 text-[10px] uppercase font-medium">Prediction</div>
                <div className="text-sm font-bold text-white mt-0.5">
                  {selectedItem.prediction}
                </div>
              </div>

              <div className="apple-glass-card p-3 rounded-2xl">
                <div className="text-slate-400 text-[10px] uppercase font-medium">Confidence</div>
                <div className="text-sm font-bold font-mono text-white mt-0.5">
                  {(selectedItem.confidence * 100).toFixed(1)}%
                </div>
              </div>

              <div className="apple-glass-card p-3 rounded-2xl">
                <div className="text-slate-400 text-[10px] uppercase font-medium">Defect Class</div>
                <div className="text-sm font-medium capitalize text-slate-200 mt-0.5">
                  {selectedItem.defect_type ? selectedItem.defect_type.replace('_', ' ') : 'None'}
                </div>
              </div>

              <div className="apple-glass-card p-3 rounded-2xl">
                <div className="text-slate-400 text-[10px] uppercase font-medium">Timestamp</div>
                <div className="text-xs font-mono text-slate-300 mt-0.5">
                  {new Date(selectedItem.timestamp).toLocaleString()}
                </div>
              </div>
            </div>

            {selectedItem.notes && (
              <div className="apple-glass-card p-3 rounded-2xl">
                <div className="text-slate-400 text-[10px] uppercase font-medium">Observations / Notes</div>
                <p className="text-xs text-slate-200 mt-1 leading-relaxed">
                  {selectedItem.notes}
                </p>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedItem(null)}
                className="apple-btn-secondary px-5 py-2 text-xs font-medium"
              >
                Close Audit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
