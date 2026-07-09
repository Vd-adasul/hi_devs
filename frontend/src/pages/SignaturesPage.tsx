import { useState, useEffect } from 'react';
import api from '../lib/api.js';
import {
  FileSignature,
  Plus,
  Clock,
  CheckCircle,
  ExternalLink,
  RefreshCw
} from 'lucide-react';

export default function SignaturesPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form states
  const [contracts, setContracts] = useState<any[]>([]);
  const [selectedContractId, setSelectedContractId] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');

  const loadRequests = async () => {
    try {
      const res = await api.get('/signatures');
      setRequests(res.data.data || []);

      // Also load matters to populate contracts selection
      const matRes = await api.get('/matters');
      const matterList = matRes.data.data || [];
      const docs: any[] = [];
      for (const m of matterList) {
        try {
          const docRes = await api.get(`/matters/${m._id}/documents`);
          (docRes.data.documents || []).forEach((d: any) => {
            docs.push({ id: d._id, name: `${d.name} (${m.name})` });
          });
        } catch {}
      }
      setContracts(docs);
    } catch (err) {
      console.warn('Failed to load signature requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContractId || !signerName || !signerEmail) return;
    setCreating(true);
    try {
      await api.post('/signatures/request', {
        contractId: selectedContractId,
        signers: [{ email: signerEmail, name: signerName }],
      });
      setSelectedContractId('');
      setSignerName('');
      setSignerEmail('');
      setShowCreate(false);
      loadRequests();
      alert('E-signature request dispatched successfully.');
    } catch (err: any) {
      alert(`Error: ${err.response?.data?.error || err.message}`);
    } finally {
      setCreating(false);
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'signed':
      case 'completed': return 'bg-emerald-100 text-emerald-700';
      case 'pending': return 'bg-amber-100 text-amber-700';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">E-Signature Dispatch</h1>
          <p className="text-sm text-slate-500 mt-1">Track counterparty signatures, view sign-off status, and generate secure OTP links</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadRequests}
            className="flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
          >
            <Plus size={16} />
            New Signature Request
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Requests', value: requests.length, icon: FileSignature, color: 'text-indigo-600 bg-indigo-50' },
          { label: 'Pending Signature', value: requests.filter(r => r.status === 'pending').length, icon: Clock, color: 'text-amber-600 bg-amber-50' },
          { label: 'Completed Sign-Offs', value: requests.filter(r => r.status === 'completed' || r.status === 'signed').length, icon: CheckCircle, color: 'text-emerald-600 bg-emerald-50' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-5 flex items-center gap-4 shadow-sm">
            <div className={`p-3 rounded-lg ${s.color}`}>
              <s.icon size={20} />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">{s.label}</p>
              <p className="text-2xl font-bold text-slate-800">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Requests Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : requests.length === 0 ? (
          <div className="py-20 text-center">
            <FileSignature size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No signature requests found.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Contract Title</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Signer Info</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Link (Testing)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {requests.map((r: any) => (
                <tr key={r._id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-semibold text-slate-800">{r.contractTitle || 'Contract'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">ID: {r._id}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {r.signers?.map((s: any, idx: number) => (
                      <div key={idx} className="flex flex-col gap-0.5">
                        <span className="font-medium text-slate-700">{s.name} ({s.email})</span>
                        <span className="text-[10px] text-slate-400">OTP Code: <strong className="text-slate-600 font-mono">{s.otp}</strong></span>
                      </div>
                    ))}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-bold px-2 py-1 rounded uppercase ${statusColor(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {r.signers?.map((s: any, idx: number) => (
                      <a
                        key={idx}
                        href={`/sign/${s.token}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-indigo-600 font-semibold hover:underline flex items-center gap-1"
                      >
                        Open Portal <ExternalLink size={12} />
                      </a>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New Request Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4">New Signature Request</h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Select Contract Document</label>
                <select
                  value={selectedContractId}
                  onChange={e => setSelectedContractId(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  required
                >
                  <option value="">Select contract...</option>
                  {contracts.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Signer Full Name</label>
                <input
                  type="text"
                  value={signerName}
                  onChange={e => setSignerName(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="e.g. Jane Doe"
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
                  placeholder="jane.doe@counterparty.com"
                  required
                />
              </div>
              <div className="flex gap-3 justify-end mt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="text-sm text-slate-500 hover:text-slate-700 font-medium px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-6 py-2 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <FileSignature size={14} />
                  {creating ? 'Sending...' : 'Send Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
