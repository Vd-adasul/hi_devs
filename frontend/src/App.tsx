import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell.js';

// Lazy loading all pages (stubs defined below or imported)
const LoginPage = lazy(() => import('./pages/LoginPage.js'));
const RegisterPage = lazy(() => import('./pages/RegisterPage.js'));
const AcceptInvitePage = lazy(() => import('./pages/AcceptInvitePage.js'));
const ExternalPortalPage = lazy(() => import('./pages/ExternalPortalPage.js'));
const DashboardPage = lazy(() => import('./pages/DashboardPage.js'));
const MatterDetailPage = lazy(() => import('./pages/MatterDetailPage.js'));
const PlaybookPage = lazy(() => import('./pages/PlaybookPage.js'));
const ApprovalsPage = lazy(() => import('./pages/ApprovalsPage.js'));
const ReviewQueuePage = lazy(() => import('./pages/ReviewQueuePage.js'));
const ObligationsPage = lazy(() => import('./pages/ObligationsPage.js'));
const CounterpartiesPage = lazy(() => import('./pages/CounterpartiesPage.js'));
const CounterpartyDetailPage = lazy(() => import('./pages/CounterpartyDetailPage.js'));
const NegotiationsPage = lazy(() => import('./pages/NegotiationsPage.js'));
const NegotiationDetailPage = lazy(() => import('./pages/NegotiationDetailPage.js'));
const ResearchPage = lazy(() => import('./pages/ResearchPage.js'));
const DeveloperPage = lazy(() => import('./pages/DeveloperPage.js'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.js'));
const ContractsPage = lazy(() => import('./pages/ContractsPage.js'));
const KnowledgeGraphPage = lazy(() => import('./pages/KnowledgeGraphPage.js'));
const DiligenceRoomsPage = lazy(() => import('./pages/DiligenceRoomsPage.js'));
const DiligenceRoomDetailPage = lazy(() => import('./pages/DiligenceRoomDetailPage.js'));
const SignaturesPage = lazy(() => import('./pages/SignaturesPage.js'));
const SignerPortal = lazy(() => import('./pages/SignerPortal.js'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage.js'));

export default function App() {
  return (
    <BrowserRouter>
      <Suspense
        fallback={
          <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        }
      >
        <Routes>
          {/* Public Authentication routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/accept-invite/:token" element={<AcceptInvitePage />} />
          
          {/* Public Portal external routes */}
          <Route path="/portal/:token" element={<ExternalPortalPage />} />
          <Route path="/sign/:token" element={<SignerPortal />} />

          {/* Gated Application shell routes */}
          <Route path="/" element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="matters/:id" element={<MatterDetailPage />} />
            <Route path="playbook" element={<PlaybookPage />} />
            <Route path="approvals" element={<ApprovalsPage />} />
            <Route path="review-queue" element={<ReviewQueuePage />} />
            <Route path="obligations" element={<ObligationsPage />} />
            <Route path="counterparties" element={<CounterpartiesPage />} />
            <Route path="counterparties/:id" element={<CounterpartyDetailPage />} />
            <Route path="negotiations" element={<NegotiationsPage />} />
            <Route path="negotiations/:id" element={<NegotiationDetailPage />} />
            <Route path="research" element={<ResearchPage />} />
            <Route path="developer" element={<DeveloperPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="contracts" element={<ContractsPage />} />
            <Route path="graph" element={<KnowledgeGraphPage />} />
            <Route path="diligence" element={<DiligenceRoomsPage />} />
            <Route path="diligence/:id" element={<DiligenceRoomDetailPage />} />
            <Route path="signatures" element={<SignaturesPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
