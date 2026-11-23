import { useEffect, useState } from 'react';
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  Drawer,
  Fade,
  IconButton,
  LinearProgress,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Popover,
  Stack,
  Switch,
  Toolbar,
  Tooltip,
  Typography,
  Button,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import RouterIcon from '@mui/icons-material/Router';
import HistoryIcon from '@mui/icons-material/History';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import SecurityIcon from '@mui/icons-material/Security';
import SettingsIcon from '@mui/icons-material/Settings';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MenuIcon from '@mui/icons-material/Menu';
import NotificationsIcon from '@mui/icons-material/Notifications';
import SensorsIcon from '@mui/icons-material/Sensors';
import LogoutIcon from '@mui/icons-material/Logout';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import CheckIcon from '@mui/icons-material/Check';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { IDLE_TIMEOUT_MS, useAcsStore } from '../stores/acsStore';
import type { RoleName } from '../types';
import { formatRelativeTime } from '../utils/classification';
import { SimulateInformDialog } from '../components/dialogs/SimulateInformDialog';
import { NocDialog } from '../components/dialogs/NocDialog';

const DRAWER_WIDTH = 236;

function formatRoleSlug(role: string): string {
  const slug = role.trim().toLowerCase().replace(/\s+/g, '');
  return slug === 'superadmin' ? 'admin' : slug;
}

function LastUpdateChip() {
  const lastDataUpdate = useAcsStore((s) => s.lastDataUpdate);
  return (
    <Chip
      size="small"
      variant="outlined"
      color="primary"
      label={`Last update: ${formatRelativeTime(lastDataUpdate)}`}
      sx={{ height: 26, fontSize: '0.75rem' }}
    />
  );
}

function SidebarQueueBadgeIcon() {
  const activeQueueCount = useAcsStore((s) => s.summonQueueSummary.activeCount);
  return (
    <Badge badgeContent={activeQueueCount} color="info" max={99}>
      <HistoryIcon fontSize="small" />
    </Badge>
  );
}

function SidebarFaultsBadgeIcon() {
  const openFaultCount = useAcsStore((s) => {
    let n = 0;
    for (const f of s.faults) {
      if (f.status === 'open') n += 1;
    }
    return n;
  });
  return (
    <Badge badgeContent={openFaultCount} color="error" max={99}>
      <WarningAmberIcon fontSize="small" />
    </Badge>
  );
}

