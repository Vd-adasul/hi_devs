import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api.js';
import { FileText, Upload, Eye, BarChart2, Clock, ArrowRight, AlertCircle } from 'lucide-react';

export default function ContractsPage() {
  const [matters, setMatters] = useState<any[]>([]);
  const [allDocs, setAllDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const matRes = await api.get('/matters');
        const matterList = matRes.data.data || [];
        setMatters(matterList);

        // Aggregate documents from first few matters for the list view
        const docs: any[] = [];
        for (const m of matterList.slice(0, 5)) {
          try {
            const docRes = await api.get(`/matters/${m._id}/documents`);
            (docRes.data.documents || []).forEach((d: any) => {
              docs.push({ ...d, matterName: m.name, matterId: m._id });
            });
          } catch {}
        }
        setAllDocs(docs);
      } catch (err) {
        console.warn('Failed to load contracts:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const statusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-emerald-100 text-emerald-700';
      case 'review': return 'bg-amber-100 text-amber-700';
      case 'expired': return 'bg-red-100 text-red-700';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Contract Documents</h1>
          <p className="text-sm text-slate-500 mt-1">All contracts across matter scopes — with clause, risk &amp; obligation extraction</p>
        </div>
        <Link to="/matters/new" className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors">
          <Upload size={16} />
          Upload Contract
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Contracts', value: allDocs.length, icon: FileText, color: 'text-indigo-600 bg-indigo-50' },
          { label: 'Active Matters', value: matters.length, icon: BarChart2, color: 'text-blue-600 bg-blue-50' },
          { label: 'Pending Review', value: allDocs.filter(d => d.status === 'review').length, icon: Clock, color: 'text-amber-600 bg-amber-50' },
          { label: 'Risk Flagged', value: allDocs.filter(d => d.risks && d.risks.length > 0).length, icon: AlertCircle, color: 'text-red-600 bg-red-50' },
        ].map(stat => (
          <div key={stat.label} className="bg-white border border-slate-200 rounded-xl p-5 flex items-center gap-4 shadow-sm">
            <div className={`p-3 rounded-lg ${stat.color}`}>
              <stat.icon size={20} />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">{stat.label}</p>
              <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Documents Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-slate-800">All Contract Documents</h2>
          <span className="text-xs text-slate-400">{allDocs.length} total</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
          </div>
        ) : allDocs.length === 0 ? (
          <div className="py-20 text-center">
            <FileText size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No contracts found. Create a matter and upload PDFs to get started.</p>
            <Link to="/matters/new" className="mt-4 inline-flex items-center gap-2 text-sm text-indigo-600 font-semibold hover:underline">
              Create a Matter <ArrowRight size={14} />
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Document Name</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Matter</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Version</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Clauses</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {allDocs.map((doc) => (
                <tr key={doc._id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <FileText size={16} className="text-slate-400 shrink-0" />
                      <div>
                        <p className="font-medium text-slate-800 truncate max-w-[200px]">{doc.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{(doc.file_size / 1024).toFixed(0)} KB</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Link to={`/matters/${doc.matterId}`} className="text-indigo-600 hover:underline text-xs font-medium">
                      {doc.matterName}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded font-mono">v{doc.version || 1}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-semibold px-2 py-1 rounded capitalize ${statusColor(doc.status || 'active')}`}>
                      {doc.status || 'active'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-slate-600">{doc.clauses?.length || 0} clauses</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/matters/${doc.matterId}`}
                        className="flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 font-semibold px-3 py-1.5 rounded-md hover:bg-indigo-100 transition-colors"
                      >
                        <Eye size={12} />
                        View in Twin
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
