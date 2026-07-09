import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import {
  Webhook,
  Plus,
  Trash,
  Key,
  Copy,
  Check
} from 'lucide-react';

export default function DeveloperPage() {
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [keys, setKeys] = useState<any[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Form states
  const [webhookUrl, setWebhookUrl] = useState('');
  const [keyName, setKeyName] = useState('');
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);

  const loadDevData = async () => {
    try {
      const whRes = await api.get('/webhooks');
      setWebhooks(whRes.data.data || []);

      const keyRes = await api.get('/webhooks/api-keys');
      setKeys(keyRes.data.data || []);
    } catch (err) {
      console.warn('Failed to load developer portal context:', err);
    }
  };

  useEffect(() => {
    loadDevData();
  }, []);

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookUrl) return;

    try {
      await api.post('/webhooks', {
        url: webhookUrl,
        events: ['document.processed', 'clause.conflict', 'approval.completed'],
      });
      setWebhookUrl('');
      loadDevData();
      alert('Webhook registered successfully.');
    } catch (err) {
      alert('Failed to register webhook endpoint.');
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName) return;

    try {
      const res = await api.post('/webhooks/api-keys', { name: keyName });
      setKeyName('');
      setNewlyCreatedKey(res.data.data.apiKey);
      loadDevData();
    } catch (err) {
      alert('Failed to generate developer API key.');
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    if (!window.confirm('Delete this webhook configuration?')) return;
    try {
      await api.delete(`/webhooks/${id}`);
      loadDevData();
    } catch (err) {
      alert('Failed to delete webhook.');
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (!window.confirm('Delete this developer API key?')) return;
    try {
      await api.delete(`/webhooks/api-keys/${id}`);
      loadDevData();
    } catch (err) {
      alert('Failed to delete key.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 font-outfit">Developers & Webhooks</h1>
        <p className="text-sm text-slate-500 mt-1">Configure real-time outgoing event webhooks and generate developer API keys</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Column Left: Webhooks manager */}
        <div className="glass-panel bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-1.5">
            <Webhook size={16} className="text-indigo-600" /> Webhook Endpoints
          </h3>

          <form onSubmit={handleCreateWebhook} className="flex gap-2 text-xs">
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://api.yourfirm.com/callbacks"
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none"
              required
            />
            <button type="submit" className="btn-primary rounded-lg text-xs py-2 px-4 font-semibold flex items-center gap-1">
              <Plus size={14} /> Add URL
            </button>
          </form>

          <div className="flex flex-col gap-2 mt-2">
            {webhooks.map((wh) => (
              <div key={wh.id} className="p-3 border border-slate-100 rounded-lg flex justify-between items-center text-xs">
                <div className="min-w-0 flex-1 pr-4">
                  <span className="font-bold text-slate-700 truncate block">{wh.url}</span>
                  <span className="text-[10px] text-slate-400">Events: {wh.events?.join(', ')}</span>
                </div>
                <button
                  onClick={() => handleDeleteWebhook(wh.id)}
                  className="p-1 text-slate-400 hover:text-red-500 hover:bg-slate-50 rounded"
                >
                  <Trash size={14} />
                </button>
              </div>
            ))}
            {webhooks.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-12">No active webhook endpoints registered.</p>
            )}
          </div>
        </div>

        {/* Column Right: API Keys manager */}
        <div className="glass-panel bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2 flex items-center gap-1.5">
            <Key size={16} className="text-indigo-600" /> Developer API Keys
          </h3>

          <form onSubmit={handleCreateKey} className="flex gap-2 text-xs">
            <input
              type="text"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="Key label (e.g. CLI Sync tool)"
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none"
              required
            />
            <button type="submit" className="btn-primary rounded-lg text-xs py-2 px-4 font-semibold flex items-center gap-1">
              <Plus size={14} /> Generate
            </button>
          </form>

          {newlyCreatedKey && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex flex-col gap-2 relative">
              <div>
                <strong>API Key Generated:</strong>
                <p className="text-[10px] text-emerald-600 mt-0.5">Copy this credential as it will not be displayed again.</p>
              </div>
              <div className="flex items-center justify-between bg-white border border-emerald-100 rounded px-2.5 py-1.5 font-mono text-[11px]">
                <span className="truncate pr-4">{newlyCreatedKey}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(newlyCreatedKey);
                    setCopiedKey(newlyCreatedKey);
                    setTimeout(() => setCopiedKey(null), 2000);
                  }}
                  className="text-emerald-700 hover:text-emerald-900 shrink-0"
                >
                  {copiedKey === newlyCreatedKey ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 mt-2">
            {keys.map((k) => (
              <div key={k.id} className="p-3 border border-slate-100 rounded-lg flex justify-between items-center text-xs">
                <div>
                  <span className="font-bold text-slate-700 block">{k.name}</span>
                  <span className="text-[10px] text-slate-400 font-mono">Prefix: {k.prefix}*****</span>
                </div>
                <button
                  onClick={() => handleDeleteKey(k.id)}
                  className="p-1 text-slate-400 hover:text-red-500 hover:bg-slate-50 rounded"
                >
                  <Trash size={14} />
                </button>
              </div>
            ))}
            {keys.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-12">No active developer API keys registered.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
