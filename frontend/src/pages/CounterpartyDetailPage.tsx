import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../lib/api.js';
import {
  TrendingUp,
  ArrowLeft,
  Mail,
  Building,
  Plus
} from 'lucide-react';

export default function CounterpartyDetailPage() {
  const { id } = useParams();
  const [party, setParty] = useState<any>(null);
  const [concessionNotes, setConcessionNotes] = useState('');
  const [clauseCategory, setClauseCategory] = useState('PaymentTerms');

  const loadPartyDetails = async () => {
    try {
      const res = await api.get('/counterparties');
      const matched = res.data.data?.find((c: any) => c._id === id);
      setParty(matched);
    } catch (err) {
      console.warn('Failed to load party details:', err);
    }
  };

  useEffect(() => {
    if (id) {
      loadPartyDetails();
    }
  }, [id]);

  const handleAddConcession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!concessionNotes) return;

    try {
      await api.post(`/counterparties/${id}/concessions`, {
        notes: concessionNotes,
        category: clauseCategory,
      });
      setConcessionNotes('');
      loadPartyDetails();
      alert('Concession logs registered successfully.');
    } catch (err) {
      alert('Failed to log concession.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header back link */}
      <div>
        <Link to="/counterparties" className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-semibold mb-2">
          <ArrowLeft size={12} /> Back to Directory
        </Link>
        <h1 className="text-2xl font-bold text-slate-800">{party?.name || 'Partner Profile'}</h1>
        <div className="flex gap-4 text-xs text-slate-500 mt-1">
          <div className="flex items-center gap-1"><Building size={12} /> {party?.company || 'N/A'}</div>
          <div className="flex items-center gap-1"><Mail size={12} /> {party?.email || 'N/A'}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Concession Logger */}
        <div className="glass-panel bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2">Log Negotiated Concession</h3>
          <form onSubmit={handleAddConcession} className="flex flex-col gap-4 text-xs">
            <div className="flex flex-col gap-1">
              <label className="text-slate-400 font-medium">Clause Category</label>
              <select
                value={clauseCategory}
                onChange={(e) => setClauseCategory(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2"
              >
                <option value="PaymentTerms">Payment Terms</option>
                <option value="Liability">Limitation of Liability</option>
                <option value="Termination">Termination</option>
                <option value="Indemnification">Indemnification</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-slate-400 font-medium">Concession Details</label>
              <textarea
                value={concessionNotes}
                onChange={(e) => setConcessionNotes(e.target.value)}
                placeholder="Partner agreed to Net-45 instead of Net-60 in previous NDA..."
                className="w-full bg-slate-50 border border-slate-200 rounded p-2 h-24 focus:outline-none"
                required
              />
            </div>
            <button type="submit" className="w-full btn-primary justify-center py-2 rounded-lg font-semibold flex items-center gap-1">
              <Plus size={14} /> Log Concession
            </button>
          </form>
        </div>

        {/* Concession history logs list */}
        <div className="md:col-span-2 glass-panel bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-2">
            <TrendingUp size={16} className="text-indigo-600" /> Counterparty Concessions & Memory
          </h3>
          <div className="flex flex-col gap-3">
            {party?.concessions?.map((item: any, idx: number) => (
              <div key={idx} className="p-4 border border-slate-100 rounded-lg bg-slate-50/20 text-xs">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded uppercase text-[9px] tracking-wider">
                    {item.category}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Logged: {new Date(item.timestamp).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-slate-700 leading-relaxed italic">"{item.notes}"</p>
              </div>
            ))}
            {(!party?.concessions || party.concessions.length === 0) && (
              <p className="text-xs text-slate-400 text-center py-12">No concession events recorded in profile history.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
