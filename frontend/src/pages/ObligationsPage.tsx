import { useState, useEffect } from 'react';
import api from '../lib/api.js';
import {
  Calendar,
  CheckCircle,
  Upload,
  ExternalLink
} from 'lucide-react';

export default function ObligationsPage() {
  const [obligations, setObligations] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const loadObligations = async () => {
    try {
      const res = await api.get(`/obligations?status=${activeTab}`);
      setObligations(res.data.data || []);
    } catch (err) {
      console.warn('Failed to load obligations:', err);
    }
  };

  useEffect(() => {
    loadObligations();
  }, [activeTab]);

  const handleComplete = async (id: string) => {
    const notes = window.prompt('Specify completion notes or details:');
    if (notes === null) return;

    try {
      await api.patch(`/obligations/${id}/complete`, { notes });
      loadObligations();
      alert('Obligation milestone marked completed.');
    } catch (err) {
      alert('Failed to update obligation status.');
    }
  };

  const handleUploadEvidence = async (id: string, file: File) => {
    setUploadingId(id);
    try {
      const buffer = await file.arrayBuffer();
      await api.post(`/obligations/${id}/evidence?name=${encodeURIComponent(file.name)}`, buffer, {
        headers: { 'Content-Type': 'application/pdf' },
      });
      loadObligations();
      alert('Evidence uploaded successfully.');
    } catch (err) {
      alert('Evidence upload failed.');
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 font-outfit">Obligations Timeline</h1>
        <p className="text-sm text-slate-500 mt-1">Audit active compliance milestones, deadlines, and upload validation evidence</p>
      </div>

      <div className="glass-panel bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col gap-4">
        {/* Tab filters */}
        <div className="flex border-b border-slate-200 gap-4 mb-2">
          <button
            onClick={() => setActiveTab('pending')}
            className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'pending' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'
            }`}
          >
            Pending Obligations
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'completed' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400'
            }`}
          >
            Completed Audit Record
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {obligations.map((item) => (
            <div key={item._id} className="p-4 border border-slate-100 bg-slate-50/20 rounded-lg flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-slate-800 leading-relaxed font-sans">{item.raw_text}</p>
                  <span className="text-[10px] text-slate-400 block mt-1">Matter Reference: {item.matter_id || 'Global'}</span>
                </div>
                {item.due_date && (
                  <div className="flex items-center gap-1.5 text-xs text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded font-semibold border border-indigo-100">
                    <Calendar size={14} />
                    <span>Due: {new Date(item.due_date).toLocaleDateString()}</span>
                  </div>
                )}
              </div>

              {/* Action indicators */}
              {activeTab === 'pending' ? (
                <div className="flex gap-2 justify-end mt-2">
                  <button
                    onClick={() => handleComplete(item._id)}
                    className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1"
                  >
                    <CheckCircle size={14} /> Mark Completed
                  </button>
                  <label className="cursor-pointer px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1">
                    <Upload size={14} />
                    <span>{uploadingId === item._id ? 'Uploading...' : 'Upload Evidence'}</span>
                    <input
                      type="file"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadEvidence(item._id, file);
                      }}
                      className="hidden"
                      accept="application/pdf"
                    />
                  </label>
                </div>
              ) : (
                <div className="border-t border-slate-100 pt-3 flex flex-col gap-2 text-xs">
                  <div className="text-slate-600">
                    <strong>Completion Notes:</strong> {item.completionNotes || 'None logged.'}
                  </div>
                  {item.evidence?.length > 0 && (
                    <div>
                      <strong className="text-slate-500">Supporting Evidence:</strong>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {item.evidence.map((ev: any, idx: number) => (
                          <a
                            key={idx}
                            href={ev.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 border border-slate-200 rounded text-[10px] font-medium text-slate-700 hover:text-indigo-600"
                          >
                            <span>{ev.fileName}</span>
                            <ExternalLink size={10} />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {obligations.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-12">No obligations records in this query.</p>
          )}
        </div>
      </div>
    </div>
  );
}
