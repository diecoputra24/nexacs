import { useEffect } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { Navigate, Route, Routes } from 'react-router-dom';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { LoginPage } from '../features/auth/LoginPage';
import { OverviewPage } from '../features/overview/OverviewPage';
import { DevicesPage } from '../features/devices/DevicesPage';
import { DeviceDetailPage } from '../features/devices/DeviceDetailPage';
import { FaultsPage } from '../features/faults/FaultsPage';
import { FirmwarePage } from '../features/firmware/FirmwarePage';
import { ProvisioningPage } from '../features/provisioning/ProvisioningPage';
import { SecurityPage } from '../features/security/SecurityPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { SummonLogsPage } from '../features/tasks/SummonLogsPage';
import { useAcsStore } from '../stores/acsStore';

export function AppRouter() {
  const isAuthenticated = useAcsStore((s) => s.isAuthenticated);
  const authChecking = useAcsStore((s) => s.authChecking);
  const bootstrapBackend = useAcsStore((s) => s.bootstrapBackend);

  useEffect(() => {
    void bootstrapBackend();
  }, [bootstrapBackend]);

  if (authChecking) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.default',
        }}
      >
        <CircularProgress size={30} />
      </Box>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/overview" replace /> : <LoginPage />}
      />
      <Route
        path="/"
        element={isAuthenticated ? <DashboardLayout /> : <Navigate to="/login" replace />}
      >
        <Route index element={<Navigate to="/overview" replace />} />
        <Route path="overview" element={<OverviewPage />} />
        <Route path="devices" element={<DevicesPage />} />
        <Route path="devices/:id" element={<DeviceDetailPage />} />
        <Route path="summon-logs" element={<SummonLogsPage />} />
        <Route path="faults" element={<FaultsPage />} />
        <Route path="firmware" element={<FirmwarePage />} />
        <Route path="provisioning" element={<ProvisioningPage />} />
        <Route path="security" element={<Navigate to="/security/users" replace />} />
        <Route path="security/:section" element={<SecurityPage />} />
        <Route path="settings" element={<Navigate to="/settings/general" replace />} />
        <Route path="settings/:section" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to={isAuthenticated ? '/overview' : '/login'} replace />} />
    </Routes>
  );
}
