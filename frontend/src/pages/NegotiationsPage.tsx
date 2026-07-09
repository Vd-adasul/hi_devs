import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import {
  Plus,
  ExternalLink
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function NegotiationsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [counterpartyEmail, setCounterpartyEmail] = useState('');
  const [deadlineDays, setDeadlineDays] = useState(7);
  
  // Setup forms
  const [selectedDocId, setSelectedDocId] = useState('');
  const [documents, setDocuments] = useState<any[]>([]);

  const loadSessions = async () => {
    try {
      const res = await api.get('/negotiations');
      setSessions(res.data.data || []);

      // Get documents to list
      const matRes = await api.get('/matters');
      const matters = matRes.data.data || [];
      const docsList: any[] = [];
      for (const m of matters) {
        const docRes = await api.get(`/matters/${m._id}/documents`);
        docsList.push(...(docRes.data.documents || []));
      }
      setDocuments(docsList);
      if (docsList.length > 0) {
        setSelectedDocId(docsList[0]._id);
      }
    } catch (err) {
      console.warn('Failed to load negotiations:', err);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocId || !counterpartyEmail) return;

    try {
      // Calculate deadline date
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + Number(deadlineDays));

      await api.post('/negotiations', {
        contractId: selectedDocId,
        counterpartyEmail,
        deadline,
      });
      setCounterpartyEmail('');
      loadSessions();
      alert('Negotiation session initialized successfully.');
    } catch (err) {
      alert('Failed to initialize session.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 font-outfit">Negotiation Engine</h1>
        <p className="text-sm text-slate-500 mt-1">Manage AI-bilateral negotiation sessions, estimate ZOPAs, and review counters</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Start session form */}
        <div className="glass-panel bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2">Start Negotiation</h3>
          <form onSubmit={handleStartSession} className="flex flex-col gap-4 text-xs">
            <div className="flex flex-col gap-1">
              <label className="text-slate-400 font-medium">Select Contract</label>
              <select
                value={selectedDocId}
                onChange={(e) => setSelectedDocId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2"
              >
                {documents.map((d) => (
                  <option key={d._id} value={d._id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-slate-400 font-medium">Counterparty Email</label>
              <input
                type="email"
                value={counterpartyEmail}
                onChange={(e) => setCounterpartyEmail(e.target.value)}
                placeholder="partner@company.com"
                className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-slate-400 font-medium">Session Duration (Days)</label>
              <input
                type="number"
                value={deadlineDays}
                onChange={(e) => setDeadlineDays(Number(e.target.value))}
                min={1}
                max={30}
                className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2"
                required
              />
            </div>
            <button type="submit" className="w-full btn-primary justify-center py-2 rounded-lg font-semibold flex items-center gap-1">
              <Plus size={14} /> Start Session
            </button>
          </form>
        </div>

        {/* Sessions list */}
        <div className="md:col-span-2 glass-panel bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2">Active Sessions</h3>
          <div className="flex flex-col gap-3">
            {sessions.map((sess) => (
              <div key={sess._id} className="p-4 border border-slate-100 rounded-lg flex justify-between items-center hover:border-indigo-100 hover:bg-slate-50/50 transition-colors">
                <div>
                  <h4 className="text-sm font-bold text-slate-800">
                    Negotiation on Document
                  </h4>
                  <span className="text-xs text-slate-400 mt-1 block">Counterparty: {sess.counterpartyEmail}</span>
                  <div className="flex gap-2 items-center mt-2">
                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${
                      sess.status === 'active' ? 'bg-indigo-50 text-indigo-700' :
                      sess.status === 'accepted' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                    }`}>
                      {sess.status}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Rounds: {(sess.rounds || []).length}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-end">
                  {sess.portalToken && (
                    <a
                      href={`/portal/${sess.portalToken}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-indigo-600 hover:underline flex items-center gap-0.5 font-medium"
                    >
                      Counter Portal <ExternalLink size={10} />
                    </a>
                  )}
                  <Link
                    to={`/negotiations/${sess._id}`}
                    className="text-xs bg-indigo-50 text-indigo-700 font-semibold px-3 py-1.5 rounded-md hover:bg-indigo-100"
                  >
                    Manage Deal
                  </Link>
                </div>
              </div>
            ))}
            {sessions.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-12">No negotiation sessions currently initialized.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
