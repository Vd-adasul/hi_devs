import { lazy, Suspense, Component, type ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { Breadcrumbs } from './Breadcrumbs'

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
