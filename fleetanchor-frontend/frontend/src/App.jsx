import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './context/authStore';
import { PageLoader } from './components/shared/Skeleton';

const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));
const VendorSetupPage = lazy(() => import('./pages/auth/VendorSetupPage'));
const DriverSignupPage = lazy(() => import('./pages/auth/DriverSignupPage'));

const AdminLayout = lazy(() => import('./components/shared/AdminLayout'));
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
const JobsPage = lazy(() => import('./pages/dashboard/JobsPage'));
const JobDetailPage = lazy(() => import('./pages/dashboard/JobDetailPage'));
const VehiclesPage = lazy(() => import('./pages/dashboard/VehiclesPage'));
const VendorsPage = lazy(() => import('./pages/dashboard/VendorsPage'));
const InvoicesPage = lazy(() => import('./pages/dashboard/InvoicesPage'));
const AnalyticsPage = lazy(() => import('./pages/dashboard/AnalyticsPage'));
const ScannerPage = lazy(() => import('./pages/dashboard/ScannerPage'));
const SubscriptionsPage = lazy(() => import('./pages/dashboard/SubscriptionsPage'));
const AuditPage = lazy(() => import('./pages/dashboard/AuditPage'));
const SettingsPage = lazy(() => import('./pages/dashboard/SettingsPage'));
const RepairsPage = lazy(() => import('./pages/dashboard/RepairsPage'));

const VendorLayout = lazy(() => import('./components/shared/VendorLayout'));
const VendorDashboardPage = lazy(() => import('./pages/vendor/VendorDashboardPage'));
const VendorJobsPage = lazy(() => import('./pages/vendor/VendorJobsPage'));
const VendorScannerPage = lazy(() => import('./pages/vendor/VendorScannerPage'));
const VendorVehiclesPage = lazy(() => import('./pages/vendor/VendorVehiclesPage'));
const VendorHistoryPage = lazy(() => import('./pages/vendor/VendorHistoryPage'));
const VendorInvoicesPage = lazy(() => import('./pages/vendor/VendorInvoicesPage'));
const VendorTeamPage = lazy(() => import('./pages/vendor/VendorTeamPage'));
const VendorSubscriptionPage = lazy(() => import('./pages/vendor/VendorSubscriptionPage'));
const TeamChatPage = lazy(() => import('./pages/vendor/TeamChatPage'));
const VendorCompliancePage = lazy(() => import('./pages/vendor/VendorCompliancePage'));

const RequireAuth = ({ children }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

const RequireWorkshop = ({ children }) => {
  const { user, isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!['SUPER_ADMIN','OEM_ADMIN','WORKSHOP_STAFF'].includes(user?.role)) return <Navigate to="/vendor" replace />;
  return children;
};

const RequireVendor = ({ children }) => {
  const { user, isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!['FLEET_MANAGER','MAINTENANCE_SUPERVISOR','FIELD_AGENT'].includes(user?.role)) return <Navigate to="/admin" replace />;
  return children;
};

const SmartRedirect = () => {
  const { user, isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={['FLEET_MANAGER','MAINTENANCE_SUPERVISOR','FIELD_AGENT'].includes(user?.role) ? '/vendor' : '/admin'} replace />;
};

const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-navy">
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 bg-gold rounded-xl flex items-center justify-center text-2xl animate-pulse">⚓</div>
      <div className="text-xs text-[var(--text3)]">Loading FleetAnchor Pro...</div>
    </div>
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background:'#0F2040', color:'#E8ECF4', border:'1px solid rgba(255,255,255,0.1)', fontSize:'12px' },
          success: { iconTheme: { primary:'#00C9A7', secondary:'#0F2040' } },
          error:   { iconTheme: { primary:'#E84B4B', secondary:'#0F2040' } },
        }}
      />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/vendor/setup" element={<VendorSetupPage />} />
          <Route path="/driver/signup" element={<DriverSignupPage />} />
          <Route path="/" element={<SmartRedirect />} />

          <Route path="/admin" element={<RequireWorkshop><AdminLayout /></RequireWorkshop>}>
            <Route index element={<DashboardPage />} />
            <Route path="jobs" element={<JobsPage />} />
            <Route path="jobs/:id" element={<JobDetailPage />} />
            <Route path="repairs" element={<RepairsPage />} />
            <Route path="vehicles" element={<VehiclesPage />} />
            <Route path="vendors" element={<VendorsPage />} />
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="scanner" element={<ScannerPage />} />
            <Route path="subscriptions" element={<SubscriptionsPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          <Route path="/vendor" element={<RequireVendor><VendorLayout /></RequireVendor>}>
            <Route index element={<VendorDashboardPage />} />
            <Route path="jobs" element={<VendorJobsPage />} />
            <Route path="scanner" element={<VendorScannerPage />} />
            <Route path="vehicles" element={<VendorVehiclesPage />} />
            <Route path="history" element={<VendorHistoryPage />} />
            <Route path="invoices" element={<VendorInvoicesPage />} />
            <Route path="team" element={<VendorTeamPage />} />
            <Route path="subscription" element={<VendorSubscriptionPage />} />
            <Route path="chat" element={<TeamChatPage />} />
            <Route path="compliance" element={<VendorCompliancePage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
