import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../lib/api.js';
import {
  Shield,
  FileText,
  Users,
  Plus,
  Send,
  ArrowLeft,
  Clock,
  ExternalLink,
  Lock,
  FileSignature
} from 'lucide-react';

export default function DiligenceRoomDetailPage() {
  const { id } = useParams();
  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [matterDocs, setMatterDocs] = useState<any[]>([]);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  // Invite states
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('view');
  const [inviting, setInviting] = useState(false);

  // Add doc state
  const [selectedDocId, setSelectedDocId] = useState('');
  const [addingDoc, setAddingDoc] = useState(false);

  // Signature request state
  const [signingDocId, setSigningDocId] = useState('');
  const [showSignRequest, setShowSignRequest] = useState(false);
  const [signerEmail, setSignerEmail] = useState('');
  const [signerName, setSignerName] = useState('');
  const [requestingSign, setRequestingSign] = useState(false);

  const loadRoomDetails = async () => {
    try {
      const res = await api.get(`/diligence/rooms/${id}`);
      setRoom(res.data.data);

      if (res.data.data?.matterId) {
        const docsRes = await api.get(`/matters/${res.data.data.matterId}/documents`);
        setMatterDocs(docsRes.data.documents || []);
      }
    } catch (err) {
      console.warn('Failed to load room details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      loadRoomDetails();
    }
  }, [id]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    setInviting(true);
    try {
      await api.post(`/diligence/rooms/${id}/access`, {
        email: inviteEmail,
        role: inviteRole,
      });
      setInviteEmail('');
      setShowInvite(false);
      loadRoomDetails();
      alert(`Invitation sent successfully to ${inviteEmail}`);
    } catch (err: any) {
      alert(`Error: ${err.response?.data?.error || err.message}`);
    } finally {
      setInviting(false);
    }
  };

  const handleAddDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocId) return;
    setAddingDoc(true);
    try {
      await api.post(`/diligence/rooms/${id}/docs`, {
        documentId: selectedDocId,
      });
      setSelectedDocId('');
      setShowAddDoc(false);
      loadRoomDetails();
    } catch (err: any) {
      alert(`Error: ${err.response?.data?.error || err.message}`);
    } finally {
      setAddingDoc(false);
    }
  };

  const handleSignRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signerEmail || !signerName || !signingDocId) return;
    setRequestingSign(true);
    try {
      await api.post('/signatures/request', {
        contractId: signingDocId,
        signers: [{ email: signerEmail, name: signerName }],
      });
      setSignerEmail('');
      setSignerName('');
      setSigningDocId('');
      setShowSignRequest(false);
      loadRoomDetails();
      alert('E-signature request dispatched successfully.');
    } catch (err: any) {
      alert(`Error: ${err.response?.data?.error || err.message}`);
    } finally {
      setRequestingSign(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500">Virtual diligence room not found.</p>
        <Link to="/diligence" className="text-indigo-600 hover:underline mt-2 inline-block">Back to rooms</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <Link to="/diligence" className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1">
          <ArrowLeft size={12} /> Back to Rooms
        </Link>
        <div className="flex justify-between items-center mt-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 shadow-inner">
              <Shield size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">{room.name}</h1>
              <p className="text-sm text-slate-500">Virtual Diligence Room for secure documentation exchange</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowInvite(true)}
              className="flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              <Users size={16} />
              Invite External User
            </button>
            <button
              onClick={() => setShowAddDoc(true)}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              <Plus size={16} />
              Add Document
            </button>
          </div>
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Documents list */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <FileText size={16} className="text-slate-500" />
                Diligence Documents ({room.documents?.length || 0})
              </h2>
            </div>

            {(!room.documents || room.documents.length === 0) ? (
              <div className="py-16 text-center">
                <Lock size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-400">No documents shared in this diligence room yet.</p>
                <button onClick={() => setShowAddDoc(true)} className="mt-2 text-xs text-indigo-600 font-semibold hover:underline">
                  Add documents from Matter Twin
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {room.documents.map((doc: any) => (
                  <div key={doc._id} className="p-4 flex items-center justify-between hover:bg-slate-50/40 transition-colors">
                    <div className="flex items-center gap-3">
                      <FileText size={18} className="text-slate-400" />
                      <div>
                        <h4 className="text-sm font-semibold text-slate-800">{doc.name}</h4>
                        <p className="text-xs text-slate-400 mt-0.5">Version {doc.version} · {(doc.file_size / 1024).toFixed(0)} KB</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setSigningDocId(doc._id); setShowSignRequest(true); }}
                        className="flex items-center gap-1 text-xs font-semibold bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors"
                      >
                        <FileSignature size={12} />
                        Request E-Sign
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Collaborators list */}
        <div className="flex flex-col gap-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 flex flex-col gap-4">
            <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-2">
              <Users size={16} className="text-slate-500" />
              Collaborators &amp; Access Tokens
            </h3>

            {(!room.collaborators || room.collaborators.length === 0) ? (
              <p className="text-xs text-slate-400 text-center py-6">No external users invited yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {room.collaborators.map((c: any, idx: number) => (
                  <div key={idx} className="p-3 border border-slate-100 rounded-lg bg-slate-50/50 flex flex-col gap-1.5">
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-semibold text-slate-700 truncate max-w-[150px]">{c.email}</span>
                      <span className="text-[10px] uppercase font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">
                        {c.role}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        Expires {new Date(c.expiresAt).toLocaleDateString()}
                      </span>
                      <a
                        href={`/portal/${c.token}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 font-semibold flex items-center gap-0.5 hover:underline"
                      >
                        Portal Link <ExternalLink size={8} />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Invite External Collaborator</h2>
            <form onSubmit={handleInvite} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Email Address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="partner@counterparty.com"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Access Level Role</label>
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="view">Viewer (Read Only)</option>
                  <option value="comment">Commenter (Add annotations)</option>
                </select>
              </div>
              <div className="flex gap-3 justify-end mt-2">
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="text-sm text-slate-500 hover:text-slate-700 font-medium px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-6 py-2 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Send size={14} />
                  {inviting ? 'Sending...' : 'Send Access Email'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Document Modal */}
      {showAddDoc && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Add Document to Diligence Room</h2>
            <form onSubmit={handleAddDoc} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Select Document from Matter</label>
                <select
                  value={selectedDocId}
                  onChange={e => setSelectedDocId(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  required
                >
                  <option value="">Select doc...</option>
                  {matterDocs.map(doc => (
                    <option key={doc._id} value={doc._id}>{doc.name} (v{doc.version})</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 justify-end mt-2">
                <button
                  type="button"
                  onClick={() => setShowAddDoc(false)}
                  className="text-sm text-slate-500 hover:text-slate-700 font-medium px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingDoc}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-6 py-2 rounded-lg transition-colors"
                >
                  {addingDoc ? 'Adding...' : 'Add Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Signature Request Modal */}
      {showSignRequest && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Request E-Signature</h2>
            <form onSubmit={handleSignRequest} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Signer Full Name</label>
                <input
                  type="text"
                  value={signerName}
                  onChange={e => setSignerName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="e.g. John Doe"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Signer Email</label>
                <input
                  type="email"
                  value={signerEmail}
                  onChange={e => setSignerEmail(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="john.doe@counterparty.com"
                  required
                />
              </div>
              <div className="flex gap-3 justify-end mt-2">
                <button
                  type="button"
                  onClick={() => { setShowSignRequest(false); setSigningDocId(''); }}
                  className="text-sm text-slate-500 hover:text-slate-700 font-medium px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={requestingSign}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-6 py-2 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <FileSignature size={14} />
                  {requestingSign ? 'Requesting...' : 'Dispatch Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
