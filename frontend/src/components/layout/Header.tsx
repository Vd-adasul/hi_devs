import { useState, useEffect } from 'react';
import { Bell, Sparkles } from 'lucide-react';
import { useAuthStore } from '../../store/auth.js';
import api from '../../lib/api.js';

export function Header() {
  const { user } = useAuthStore();
  const [org, setOrg] = useState<any>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    const fetchOrgAndNotifs = async () => {
      try {
        const profileRes = await api.get('/auth/me');
        setOrg(profileRes.data.organization);

        // Simple mock notifications of events
        setNotifications([
          { id: 1, text: 'New counter-offer submitted for Tech Purchase SLA', time: '10m ago' },
          { id: 2, text: 'Audit completed for NDA-Standard with score: 92%', time: '1h ago' },
          { id: 3, text: 'Timeline alert: Renewal due in 6 days for Office Lease Agreement', time: '3h ago' },
        ]);
      } catch (err) {
        console.warn('Failed to fetch org billing tier:', err);
      }
    };

    if (user) {
      fetchOrgAndNotifs();
    }
  }, [user]);

  const getTierColor = (tier: string) => {
    switch (tier?.toLowerCase()) {
      case 'enterprise':
        return 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-purple-400';
      case 'pro':
        return 'bg-gradient-to-r from-indigo-500 to-blue-500 text-white border-indigo-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  return (
    <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0 relative">
      {/* Left side: Greeting/Context */}
      <div>
        <h2 className="text-slate-800 font-semibold text-base">
          Workspace Hub
        </h2>
        <p className="text-xs text-slate-400">
          Organization: <span className="font-medium text-slate-600">{org?.name || 'Default Firm'}</span>
        </p>
      </div>

      {/* Right side: Tier, Notifications & Profile */}
      <div className="flex items-center gap-4">
        {/* Subscription Tier Badge */}
        {org?.tier && (
          <div className={`text-xs font-bold uppercase px-2.5 py-1 rounded-full border flex items-center gap-1 shadow-sm ${getTierColor(org.tier)}`}>
            <Sparkles size={12} />
            <span>{org.tier} Tier</span>
          </div>
        )}

        {/* Notifications Icon & Tray */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
          >
            <Bell size={18} />
            {notifications.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-indigo-600 rounded-full"></span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg border border-slate-200 shadow-lg py-2 z-50">
              <div className="px-4 py-2 border-b border-slate-100 flex justify-between items-center">
                <span className="font-semibold text-sm text-slate-800 font-inter">Recent Alerts</span>
                <span className="text-xs text-indigo-600 font-medium hover:underline cursor-pointer">Mark all read</span>
              </div>
              <div className="max-h-60 overflow-y-auto">
                {notifications.map((n) => (
                  <div key={n.id} className="px-4 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-50">
                    <p className="text-xs text-slate-700 font-inter leading-relaxed">{n.text}</p>
                    <span className="text-[10px] text-slate-400 mt-1 block">{n.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
            {user?.email?.charAt(0).toUpperCase()}
          </div>
          <div className="hidden md:block text-left">
            <p className="text-xs font-semibold text-slate-700 font-inter leading-none">{user?.name || 'User'}</p>
            <p className="text-[10px] text-slate-400 capitalize mt-0.5">{user?.role}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
export default Header;
