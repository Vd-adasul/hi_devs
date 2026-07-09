import { useState, useEffect } from 'react';
import api from '../lib/api.js';
import {
  Briefcase,
  FileCheck,
  CheckSquare,
  AlertCircle,
  ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function DashboardPage() {
  const [stats, setStats] = useState({ mattersCount: 0, docsCount: 0, pendingApprovals: 0, overdueObligations: 0 });
  const [recentMatters, setRecentMatters] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // 1. Fetch matters
        const matRes = await api.get('/matters');
        const matters = matRes.data.data || [];
        setRecentMatters(matters.slice(0, 3));

        // 2. Fetch pending queues
        const appRes = await api.get('/approvals/instances/queue');
        setPendingApprovals(appRes.data.data || []);

        const oblRes = await api.get('/obligations?status=pending');
        
        setStats({
          mattersCount: matters.length,
          docsCount: matters.length * 2, // approximation for summary
          pendingApprovals: appRes.data.data?.length || 0,
          overdueObligations: oblRes.data.data?.length || 0,
        });
      } catch (err) {
        console.warn('Dashboard data fetch failed:', err);
      }
    };

    fetchDashboardData();
  }, []);

  const metricCards = [
    { title: 'Active Matters', count: stats.mattersCount, icon: Briefcase, color: 'text-indigo-600 bg-indigo-50 border-indigo-100' },
    { title: 'Documents Twin', count: stats.docsCount, icon: FileCheck, color: 'text-blue-600 bg-blue-50 border-blue-100' },
    { title: 'Pending Approvals', count: stats.pendingApprovals, icon: CheckSquare, color: 'text-emerald-600 bg-emerald-50 border-emerald-100', badge: true },
    { title: 'Overdue Compliance', count: stats.overdueObligations, icon: AlertCircle, color: 'text-red-600 bg-red-50 border-red-100', badge: true },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Executive Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Real-time status overview of legal digital twins and workflows</p>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="glass-panel p-6 bg-white border border-slate-200 shadow-sm flex items-center justify-between rounded-xl">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{card.title}</p>
                <h3 className="text-3xl font-bold text-slate-800 mt-2">{card.count}</h3>
              </div>
              <div className={`p-3 rounded-lg border ${card.color}`}>
                <Icon size={24} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail Split columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
        {/* Column Left: Recent Matters */}
        <div className="glass-panel bg-white border border-slate-200 shadow-sm flex flex-col gap-4 rounded-xl">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Recent active Matters</h3>
            <Link to="/matters" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>

          <div className="flex flex-col gap-3">
            {recentMatters.map((m) => (
              <div key={m._id} className="p-4 border border-slate-100 rounded-lg hover:border-indigo-100 hover:bg-slate-50/50 transition-colors flex justify-between items-center">
                <div>
                  <h4 className="text-sm font-bold text-slate-800">{m.name}</h4>
                  <span className="text-xs text-slate-400 mt-0.5 block">Client: {m.client_name}</span>
                </div>
                <Link to={`/matters/${m._id}`} className="text-xs bg-indigo-50 text-indigo-700 font-semibold px-3 py-1.5 rounded-md hover:bg-indigo-100">
                  Enter Scope
                </Link>
              </div>
            ))}
            {recentMatters.length === 0 && (
              <p className="text-xs text-slate-400 py-6 text-center">No active matter scopes found.</p>
            )}
          </div>
        </div>

        {/* Column Right: Pending Approvals */}
        <div className="glass-panel bg-white border border-slate-200 shadow-sm flex flex-col gap-4 rounded-xl">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Pending Approval Workflows</h3>
            <Link to="/approvals" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              Open Queue <ArrowRight size={12} />
            </Link>
          </div>

          <div className="flex flex-col gap-3">
            {pendingApprovals.map((app) => (
              <div key={app._id} className="p-4 border border-slate-100 rounded-lg flex justify-between items-center hover:border-emerald-100 hover:bg-slate-50/50 transition-colors">
                <div>
                  <h4 className="text-sm font-bold text-slate-800">{app.contract?.title || 'Contract'}</h4>
                  <span className="text-xs text-slate-400 mt-0.5 block">Step {app.currentStepIndex + 1} of {app.steps?.length}</span>
                </div>
                <Link to={`/contracts/${app.contractId}`} className="text-xs bg-emerald-50 text-emerald-700 font-semibold px-3 py-1.5 rounded-md hover:bg-emerald-100">
                  Review Doc
                </Link>
              </div>
            ))}
            {pendingApprovals.length === 0 && (
              <p className="text-xs text-slate-400 py-6 text-center">Your pending approval queue is empty.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
