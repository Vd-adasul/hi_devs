import React, { useState, useEffect } from 'react';
import api from '../lib/api.js';
import {
  Settings,
  Plus,
  Trash,
  Key,
  Mail,
  UserPlus
} from 'lucide-react';

export default function SettingsPage() {
  const [keys, setKeys] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  
  // Custom LLM Form
  const [provider, setProvider] = useState('google');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('google/gemini-2.5-flash');

  // Model selection configuration
  const [docProcessingModel, setDocProcessingModel] = useState('google/gemini-2.5-flash');
  const [qaModel, setQaModel] = useState('google/gemini-2.5-flash');

  // Invite Form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('lawyer');

  const loadSettingsData = async () => {
    try {
      const keyRes = await api.get('/settings/llm-keys');
      setKeys(keyRes.data.data || []);

      const cfgRes = await api.get('/settings/model-config');
      const cfg = cfgRes.data.data || {};
      setDocProcessingModel(cfg.documentProcessing || 'google/gemini-2.5-flash');
      setQaModel(cfg.qa || 'google/gemini-2.5-flash');

      const teamRes = await api.get('/settings/team');
      setTeam(teamRes.data.data || []);
    } catch (err) {
      console.warn('Failed to load settings context:', err);
    }
  };

  useEffect(() => {
    loadSettingsData();
  }, []);

  const handleRegisterKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey) return;

    try {
      await api.post('/settings/llm-keys', { provider, key: apiKey, model });
      setApiKey('');
      loadSettingsData();
      alert('LLM Provider Key registered successfully.');
    } catch (err) {
      alert('Failed to register provider key.');
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (!window.confirm('Delete this provider API key?')) return;
    try {
      await api.delete(`/settings/llm-keys/${id}`);
      loadSettingsData();
    } catch (err) {
      alert('Failed to delete key.');
    }
  };

  const handleUpdateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.patch('/settings/model-config', {
        config: {
          documentProcessing: docProcessingModel,
          qa: qaModel,
        },
      });
      alert('Model configuration updated successfully.');
    } catch (err) {
      alert('Failed to update config.');
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;

    try {
      await api.post('/auth/invite', { email: inviteEmail, role: inviteRole });
      setInviteEmail('');
      alert('Invitation email sent via Resend successfully.');
    } catch (err) {
      alert('Failed to send invitation.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 font-outfit">System Configuration</h1>
        <p className="text-sm text-slate-500 mt-1">Manage team member invitations, LLM API keys (BYOK), and agent models</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Invite & Team Column */}
        <div className="glass-panel bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-1.5">
            <UserPlus size={16} className="text-indigo-600" /> Team & Onboarding
          </h3>

          <form onSubmit={handleInvite} className="flex flex-col gap-3 text-xs">
            <div className="flex flex-col gap-1">
              <label className="text-slate-400 font-medium">Invite User Email</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@firm.com"
                className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-slate-400 font-medium">Assigned Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2"
              >
                <option value="lawyer">Lawyer / Counsel</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
            <button type="submit" className="w-full btn-primary justify-center py-2 rounded-lg font-semibold flex items-center gap-1">
              <Mail size={14} /> Send Invite
            </button>
          </form>

          <div className="flex flex-col gap-2 mt-4">
            <strong className="text-xs text-slate-500">Active Directory Members:</strong>
            {team.map((t) => (
              <div key={t._id} className="p-3 border border-slate-100 rounded-lg text-xs">
                <span className="font-bold text-slate-700 block">{t.name || t.email}</span>
                <span className="text-[10px] text-slate-400 capitalize">{t.role}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bring Your Own Key Column */}
        <div className="glass-panel bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-1.5">
            <Key size={16} className="text-indigo-600" /> Bring Your Own Key (BYOK)
          </h3>

          <form onSubmit={handleRegisterKey} className="flex flex-col gap-3 text-xs">
            <div className="flex flex-col gap-1">
              <label className="text-slate-400 font-medium">Provider</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2"
              >
                <option value="google">Google Gemini</option>
                <option value="openai">OpenAI GPT</option>
                <option value="anthropic">Anthropic Claude</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-slate-400 font-medium">API Key Credentials</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-slate-400 font-medium">Associated Model</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2"
                required
              />
            </div>
            <button type="submit" className="w-full btn-primary justify-center py-2 rounded-lg font-semibold flex items-center gap-1">
              <Plus size={14} /> Register Key
            </button>
          </form>

          <div className="flex flex-col gap-2 mt-4">
            {keys.map((k) => (
              <div key={k.id} className="p-3 border border-slate-100 rounded-lg flex justify-between items-center text-xs">
                <div>
                  <span className="font-bold text-slate-700 block capitalize">{k.provider}</span>
                  <span className="text-[10px] text-slate-400 font-mono">{k.key}</span>
                </div>
                <button
                  onClick={() => handleDeleteKey(k.id)}
                  className="p-1 text-slate-400 hover:text-red-500 hover:bg-slate-50 rounded"
                >
                  <Trash size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Agent Config Column */}
        <div className="glass-panel bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-1.5">
            <Settings size={16} className="text-indigo-600" /> Model Configuration
          </h3>

          <form onSubmit={handleUpdateConfig} className="flex flex-col gap-4 text-xs">
            <div className="flex flex-col gap-1">
              <label className="text-slate-400 font-medium">Document Parsing Agent</label>
              <input
                type="text"
                value={docProcessingModel}
                onChange={(e) => setDocProcessingModel(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-slate-400 font-medium">Hybrid Q&A Graph RAG Agent</label>
              <input
                type="text"
                value={qaModel}
                onChange={(e) => setQaModel(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2"
                required
              />
            </div>
            <button type="submit" className="w-full btn-primary justify-center py-2 rounded-lg font-semibold flex items-center gap-1">
              Save Configuration
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
