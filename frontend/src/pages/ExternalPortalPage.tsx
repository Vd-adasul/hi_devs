import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../lib/api.js';
import {
  FileText,
  Clock,
  CheckCircle,
  MessageSquare,
  Download,
  AlertCircle
} from 'lucide-react';

export default function ExternalPortalPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [portalData, setPortalData] = useState<any>(null);

  // Form states
  const [otp, setOtp] = useState('');
  const [commentText, setCommentText] = useState('');
  const [commentDocId, setCommentDocId] = useState('');
  const [submittingOffer, setSubmittingOffer] = useState(false);
  const [proposalText, setProposalText] = useState('');

  const loadPortalData = async () => {
    try {
      const res = await api.get(`/portal/${token}`);
      setPortalData(res.data);
      if (res.data.type === 'diligence' && res.data.room?.documents?.length > 0) {
        setCommentDocId(res.data.room.documents[0]._id);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Portal connection failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadPortalData();
    }
  }, [token]);

  const handleSign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) return;
    try {
      await api.post(`/portal/${token}/sign`, { otp });
      alert('Document successfully signed!');
      loadPortalData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'OTP verification failed.');
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText || !commentDocId) return;
    try {
      await api.post(`/portal/${token}/comments`, { text: commentText, docId: commentDocId });
      setCommentText('');
      alert('Comment shared successfully.');
      loadPortalData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to post comment.');
    }
  };

  const handleSendCounterOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposalText) return;
    setSubmittingOffer(true);

    try {
      // Structure counter offer
      const clauses = [
        {
          type: 'Negotiated Terms',
          proposed: proposalText,
          rationale: 'Submitted via external counterpart negotiation portal.',
        },
      ];
      await api.post(`/portal/${token}/negotiate`, { clauses });
      setProposalText('');
      alert('Counter-proposal submitted!');
      loadPortalData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to submit offer.');
    } finally {
      setSubmittingOffer(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-950 px-4">
        <div className="max-w-md glass-panel text-center flex flex-col items-center gap-4">
          <AlertCircle size={40} className="text-red-500" />
          <h2 className="text-lg font-bold text-white">Access Denied</h2>
          <p className="text-sm text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Banner Header */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/60 px-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white">L</div>
          <span className="font-semibold text-white">LawyerOS Secure Portal</span>
        </div>
        <div className="text-xs text-slate-400">
          Gated Access • {portalData?.email || 'External Counterparty'}
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full p-6 flex flex-col gap-6">
        {/* RENDER A: Diligence Room */}
        {portalData?.type === 'diligence' && (
          <div className="flex flex-col gap-6">
            <div className="glass-panel">
              <h2 className="text-xl font-bold text-white">{portalData.room.name}</h2>
              <p className="text-sm text-slate-400 mt-1">Virtual Diligence Room - Shared Files</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 flex flex-col gap-4">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Shared Documents</h3>
                {portalData.room.documents.map((d: any) => (
                  <div key={d._id} className="glass-panel p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="text-indigo-400" size={24} />
                      <div>
                        <h4 className="text-sm font-semibold text-white">{d.name}</h4>
                        <span className="text-xs text-slate-400">{(d.file_size / 1024).toFixed(1)} KB</span>
                      </div>
                    </div>
                    <button className="p-2 rounded bg-slate-800 text-slate-300 hover:text-white">
                      <Download size={18} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Collaborative Comments Box */}
              {portalData.role !== 'view' && (
                <div className="glass-panel flex flex-col gap-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <MessageSquare size={16} /> Shared Comments
                  </h3>
                  <form onSubmit={handleAddComment} className="flex flex-col gap-3">
                    <select
                      value={commentDocId}
                      onChange={(e) => setCommentDocId(e.target.value)}
                      className="w-full text-xs bg-slate-800 text-slate-100 rounded border border-slate-700 py-1.5 px-2"
                    >
                      {portalData.room.documents.map((d: any) => (
                        <option key={d._id} value={d._id}>{d.name}</option>
                      ))}
                    </select>
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Add comment..."
                      className="w-full text-xs bg-slate-800 text-slate-100 rounded border border-slate-700 p-2 h-20 focus:outline-none"
                    />
                    <button type="submit" className="w-full btn-primary text-xs justify-center py-2 rounded-lg">
                      Submit Comment
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}

        {/* RENDER B: E-Signature Consent Check */}
        {portalData?.type === 'signature' && (
          <div className="max-w-2xl mx-auto w-full glass-panel flex flex-col gap-6">
            <div className="text-center">
              <h2 className="text-xl font-bold text-white">E-Signature Request</h2>
              <p className="text-sm text-slate-400 mt-1">Review the document below and sign securely using OTP</p>
            </div>

            <div className="border border-slate-800 rounded bg-slate-900/40 p-4 font-mono text-xs max-h-60 overflow-y-auto whitespace-pre-wrap leading-relaxed">
              {portalData.contract?.rawText || 'No plain text representation available.'}
            </div>

            {portalData.signer.status === 'signed' ? (
              <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-500 rounded p-4 text-center flex flex-col items-center gap-2">
                <CheckCircle size={32} />
                <h3 className="font-bold">You have successfully signed this document!</h3>
                <span className="text-xs">A copy of the execution record has been logged in the system.</span>
              </div>
            ) : (
              <form onSubmit={handleSign} className="flex flex-col gap-4 border-t border-slate-800 pt-4">
                <h3 className="text-sm font-semibold text-slate-300">Authorize Execution</h3>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-400">Enter 6-digit OTP Code</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      required
                      className="bg-slate-900 border border-slate-700/60 rounded-lg py-2 px-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-center tracking-widest w-40"
                      placeholder="123456"
                    />
                    <button type="submit" className="btn-primary flex-1 justify-center rounded-lg">
                      Authorize & Sign
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1">
                    Verify the OTP code sent to your email to sign this transaction.
                  </span>
                </div>
              </form>
            )}
          </div>
        )}

        {/* RENDER C: Alternating Offer Negotiation */}
        {portalData?.type === 'negotiation' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 glass-panel flex flex-col gap-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Clock size={18} className="text-indigo-400" /> Bilateral Negotiation Portal
              </h2>

              {/* Negotiation timeline history */}
              <div className="flex flex-col gap-4 max-h-80 overflow-y-auto border border-slate-800 rounded p-4 bg-slate-900/20">
                {portalData.negotiation.rounds.map((r: any) => (
                  <div key={r.roundNumber} className={`p-3 rounded-lg border text-xs ${
                    r.offerBy === 'us' ? 'bg-indigo-950/20 border-indigo-800/60 self-end w-4/5' : 'bg-slate-800/40 border-slate-700/60 w-4/5'
                  }`}>
                    <div className="font-semibold text-slate-300 mb-1">
                      {r.offerBy === 'us' ? 'Firm Offer' : 'Your Counter-proposal'} (Round {r.roundNumber})
                    </div>
                    {r.clauses.map((c: any, idx: number) => (
                      <div key={idx} className="mt-1">
                        <strong>{c.type}:</strong> {c.proposed}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-panel flex flex-col gap-4">
              <h3 className="text-sm font-semibold text-white">Submit Counter-Offer</h3>
              <form onSubmit={handleSendCounterOffer} className="flex flex-col gap-3">
                <textarea
                  value={proposalText}
                  onChange={(e) => setProposalText(e.target.value)}
                  placeholder="Detail your proposed counter clause parameters (e.g. Liability cap at $500,000, Payment terms Net-45)..."
                  className="w-full text-xs bg-slate-800 text-slate-100 rounded border border-slate-700 p-2 h-32 focus:outline-none"
                  required
                />
                <button
                  type="submit"
                  disabled={submittingOffer}
                  className="w-full btn-primary text-xs justify-center py-2 rounded-lg"
                >
                  {submittingOffer ? 'Submitting offer...' : 'Submit Counter Offer'}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
