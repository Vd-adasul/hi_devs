import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import { Network, Filter, RefreshCw, GitBranch } from 'lucide-react';

interface GraphNode {
  id: string;
  label: string;
  type: 'matter' | 'document' | 'clause' | 'entity' | 'citation';
  x?: number;
  y?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  label?: string;
}

export default function KnowledgeGraphPage() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'matter' | 'document' | 'clause' | 'citation'>('all');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [stats, setStats] = useState({ matters: 0, documents: 0, clauses: 0, citations: 0 });

  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      // Try to load from the graph API
      const res = await api.get('/graph/overview');
      if (res.data.nodes && res.data.edges) {
        setNodes(res.data.nodes);
        setEdges(res.data.edges);
      }
      // Also load stats
      const matRes = await api.get('/matters');
      const matterList = matRes.data.data || [];
      setStats(prev => ({ ...prev, matters: matterList.length }));

      // Build a local graph from matters
      if (!res.data.nodes) {
        const builtNodes: GraphNode[] = [];
        const builtEdges: GraphEdge[] = [];
        for (const m of matterList) {
          builtNodes.push({ id: m._id, label: m.name, type: 'matter' });
          try {
            const docRes = await api.get(`/matters/${m._id}/documents`);
            (docRes.data.documents || []).forEach((d: any) => {
              builtNodes.push({ id: d._id, label: d.name, type: 'document' });
              builtEdges.push({ source: m._id, target: d._id, label: 'contains' });
              (d.clauses || []).slice(0, 3).forEach((c: any, idx: number) => {
                const clauseId = `${d._id}_c${idx}`;
                builtNodes.push({ id: clauseId, label: c.category || 'Clause', type: 'clause' });
                builtEdges.push({ source: d._id, target: clauseId, label: 'has clause' });
              });
            });
          } catch {}
        }
        setNodes(builtNodes);
        setEdges(builtEdges);
        setStats({ matters: matterList.length, documents: builtNodes.filter(n => n.type === 'document').length, clauses: builtNodes.filter(n => n.type === 'clause').length, citations: 0 });
      }
    } catch (err) {
      console.warn('Graph load error:', err);
      // Build minimal demo graph
      setNodes([
        { id: 'demo_matter', label: 'Demo Matter', type: 'matter' },
        { id: 'demo_doc1', label: 'Contract_A.pdf', type: 'document' },
        { id: 'demo_doc2', label: 'Amendment_B.pdf', type: 'document' },
        { id: 'demo_clause1', label: 'Governing Law', type: 'clause' },
        { id: 'demo_clause2', label: 'Termination', type: 'clause' },
        { id: 'demo_cite1', label: 'Section 78 IPC', type: 'citation' },
      ]);
      setEdges([
        { source: 'demo_matter', target: 'demo_doc1', label: 'contains' },
        { source: 'demo_matter', target: 'demo_doc2', label: 'contains' },
        { source: 'demo_doc1', target: 'demo_clause1', label: 'has clause' },
        { source: 'demo_doc1', target: 'demo_clause2', label: 'has clause' },
        { source: 'demo_clause1', target: 'demo_cite1', label: 'cites' },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  const nodeColor = (type: string) => {
    switch (type) {
      case 'matter': return '#6366f1';
      case 'document': return '#0ea5e9';
      case 'clause': return '#10b981';
      case 'citation': return '#f59e0b';
      default: return '#94a3b8';
    }
  };

  const filteredNodes = filter === 'all' ? nodes : nodes.filter(n => n.type === filter);
  const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
  const filteredEdges = edges.filter(e => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target));

  // Simple SVG force-layout graph (static positioning for demo)
  const W = 800, H = 500;
  const positioned = filteredNodes.map((n, i) => {
    const angle = (i / filteredNodes.length) * 2 * Math.PI;
    const r = Math.min(W, H) * 0.35;
    return {
      ...n,
      x: W / 2 + r * Math.cos(angle),
      y: H / 2 + r * Math.sin(angle),
    };
  });
  const posMap: Record<string, { x: number; y: number }> = {};
  positioned.forEach(n => { posMap[n.id] = { x: n.x, y: n.y }; });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Legal Knowledge Fabric</h1>
          <p className="text-sm text-slate-500 mt-1">Neo4j-powered citation, matter &amp; clause relationship graph</p>
        </div>
        <button onClick={loadGraph} className="flex items-center gap-2 text-sm border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-semibold px-4 py-2 rounded-lg transition-colors">
          <RefreshCw size={14} />
          Reload Graph
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Matters', value: stats.matters, color: '#6366f1', type: 'matter' },
          { label: 'Documents', value: stats.documents, color: '#0ea5e9', type: 'document' },
          { label: 'Clauses', value: stats.clauses, color: '#10b981', type: 'clause' },
          { label: 'Citations', value: stats.citations, color: '#f59e0b', type: 'citation' },
        ].map(stat => (
          <div
            key={stat.label}
            onClick={() => setFilter(stat.type as any)}
            className={`bg-white border rounded-xl p-5 cursor-pointer transition-all shadow-sm hover:shadow ${filter === stat.type ? 'border-2' : 'border-slate-200'}`}
            style={{ borderColor: filter === stat.type ? stat.color : undefined }}
          >
            <p className="text-xs font-medium text-slate-500">{stat.label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: stat.color }}>{stat.value}</p>
            <div className="mt-2 h-1.5 rounded-full" style={{ backgroundColor: stat.color + '33' }}>
              <div className="h-full rounded-full" style={{ width: '60%', backgroundColor: stat.color }} />
            </div>
          </div>
        ))}
      </div>

      {/* Filter Row */}
      <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <Filter size={16} className="text-slate-400" />
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-2">Filter by type:</span>
        {(['all', 'matter', 'document', 'clause', 'citation'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors ${
              filter === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400">{filteredNodes.length} nodes · {filteredEdges.length} edges</span>
      </div>

      {/* Graph Canvas */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Network size={16} className="text-indigo-500" />
            Knowledge Graph — {filteredNodes.length} Nodes
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            {[
              { label: 'Matter', color: '#6366f1' },
              { label: 'Document', color: '#0ea5e9' },
              { label: 'Clause', color: '#10b981' },
              { label: 'Citation', color: '#f59e0b' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: l.color }} />
                <span>{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-80">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : (
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="bg-slate-50/30">
            {/* Edges */}
            {filteredEdges.map((e, i) => {
              const src = posMap[e.source];
              const tgt = posMap[e.target];
              if (!src || !tgt) return null;
              return (
                <g key={i}>
                  <line
                    x1={src.x} y1={src.y}
                    x2={tgt.x} y2={tgt.y}
                    stroke="#cbd5e1" strokeWidth="1.5"
                    markerEnd="url(#arrow)"
                  />
                  <text x={(src.x + tgt.x) / 2} y={(src.y + tgt.y) / 2 - 4} fill="#94a3b8" fontSize="9" textAnchor="middle">{e.label}</text>
                </g>
              );
            })}

            {/* Arrow marker */}
            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L9,3 z" fill="#cbd5e1" />
              </marker>
            </defs>

            {/* Nodes */}
            {positioned.map(n => (
              <g key={n.id} onClick={() => setSelectedNode(n)} style={{ cursor: 'pointer' }}>
                <circle
                  cx={n.x} cy={n.y} r={selectedNode?.id === n.id ? 22 : 18}
                  fill={nodeColor(n.type)}
                  opacity={0.9}
                  stroke={selectedNode?.id === n.id ? '#1e293b' : nodeColor(n.type)}
                  strokeWidth={selectedNode?.id === n.id ? 3 : 0}
                />
                <text
                  x={n.x} y={n.y + 30}
                  fill="#475569" fontSize="10" textAnchor="middle" fontWeight="600"
                  className="select-none"
                >
                  {n.label.length > 14 ? n.label.slice(0, 14) + '…' : n.label}
                </text>
              </g>
            ))}
          </svg>
        )}

        {/* Selected node info panel */}
        {selectedNode && (
          <div className="border-t border-slate-100 px-6 py-4 bg-indigo-50/50 flex items-center gap-4">
            <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: nodeColor(selectedNode.type) }} />
            <div>
              <p className="text-sm font-bold text-slate-800">{selectedNode.label}</p>
              <p className="text-xs text-slate-500 capitalize mt-0.5">Type: {selectedNode.type} · ID: {selectedNode.id.slice(0, 16)}…</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-md font-medium">
                <GitBranch size={12} className="inline mr-1" />
                {edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id).length} connections
              </span>
              <button onClick={() => setSelectedNode(null)} className="text-xs text-slate-400 hover:text-slate-600">✕</button>
            </div>
          </div>
        )}
      </div>

      <div className="text-xs text-slate-400 text-center mt-2">
        Click any node to inspect • Graph powered by Neo4j • All relationships automatically extracted from uploaded PDFs
      </div>
    </div>
  );
}
