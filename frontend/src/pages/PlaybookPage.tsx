import React, { useState, useEffect } from 'react';
import api from '../lib/api.js';
import {
  Plus,
  Trash,
  CheckCircle,
  AlertTriangle,
  Info
} from 'lucide-react';

export default function PlaybookPage() {
  const [positions, setPositions] = useState<any[]>([]);
  const [clauseType, setClauseType] = useState('PaymentTerms');
  const [ourPosition, setOurPosition] = useState('');
  const [fallbackPosition, setFallbackPosition] = useState('');
  const [redLine, setRedLine] = useState('');
  const [mustHave, setMustHave] = useState(false);

  const loadPlaybook = async () => {
    try {
      const res = await api.get('/playbook/playbook');
      setPositions(res.data.data || []);
    } catch (err) {
      console.warn('Failed to load playbook:', err);
    }
  };

  useEffect(() => {
    loadPlaybook();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ourPosition) return;

    try {
      await api.post('/playbook/playbook', {
        clauseType,
        ourPosition,
        fallbackPosition,
        redLine,
        mustHave,
      });
      setOurPosition('');
      setFallbackPosition('');
      setRedLine('');
      setMustHave(false);
      loadPlaybook();
      alert('Playbook position registered successfully.');
    } catch (err) {
      alert('Failed to register playbook position.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this playbook position?')) return;
    try {
      await api.delete(`/playbook/playbook/${id}`);
      loadPlaybook();
    } catch (err) {
      alert('Failed to delete position.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Playbook Guidelines</h1>
        <p className="text-sm text-slate-500 mt-1">Define target preferred positions, fallbacks, and strict redlines for contract audits</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Playbook form */}
        <div className="glass-panel bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2">Add Playbook Rule</h3>
          <form onSubmit={handleAdd} className="flex flex-col gap-4 text-xs">
            <div className="flex flex-col gap-1">
              <label className="text-slate-400 font-medium">Clause Category</label>
              <select
                value={clauseType}
                onChange={(e) => setClauseType(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2"
              >
                <option value="PaymentTerms">Payment Terms</option>
                <option value="Liability">Limitation of Liability</option>
                <option value="Termination">Termination</option>
                <option value="Indemnification">Indemnification</option>
                <option value="GoverningLaw">Governing Law</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-slate-400 font-medium">Preferred Position (Target)</label>
              <textarea
                value={ourPosition}
                onChange={(e) => setOurPosition(e.target.value)}
                placeholder="Prefer Net-30 payment schedule..."
                className="w-full bg-slate-50 border border-slate-200 rounded p-2 h-16 focus:outline-none"
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-slate-400 font-medium">Acceptable Fallback Position</label>
              <textarea
                value={fallbackPosition}
                onChange={(e) => setFallbackPosition(e.target.value)}
                placeholder="Accept Net-45 payment schedule under exceptional conditions..."
                className="w-full bg-slate-50 border border-slate-200 rounded p-2 h-16 focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-slate-400 font-medium">Strict Redline (Forbidden)</label>
              <textarea
                value={redLine}
                onChange={(e) => setRedLine(e.target.value)}
                placeholder="No payment terms exceeding Net-60 allowed..."
                className="w-full bg-slate-50 border border-slate-200 rounded p-2 h-16 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={mustHave}
                onChange={(e) => setMustHave(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-slate-600 font-medium">Strict Must-Have Rule</span>
            </div>

            <button type="submit" className="w-full btn-primary justify-center py-2 rounded-lg font-semibold flex items-center gap-1">
              <Plus size={14} /> Add Guideline
            </button>
          </form>
        </div>

        {/* Playbook rules list */}
        <div className="md:col-span-2 glass-panel bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2">Active Playbook Guidelines</h3>
          <div className="flex flex-col gap-4 max-h-96 overflow-y-auto">
            {positions.map((p) => (
              <div key={p._id} className="p-4 border border-slate-100 rounded-lg flex flex-col gap-2 relative">
                <button
                  onClick={() => handleDelete(p._id)}
                  className="absolute top-4 right-4 p-1 text-slate-400 hover:text-red-500 hover:bg-slate-50 rounded"
                >
                  <Trash size={14} />
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                    {p.clauseType}
                  </span>
                  {p.mustHave && (
                    <span className="text-[9px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded">
                      MUST HAVE
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs mt-1 leading-relaxed">
                  <div className="flex items-start gap-1">
                    <CheckCircle size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-700">Preferred:</strong>
                      <p className="text-slate-500 mt-0.5">{p.ourPosition}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-1">
                    <Info size={14} className="text-indigo-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-700">Fallback:</strong>
                      <p className="text-slate-500 mt-0.5">{p.fallbackPosition || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-1">
                    <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-700">Redline:</strong>
                      <p className="text-slate-500 mt-0.5">{p.redLine || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {positions.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-12">No playbook guidelines defined yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
