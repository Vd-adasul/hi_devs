import React, { useState, useEffect, useRef } from 'react';

// Setup Base API Endpoint
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

interface Matter {
  _id: string;
  name: string;
  client_name: string;
  status: string;
  created_at: string;
}

interface DocumentRecord {
  _id: string;
  name: string;
  status: string;
  file_size: number;
  page_count?: number;
  created_at: string;
}

interface Clause {
  _id: string;
  category: string;
  raw_text: string;
  page_number: number;
}

interface Obligation {
  _id: string;
  raw_text: string;
  due_date?: string;
  status: string;
}

interface Risk {
  _id: string;
  risk_level: 'high' | 'medium' | 'low';
  description: string;
  explanation: string;
  trust_score: number;
}

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  sources?: Array<{
    clauseId: string;
    category: string;
    pageNumber: number;
    rawText: string;
    score: number;
  }>;
  trust?: {
    score: number;
    safe: boolean;
    flags: string[];
  };
}

export default function App() {
  // Authentication states
  const [token, setToken] = useState<string | null>(localStorage.getItem('lawyeros_token'));
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // State variables
  const [matters, setMatters] = useState<Matter[]>([]);
  const [selectedMatter, setSelectedMatter] = useState<Matter | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<DocumentRecord | null>(null);
  const [clauses, setClauses] = useState<Clause[]>([]);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  
  // Forms & Loading
  const [newMatterName, setNewMatterName] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [processingLog, setProcessingLog] = useState('');
  const [activeTab, setActiveTab] = useState<'clauses' | 'timeline' | 'risks'>('clauses');
  
  // Chat Q&A (Graph RAG)
  const [chatQuery, setChatQuery] = useState('');
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [qaLoading, setQaLoading] = useState(false);

  // File Input Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // API Fetch Wrapper supporting Authorization Header
  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const headers = {
      ...options.headers,
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      localStorage.removeItem('lawyeros_token');
      setToken(null);
      setSelectedMatter(null);
    }
    return res;
  };

  // Fetch Matters on mount or when token updates
  useEffect(() => {
    if (token) {
      fetchMatters();
    }
  }, [token]);

  // Fetch Documents and Matter State when Matter selection changes
  useEffect(() => {
    if (selectedMatter && token) {
      fetchDocuments(selectedMatter._id);
      fetchMatterDetails(selectedMatter._id);
    } else {
      setDocuments([]);
      setSelectedDoc(null);
      setClauses([]);
      setObligations([]);
      setRisks([]);
    }
  }, [selectedMatter, token]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) return;
    setAuthError('');
    setAuthLoading(true);

    try {
      const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register';
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, password: authPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      if (authMode === 'login') {
        localStorage.setItem('lawyeros_token', data.token);
        setToken(data.token);
        setAuthEmail('');
        setAuthPassword('');
      } else {
        setAuthMode('login');
        setAuthError('Account created successfully. Please log in.');
      }
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const fetchMatters = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/matters`);
      const data = await res.json();
      if (data.matters) setMatters(data.matters);
    } catch (err) {
      console.error('Failed to fetch matters:', err);
    }
  };

  const fetchDocuments = async (matterId: string) => {
    try {
      const res = await apiFetch(`${API_BASE}/matters/${matterId}/documents`);
      const data = await res.json();
      if (data.documents) setDocuments(data.documents);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    }
  };

  const fetchMatterDetails = async (matterId: string) => {
    try {
      // Fetch Clauses
      const clausesRes = await apiFetch(`${API_BASE}/matters/${matterId}/clauses`);
      if (clausesRes.ok) {
        const clausesData = await clausesRes.json();
        setClauses(clausesData.clauses || []);
      }

      // Fetch Obligations
      const obligationsRes = await apiFetch(`${API_BASE}/matters/${matterId}/obligations`);
      if (obligationsRes.ok) {
        const obligationsData = await obligationsRes.json();
        setObligations(obligationsData.obligations || []);
      }

      // Fetch Risks
      const risksRes = await apiFetch(`${API_BASE}/matters/${matterId}/risks`);
      if (risksRes.ok) {
        const risksData = await risksRes.json();
        setRisks(risksData.risks || []);
      }
    } catch (err) {
      console.error('Failed to fetch matter details:', err);
    }
  };

  const handleCreateMatter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMatterName || !newClientName) return;

    try {
      const res = await apiFetch(`${API_BASE}/matters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newMatterName, client_name: newClientName }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewMatterName('');
        setNewClientName('');
        fetchMatters();
        if (data.matter) setSelectedMatter(data.matter);
      }
    } catch (err) {
      console.error('Failed to create matter:', err);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedMatter) return;

    setUploading(true);
    setProcessingLog('Uploading PDF binary contents to AWS S3 storage...');

    try {
      const fileBuffer = await file.arrayBuffer();
      setProcessingLog('Extracting PDF text content & triggering Mastra Agent parsing...');
      const uploadUrl = `${API_BASE}/matters/${selectedMatter._id}/documents?name=${encodeURIComponent(file.name)}`;
      
      const res = await apiFetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        body: fileBuffer,
      });

      const data = await res.json();
      
      if (res.ok) {
        setProcessingLog('Mastra Agent finished structuring clauses successfully!');
        fetchDocuments(selectedMatter._id);
        fetchMatterDetails(selectedMatter._id);
      } else {
        setProcessingLog(`Failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      console.error(err);
      setProcessingLog(`Upload exception: ${err.message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSendQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatQuery || !selectedMatter) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: chatQuery,
    };

    setChatMessages((prev) => [...prev, userMsg]);
    const currentQuery = chatQuery;
    setChatQuery('');
    setQaLoading(true);

    try {
      const res = await apiFetch(`${API_BASE}/matters/${selectedMatter._id}/qa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: currentQuery }),
      });

      const data = await res.json();
      
      if (res.ok) {
        const assistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          sender: 'assistant',
          text: data.answer,
          sources: data.sources,
          trust: data._trust,
        };
        setChatMessages((prev) => [...prev, assistantMsg]);
      } else {
        setChatMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            sender: 'assistant',
            text: `Error: ${data.error || 'Failed to fetch answer.'}`,
          },
        ]);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setQaLoading(false);
    }
  };

  // Helper to get color code for safety trust score
  const getTrustBadgeStyle = (score: number, safe: boolean) => {
    if (!safe) return { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', label: 'Blocked / Danger' };
    if (score >= 0.85) return { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', label: 'Safe / Verify' };
    return { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b', label: 'Caution' };
  };

  return (
    <div className="app-container">
      {/* Platform Header */}
      <header className="app-header">
        <div>
          <h1 className="logo-text">LawyerOS</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            Legal Document Intelligence & Matter Digital Twin
          </p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {selectedMatter && (
            <div className="glass-panel" style={{ padding: '10px 20px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Selected Matter:</span>
              <strong style={{ color: 'var(--accent-color)' }}>{selectedMatter.name}</strong>
              <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px' }} onClick={() => setSelectedMatter(null)}>
                Change
              </button>
            </div>
          )}

          {token && (
            <button
              className="btn-secondary"
              style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid var(--danger)', color: 'var(--danger)' }}
              onClick={() => {
                localStorage.removeItem('lawyeros_token');
                setToken(null);
                setSelectedMatter(null);
              }}
            >
              Logout
            </button>
          )}
        </div>
      </header>

      {/* Primary Dashboard Grid Layout */}
      {!token ? (
        <div style={{ maxWidth: '450px', margin: '80px auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: '24px', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'inline-block' }}>
                {authMode === 'login' ? 'Welcome to LawyerOS' : 'Create Lawyer Account'}
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '6px' }}>
                {authMode === 'login' ? 'Sign in to access your Legal Matter Twins' : 'Register your credentials to secure your workspace'}
              </p>
            </div>

            {authError && (
              <div style={{
                padding: '12px',
                borderRadius: '8px',
                background: authError.includes('successful') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                color: authError.includes('successful') ? 'var(--success)' : 'var(--danger)',
                fontSize: '13px',
                textAlign: 'center',
                border: authError.includes('successful') ? '1px solid var(--success)' : '1px solid var(--danger)',
              }}>
                {authError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Email Address</label>
                <input
                  type="email"
                  className="input-field"
                  placeholder="name@firm.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Password</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-primary" style={{ justifyContent: 'center', marginTop: '10px' }} disabled={authLoading}>
                {authLoading ? 'Verifying...' : authMode === 'login' ? 'Sign In' : 'Register Account'}
              </button>
            </form>

            <div style={{ textAlign: 'center', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>
                {authMode === 'login' ? "Don't have an account? " : "Already have an account? "}
              </span>
              <button
                style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', fontWeight: 600 }}
                onClick={() => {
                  setAuthMode(authMode === 'login' ? 'register' : 'login');
                  setAuthError('');
                }}
              >
                {authMode === 'login' ? 'Register here' : 'Log in here'}
              </button>
            </div>
          </div>
        </div>
      ) : !selectedMatter ? (
        <div style={{ maxWidth: '600px', margin: '60px auto w-full', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Matter Selection Screen */}
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h2 style={{ fontSize: '20px' }}>Select or Create Matter</h2>
            
            {matters.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Existing Matters:</p>
                {matters.map((m) => (
                  <div
                    key={m._id}
                    className="glass-panel"
                    style={{ padding: '16px', borderRadius: '10px', cursor: 'pointer', border: '1px solid var(--panel-border)', background: 'rgba(255,255,255,0.01)' }}
                    onClick={() => setSelectedMatter(m)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>{m.name}</strong>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Client: {m.client_name}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No active matters found. Create one below to begin.</p>
            )}

            <hr style={{ borderColor: 'rgba(255,255,255,0.05)' }} />

            <form onSubmit={handleCreateMatter} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Initialize New Matter Twin:</p>
              <input
                type="text"
                className="input-field"
                placeholder="Matter Name (e.g. Vendor Agreement 2026)"
                value={newMatterName}
                onChange={(e) => setNewMatterName(e.target.value)}
                required
              />
              <input
                type="text"
                className="input-field"
                placeholder="Client Name (e.g. Acme Corp)"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                required
              />
              <button type="submit" className="btn-primary" style={{ justifyContent: 'center' }}>
                Create Matter Twin
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="grid-cols-layout">
          {/* Sidebar Left: Documents and Status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* S3 Document Center */}
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ fontSize: '18px' }}>S3 Document Center</h3>
              
              {documents.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {documents.map((d) => (
                    <div
                      key={d._id}
                      style={{
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid var(--panel-border)',
                        background: selectedDoc?._id === d._id ? 'rgba(99, 102, 241, 0.05)' : 'transparent',
                        borderColor: selectedDoc?._id === d._id ? 'var(--accent-color)' : 'var(--panel-border)',
                        cursor: 'pointer',
                      }}
                      onClick={() => setSelectedDoc(d)}
                    >
                      <div style={{ fontSize: '13px', fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{d.name}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        <span>{(d.file_size / 1024).toFixed(1)} KB</span>
                        <span>{d.page_count} pages</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No documents uploaded yet.</p>
              )}

              {/* S3 Upload Dropzone */}
              <div className="upload-dropzone" onClick={handleUploadClick}>
                <svg className="spinner" style={{ display: uploading ? 'inline-block' : 'none', width: '24px', height: '24px', color: 'var(--accent-color)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeDasharray="32" />
                </svg>
                <div style={{ display: uploading ? 'none' : 'block' }}>
                  <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--accent-color)' }}>+ Upload Legal PDF</span>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Binary Upload to AWS S3</p>
                </div>
              </div>
              <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="application/pdf" onChange={handleFileChange} />
              
              {processingLog && (
                <div style={{ fontSize: '11px', padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', color: 'var(--warning)', fontFamily: 'monospace', overflowWrap: 'anywhere' }}>
                  {processingLog}
                </div>
              )}
            </div>

            {/* Matter Twin Overview */}
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h3 style={{ fontSize: '18px' }}>Twin Analytics</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Total Clauses:</span>
                <strong>{clauses.length}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Timeline Events:</span>
                <strong>{obligations.length}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>High Risks:</span>
                <strong style={{ color: risks.some(r => r.risk_level === 'high') ? 'var(--danger)' : 'var(--text-primary)' }}>
                  {risks.filter(r => r.risk_level === 'high').length}
                </strong>
              </div>
            </div>
          </div>

          {/* Main Workspace Area (Split Right side) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            
            {/* Top Section: Tab Panels (Clauses, Timeline, Risks) */}
            <div className="glass-panel" style={{ minHeight: '350px' }}>
              <div style={{ display: 'flex', borderBottom: '1px solid var(--panel-border)', gap: '20px', marginBottom: '20px' }}>
                <button
                  style={{
                    padding: '8px 12px 12px',
                    background: 'none',
                    border: 'none',
                    color: activeTab === 'clauses' ? 'var(--accent-color)' : 'var(--text-secondary)',
                    borderBottom: activeTab === 'clauses' ? '2px solid var(--accent-color)' : 'none',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                  onClick={() => setActiveTab('clauses')}
                >
                  Document Clauses
                </button>
                <button
                  style={{
                    padding: '8px 12px 12px',
                    background: 'none',
                    border: 'none',
                    color: activeTab === 'timeline' ? 'var(--accent-color)' : 'var(--text-secondary)',
                    borderBottom: activeTab === 'timeline' ? '2px solid var(--accent-color)' : 'none',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                  onClick={() => setActiveTab('timeline')}
                >
                  Timeline Report (Phase 3)
                </button>
                <button
                  style={{
                    padding: '8px 12px 12px',
                    background: 'none',
                    border: 'none',
                    color: activeTab === 'risks' ? 'var(--accent-color)' : 'var(--text-secondary)',
                    borderBottom: activeTab === 'risks' ? '2px solid var(--accent-color)' : 'none',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                  onClick={() => setActiveTab('risks')}
                >
                  Risk Intelligence (Phase 4)
                </button>
              </div>

              {/* Tab: Clauses */}
              {activeTab === 'clauses' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '400px', overflowY: 'auto' }}>
                  {clauses.length > 0 ? (
                    clauses.map((c) => (
                      <div key={c._id} style={{ padding: '14px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--panel-border)', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontSize: '11px', background: 'rgba(99,102,241,0.1)', color: 'var(--accent-color)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                            {c.category}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Page {c.page_number}</span>
                        </div>
                        <p style={{ fontSize: '13px', lineHeight: '1.5' }}>{c.raw_text}</p>
                      </div>
                    ))
                  ) : (
                    <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', marginTop: '40px' }}>
                      No clauses indexed. Upload a document to start parsing.
                    </p>
                  )}
                </div>
              )}

              {/* Tab: Timeline */}
              {activeTab === 'timeline' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {obligations.length > 0 ? (
                    obligations.map((o) => (
                      <div key={o._id} style={{ padding: '14px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--panel-border)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <p style={{ fontSize: '13px', fontWeight: 500 }}>{o.raw_text}</p>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Status: {o.status}</span>
                        </div>
                        {o.due_date && (
                          <span style={{ fontSize: '12px', background: 'rgba(16,185,129,0.1)', color: 'var(--success)', padding: '4px 8px', borderRadius: '6px', fontWeight: 600 }}>
                            {new Date(o.due_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    ))
                  ) : (
                    <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', marginTop: '40px' }}>
                      No obligations found in this matter state.
                    </p>
                  )}
                </div>
              )}

              {/* Tab: Risks */}
              {activeTab === 'risks' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {risks.length > 0 ? (
                    risks.map((r) => (
                      <div key={r._id} style={{ padding: '14px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--panel-border)', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: r.risk_level === 'high' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                            color: r.risk_level === 'high' ? 'var(--danger)' : 'var(--warning)',
                          }}>
                            {r.risk_level.toUpperCase()} RISK
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Enkrypt AI Trust Score: {r.trust_score}</span>
                        </div>
                        <strong style={{ fontSize: '14px', display: 'block', marginBottom: '4px' }}>{r.description}</strong>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>{r.explanation}</p>
                      </div>
                    ))
                  ) : (
                    <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', marginTop: '40px' }}>
                      No risks flagged on current document twin.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Section: Chat Console (Graph RAG Q&A) */}
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ fontSize: '18px' }}>Graph RAG Semantic Console</h3>
              
              <div style={{ height: '250px', overflowY: 'auto', border: '1px solid var(--panel-border)', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(0,0,0,0.1)' }}>
                {chatMessages.length > 0 ? (
                  chatMessages.map((msg) => (
                    <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                      <div style={{
                        padding: '12px 16px',
                        borderRadius: '12px',
                        background: msg.sender === 'user' ? 'var(--accent-gradient)' : 'rgba(255,255,255,0.03)',
                        border: msg.sender === 'user' ? 'none' : '1px solid var(--panel-border)',
                        color: '#ffffff',
                        fontSize: '13px',
                        lineHeight: '1.5',
                      }}>
                        {msg.text}
                      </div>

                      {/* Enkrypt AI Trust score representation */}
                      {msg.trust && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginTop: '6px',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          background: getTrustBadgeStyle(msg.trust.score, msg.trust.safe).bg,
                          color: getTrustBadgeStyle(msg.trust.score, msg.trust.safe).text,
                          alignSelf: 'flex-start',
                        }}>
                          <strong>Enkrypt AI Score: {msg.trust.score * 100}%</strong>
                          <span>•</span>
                          <span>{getTrustBadgeStyle(msg.trust.score, msg.trust.safe).label}</span>
                        </div>
                      )}

                      {/* Matched Vector Sources list */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Retrieved sources:</span>
                          {msg.sources.map((s, idx) => (
                            <div key={idx} style={{ fontSize: '11px', color: 'var(--text-muted)', borderLeft: '2px solid var(--accent-color)', paddingLeft: '8px', marginBottom: '2px' }}>
                              Page {s.pageNumber} ({s.category}) • Match Score: {(s.score * 100).toFixed(0)}%
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 'auto' }}>
                    Ask a question about the document Obligations, Risks, or Clauses.
                  </p>
                )}
                {qaLoading && (
                  <div style={{ alignSelf: 'flex-start', color: 'var(--text-muted)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg className="spinner" style={{ width: '16px', height: '16px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" strokeDasharray="32" />
                    </svg>
                    Retrieving graph relations & vector embeddings...
                  </div>
                )}
              </div>

              <form onSubmit={handleSendQuery} style={{ display: 'flex', gap: '12px' }}>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Query matter state (e.g., What are Acme's liability limitations?)"
                  value={chatQuery}
                  onChange={(e) => setChatQuery(e.target.value)}
                  disabled={qaLoading}
                />
                <button type="submit" className="btn-primary" disabled={qaLoading} style={{ padding: '0 24px' }}>
                  Ask
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
