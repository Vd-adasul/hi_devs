/**
 * MatterDetailPage (P4.2 / docs/30 D.7.2 + D.7.3)
 *
 * Workspace for a single matter — sidebar list of the matter's
 * contracts + requests + threads, with a title header showing
 * metadata + status toggle.
 */
import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Briefcase, FileText, ClipboardList, MessageSquare, ArrowLeft,
  Archive, CheckCircle2,
} from 'lucide-react'

interface Detail {
  id: string
  name: string
  description: string | null
  status: 'OPEN' | 'CLOSED' | 'ARCHIVED'
  counterpartyId: string | null
  counterpartyName: string | null
  owner: { id: string; name: string; email: string; avatarUrl: string | null } | null
  counterparty: { id: string; name: string; website: string | null } | null
  tags: string[]
  contracts: Array<{
    id: string; title: string; type: string; status: string
    value: number | null; currency: string | null; riskScore: number | null
    counterpartyName: string | null; effectiveDate: string | null; expiryDate: string | null
    updatedAt: string
  }>
  requests: Array<{
    id: string; requestNumber: string | null; title: string; type: string
    status: string; priority: string; counterpartyName: string | null
    createdAt: string
  }>
  threads: Array<{
    id: string; title: string; scopeType: string | null; scopeId: string | null
    userId: string; updatedAt: string
  }>
  livingState?: {
    mergedClauses: Array<{ text: string; category: string; sourceDocId: string }>;
    supersededClauses: Array<{ existingClauseId: string; reason: string }>;
    lastMergedAt: string | null;
  };
  conflicts?: Array<{
    existingClauseId: string;
    existingClauseText: string;
    incomingClauseText: string;
    category: string;
    recommendation: string;
    reason: string;
  }>;
  createdAt: string
  updatedAt: string
  closedAt: string | null
}

