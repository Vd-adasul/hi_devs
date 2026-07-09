import React, { useState, useEffect } from 'react';
import api from '../lib/api.js';
import {
  Plus,
  ArrowRight,
  Mail,
  Building
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function CounterpartiesPage() {
  const [parties, setParties] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');

  const loadParties = async () => {
    try {
      const res = await api.get('/counterparties');
      setParties(res.data.data || []);
    } catch (err) {
      console.warn('Failed to load counterparties:', err);
    }
  };

  useEffect(() => {
    loadParties();
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;

    try {
      await api.post('/counterparties', { name, email, company });
      setName('');
      setEmail('');
      setCompany('');
      loadParties();
      alert('Counterparty contact registered successfully.');
    } catch (err) {
      alert('Failed to register contact.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 font-outfit">Counterparty Directory</h1>
        <p className="text-sm text-slate-500 mt-1">Manage external partner contacts, deal statistics, and counterparty concessions memory</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Contact setup form */}
        <div className="glass-panel bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2">Add Partner Contact</h3>
          <form onSubmit={handleRegister} className="flex flex-col gap-4 text-xs">
            <div className="flex flex-col gap-1">
              <label className="text-slate-400 font-medium">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-slate-400 font-medium">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane.smith@partner.com"
                className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-slate-400 font-medium">Company Name</label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Partner Inc."
                className="w-full bg-slate-50 border border-slate-200 rounded py-1.5 px-2"
              />
            </div>
            <button type="submit" className="w-full btn-primary justify-center py-2 rounded-lg font-semibold flex items-center gap-1">
              <Plus size={14} /> Add Contact
            </button>
          </form>
        </div>

        {/* Counterparty list */}
        <div className="md:col-span-2 glass-panel bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-100 pb-2">Partner Profiles</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {parties.map((p) => (
              <div key={p._id} className="p-4 border border-slate-100 rounded-lg flex flex-col justify-between hover:border-indigo-100 hover:bg-slate-50/50 transition-colors">
                <div>
                  <h4 className="text-sm font-bold text-slate-800">{p.name}</h4>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                    <Building size={12} />
                    <span>{p.company || 'Private Practice'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                    <Mail size={12} />
                    <span>{p.email}</span>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3 mt-3 flex justify-between items-center text-xs">
                  <span className="text-[10px] text-indigo-700 bg-indigo-50 font-bold px-2 py-0.5 rounded">
                    {p.dealCount || 0} Deals Logged
                  </span>
                  <Link
                    to={`/counterparties/${p._id}`}
                    className="text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1"
                  >
                    View Memory <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            ))}
            {parties.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-12 md:col-span-2">No counterparty contact files registered.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
