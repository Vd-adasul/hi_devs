import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import api from '../lib/api.js';
import {
  Upload,
  AlertTriangle
} from 'lucide-react';
import { VoiceInput } from '../components/common/VoiceInput.js';
import { VoiceOutput } from '../components/common/VoiceOutput.js';

export default function MatterDetailPage() {
  const { id } = useParams();
  const [matter, setMatter] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'twin' | 'qa' | 'conflicts'>('twin');
  const [uploading, setUploading] = useState(false);
  const [log, setLog] = useState('');
  
  // Chat state
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadMatterState = async () => {
    try {
      const matRes = await api.get(`/matters`);
      const matched = matRes.data.data?.find((m: any) => m._id === id);
      setMatter(matched);

      const docRes = await api.get(`/matters/${id}/documents`);
      setDocuments(docRes.data.documents || []);
    } catch (err) {
      console.warn('Failed to load matter state:', err);
    }
  };

  useEffect(() => {
    if (id) {
      loadMatterState();
    }
  }, [id]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setLog('Parsing document and checking for scanned PDF triggers...');
    try {
      const arrayBuffer = await file.arrayBuffer();
      await api.post(`/matters/${id}/documents?name=${encodeURIComponent(file.name)}`, arrayBuffer, {
        headers: { 'Content-Type': 'application/pdf' },
      });
      setLog('Document structured and indexed in Qdrant & Neo4j databases successfully!');
      loadMatterState();
    } catch (err: any) {
      setLog(`Error: ${err.response?.data?.error || err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;
    setChatLoading(true);

    const userMsg = { id: Date.now().toString(), sender: 'user', text: query };
    setMessages(prev => [...prev, userMsg]);
    const activeQuery = query;
    setQuery('');

    try {
      const res = await api.post(`/matters/${id}/qa`, { query: activeQuery });
      const assistantMsg = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: res.data.answer,
        sources: res.data.sources || [],
        citationVerifications: res.data.citationVerifications || [],
        trust: res.data._trust,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), sender: 'assistant', text: 'Error executing Hybrid Graph RAG check.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Title Header */}
      <div className="flex justify-between items-center glass-panel bg-white border border-slate-200 shadow-sm p-6 rounded-xl">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{matter?.name || 'Loading Matter Twin...'}</h1>
          <p className="text-xs text-slate-500 mt-1">Client: <span className="font-semibold">{matter?.client_name || 'N/A'}</span></p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="btn-primary flex items-center gap-2 rounded-lg text-sm font-semibold"
          disabled={uploading}
        >
          <Upload size={16} />
          {uploading ? 'Processing...' : 'Upload PDF'}
        </button>
        <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" accept="application/pdf" />
      </div>

      {log && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs font-mono p-3 rounded-lg">
          {log}
        </div>
      )}

      {/* Main Grid Content split */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Col: Uploaded documents list */}
        <div className="glass-panel bg-white border border-slate-200 shadow-sm rounded-xl p-4 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2">Document Index</h3>
          <div className="flex flex-col gap-2">
            {documents.map((d: any) => (
              <div key={d._id} className="p-3 border border-slate-100 rounded-lg hover:bg-slate-50/50 transition-colors">
                <h4 className="text-xs font-bold text-slate-700 truncate">{d.name}</h4>
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>{(d.file_size / 1024).toFixed(1)} KB</span>
                  <span>Version {d.version}</span>
                </div>
              </div>
            ))}
            {documents.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-6">No files uploaded yet.</p>
            )}
          </div>
        </div>

        {/* Right Col: Workspace twin state & Chat QA console */}
        <div className="md:col-span-2 glass-panel bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col gap-4 min-h-[450px]">
          {/* Navigation tab menu */}
          <div className="flex border-b border-slate-200 gap-4">
            <button
              onClick={() => setActiveTab('twin')}
              className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'twin' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              Living Matter Twin
            </button>
            <button
              onClick={() => setActiveTab('qa')}
              className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'qa' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              Hybrid Graph RAG Chat
            </button>
            <button
              onClick={() => setActiveTab('conflicts')}
              className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'conflicts' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              Conflicts ({matter?.conflicts?.length || 0})
            </button>
          </div>

          {/* TAB 1: Living Twin State Active Clauses */}
          {activeTab === 'twin' && (
            <div className="flex flex-col gap-4 max-h-96 overflow-y-auto pr-2">
              {matter?.livingState?.mergedClauses?.map((c: any, idx: number) => (
                <div key={idx} className="p-4 border border-slate-100 rounded-lg bg-slate-50/40">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                      {c.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed font-sans">{c.text}</p>
                </div>
              ))}
              {(!matter?.livingState?.mergedClauses || matter.livingState.mergedClauses.length === 0) && (
                <p className="text-xs text-slate-400 text-center py-12">No active clauses compiled. Upload documents to assemble living state.</p>
              )}
            </div>
          )}

          {/* TAB 2: Hybrid Graph RAG chat console */}
          {activeTab === 'qa' && (
            <div className="flex flex-col gap-4 h-full">
              {/* Message scroll list */}
              <div className="flex-1 overflow-y-auto max-h-80 border border-slate-100 rounded-lg p-4 bg-slate-50/30 flex flex-col gap-3">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex flex-col max-w-[80%] ${msg.sender === 'user' ? 'self-end' : 'self-start'}`}>
                    <div className={`p-3 rounded-lg text-xs leading-relaxed ${
                      msg.sender === 'user' ? 'bg-indigo-600 text-white font-sans' : 'bg-white border border-slate-200 text-slate-800'
                    }`}>
                      {msg.text}
                    </div>

                    {msg.sender === 'assistant' && (
                      <div className="flex items-center gap-4 mt-2">
                        <VoiceOutput text={msg.text} label="Listen to Answer" />
                        {msg.trust && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            msg.trust.safe ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                          }`}>
                            Enkrypt Trust: {(msg.trust.score * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {chatLoading && (
                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-slate-400"></div>
                    Traversing Neo4j citations and vector indexes...
                  </div>
                )}
              </div>

              {/* Chat Form with Voice Button */}
              <form onSubmit={handleAskQuestion} className="flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="flex-1 bg-white border border-slate-200 rounded-lg px-4 py-2 text-xs focus:outline-none focus:border-indigo-500"
                  placeholder="Ask a question about the matter contract state..."
                />
                <VoiceInput onTranscript={(t) => setQuery(prev => `${prev} ${t}`)} />
                <button type="submit" className="btn-primary rounded-lg text-xs py-2 px-4 font-semibold">
                  Ask AI
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: Auto-merged Conflict warnings */}
          {activeTab === 'conflicts' && (
            <div className="flex flex-col gap-4 max-h-96 overflow-y-auto">
              {matter?.conflicts?.map((conf: any, idx: number) => (
                <div key={idx} className="p-4 border border-red-100 bg-red-50/20 rounded-lg flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-red-700 font-semibold text-xs">
                    <AlertTriangle size={14} />
                    <span>Conflict in Category: {conf.category}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-xs mt-1">
                    <div>
                      <span className="font-semibold text-slate-400 block">Existing Position:</span>
                      <p className="text-slate-600 mt-1 italic">"{conf.existingClauseText}"</p>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-400 block">Incoming Amendment Proposal:</span>
                      <p className="text-slate-600 mt-1 italic">"{conf.incomingClauseText}"</p>
                    </div>
                  </div>
                  <div className="border-t border-slate-100 pt-2 text-xs text-slate-500 mt-1 leading-relaxed">
                    <strong>AI Recommendation:</strong> {conf.recommendation} ({conf.reason})
                  </div>
                </div>
              ))}
              {(!matter?.conflicts || matter.conflicts.length === 0) && (
                <p className="text-xs text-slate-400 text-center py-12">No active conflicts detected on the Matter twin state.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
