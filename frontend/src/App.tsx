import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell.js';

// Lazy loading all pages (stubs defined below or imported)
const LoginPage = lazy(() => import('./pages/LoginPage.js').then(m => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('./pages/RegisterPage.js').then(m => ({ default: m.RegisterPage })));
const AcceptInvitePage = lazy(() => import('./pages/AcceptInvitePage.js').then(m => ({ default: m.AcceptInvitePage })));
const ExternalPortalPage = lazy(() => import('./pages/ExternalPortalPage.js').then(m => ({ default: m.ExternalPortalPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage.js').then(m => ({ default: m.DashboardPage })));
const MatterDetailPage = lazy(() => import('./pages/MatterDetailPage.js').then(m => ({ default: m.MatterDetailPage })));
const PlaybookPage = lazy(() => import('./pages/PlaybookPage.js').then(m => ({ default: m.PlaybookPage })));
const ApprovalsPage = lazy(() => import('./pages/ApprovalsPage.js').then(m => ({ default: m.ApprovalsPage })));
const ReviewQueuePage = lazy(() => import('./pages/ReviewQueuePage.js').then(m => ({ default: m.ReviewQueuePage })));
const ObligationsPage = lazy(() => import('./pages/ObligationsPage.js').then(m => ({ default: m.ObligationsPage })));
const CounterpartiesPage = lazy(() => import('./pages/CounterpartiesPage.js').then(m => ({ default: m.CounterpartiesPage })));
const CounterpartyDetailPage = lazy(() => import('./pages/CounterpartyDetailPage.js').then(m => ({ default: m.CounterpartyDetailPage })));
const NegotiationsPage = lazy(() => import('./pages/NegotiationsPage.js'));
const NegotiationDetailPage = lazy(() => import('./pages/NegotiationDetailPage.js'));
const ResearchPage = lazy(() => import('./pages/ResearchPage.js'));
const DeveloperPage = lazy(() => import('./pages/DeveloperPage.js'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.js').then(m => ({ default: m.SettingsPage })));
const ContractsPage = lazy(() => import('./pages/ContractsPage.js').then(m => ({ default: m.ContractsPage })));
const KnowledgeGraphPage = lazy(() => import('./pages/KnowledgeGraphPage.js'));
const DiligenceRoomsPage = lazy(() => import('./pages/DiligenceRoomsPage.js').then(m => ({ default: m.DiligenceRoomsPage })));
const DiligenceRoomDetailPage = lazy(() => import('./pages/DiligenceRoomDetailPage.js').then(m => ({ default: m.DiligenceRoomDetailPage })));
const SignaturesPage = lazy(() => import('./pages/SignaturesPage.js').then(m => ({ default: m.SignaturesPage })));
const SignerPortal = lazy(() => import('./pages/SignerPortal.js').then(m => ({ default: m.SignerPortal })));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage.js').then(m => ({ default: m.AnalyticsPage })));

// Ported pages from cloned repo
const ContractDetailPage = lazy(() => import('./pages/ContractDetailPage.js').then(m => ({ default: m.ContractDetailPage })));
const AgentHomePage = lazy(() => import('./pages/AgentHomePage.js').then(m => ({ default: m.AgentHomePage })));
const TemplatesPage = lazy(() => import('./pages/TemplatesPage.js').then(m => ({ default: m.TemplatesPage })));
const ClausesPage = lazy(() => import('./pages/ClausesPage.js').then(m => ({ default: m.ClausesPage })));
const RenewalsPage = lazy(() => import('./pages/RenewalsPage.js').then(m => ({ default: m.RenewalsPage })));
const InvoicesPage = lazy(() => import('./pages/InvoicesPage.js').then(m => ({ default: m.InvoicesPage })));
const RequestsPage = lazy(() => import('./pages/RequestsPage.js').then(m => ({ default: m.RequestsPage })));
const TeamPage = lazy(() => import('./pages/TeamPage.js').then(m => ({ default: m.TeamPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage.js').then(m => ({ default: m.ProfilePage })));
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage.js').then(m => ({ default: m.AdminUsersPage })));
const AdminRolesPage = lazy(() => import('./pages/AdminRolesPage.js').then(m => ({ default: m.AdminRolesPage })));
const AdminOrgPage = lazy(() => import('./pages/AdminOrgPage.js').then(m => ({ default: m.AdminOrgPage })));
const AdminIntegrationsPage = lazy(() => import('./pages/AdminIntegrationsPage.js').then(m => ({ default: m.AdminIntegrationsPage })));
const AdminSkillsPage = lazy(() => import('./pages/AdminSkillsPage.js').then(m => ({ default: m.AdminSkillsPage })));
const PrivacyPage = lazy(() => import('./pages/legal/PrivacyPage.js').then(m => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import('./pages/legal/TermsPage.js').then(m => ({ default: m.TermsPage })));
const StatusPage = lazy(() => import('./pages/legal/StatusPage.js').then(m => ({ default: m.StatusPage })));

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
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/status" element={<StatusPage />} />
          
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
            <Route path="contracts/:id" element={<ContractDetailPage />} />
            <Route path="agent" element={<AgentHomePage />} />
            <Route path="templates" element={<TemplatesPage />} />
            <Route path="clauses" element={<ClausesPage />} />
            <Route path="renewals" element={<RenewalsPage />} />
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="requests" element={<RequestsPage />} />
            <Route path="team" element={<TeamPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="admin/users" element={<AdminUsersPage />} />
            <Route path="admin/roles" element={<AdminRolesPage />} />
            <Route path="admin/org" element={<AdminOrgPage />} />
            <Route path="admin/integrations" element={<AdminIntegrationsPage />} />
            <Route path="admin/skills" element={<AdminSkillsPage />} />
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
