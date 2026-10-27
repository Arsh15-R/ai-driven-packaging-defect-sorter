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
      {/* Controls Bar: Search & Filters */}
      <div className="flat-panel bg-[#0d121f] border border-[#1e2638] p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search inspections by Item ID, observations, defect type, or operator..."
            className="w-full bg-[#080b12] border border-[#1e2638] focus:border-[#3b82f6] focus:outline-none pl-9 pr-3 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills (All, Defective, Non-defective) */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-xs font-mono text-slate-500 mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" />
            <span>FILTER:</span>
          </span>

          <button
            onClick={() => setFilterResult('ALL')}
            className={`interactive-target h-8 px-3 text-xs font-mono font-bold uppercase transition-colors border ${
              filterResult === 'ALL'
                ? 'bg-[#1e2638] text-white border-slate-500'
                : 'bg-[#080b12] text-slate-400 hover:text-slate-200 border-[#1e2638]'
            }`}
          >
            ALL ({inspections.length})
          </button>

          <button
            onClick={() => setFilterResult('DEFECTIVE')}
            className={`interactive-target h-8 px-3 text-xs font-mono font-bold uppercase transition-colors border ${
              filterResult === 'DEFECTIVE'
                ? 'bg-[#2b0d10] text-[#fca5a5] border-[#ef4444]'
                : 'bg-[#080b12] text-slate-400 hover:text-[#fca5a5] border-[#1e2638]'
            }`}
          >
            DEFECTIVE ({inspections.filter((i) => i.prediction === 'Defective').length})
          </button>

          <button
            onClick={() => setFilterResult('NON-DEFECTIVE')}
            className={`interactive-target h-8 px-3 text-xs font-mono font-bold uppercase transition-colors border ${
              filterResult === 'NON-DEFECTIVE'
                ? 'bg-[#062617] text-[#a7f3d0] border-[#10b981]'
                : 'bg-[#080b12] text-slate-400 hover:text-[#a7f3d0] border-[#1e2638]'
            }`}
          >
            NON-DEFECTIVE ({inspections.filter((i) => i.prediction === 'Non-defective').length})
          </button>
        </div>

        {/* View Mode Toggle & Refresh */}
        <div className="flex items-center gap-2 self-end md:self-auto">
          <div className="flex border border-[#1e2638] bg-[#080b12]">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 ${viewMode === 'table' ? 'bg-[#162035] text-cyan-300' : 'text-slate-500 hover:text-slate-300'}`}
              title="Table View"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`p-1.5 ${viewMode === 'cards' ? 'bg-[#162035] text-cyan-300' : 'text-slate-500 hover:text-slate-300'}`}
              title="Cards View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="interactive-target h-8 px-2.5 text-xs font-mono bg-[#111728] hover:bg-[#162035] text-slate-300 border border-[#1e2638] flex items-center gap-1.5 transition-colors"
            title="Refresh Inspection History"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>SYNC</span>
          </button>
        </div>
      </div>

      {/* Empty State */}
      {filteredList.length === 0 && (
        <div className="flat-panel bg-[#0d121f] border border-[#1e2638] p-12 text-center space-y-3">
          <FileText className="w-10 h-10 text-slate-600 mx-auto" />
          <div className="font-mono text-sm font-bold uppercase text-slate-300">
            NO INSPECTIONS MATCH CRITERIA
          </div>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery
              ? `No records found matching query "${searchQuery}". Reset search or change filters.`
              : 'No product inspections have been saved to this session or cloud archive yet.'}
          </p>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-xs font-mono text-[#3b82f6] hover:underline"
            >
              Clear search filter
            </button>
          )}
        </div>
      )}

      {/* TABLE VIEW */}
      {viewMode === 'table' && filteredList.length > 0 && (
        <div className="flat-panel bg-[#0d121f] border border-[#1e2638] overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-[#1e2638] bg-[#0a0e19] text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">THUMBNAIL</th>
                <th className="py-3 px-4">ITEM ID</th>
                <th className="py-3 px-4">TIMESTAMP</th>
                <th className="py-3 px-4">PREDICTION</th>
                <th className="py-3 px-4">DEFECT TYPE</th>
                <th className="py-3 px-4">CONFIDENCE</th>
                <th className="py-3 px-4">OBSERVATIONS / NOTES</th>
                <th className="py-3 px-4 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#182030]">
              {filteredList.map((item) => {
                const isDef = item.prediction === 'Defective';
                return (
                  <tr
                    key={item.id}
                    className="hover:bg-[#111728] transition-colors cursor-pointer group"
                    onClick={() => setSelectedItem(item)}
                  >
                    {/* Thumbnail */}
                    <td className="py-2.5 px-4">
                      {item.image_url ? (
                        <div className="w-12 h-9 bg-black border border-[#1e2638] overflow-hidden shrink-0">
                          <img
                            src={item.image_url}
                            alt={item.id}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-9 bg-[#080b12] border border-[#1e2638] flex items-center justify-center text-slate-600 text-[10px]">
                          NO IMG
                        </div>
                      )}
                    </td>

                    {/* Item ID */}
                    <td className="py-2.5 px-4 font-bold text-slate-200">
                      {item.id}
                    </td>

                    {/* Timestamp */}
                    <td className="py-2.5 px-4 text-slate-400 whitespace-nowrap">
                      {item.timestamp}
                    </td>

                    {/* Prediction Badge */}
                    <td className="py-2.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold uppercase border ${
                          isDef
                            ? 'bg-[#2b0d10] text-[#fca5a5] border-[#ef4444]'
                            : 'bg-[#062617] text-[#a7f3d0] border-[#10b981]'
                        }`}
                      >
                        {isDef ? (
                          <AlertTriangle className="w-3 h-3 text-[#ef4444]" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3 text-[#10b981]" />
                        )}
                        <span>{item.prediction}</span>
                      </span>
                    </td>

                    {/* Defect Type */}
                    <td className="py-2.5 px-4 text-slate-300 uppercase">
                      {item.defect_type === 'none' ? '—' : item.defect_type.replace('_', ' ')}
                    </td>

                    {/* Confidence */}
                    <td className="py-2.5 px-4 font-bold text-slate-200">
                      {(item.confidence * 100).toFixed(1)}%
                    </td>

                    {/* Notes */}
                    <td className="py-2.5 px-4 text-slate-400 max-w-xs truncate" title={item.notes}>
                      {item.notes || <span className="text-slate-600 italic">No notes recorded</span>}
                    </td>

                    {/* Action */}
                    <td className="py-2.5 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedItem(item);
                        }}
                        className="interactive-target h-7 px-2.5 text-slate-400 hover:text-white bg-[#111728] border border-[#1e2638] flex items-center gap-1 ml-auto"
                      >
                        <Eye className="w-3 h-3 text-cyan-400" />
                        <span className="text-[11px]">INSPECT</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* CARDS VIEW */}
      {viewMode === 'cards' && filteredList.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredList.map((item) => {
            const isDef = item.prediction === 'Defective';
            return (
              <div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className="flat-panel bg-[#0d121f] border border-[#1e2638] hover:border-[#3b82f6]/60 transition-colors p-4 flex flex-col justify-between cursor-pointer group"
              >
                <div className="space-y-3">
                  {/* Top Line: ID & Badge */}
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-200">
                      {item.id}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-bold uppercase border ${
                        isDef
                          ? 'bg-[#2b0d10] text-[#fca5a5] border-[#ef4444]'
                          : 'bg-[#062617] text-[#a7f3d0] border-[#10b981]'
                      }`}
                    >
                      {item.prediction}
                    </span>
                  </div>

                  {/* Thumbnail / Image Preview */}
                  <div className="relative aspect-video bg-black border border-[#1e2638] overflow-hidden">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.id}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs font-mono">
                        IMAGE UNAVAILABLE
                      </div>
                    )}
                    <div className="absolute bottom-1 right-1 bg-black/80 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                      CONF: {(item.confidence * 100).toFixed(1)}%
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="space-y-1 text-xs font-mono">
                    <div className="flex justify-between text-slate-400">
                      <span>TYPE:</span>
                      <span className="text-slate-200 font-bold uppercase">
                        {item.defect_type === 'none' ? 'PASS' : item.defect_type.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="flex justify-between text-slate-400">
                      <span>TIME:</span>
                      <span className="text-slate-300">{item.timestamp}</span>
                    </div>

                    {item.notes && (
                      <div className="mt-2 p-2 bg-[#080b12] border border-[#1e2638] text-[11px] text-slate-300 line-clamp-2">
                        {item.notes}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-[#1e2638] mt-3 flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>{item.user_email || 'Local Inspector'}</span>
                  <span className="text-[#3b82f6] group-hover:underline flex items-center gap-1">
                    Details &rarr;
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DETAIL INSPECTION MODAL */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-2xl flat-panel bg-[#0d121f] border border-[#1e2638] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e2638] bg-[#0a0e19]">
              <div className="flex items-center gap-3">
                <span className="font-mono text-base font-bold text-slate-100">
                  {selectedItem.id}
                </span>
                <span
                  className={`px-2.5 py-0.5 text-xs font-mono font-bold uppercase border ${
                    selectedItem.prediction === 'Defective'
                      ? 'bg-[#2b0d10] text-[#fca5a5] border-[#ef4444]'
                      : 'bg-[#062617] text-[#a7f3d0] border-[#10b981]'
                  }`}
                >
                  {selectedItem.prediction}
                </span>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4">
              {/* Full Inspection Image */}
              {selectedItem.image_url ? (
                <div className="relative aspect-video bg-black border border-[#1e2638] overflow-hidden flex items-center justify-center">
                  <img
                    src={selectedItem.image_url}
                    alt={selectedItem.id}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              ) : (
                <div className="aspect-video bg-[#080b12] border border-[#1e2638] flex items-center justify-center text-slate-500 font-mono text-xs">
                  NO FRAME IMAGE LOGGED
                </div>
              )}

              {/* Data Table */}
              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div className="flat-card p-3 border border-[#1e2638]">
                  <div className="text-slate-400 text-[10px] uppercase">Timestamp</div>
                  <div className="text-slate-100 font-bold mt-0.5">{selectedItem.timestamp}</div>
                </div>

                <div className="flat-card p-3 border border-[#1e2638]">
                  <div className="text-slate-400 text-[10px] uppercase">Defect Classification</div>
                  <div className="text-slate-100 font-bold mt-0.5 uppercase">
                    {selectedItem.defect_type === 'none' ? 'None (Pass)' : selectedItem.defect_type.replace('_', ' ')}
                  </div>
                </div>

                <div className="flat-card p-3 border border-[#1e2638]">
                  <div className="text-slate-400 text-[10px] uppercase">Model Confidence</div>
                  <div className="text-slate-100 font-bold mt-0.5">
                    {(selectedItem.confidence * 100).toFixed(2)}%
                  </div>
                </div>

                <div className="flat-card p-3 border border-[#1e2638]">
                  <div className="text-slate-400 text-[10px] uppercase">Inspector / Operator</div>
                  <div className="text-slate-100 font-bold mt-0.5 truncate">
                    {selectedItem.user_email || 'Local Operator'}
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="flat-card p-4 border border-[#1e2638] space-y-1">
                <div className="text-slate-400 text-[10px] font-mono uppercase font-bold">
                  Observation Notes
                </div>
                <div className="text-xs font-mono text-slate-200 whitespace-pre-wrap">
                  {selectedItem.notes || 'No observation notes entered for this inspection record.'}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-[#1e2638] bg-[#0a0e19] flex justify-between items-center">
              {selectedItem.image_url ? (
                <a
                  href={selectedItem.image_url}
                  download={`${selectedItem.id}.jpg`}
                  className="interactive-target h-8 px-3 text-xs font-mono bg-[#162035] hover:bg-[#1e2d4a] text-cyan-300 border border-cyan-500/40 flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>EXPORT FRAME</span>
                </a>
              ) : <div />}

              <button
                onClick={() => setSelectedItem(null)}
                className="interactive-target h-8 px-4 text-xs font-mono font-bold uppercase bg-[#1e2638] hover:bg-[#28354d] text-white"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