export function MatterDetailPage() {
  const qc = useQueryClient()
  const { id } = useParams<{ id: string }>()
  const [tab, setTab] = useState<'contracts' | 'requests' | 'threads' | 'livingState'>('contracts')
  const [resolvedConflicts, setResolvedConflicts] = useState<string[]>([])

  const { data, isLoading } = useQuery({
    queryKey: ['matter', id],
    enabled: !!id,
    queryFn: async () => (await api.get<Detail>(`/matters/${id}`)).data,
  })

  const close = useMutation({
    mutationFn: () => api.patch(`/matters/${id}`, { status: 'CLOSED' }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matter', id] }),
  })
  const archive = useMutation({
    mutationFn: () => api.patch(`/matters/${id}`, { status: 'ARCHIVED' }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matter', id] }),
  })
  const reopen = useMutation({
    mutationFn: () => api.patch(`/matters/${id}`, { status: 'OPEN' }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matter', id] }),
  })

  if (isLoading || !data) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  }

  // Get active conflicts filter
  const activeConflicts = (data.conflicts ?? []).filter(c => !resolvedConflicts.includes(c.existingClauseId))

  return (
    <div className="px-6 py-5 max-w-6xl mx-auto" data-testid="matter-detail-page">
      <Link to="/matters" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-gray-900 mb-3">
        <ArrowLeft className="h-3 w-3" /> Matters
      </Link>
      <div className="flex items-start justify-between mb-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-indigo-600" />
            {data.name}
            <span className={
              'text-[10px] uppercase tracking-wider font-medium rounded px-1.5 py-0.5 border ' +
              (data.status === 'OPEN'     ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : data.status === 'CLOSED' ? 'bg-gray-50 text-gray-600 border-gray-200'
                :                            'bg-amber-50 text-amber-700 border-amber-200')
            }>{data.status}</span>
          </h1>
          <div className="text-[12px] text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            {data.counterpartyName && <span>Counterparty: <span className="text-gray-900">{data.counterpartyName}</span></span>}
            {data.owner && <span>· Owner: <span className="text-gray-900">{data.owner.name}</span></span>}
            {data.tags.map(t => <span key={t} className="font-mono text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1.5">#{t}</span>)}
          </div>
          {data.description && <p className="text-[12px] text-gray-700 mt-2 max-w-3xl">{data.description}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          {data.status === 'OPEN' ? (
            <>
              <Button
                variant="outline" size="sm"
                onClick={() => close.mutate()}
                data-testid="matter-close-btn"
                className="gap-1 text-[12px]"
              >
                <CheckCircle2 className="h-3 w-3" /> Close
              </Button>
              <Button
                variant="outline" size="sm"
                onClick={() => archive.mutate()}
                data-testid="matter-archive-btn"
                className="gap-1 text-[12px]"
              >
                <Archive className="h-3 w-3" /> Archive
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => reopen.mutate()} data-testid="matter-reopen-btn" className="gap-1 text-[12px]">
              Reopen
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center border-b border-border gap-4 text-[13px] mb-3">
        {[
          { k: 'contracts', label: 'Contracts', icon: FileText,    count: (data.contracts ?? []).length },
          { k: 'requests',  label: 'Requests',  icon: ClipboardList, count: (data.requests ?? []).length },
          { k: 'threads',   label: 'Threads',   icon: MessageSquare, count: (data.threads ?? []).length },
          { k: 'livingState', label: 'Living State', icon: Briefcase, count: data.livingState?.mergedClauses?.length || 0 },
        ].map(t => {
          const Icon = t.icon
          const active = tab === t.k
          return (
            <button
              key={t.k}
              onClick={() => setTab(t.k as typeof tab)}
              data-testid={`matter-tab-${t.k}`}
              className={cn(
                'relative flex items-center gap-1.5 py-2 border-b-2 transition-colors',
                active
                  ? 'text-gray-900 border-indigo-500 font-medium'
                  : 'text-muted-foreground border-transparent hover:text-gray-900',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              {t.count !== null && <span className="text-[10.5px] tabular-nums opacity-70">{t.count}</span>}
            </button>
          )
        })}
      </div>

      {tab === 'contracts' && (
        <ul className="divide-y divide-border border border-border rounded-lg bg-card overflow-hidden" data-testid="matter-tab-contracts-body">
          {(data.contracts ?? []).length === 0 && <EmptyRow text="No contracts in this matter yet. Open a contract and assign it via the Matter picker in its header." />}
          {(data.contracts ?? []).map(c => (
            <li key={c.id}>
              <Link to={`/contracts/${c.id}`} className="block px-4 py-2 hover:bg-muted/40">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-[12.5px] text-gray-900 truncate">{c.title}</span>
                  <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground font-mono">{c.type}</span>
                  <span className={cn(
                    'text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 border',
                    c.status === 'EXECUTED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    c.status === 'DRAFT' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    'bg-gray-50 text-gray-600 border-gray-200',
                  )}>{c.status}</span>
                  {c.value != null && <span className="text-[11px] text-muted-foreground">{(c.currency ?? '$')}{Number(c.value).toLocaleString()}</span>}
                  {c.riskScore != null && <span className="text-[10.5px] text-amber-700">risk {(c.riskScore * 100).toFixed(0)}%</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {tab === 'requests' && (
        <ul className="divide-y divide-border border border-border rounded-lg bg-card overflow-hidden" data-testid="matter-tab-requests-body">
          {(data.requests ?? []).length === 0 && <EmptyRow text="No intake requests linked to this matter." />}
          {(data.requests ?? []).map(r => (
            <li key={r.id} className="px-4 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[10.5px] text-muted-foreground">{r.requestNumber ?? r.id.slice(-6)}</span>
                <span className="font-medium text-[12.5px] text-gray-900 truncate">{r.title}</span>
                <span className="text-[10.5px] text-muted-foreground">· {r.status} · {r.priority}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {tab === 'threads' && (
        <ul className="divide-y divide-border border border-border rounded-lg bg-card overflow-hidden" data-testid="matter-tab-threads-body">
          {(data.threads ?? []).length === 0 && <EmptyRow text="No agent threads linked to this matter yet." />}
          {(data.threads ?? []).map(t => (
            <li key={t.id} className="px-4 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                <MessageSquare className="h-3 w-3 text-muted-foreground" />
                <span className="text-[12.5px] text-gray-900 truncate">{t.title}</span>
                <span className="text-[10.5px] text-muted-foreground">· last activity {new Date(t.updatedAt).toLocaleDateString()}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {tab === 'livingState' && (
        <div className="space-y-6" data-testid="matter-tab-living-state-body">
          {/* Active Conflicts Panel */}
          {activeConflicts.length > 0 && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
              <h2 className="text-sm font-semibold text-red-800 flex items-center gap-1.5">
                <Briefcase className="h-4 w-4" />
                Active Conflicts Detected ({activeConflicts.length})
              </h2>
              <div className="space-y-3">
                {activeConflicts.map((c) => (
                  <div key={c.existingClauseId} className="bg-white border border-red-100 rounded-lg p-3 space-y-2">
                    <div className="flex justify-between items-start flex-wrap gap-1">
                      <span className="font-mono text-[10px] uppercase font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded">
                        {c.category}
                      </span>
                      <span className="text-[10.5px] text-gray-500">
                        AI Recommendation: <strong className="text-emerald-700">{c.recommendation}</strong>
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="p-2 bg-gray-50 rounded border border-gray-100">
                        <strong className="text-gray-600 block mb-1">Original Clause:</strong>
                        <p className="text-gray-800 italic leading-relaxed">{c.existingClauseText}</p>
                      </div>
                      <div className="p-2 bg-indigo-50/40 rounded border border-indigo-100">
                        <strong className="text-indigo-700 block mb-1">Incoming Amendment Clause:</strong>
                        <p className="text-gray-800 italic leading-relaxed">{c.incomingClauseText}</p>
                      </div>
                    </div>
                    <div className="flex justify-between items-center flex-wrap pt-1 gap-2 border-t border-gray-100">
                      <span className="text-xs text-gray-600">
                        <strong>Reason:</strong> {c.reason}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setResolvedConflicts(prev => [...prev, c.existingClauseId])}
                        className="text-xs text-red-700 hover:bg-red-50 border-red-200 h-7"
                      >
                        Resolve
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Living State Active Clauses */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900">Merged Living State</h2>
              {data.livingState?.lastMergedAt && (
                <span className="text-xs text-muted-foreground">
                  Last updated {new Date(data.livingState.lastMergedAt).toLocaleString()}
                </span>
              )}
            </div>
            {(!data.livingState || !data.livingState.mergedClauses || data.livingState.mergedClauses.length === 0) ? (
              <div className="text-center py-10 border border-dashed rounded-lg text-sm text-gray-400">
                No living clauses calculated yet. Upload multiple documents to calculate merged state.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {data.livingState.mergedClauses.map((mc, idx) => {
                  const sourceContract = data.contracts.find(c => c.id === mc.sourceDocId)
                  return (
                    <div key={idx} className="bg-white border rounded-xl p-3.5 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-[10px] uppercase font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                          {mc.category}
                        </span>
                        {sourceContract && (
                          <span className="text-[10px] text-gray-500">
                            Source: <strong className="text-gray-700">{sourceContract.title}</strong>
                          </span>
                        )}
                      </div>
                      <p className="text-xs leading-relaxed text-gray-700 whitespace-pre-wrap">{mc.text}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyRow({ text }: { text: string }) {
  return (
    <li className="px-4 py-8 text-center text-[12px] text-muted-foreground italic">
      {text}
    </li>
  )
}

function cn(...c: Array<string | null | undefined | false>): string {
  return c.filter(Boolean).join(' ')
}

