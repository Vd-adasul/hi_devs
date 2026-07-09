import { useState, useEffect } from 'react';
import api from '../lib/api.js';
import {
  Bell,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';

export default function ReviewQueuePage() {
  const [queue, setQueue] = useState<any[]>([]);

  const loadQueue = async () => {
    try {
      const res = await api.get('/review-queue?status=pending');
      setQueue(res.data.data || []);
    } catch (err) {
      console.warn('Failed to load review queue:', err);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const handleResolve = async (id: string, decision: 'approve' | 'reject') => {
    const notes = window.prompt(`Log notes/feedback for this ${decision} decision:`);
    if (notes === null) return;

    try {
      await api.post(`/review-queue/${id}/${decision}`, { notes });
      loadQueue();
      alert(`Review queue item marked as ${decision}ed successfully.`);
    } catch (err) {
      alert('Failed to resolve queue item.');
    }
  };

  const handleRequestRevision = async (id: string) => {
    const feedback = window.prompt('Specify revision instructions for the drafting agent:');
    if (!feedback) return;

    try {
      await api.post(`/review-queue/${id}/revise`, { feedback });
      loadQueue();
      alert('Revision request logged successfully.');
    } catch (err) {
      alert('Failed to send revision request.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Human Review Queue</h1>
        <p className="text-sm text-slate-500 mt-1">Audit low-confidence LLM extractions, answers, or redlines before staging</p>
      </div>

      <div className="glass-panel bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-2">
          <Bell size={16} className="text-amber-500" /> Pending Revisions
        </h3>

        <div className="flex flex-col gap-4">
          {queue.map((item) => (
            <div key={item._id} className="p-4 border border-slate-100 bg-slate-50/20 rounded-lg flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-slate-700">Type: {item.type}</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-500">Matter: {item.matterName}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded font-semibold">
                  <AlertTriangle size={12} />
                  <span>Confidence: {item.confidence}%</span>
                </div>
              </div>

              {/* Detail context */}
              <div className="text-xs leading-relaxed text-slate-700 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-b border-slate-100 py-3">
                <div>
                  <strong className="text-slate-500 block">Trigger Query:</strong>
                  <p className="mt-1 font-medium">"{item.query}"</p>
                </div>
                <div>
                  <strong className="text-slate-500 block">Proposed LLM Output:</strong>
                  <p className="mt-1 italic">"{item.answer}"</p>
                </div>
              </div>

              {item.reasoning && (
                <div className="text-xs text-slate-500 bg-slate-100 p-2.5 rounded font-mono">
                  <strong>Confidence Reasoning:</strong> {item.reasoning}
                </div>
              )}

              {/* Actions panel */}
              <div className="flex gap-2 justify-end mt-2">
                <button
                  onClick={() => handleResolve(item._id, 'approve')}
                  className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1"
                >
                  <CheckCircle size={14} /> Approve Answer
                </button>
                <button
                  onClick={() => handleRequestRevision(item._id)}
                  className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1"
                >
                  <RotateCcw size={14} /> Request Revision
                </button>
                <button
                  onClick={() => handleResolve(item._id, 'reject')}
                  className="px-3 py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold flex items-center gap-1"
                >
                  <XCircle size={14} /> Discard Output
                </button>
              </div>
            </div>
          ))}
          {queue.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-12">No low-confidence operations require review.</p>
          )}
        </div>
      </div>
    </div>
  );
}
