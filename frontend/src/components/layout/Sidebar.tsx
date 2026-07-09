import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Briefcase,
  FileText,
  CheckSquare,
  Users,
  Compass,
  FileCheck,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Bell,
  MessageSquare,
  Calendar,
  Layers,
  Webhook,
  Network,
  Shield,
  FileSignature,
  BarChart2
} from 'lucide-react';
import { useAuthStore } from '../../store/auth.js';
import api from '../../lib/api.js';

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [matters, setMatters] = useState<any[]>([]);
  const [selectedMatterId, setSelectedMatterId] = useState<string>('');
  const [badges, setBadges] = useState({ approvals: 0, reviewQueue: 0, obligations: 0 });

  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  // Load matters and badge counts
  const loadSidebarData = async () => {
    try {
      // 1. Fetch matters list
      const matRes = await api.get('/matters');
      setMatters(matRes.data.data || []);
      if (matRes.data.data && matRes.data.data.length > 0 && !selectedMatterId) {
        setSelectedMatterId(matRes.data.data[0]._id);
      }

      // 2. Fetch pending counts
      const appRes = await api.get('/approvals/instances/queue');
      const revRes = await api.get('/review-queue?status=pending');
      const oblRes = await api.get('/obligations?status=pending');

      setBadges({
        approvals: appRes.data.data?.length || 0,
        reviewQueue: revRes.data.data?.length || 0,
        obligations: oblRes.data.data?.length || 0,
      });
    } catch (err) {
      console.warn('Failed to load sidebar metrics:', err);
    }
  };

  useEffect(() => {
    if (user) {
      loadSidebarData();
      const interval = setInterval(loadSidebarData, 60000); // refresh every 60s
      return () => clearInterval(interval);
    }
  }, [user]);

  // Keyboard shortcut Ctrl+\ to collapse sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '\\') {
        setIsCollapsed(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const menuItems = [
    { name: 'Dashboard', path: '/dashboard', icon: Layers },
    { name: 'Matters Twin', path: `/matters/${selectedMatterId || 'new'}`, icon: Briefcase },
    { name: 'Contracts Playbook', path: '/playbook', icon: FileCheck },
    { name: 'Contracts Index', path: '/contracts', icon: FileText },
    { name: 'Knowledge Graph', path: '/graph', icon: Network },
    { name: 'Virtual Diligence', path: '/diligence', icon: Shield },
    { name: 'E-Signatures', path: '/signatures', icon: FileSignature },
    { name: 'Approvals Queue', path: '/approvals', icon: CheckSquare, badge: badges.approvals },
    { name: 'Human Review Queue', path: '/review-queue', icon: Bell, badge: badges.reviewQueue },
    { name: 'Obligations Timeline', path: '/obligations', icon: Calendar, badge: badges.obligations },
    { name: 'Counterparty Directory', path: '/counterparties', icon: Users },
    { name: 'Negotiation Engine', path: '/negotiations', icon: MessageSquare },
    { name: 'Statutory Research', path: '/research', icon: Compass },
    { name: 'Contract Playbook Compliance', path: '/draft', icon: FileText },
    { name: 'Analytics & Performance', path: '/analytics', icon: BarChart2 },
    { name: 'Developers & Webhooks', path: '/developer', icon: Webhook },
    { name: 'System Configuration', path: '/settings', icon: Settings },
  ];

  return (
    <div
      className={`h-screen flex flex-col bg-slate-900 text-slate-100 transition-all duration-300 ${
        isCollapsed ? 'w-16' : 'w-64'
      } border-r border-slate-800 shrink-0`}
    >
      {/* Sidebar Header Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-lg text-white">
              L
            </div>
            <span className="font-semibold text-lg tracking-wider text-white">LawyerOS</span>
          </div>
        )}
        {isCollapsed && (
          <div className="w-8 h-8 mx-auto rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-lg text-white">
            L
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-100 hidden md:block"
          title="Toggle Sidebar (Ctrl+\\)"
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Workspace Matter Selector */}
      {!isCollapsed && matters.length > 0 && (
        <div className="p-3 border-b border-slate-800">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Active Matter Scope
          </label>
          <select
            value={selectedMatterId}
            onChange={(e) => {
              setSelectedMatterId(e.target.value);
              navigate(`/matters/${e.target.value}`);
            }}
            className="w-full text-sm bg-slate-800 text-slate-100 rounded border border-slate-700 py-1.5 px-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {matters.map((m: any) => (
              <option key={m._id} value={m._id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Menu Links */}
      <div className="flex-1 overflow-y-auto py-4 space-y-1">
        {menuItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path.split('/:')[0]);
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              to={item.path}
              className={`flex items-center justify-between px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
              title={isCollapsed ? item.name : ''}
            >
              <div className="flex items-center gap-3">
                <Icon size={18} className={isActive ? 'text-white' : 'text-slate-400'} />
                {!isCollapsed && <span>{item.name}</span>}
              </div>
              {!isCollapsed && item.badge && item.badge > 0 ? (
                <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      {/* Sidebar Footer User Section */}
      <div className="p-4 border-t border-slate-800 flex flex-col gap-2">
        {!isCollapsed && (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold text-slate-200">
              {user?.email?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate text-white">{user?.name || user?.email}</p>
              <p className="text-xs text-slate-400 uppercase tracking-wide truncate">{user?.role}</p>
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-950/20 hover:text-red-300 rounded transition-colors mt-2"
        >
          <LogOut size={16} />
          {!isCollapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );
}
