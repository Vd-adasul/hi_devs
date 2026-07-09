import React, { useState } from 'react';
import api from '../lib/api.js';
import {
  Search,
  BookOpen,
  FileText
} from 'lucide-react';
import { VoiceInput } from '../components/common/VoiceInput.js';
import { VoiceOutput } from '../components/common/VoiceOutput.js';

export default function ResearchPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [memo, setMemo] = useState('');
  const [generatingMemo, setGeneratingMemo] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;
    setLoading(true);
    setMemo('');

    try {
      const res = await api.get(`/research/search?query=${encodeURIComponent(query)}`);
      setResults(res.data.data || []);
    } catch (err) {
      alert('Indian Kanoon precedent lookup failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateMemo = async () => {
    if (results.length === 0) return;
    setGeneratingMemo(true);

    try {
      const docIds = results.map(r => r.tid);
      const res = await api.post('/research/memo', { query, docIds });
      setMemo(res.data.memo);
    } catch (err) {
      alert('Failed to generate statutory memo.');
    } finally {
      setGeneratingMemo(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 font-outfit">Statutory Research Agent</h1>
        <p className="text-sm text-slate-500 mt-1">Search Indian Kanoon legal precedents and generate structured research memos</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Search Panel */}
        <div className="glass-panel bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2">Precedent Lookup</h3>
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4.5 w-4.5 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search precedents (e.g. section 138)..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-10 pr-4 text-xs placeholder-slate-400 text-slate-700 focus:outline-none"
                required
              />
            </div>
            <VoiceInput onTranscript={(t) => setQuery(prev => `${prev} ${t}`)} />
            <button type="submit" disabled={loading} className="btn-primary rounded-lg text-xs py-2 px-4 font-semibold">
              Search
            </button>
          </form>

          {/* Results list */}
          <div className="flex flex-col gap-3 max-h-80 overflow-y-auto mt-2">
            {results.map((res) => (
              <div key={res.tid} className="p-3 border border-slate-100 rounded-lg text-xs">
                <h4 className="font-bold text-slate-700 leading-tight">{res.title}</h4>
                <div className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded mt-1.5 inline-block">
                  Doc ID: {res.tid}
                </div>
              </div>
            ))}
            {results.length > 0 && (
              <button
                onClick={handleGenerateMemo}
                disabled={generatingMemo}
                className="w-full btn-primary justify-center text-xs py-2 mt-2 font-semibold flex items-center gap-1.5"
              >
                <FileText size={14} />
                {generatingMemo ? 'Assembling Statutory Memo...' : 'Synthesize Research Memo'}
              </button>
            )}
            {results.length === 0 && !loading && (
              <p className="text-xs text-slate-400 text-center py-12">Search to fetch Indian Kanoon precedents.</p>
            )}
          </div>
        </div>

        {/* Memo Viewer */}
        <div className="md:col-span-2 glass-panel bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col gap-4 min-h-[350px]">
          <div className="flex justify-between items-center border-b border-slate-100 pb-2">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <BookOpen size={16} className="text-indigo-600" /> Compiled Statutory Memo
            </h3>
            {memo && <VoiceOutput text={memo} label="Hear statutory memo summary" />}
          </div>

          <div className="flex-1 overflow-y-auto pr-2">
            {memo ? (
              <div className="text-xs text-slate-700 leading-relaxed font-sans whitespace-pre-wrap bg-slate-50 border border-slate-100 rounded-lg p-4 font-inter">
                {memo}
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-24">
                Research memo will be rendered here after synthesizing Indian Kanoon precedent listings.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
