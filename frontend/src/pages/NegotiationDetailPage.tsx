import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import {
  ArrowLeft,
  Clock
} from 'lucide-react';
import { VoiceOutput } from '../components/common/VoiceOutput.js';

export default function NegotiationDetailPage() {
  const { id } = useParams();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Submit round
  const [proposedText, setProposedText] = useState('');
  const [analyzingRound, setAnalyzingRound] = useState(false);

  const loadSessionDetails = async () => {
    try {
      const res = await api.get('/negotiations');
      const matched = res.data.data?.find((s: any) => s._id === id);
      setSession(matched);
    } catch (err) {
      console.warn('Failed to load negotiation session:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      loadSessionDetails();
    }
  }, [id]);

  const handlePostOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposedText) return;
    setAnalyzingRound(true);

    try {
      const clauses = [
        {
          type: 'Negotiated Terms',
          proposed: proposedText,
          rationale: 'Submitted via LawyerOS bilateral agent console.',
        },
      ];
      await api.post(`/negotiations/${id}/rounds`, { clauses });
      setProposedText('');
      loadSessionDetails();
      alert('Negotiation round submitted successfully!');
    } catch (err) {
      alert('Failed to register negotiation round.');
    } finally {
      setAnalyzingRound(false);
    }
  };

  const handleStatusChange = async (newStatus: 'accepted' | 'rejected') => {
    if (!window.confirm(`Mark negotiation session as ${newStatus}?`)) return;
    try {
      await api.post(`/negotiations/${id}/${newStatus}`);
      loadSessionDetails();
      alert(`Negotiation session status marked as ${newStatus}.`);
    } catch (err) {
      alert('Failed to update session status.');
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header back links */}
      <div>
        <Link to="/negotiations" className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-semibold mb-2">
          <ArrowLeft size={12} /> Back to Sessions
        </Link>
        <h1 className="text-2xl font-bold text-slate-800">Bilateral Negotiation Round Dashboard</h1>
        <div className="flex gap-4 text-xs text-slate-500 mt-1">
          <span>Counterparty Email: <span className="font-semibold">{session?.counterpartyEmail}</span></span>
          <span>Status: <span className="font-semibold capitalize">{session?.status}</span></span>
        </div>
      </div>

      {/* Grid workspace */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Col: Historical rounds */}
        <div className="md:col-span-2 glass-panel bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-2">
            <Clock size={16} className="text-indigo-600" /> Alternating Offers Timeline
          </h3>

          <div className="flex flex-col gap-4 max-h-[350px] overflow-y-auto pr-2">
            {session?.rounds?.map((r: any) => (
              <div key={r.roundNumber} className={`p-4 border rounded-lg text-xs leading-relaxed flex flex-col gap-2 ${
                r.offerBy === 'us' ? 'bg-indigo-50/20 border-indigo-100 self-end w-4/5' : 'bg-slate-50 border-slate-200 w-4/5'
              }`}>
                <div className="flex justify-between items-center font-bold text-slate-700 border-b border-slate-100 pb-1.5 mb-1.5">
                  <span>{r.offerBy === 'us' ? 'Firm Offer' : 'Counterparty Offer'} (Round {r.roundNumber})</span>
                  <span className="text-[10px] text-slate-400 font-normal">{new Date(r.timestamp).toLocaleDateString()}</span>
                </div>
                {r.clauses.map((c: any, idx: number) => (
                  <div key={idx} className="mt-1">
                    <strong>{c.type}:</strong> {c.proposed}
                    {c.rationale && <p className="text-[11px] text-slate-400 mt-0.5 italic">Rationale: {c.rationale}</p>}
                  </div>
                ))}

                {/* AI Negotiation Concession Analysis */}
                {r.aiAnalysis && (
                  <div className="bg-indigo-50 text-indigo-900 border border-indigo-100 p-2.5 rounded-md mt-2 font-mono text-[11px] flex flex-col gap-1">
                    <div>
                      <strong>AI Agent Concession Estimate:</strong> {r.aiAnalysis.analysis}
                    </div>
                    {r.aiAnalysis.recommendation && (
                      <div className="mt-1 font-sans flex justify-between items-center">
                        <span className="text-[10px] text-indigo-700 font-semibold bg-indigo-100 px-2 py-0.5 rounded">
                          Action: {r.aiAnalysis.recommendation}
                        </span>
                        <VoiceOutput text={r.aiAnalysis.analysis} label="Hear concession recommendation" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {(!session?.rounds || session.rounds.length === 0) && (
              <p className="text-xs text-slate-400 text-center py-12">No negotiation rounds executed.</p>
            )}
          </div>
        </div>

        {/* Right Col: Submit Counter / Actions */}
        <div className="flex flex-col gap-6">
          {session?.status === 'active' ? (
            <div className="glass-panel bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col gap-4">
              <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2">Propose Counter</h3>
              <form onSubmit={handlePostOffer} className="flex flex-col gap-3 text-xs">
                <textarea
                  value={proposedText}
                  onChange={(e) => setProposedText(e.target.value)}
                  placeholder="Detail your counter proposal terms..."
                  className="w-full bg-slate-50 border border-slate-200 rounded p-2 h-32 focus:outline-none"
                  required
                />
                <button
                  type="submit"
                  disabled={analyzingRound}
                  className="w-full btn-primary justify-center py-2 rounded-lg font-semibold flex items-center gap-1"
                >
                  {analyzingRound ? 'Analyzing concession...' : 'Submit Counter'}
                </button>
              </form>

              <div className="border-t border-slate-100 pt-4 flex gap-2">
                <button
                  onClick={() => handleStatusChange('accepted')}
                  className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold text-center"
                >
                  Accept Terms
                </button>
                <button
                  onClick={() => handleStatusChange('rejected')}
                  className="flex-1 px-3 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded text-xs font-semibold text-center"
                >
                  Reject & Close
                </button>
              </div>
            </div>
          ) : (
            <div className="glass-panel bg-white border border-slate-200 shadow-sm rounded-xl p-6 text-center text-xs">
              <span className={`inline-block font-bold uppercase px-3 py-1 rounded-full mb-2 ${
                session?.status === 'accepted' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              }`}>
                {session?.status}
              </span>
              <p className="text-slate-400">This negotiation session has been finalized and closed.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
