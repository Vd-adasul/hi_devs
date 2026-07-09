import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api.js';
import { Shield, PlusCircle, Users, Lock, Clock, ChevronRight } from 'lucide-react';

export default function DiligenceRoomsPage() {
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', matterName: '' });
  const [showCreate, setShowCreate] = useState(false);
  const [matters, setMatters] = useState<any[]>([]);

  const loadRooms = async () => {
    try {
      const [roomsRes, matRes] = await Promise.all([
        api.get('/diligence/rooms'),
        api.get('/matters'),
      ]);
      setRooms(roomsRes.data.data || []);
      setMatters(matRes.data.data || []);
    } catch (err) {
      console.warn('Failed to load diligence rooms:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRooms();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const matter = matters.find(m => m.name.includes(form.matterName)) || matters[0];
      await api.post('/diligence/rooms', {
        name: form.name,
        matterId: matter?._id || 'default_matter',
        accessLevel: 'restricted',
      });
      setShowCreate(false);
      setForm({ name: '', matterName: '' });
      loadRooms();
    } catch (err: any) {
      alert(`Error: ${err.response?.data?.error || err.message}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Virtual Diligence Rooms</h1>
          <p className="text-sm text-slate-500 mt-1">Secure deal rooms for external counterparty collaboration and document sharing</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
        >
          <PlusCircle size={16} />
          Create Diligence Room
        </button>
      </div>

      {/* Create Form Overlay */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4">New Diligence Room</h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Room Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="e.g. Series A Due Diligence"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Linked Matter</label>
                <select
                  value={form.matterName}
                  onChange={e => setForm(p => ({ ...p, matterName: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="">Select matter...</option>
                  {matters.map(m => (
                    <option key={m._id} value={m.name}>{m.name}</option>
                  ))}
                </select>
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
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-6 py-2 rounded-lg transition-colors"
                >
                  {creating ? 'Creating...' : 'Create Room'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Active Rooms', value: rooms.filter(r => r.status === 'active' || !r.status).length, icon: Shield, color: 'text-indigo-600 bg-indigo-50' },
          { label: 'Total Participants', value: rooms.reduce((acc, r) => acc + (r.participants?.length || 0), 0), icon: Users, color: 'text-blue-600 bg-blue-50' },
          { label: 'Secured Documents', value: rooms.reduce((acc, r) => acc + (r.documents?.length || 0), 0), icon: Lock, color: 'text-emerald-600 bg-emerald-50' },
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

      {/* Rooms Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : rooms.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl py-20 text-center shadow-sm">
          <Shield size={32} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No diligence rooms created yet.</p>
          <button onClick={() => setShowCreate(true)} className="mt-4 text-sm text-indigo-600 font-semibold hover:underline">
            Create your first room →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map(room => (
            <Link
              key={room._id}
              to={`/diligence/${room._id}`}
              className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all flex flex-col gap-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <Shield size={20} className="text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800 text-sm">{room.name}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{room.accessLevel || 'restricted'}</p>
                  </div>
                </div>
                <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full uppercase">
                  {room.status || 'Active'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="text-xs font-bold text-slate-700">{room.participants?.length || 0}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Members</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="text-xs font-bold text-slate-700">{room.documents?.length || 0}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Docs</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="text-xs font-bold text-slate-700">{room.signingRequests?.length || 0}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">E-Signs</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
                <div className="flex items-center gap-1">
                  <Clock size={11} />
                  <span>{room.createdAt ? new Date(room.createdAt).toLocaleDateString() : 'Recently created'}</span>
                </div>
                <div className="flex items-center gap-1 text-indigo-600 font-semibold">
                  <span>Enter Room</span>
                  <ChevronRight size={12} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