function RealtimeEventsControl() {
  const [eventsAnchor, setEventsAnchor] = useState<HTMLElement | null>(null);
  const realtimeEvents = useAcsStore((s) => s.realtimeEvents);
  return (
    <>
      <Tooltip title="Realtime WebSocket Events (/ws/v1/events)">
        <IconButton
          size="small"
          onClick={(e) => setEventsAnchor(e.currentTarget)}
          sx={{ p: 0.75, borderRadius: 1.25 }}
        >
          <Badge badgeContent={realtimeEvents.length} color="primary" max={9}>
            <NotificationsIcon fontSize="small" />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(eventsAnchor)}
        anchorEl={eventsAnchor}
        onClose={() => setEventsAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ width: 360, maxHeight: 400, overflowY: 'auto', p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Realtime Event Stream (Sanitized)
          </Typography>
          <Divider sx={{ mb: 1 }} />
          <Stack spacing={1}>
            {realtimeEvents.map((ev) => (
              <Box key={ev.id} sx={{ p: 1, borderRadius: 1, bgcolor: 'var(--noc-subtle)', border: '1px solid', borderColor: 'divider' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="caption" fontWeight={700} color="primary.main">
                    {ev.type}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatRelativeTime(ev.timestamp)}
                  </Typography>
                </Stack>
                <Typography variant="caption" display="block" color="text.primary">
                  {ev.message}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      </Popover>
    </>
  );
}

function SummonQueueToast({ onOpenDetails }: { onOpenDetails: () => void }) {
  const apiMode = useAcsStore((s) => s.apiMode);
  const summonQueueSummary = useAcsStore((s) => s.summonQueueSummary);
  const summonBatchTrackedIds = useAcsStore((s) => s.summonBatchTrackedIds);
  const fetchTasks = useAcsStore((s) => s.fetchTasks);

  const activeQueueCount = summonQueueSummary.activeCount;
  const batchTotal = Math.max(summonBatchTrackedIds.length, activeQueueCount);
  const batchDone = Math.max(0, batchTotal - activeQueueCount);
  const batchPercent = batchTotal > 0 ? Math.min(100, Math.round((batchDone / batchTotal) * 100)) : 0;

  // Adaptive task polling strictly while a Summon queue is active and tab is visible.
  useEffect(() => {
    if (apiMode !== 'backend' || activeQueueCount <= 0) return;
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void fetchTasks({ limit: 60 });
    }, 4000);
    return () => window.clearInterval(timer);
  }, [apiMode, activeQueueCount, fetchTasks]);

  return (
    <Fade in={activeQueueCount > 0} unmountOnExit>
      <Paper
        elevation={6}
        sx={{
          position: 'fixed',
          bottom: 20,
          right: 24,
          zIndex: (t) => t.zIndex.snackbar,
          minWidth: 310,
          maxWidth: 390,
          overflow: 'hidden',
          borderRadius: 1.5,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5} sx={{ px: 2, py: 1.25 }}>
          <Stack direction="row" alignItems="center" spacing={1.25} sx={{ minWidth: 0 }}>
            <CircularProgress size={16} thickness={5} color="info" sx={{ flexShrink: 0 }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} noWrap>
                Sedang Queue Summon{' '}
                <Box component="span" sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', color: 'info.main' }}>
                  ({batchDone}/{batchTotal})
                </Box>
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" noWrap>
                {summonQueueSummary.executingCount} executing ·{' '}
                {summonQueueSummary.queuedCount + summonQueueSummary.waitingCount} waiting
              </Typography>
            </Box>
          </Stack>
          <Button
            size="small"
            variant="text"
            color="primary"
            onClick={onOpenDetails}
            sx={{ flexShrink: 0, fontWeight: 600, whiteSpace: 'nowrap' }}
          >
            Lihat Details
          </Button>
        </Stack>
        <LinearProgress
          variant="determinate"
          value={batchPercent}
          color="info"
          sx={{ height: 3 }}
        />
      </Paper>
    </Fade>
  );
}

export function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [informOpen, setInformOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [profileAnchor, setProfileAnchor] = useState<HTMLElement | null>(null);
  const [openGroup, setOpenGroup] = useState<'security' | 'settings' | null>(null);

  const currentUser = useAcsStore((s) => s.currentUser);
  const setCurrentRole = useAcsStore((s) => s.setCurrentRole);
  const themeMode = useAcsStore((s) => s.themeMode);
  const toggleThemeMode = useAcsStore((s) => s.toggleThemeMode);
  const apiMode = useAcsStore((s) => s.apiMode);
  const logoutBackend = useAcsStore((s) => s.logoutBackend);
  const recordUserActivity = useAcsStore((s) => s.recordUserActivity);

  // Track user interactions & auto-logout after 1 hour of inactivity
  useEffect(() => {
    let lastRecorded = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastRecorded >= 15000) {
        lastRecorded = now;
        recordUserActivity();
      }
    };
    const events: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'click',
    ];
    for (const ev of events) {
      window.addEventListener(ev, onActivity, { passive: true });
    }

    const checkIdle = () => {
      const state = useAcsStore.getState();
      if (state.isAuthenticated && state.lastActivityAt > 0 && Date.now() - state.lastActivityAt >= IDLE_TIMEOUT_MS) {
        state.logoutBackend('Session expired after 1 hour of inactivity. Please sign in again.');
        navigate('/login', { replace: true });
      }
    };
    const timer = window.setInterval(checkIdle, 15000);
    window.addEventListener('focus', checkIdle);

    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, onActivity);
      }
      window.clearInterval(timer);
      window.removeEventListener('focus', checkIdle);
    };
  }, [recordUserActivity, navigate]);

  const securityChildren = [
    { label: 'Users & RBAC Permissions', path: '/security/users' },
    { label: 'Audit Logs', path: '/security/audit' },
    { label: 'Device & USP Trust Policy', path: '/security/trust' },
  ];

  const settingsChildren = [
    { label: 'General & Status', path: '/settings/general' },
    { label: 'Health Thresholds', path: '/settings/thresholds' },
    { label: 'Aliases & Virtual Params', path: '/settings/aliases' },
    { label: 'Protocol (CWMP / USP)', path: '/settings/protocol' },
  ];

  const navItems = [
    { label: 'Overview', path: '/overview', icon: <DashboardIcon fontSize="small" /> },
    { label: 'Devices', path: '/devices', icon: <RouterIcon fontSize="small" /> },
    {
      label: 'Log Summon',
      path: '/summon-logs',
      icon: <SidebarQueueBadgeIcon />,
    },
    {
      label: 'Faults',
      path: '/faults',
      icon: <SidebarFaultsBadgeIcon />,
    },
    { label: 'Firmware', path: '/firmware', icon: <SystemUpdateAltIcon fontSize="small" /> },
    { label: 'Auto Provisioning', path: '/provisioning', icon: <AutoFixHighOutlinedIcon fontSize="small" /> },
  ];

  const isSecurityActive = location.pathname.startsWith('/security');
  const isSettingsActive = location.pathname.startsWith('/settings');

  // Keep parent nav group expanded automatically whenever one of its child routes is active.
  useEffect(() => {
    setOpenGroup(null);
  }, [location.pathname]);

  const renderExpandableNavGroup = (
    label: string,
    icon: React.ReactNode,
    active: boolean,
    open: boolean,
    onToggle: () => void,
    children: Array<{ label: string; path: string }>,
  ) => (
    <>
      <ListItemButton
        onClick={onToggle}
        sx={{
          mx: 1,
          my: 0.35,
          borderRadius: 1,
          bgcolor: active ? 'action.selected' : 'transparent',
          color: active ? 'primary.main' : 'text.primary',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <ListItemIcon sx={{ minWidth: 36, color: active ? 'primary.main' : 'text.secondary' }}>
          {icon}
        </ListItemIcon>
        <ListItemText
          primary={label}
          primaryTypographyProps={{ fontSize: '0.88rem', fontWeight: active ? 700 : 500 }}
        />
        <ExpandMoreIcon
          fontSize="small"
          sx={{
            color: active ? 'primary.main' : 'text.secondary',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      </ListItemButton>

      <Collapse in={open} timeout={220} unmountOnExit>
        <List dense disablePadding sx={{ pl: 1, pr: 0.5 }}>
          {children.map((child) => {
            const selected = location.pathname === child.path;
            return (
              <ListItemButton
                key={child.path}
                selected={selected}
                onClick={() => {
                  navigate(child.path);
                  setMobileOpen(false);
                }}
                sx={{
                  mx: 1,
                  my: 0.25,
                  pl: 2.25,
                  pr: 1,
                  py: 0.55,
                  borderRadius: 1,
                  transition: 'background-color 220ms cubic-bezier(0.22, 1, 0.36, 1), color 200ms ease',
                  '&.Mui-selected': {
                    bgcolor: '#0284C7',
                    color: '#FFFFFF',
                    '&:hover': { bgcolor: '#0369A1' },
                  },
                }}
              >
                <Box
                  component="span"
                  sx={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    bgcolor: selected ? '#fff' : '#94A3B8',
                    mr: 1,
                    flexShrink: 0,
                    transition: 'background-color 220ms ease, transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
                    transform: selected ? 'scale(1.25)' : 'scale(1)',
                  }}
                />
                <ListItemText
                  primary={child.label}
                  primaryTypographyProps={{
                    fontSize: '0.75rem',
                    fontWeight: selected ? 600 : 500,
                    noWrap: true,
                  }}
                />
              </ListItemButton>
            );
          })}
        </List>
      </Collapse>
    </>
  );

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box
        sx={{
          px: 2.5,
          height: 60,
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Box
          component="img"
          src="/nexacs-logo.png"
          alt="NexACS"
          sx={{
            height: 36,
            width: 'auto',
            maxWidth: '100%',
            display: 'block',
            objectFit: 'contain',
            filter: (t) =>
              t.palette.mode === 'dark'
                ? 'drop-shadow(0 0 1px rgba(255,255,255,0.9)) drop-shadow(0 2px 6px rgba(56,189,248,0.22))'
                : 'none',
          }}
        />
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', py: 1 }}>
        <List dense disablePadding>
          {navItems.map((item) => {
            const selected = location.pathname.startsWith(item.path);
            return (
              <ListItemButton
                key={item.path}
                selected={selected}
                onClick={() => {
                  setOpenGroup(null);
                  navigate(item.path);
                  setMobileOpen(false);
                }}
                sx={{
                  mx: 1,
                  my: 0.35,
                  borderRadius: 1,
                  transition: 'background-color 220ms cubic-bezier(0.22, 1, 0.36, 1), color 200ms ease',
                  '&.Mui-selected': {
                    bgcolor: '#0284C7',
                    color: '#FFFFFF',
                    '& .MuiListItemIcon-root': { color: '#FFFFFF' },
                    '&:hover': { bgcolor: '#0369A1' },
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: '0.88rem', fontWeight: selected ? 700 : 500 }} />
              </ListItemButton>
            );
          })}

          {renderExpandableNavGroup(
            'Security',
            <SecurityIcon fontSize="small" />,
            isSecurityActive,
            isSecurityActive || openGroup === 'security',
            () => setOpenGroup((prev) => (prev === 'security' ? null : 'security')),
            securityChildren,
          )}

          {renderExpandableNavGroup(
            'Settings',
            <SettingsIcon fontSize="small" />,
            isSettingsActive,
            isSettingsActive || openGroup === 'settings',
            () => setOpenGroup((prev) => (prev === 'settings' ? null : 'settings')),
            settingsChildren,
          )}
        </List>
      </Box>

      {/* Sidebar footer removed; profile and sign-out live in top-right navbar */}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden', bgcolor: 'background.default' }}>
      {/* Mobile Drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
      >
        {drawerContent}
      </Drawer>

      {/* Desktop Sidebar (independent scroll) */}
      <Drawer
        variant="permanent"
        open
        sx={{
          display: { xs: 'none', md: 'block' },
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            borderRight: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
          },
        }}
      >
        {drawerContent}
      </Drawer>

      {/* Main Content Area (Header fixed + content scrollable independently) */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100vh' }}>
        <AppBar
          position="static"
          color="inherit"
          elevation={0}
          sx={{ borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}
        >
          <Toolbar
            sx={{
              minHeight: '60px !important',
              px: { xs: 2, md: 3 },
              justifyContent: 'space-between',
              gap: 1.5,
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <IconButton edge="start" onClick={() => setMobileOpen(true)} sx={{ display: { md: 'none' } }}>
                <MenuIcon />
              </IconButton>
              <LastUpdateChip />
            </Stack>

            <Stack direction="row" alignItems="center" spacing={1}>
              {apiMode === 'simulator' && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<SensorsIcon fontSize="small" />}
                  onClick={() => setInformOpen(true)}
                  sx={{ mr: 0.5 }}
                >
                  Simulate ONT Inform
                </Button>
              )}

              <RealtimeEventsControl />

              <Divider orientation="vertical" flexItem sx={{ height: 22, my: 'auto', mx: 0.5 }} />

              <Button
                size="small"
                variant="text"
                color="inherit"
                onClick={(e) => setProfileAnchor(e.currentTarget)}
                endIcon={<ExpandMoreIcon sx={{ fontSize: 16, color: 'text.secondary', ml: -0.25 }} />}
                sx={{
                  borderRadius: 1.5,
                  px: 1,
                  py: 0.5,
                  minHeight: 36,
                  gap: 1,
                  textTransform: 'none',
                  '&:hover': {
                    bgcolor: 'action.hover',
                  },
                }}
              >
                <Avatar
                  sx={{
                    width: 26,
                    height: 26,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                  }}
                >
                  {(currentUser.username?.[0] ?? 'A').toUpperCase()}
                </Avatar>
                <Box sx={{ textAlign: 'left', lineHeight: 1.15 }}>
                  <Typography
                    variant="body2"
                    fontWeight={600}
                    color="text.primary"
                    display="block"
                    noWrap
                    sx={{ fontSize: '0.82rem', lineHeight: 1.2, maxWidth: 150 }}
                  >
                    {currentUser.username}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    fontWeight={500}
                    display="block"
                    sx={{ fontSize: '0.68rem', lineHeight: 1.1 }}
                  >
                    {formatRoleSlug(currentUser.role)}
                  </Typography>
                </Box>
              </Button>
            </Stack>
          </Toolbar>
        </AppBar>

        <Menu
          anchorEl={profileAnchor}
          open={Boolean(profileAnchor)}
          onClose={() => setProfileAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{
            paper: {
              sx: { width: 245, mt: 0.75, borderRadius: 1.5 },
            },
          }}
        >
          <Box sx={{ px: 2, py: 1.25 }}>
            <Typography variant="body2" fontWeight={700} color="text.primary" noWrap>
              {currentUser.username}
            </Typography>
            <Chip
              size="small"
              color="primary"
              variant="outlined"
              label={formatRoleSlug(currentUser.role)}
              sx={{ mt: 0.75, height: 20, fontSize: '0.68rem', fontWeight: 700 }}
            />
          </Box>

          <Divider />

          <MenuItem onClick={() => toggleThemeMode()} sx={{ justifyContent: 'space-between', py: 1 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              {themeMode === 'dark' ? (
                <DarkModeOutlinedIcon fontSize="small" color="primary" />
              ) : (
                <LightModeOutlinedIcon fontSize="small" color="action" />
              )}
              <Typography variant="body2" fontWeight={500}>
                Dark Mode
              </Typography>
            </Stack>
            <Switch size="small" checked={themeMode === 'dark'} />
          </MenuItem>

          {apiMode === 'simulator' && (
            <>
              <Divider />
              <Box sx={{ px: 2, pt: 0.9, pb: 0.35 }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary">
                  Switch Simulator Role
                </Typography>
              </Box>
              {(['Super Admin', 'NOC Engineer', 'Technician', 'Viewer'] as RoleName[]).map((r) => (
                <MenuItem
                  key={r}
                  selected={currentUser.role === r}
                  onClick={() => {
                    setCurrentRole(r);
                    setProfileAnchor(null);
                  }}
                  sx={{ py: 0.65, justifyContent: 'space-between' }}
                >
                  <Typography variant="body2" sx={{ fontSize: '0.82rem' }}>
                    {formatRoleSlug(r)}
                  </Typography>
                  {currentUser.role === r && <CheckIcon sx={{ fontSize: 15, color: 'primary.main' }} />}
                </MenuItem>
              ))}
            </>
          )}

          <Divider />
          <MenuItem
            onClick={() => {
              setProfileAnchor(null);
              setLogoutConfirmOpen(true);
            }}
            sx={{ color: 'error.main', py: 1, gap: 1 }}
          >
            <LogoutIcon fontSize="small" />
            <Typography variant="body2" fontWeight={600}>
              Sign Out
            </Typography>
          </MenuItem>
        </Menu>

        <Box component="main" sx={{ flex: 1, overflowY: 'auto', p: { xs: 2, md: 3 } }}>
          <Outlet />
        </Box>
      </Box>

      <SimulateInformDialog open={informOpen} onClose={() => setInformOpen(false)} />

      <NocDialog
        open={logoutConfirmOpen}
        onClose={() => setLogoutConfirmOpen(false)}
        title="Confirm Sign Out"
        subtitle={`@${currentUser.username} · ${formatRoleSlug(currentUser.role)}`}
        icon={<LogoutIcon sx={{ fontSize: 18 }} />}
        tone="warning"
        confirmLabel="Sign Out"
        onConfirm={() => {
          setLogoutConfirmOpen(false);
          logoutBackend();
          navigate('/login', { replace: true });
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Are you sure you want to sign out of your NexACS session? You will need to sign in again to manage devices.
        </Typography>
      </NocDialog>

      <SummonQueueToast onOpenDetails={() => navigate('/summon-logs')} />
    </Box>
  );
}
