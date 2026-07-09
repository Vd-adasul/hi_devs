import { lazy, Suspense, Component, type ReactNode, useEffect, useState } from 'react'
import { Outlet, useLocation, Navigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { Breadcrumbs } from './Breadcrumbs'
import { useAuthStore } from '@/store/auth'

// Lazy-load the heavy SideAgentRail (110 KB) so it doesn't block the initial
// render and any crash inside it is isolated to its own boundary.
const SideAgentRail = lazy(() =>
  import('@/components/agent/SideAgentRail').then(m => ({ default: m.SideAgentRail }))
)

class RailBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return null // silently hide if rail crashes
    return this.props.children
  }
}

// U.4.5 — legacy ChatPanel modal + AGENT_SIDE_PANEL_V2 feature flag deleted
// (doc 32 §11b items 7+10). Final state: rail is the AI surface on every
// non-/agent route, no fallback. The /agent route runs the studio.
export function AppShell() {
  const location = useLocation()
  const onAgentRoute = location.pathname.startsWith('/agent')

  // ── Auth Guard ─────────────────────────────────────────────────────────────
  // Zustand-persist restores state from localStorage asynchronously on first
  // render. We wait one tick (useEffect) before checking auth so we don't
  // redirect users with valid persisted tokens to /login on hard reload.
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => { setHydrated(true) }, [])

  // Still waiting for localStorage hydration — show full-page spinner
  if (!hydrated) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    )
  }

  // Not authenticated — redirect to /login, preserving intended destination
  if (!isAuthenticated) {
    const next = location.pathname !== '/login'
      ? `?next=${encodeURIComponent(location.pathname + location.search)}`
      : ''
    return <Navigate to={`/login${next}`} replace />
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Header />
        <Breadcrumbs />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      {!onAgentRoute && (
        <RailBoundary>
          <Suspense fallback={null}>
            <SideAgentRail />
          </Suspense>
        </RailBoundary>
      )}
    </div>
  )
}
