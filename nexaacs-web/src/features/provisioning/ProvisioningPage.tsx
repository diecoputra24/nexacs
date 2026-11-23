import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import WifiIcon from '@mui/icons-material/Wifi';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import { useNavigate } from 'react-router-dom';
import { NocDialog } from '../../components/dialogs/NocDialog';
import { TruncatedText } from '../../components/common/TruncatedText';
import { NocToast } from '../../components/feedback/NocToast';
import { FirmwareSkeleton, pageEnterSx, usePageSkeleton } from '../../components/skeletons/PageSkeletons';
import { useAcsStore } from '../../stores/acsStore';
import type { ProvisioningProfile, ProvisioningStatus } from '../../types';
import { computeDeviceStatus, formatDateTime, formatRelativeTime } from '../../utils/classification';
import { extractZodFieldErrors, formatZodError, provisioningFormSchema } from '../../validation/schemas';

interface ProvisioningFormState {
  serialNumber: string;
  oui: string;
  manufacturer: string;
  wanIndex: string;
  vlanId: string;
  pppoeUsername: string;
  pppoePassword: string;
  wifiIndex: string;
  ssid: string;
  ssidKey: string;
  wifiEnabled: boolean;
  periodicInformInterval: string;
  autoApplyOnBoot: boolean;
}

const EMPTY_FORM: ProvisioningFormState = {
  serialNumber: '',
  oui: '',
  manufacturer: '',
  wanIndex: '1',
  vlanId: '',
  pppoeUsername: '',
  pppoePassword: '',
  wifiIndex: '1',
  ssid: '',
  ssidKey: '',
  wifiEnabled: true,
  periodicInformInterval: '',
  autoApplyOnBoot: true,
};

function profileToForm(p: ProvisioningProfile): ProvisioningFormState {
  return {
    serialNumber: p.serialNumber,
    oui: p.oui ?? '',
    manufacturer: p.manufacturer ?? '',
    wanIndex: String(p.wanIndex || 1),
    vlanId: p.vlanId !== null && p.vlanId !== undefined ? String(p.vlanId) : '',
    pppoeUsername: p.pppoeUsername ?? '',
    pppoePassword: '',
    wifiIndex: String(p.wifiIndex || 1),
    ssid: p.ssid ?? '',
    ssidKey: '',
    wifiEnabled: p.wifiEnabled,
    periodicInformInterval:
      p.periodicInformInterval !== null && p.periodicInformInterval !== undefined
        ? String(p.periodicInformInterval)
        : '',
    autoApplyOnBoot: p.autoApplyOnBoot,
  };
}

function ProvisionStatusBadge({ status, lastError }: { status: ProvisioningStatus; lastError: string }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const palette = isDark
    ? {
        applied: { label: 'Applied', bg: 'rgba(34, 197, 94, 0.14)', color: '#86EFAC', border: 'rgba(34, 197, 94, 0.3)', dot: '#22C55E' },
        queued: { label: 'Queued', bg: 'rgba(14, 165, 233, 0.14)', color: '#7DD3FC', border: 'rgba(14, 165, 233, 0.3)', dot: '#0EA5E9' },
        pending: { label: 'Pending Boot', bg: 'rgba(245, 158, 11, 0.14)', color: '#FDE68A', border: 'rgba(245, 158, 11, 0.3)', dot: '#F59E0B' },
        failed: { label: 'Failed', bg: 'rgba(239, 68, 68, 0.14)', color: '#FCA5A5', border: 'rgba(239, 68, 68, 0.3)', dot: '#EF4444' },
      }
    : {
        applied: { label: 'Applied', bg: '#DCFCE7', color: '#15803D', border: '#BBF7D0', dot: '#22C55E' },
        queued: { label: 'Queued', bg: '#E0F2FE', color: '#0369A1', border: '#BAE6FD', dot: '#0284C7' },
        pending: { label: 'Pending Boot', bg: '#FEF3C7', color: '#B45309', border: '#FDE68A', dot: '#F59E0B' },
        failed: { label: 'Failed', bg: '#FEE2E2', color: '#B91C1C', border: '#FECACA', dot: '#EF4444' },
      };

  const cfg = palette[status] ?? palette.pending;
  const badge = (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1,
        py: 0.35,
        borderRadius: '4px',
        bgcolor: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
        fontSize: '0.74rem',
        fontWeight: 600,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
      }}
    >
      <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: cfg.dot, flexShrink: 0 }} />
      {cfg.label}
    </Box>
  );

  if (lastError) {
    return (
      <Tooltip title={lastError} arrow>
        {badge}
      </Tooltip>
    );
  }
  return badge;
}

export function ProvisioningPage() {
  const navigate = useNavigate();
  const { loading } = usePageSkeleton();
  const apiMode = useAcsStore((s) => s.apiMode);
  const backendRefreshing = useAcsStore((s) => s.backendRefreshing);
  const profiles = useAcsStore((s) => s.provisioningProfiles);
  const devices = useAcsStore((s) => s.devices);
  const settings = useAcsStore((s) => s.settings);
  const hasPermission = useAcsStore((s) => s.hasPermission);
  const refreshBackendData = useAcsStore((s) => s.refreshBackendData);
  const upsertProvisioningProfile = useAcsStore((s) => s.upsertProvisioningProfile);
  const deleteProvisioningProfile = useAcsStore((s) => s.deleteProvisioningProfile);

  const canWrite = hasPermission('devices.parameters.write');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ProvisioningStatus>('all');
  const [refreshing, setRefreshing] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ProvisioningProfile | null>(null);
  const [form, setForm] = useState<ProvisioningFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showPppoePwd, setShowPppoePwd] = useState(false);
  const [showSsidKey, setShowSsidKey] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ProvisioningProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState<{ open: boolean; severity: 'success' | 'error' | 'info'; text: string }>({
    open: false,
    severity: 'info',
    text: '',
  });

  const deviceBySerial = useMemo(() => {
    const map = new Map<string, (typeof devices)[number]>();
    for (const d of devices) {
      if (!d.deletedAt && d.serialNumber) {
        map.set(d.serialNumber.trim().toUpperCase(), d);
      }
    }
    return map;
  }, [devices]);

  const activeDevices = useMemo(
    () =>
      devices
        .filter((d) => !d.deletedAt && d.serialNumber)
        .sort((a, b) => a.serialNumber.localeCompare(b.serialNumber)),
    [devices],
  );

  const stats = useMemo(() => {
    let applied = 0;
    let queuedOrPending = 0;
    let failed = 0;
    for (const p of profiles) {
      if (p.status === 'applied') applied += 1;
      else if (p.status === 'failed') failed += 1;
      else queuedOrPending += 1;
    }
    return { total: profiles.length, applied, queuedOrPending, failed };
  }, [profiles]);

  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return profiles.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.serialNumber.toLowerCase().includes(q) ||
        p.manufacturer.toLowerCase().includes(q) ||
        p.pppoeUsername.toLowerCase().includes(q) ||
        p.ssid.toLowerCase().includes(q) ||
        (p.vlanId !== null && p.vlanId !== undefined && String(p.vlanId).includes(q))
      );
    });
  }, [profiles, search, statusFilter]);

  const handleOpenCreate = () => {
    setEditingProfile(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setFieldErrors({});
    setShowPppoePwd(false);
    setShowSsidKey(false);
    setModalOpen(true);
  };

  const handleOpenEdit = (profile: ProvisioningProfile) => {
    setEditingProfile(profile);
    setForm(profileToForm(profile));
    setFormError('');
    setFieldErrors({});
    setShowPppoePwd(false);
    setShowSsidKey(false);
    setModalOpen(true);
  };

  const handlePickExistingDevice = (serial: string) => {
    const dev = deviceBySerial.get(serial.toUpperCase());
    setForm((prev) => ({
      ...prev,
      serialNumber: serial,
      oui: dev?.oui ?? prev.oui,
      manufacturer: dev?.manufacturerCanonical ?? prev.manufacturer,
    }));
  };

  const handleSaveProfile = async () => {
    setFormError('');
    setFieldErrors({});
    const parsed = provisioningFormSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(extractZodFieldErrors(parsed.error));
      setFormError(formatZodError(parsed.error));
      return;
    }

    setSaving(true);
    const data = parsed.data;
    const res = await upsertProvisioningProfile({
      serialNumber: data.serialNumber,
      oui: data.oui,
      manufacturer: data.manufacturer,
      wanIndex: data.wanIndex,
      vlanId: data.vlanId,
      pppoeUsername: data.pppoeUsername,
      pppoePassword: data.pppoePassword,
      wifiIndex: data.wifiIndex,
      ssid: data.ssid,
      ssidKey: data.ssidKey,
      wifiEnabled: data.wifiEnabled,
      periodicInformInterval: data.periodicInformInterval,
      autoApplyOnBoot: data.autoApplyOnBoot,
    });
    setSaving(false);

    if (!res.ok) {
      setFormError(res.error ?? 'Gagal menyimpan profile auto provisioning.');
      return;
    }

    setModalOpen(false);
    setToast({
      open: true,
      severity: 'success',
      text:
        res.executionMode === 'queued_immediately'
          ? `Profile ${data.serialNumber} disimpan & task provisioning langsung di-queue ke ONT.`
          : `Profile ${data.serialNumber} disimpan — siap otomatis di-push saat ONT melakukan Boot/Bootstrap Inform.`,
    });
  };

  const handleRequeueProfile = async (profile: ProvisioningProfile) => {
    const res = await upsertProvisioningProfile({
      serialNumber: profile.serialNumber,
      oui: profile.oui,
      manufacturer: profile.manufacturer,
      wanIndex: profile.wanIndex,
      vlanId: profile.vlanId,
      pppoeUsername: profile.pppoeUsername,
      wifiIndex: profile.wifiIndex,
      ssid: profile.ssid,
      wifiEnabled: profile.wifiEnabled,
      periodicInformInterval: profile.periodicInformInterval,
      autoApplyOnBoot: profile.autoApplyOnBoot,
    });
    if (!res.ok) {
      setToast({ open: true, severity: 'error', text: res.error ?? 'Gagal push ulang provisioning.' });
      return;
    }
    setToast({
      open: true,
      severity: 'success',
      text:
        res.executionMode === 'queued_immediately'
          ? `Task provisioning untuk ${profile.serialNumber} berhasil di-queue.`
          : `${profile.serialNumber} belum pernah Inform — profile diset pending untuk boot berikutnya.`,
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await deleteProvisioningProfile(deleteTarget.serialNumber);
    setDeleting(false);
    if (!res.ok) {
      setToast({ open: true, severity: 'error', text: res.error ?? 'Gagal menghapus profile.' });
      return;
    }
    const deletedSerial = deleteTarget.serialNumber;
    setDeleteTarget(null);
    setToast({ open: true, severity: 'info', text: `Auto provisioning profile ${deletedSerial} dihapus.` });
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshBackendData();
    setRefreshing(false);
  };

  if (loading || refreshing || (apiMode === 'backend' && backendRefreshing)) return <FirmwareSkeleton />;

  return (
    <Box sx={pageEnterSx}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', md: 'center' }}
        spacing={1.5}
        sx={{ pb: 2, mb: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Typography variant="h5" fontWeight={700}>
          Auto Provisioning
        </Typography>

        <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
          <TextField
            size="small"
            placeholder="Search serial, PPPoE, SSID, VLAN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ width: { xs: '100%', sm: 250 } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
            }}
          />

          <TextField
            select
            size="small"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | ProvisioningStatus)}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="all">All Status</MenuItem>
            <MenuItem value="pending">Pending Boot</MenuItem>
            <MenuItem value="queued">Queued</MenuItem>
            <MenuItem value="applied">Applied</MenuItem>
            <MenuItem value="failed">Failed</MenuItem>
          </TextField>

          <Tooltip title="Refresh profiles">
            <IconButton
              size="small"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: '6px',
                width: 34,
                height: 34,
              }}
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          {canWrite && (
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={handleOpenCreate}
              sx={{ height: 34 }}
            >
              Add Profile
            </Button>
          )}
        </Stack>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        {[
          { label: 'Total Profiles', value: stats.total, color: 'text.primary' },
          { label: 'Applied', value: stats.applied, color: '#22C55E' },
          { label: 'Pending / Queued', value: stats.queuedOrPending, color: '#0EA5E9' },
          { label: 'Failed', value: stats.failed, color: '#EF4444' },
        ].map((item) => (
          <Grid item xs={6} sm={3} key={item.label}>
            <Card sx={{ borderRadius: '6px', borderColor: 'divider', bgcolor: 'background.paper' }}>
              <CardContent sx={{ px: 2, py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  {item.label}
                </Typography>
                <Typography variant="h5" fontWeight={700} sx={{ color: item.color, mt: 0.25 }}>
                  {item.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card sx={{ borderRadius: '6px', borderColor: 'divider', bgcolor: 'background.paper' }}>
        <TableContainer>
          <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: '18%' }}>Serial / Device</TableCell>
                <TableCell sx={{ width: '13%' }}>WAN / VLAN</TableCell>
                <TableCell sx={{ width: '16%' }}>PPPoE</TableCell>
                <TableCell sx={{ width: '16%' }}>WiFi / SSID</TableCell>
                <TableCell sx={{ width: '11%' }}>Boot Policy</TableCell>
                <TableCell sx={{ width: '10%' }}>Status</TableCell>
                <TableCell sx={{ width: '8%' }}>Last Applied</TableCell>
                <TableCell align="right" sx={{ width: '8%' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredProfiles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
                    <Stack alignItems="center" spacing={1}>
                      <AutoFixHighOutlinedIcon sx={{ fontSize: 30, color: 'text.secondary', opacity: 0.65 }} />
                      <Typography variant="body2" fontWeight={600}>
                        {profiles.length === 0
                          ? 'No Auto Provisioning profiles configured yet'
                          : 'No provisioning profiles match your search filter'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Pre-configure VLAN, PPPoE, and WiFi by serial number so new or reset ONTs are provisioned automatically on Inform.
                      </Typography>
                      {canWrite && profiles.length === 0 && (
                        <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={handleOpenCreate} sx={{ mt: 0.5 }}>
                          Create First Profile
                        </Button>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ) : (
                filteredProfiles.map((p) => {
                  const matchedDev = deviceBySerial.get(p.serialNumber.toUpperCase());
                  const liveStatus = matchedDev
                    ? computeDeviceStatus(
                        matchedDev,
                        settings.deviceStatus.onlineThresholdSeconds,
                        Date.now(),
                        settings.deviceStatus.neverConnectedPolicy,
                      )
                    : null;
                  return (
                    <TableRow key={p.id} hover>
                      <TableCell>
                        <Stack spacing={0.25}>
                          <Stack direction="row" spacing={0.75} alignItems="center">
                            {matchedDev ? (
                              <Typography
                                variant="body2"
                                fontFamily="monospace"
                                fontWeight={700}
                                sx={{
                                  color: 'primary.main',
                                  cursor: 'pointer',
                                  '&:hover': { textDecoration: 'underline' },
                                }}
                                onClick={() => navigate(`/devices/${matchedDev.id}`)}
                              >
                                {p.serialNumber}
                              </Typography>
                            ) : (
                              <Typography variant="body2" fontFamily="monospace" fontWeight={700}>
                                {p.serialNumber}
                              </Typography>
                            )}
                            {liveStatus && (
                              <Chip
                                size="small"
                                label={liveStatus === 'online' ? 'Online' : liveStatus === 'offline' ? 'Offline' : liveStatus}
                                color={liveStatus === 'online' ? 'success' : 'default'}
                                variant="outlined"
                                sx={{ height: 18, fontSize: '0.68rem' }}
                              />
                            )}
                          </Stack>
                          <Typography variant="caption" color="text.secondary">
                            {p.manufacturer || matchedDev?.manufacturerCanonical || 'Auto-detect on Inform'}
                            {p.oui ? ` (${p.oui})` : ''}
                          </Typography>
                        </Stack>
                      </TableCell>

                      <TableCell>
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          <Chip size="small" label={`WAN #${p.wanIndex}`} variant="outlined" sx={{ height: 22 }} />
                          <Typography variant="body2" fontFamily="monospace">
                            {p.vlanId !== null && p.vlanId !== undefined ? `VLAN ${p.vlanId}` : '—'}
                          </Typography>
                        </Stack>
                      </TableCell>

                      <TableCell>
                        {p.pppoeUsername || p.hasPppoePassword ? (
                          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
                            <TruncatedText text={p.pppoeUsername || '—'} sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }} />
                            {p.hasPppoePassword && (
                              <Tooltip title="PPPoE password stored encrypted">
                                <LockOutlinedIcon sx={{ fontSize: 14, color: 'text.secondary', flexShrink: 0 }} />
                              </Tooltip>
                            )}
                          </Stack>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            Not configured
                          </Typography>
                        )}
                      </TableCell>

                      <TableCell>
                        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
                          {p.wifiEnabled ? (
                            <WifiIcon sx={{ fontSize: 15, color: 'success.main', flexShrink: 0 }} />
                          ) : (
                            <WifiOffIcon sx={{ fontSize: 15, color: 'text.disabled', flexShrink: 0 }} />
                          )}
                          <TruncatedText text={p.ssid || (p.wifiEnabled ? `WLAN #${p.wifiIndex}` : 'Disabled')} />
                          {p.hasSsidKey && (
                            <Tooltip title="WiFi passphrase stored encrypted">
                              <LockOutlinedIcon sx={{ fontSize: 14, color: 'text.secondary', flexShrink: 0 }} />
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>

                      <TableCell>
                        <Stack spacing={0.25}>
                          <Typography variant="caption" fontWeight={600}>
                            {p.autoApplyOnBoot ? 'Auto on Boot' : 'Manual Only'}
                          </Typography>
                          {p.periodicInformInterval ? (
                            <Typography variant="caption" color="text.secondary">
                              Inform {p.periodicInformInterval}s
                            </Typography>
                          ) : null}
                        </Stack>
                      </TableCell>

                      <TableCell>
                        <ProvisionStatusBadge status={p.status} lastError={p.lastError} />
                      </TableCell>

                      <TableCell>
                        {p.lastAppliedAt ? (
                          <Tooltip title={formatDateTime(p.lastAppliedAt)}>
                            <Typography variant="caption" color="text.secondary">
                              {formatRelativeTime(p.lastAppliedAt)}
                            </Typography>
                          </Tooltip>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            —
                          </Typography>
                        )}
                      </TableCell>

                      <TableCell align="right">
                        {canWrite && (
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <Tooltip title="Push / Re-queue Provisioning">
                              <IconButton size="small" color="primary" onClick={() => void handleRequeueProfile(p)}>
                                <RocketLaunchOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Edit Profile">
                              <IconButton size="small" onClick={() => handleOpenEdit(p)}>
                                <EditOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete Profile">
                              <IconButton size="small" color="error" onClick={() => setDeleteTarget(p)}>
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <NocDialog
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editingProfile ? `Edit Profile — ${editingProfile.serialNumber}` : 'Add Auto Provisioning Profile'}
        subtitle="Konfigurasi WAN/VLAN, PPPoE, dan WiFi otomatis saat ONT terhubung (0 BOOTSTRAP / 1 BOOT)."
        icon={<AutoFixHighOutlinedIcon />}
        tone="primary"
        maxWidth="sm"
        confirmLabel={saving ? 'Saving...' : editingProfile ? 'Save & Queue' : 'Save Profile'}
        confirmDisabled={saving}
        onConfirm={() => void handleSaveProfile()}
      >
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          {formError && <Alert severity="error">{formError}</Alert>}

          {!editingProfile && activeDevices.length > 0 && (
            <TextField
              select
              size="small"
              label="Quick Select Registered Device (Optional)"
              value=""
              onChange={(e) => handlePickExistingDevice(e.target.value)}
            >
              {activeDevices.map((d) => (
                <MenuItem key={d.id} value={d.serialNumber}>
                  {d.serialNumber} — {d.manufacturerCanonical || 'Unknown'} {d.modelName}
                </MenuItem>
              ))}
            </TextField>
          )}

          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                required
                size="small"
                label="Serial Number"
                value={form.serialNumber}
                disabled={Boolean(editingProfile)}
                error={Boolean(fieldErrors.serialNumber)}
                helperText={fieldErrors.serialNumber}
                onChange={(e) => setForm((prev) => ({ ...prev, serialNumber: e.target.value.toUpperCase() }))}
                placeholder="e.g. ZTEGC1234567"
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField
                fullWidth
                size="small"
                label="Manufacturer"
                value={form.manufacturer}
                error={Boolean(fieldErrors.manufacturer)}
                helperText={fieldErrors.manufacturer}
                onChange={(e) => setForm((prev) => ({ ...prev, manufacturer: e.target.value }))}
                placeholder="ZTE / Huawei"
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField
                fullWidth
                size="small"
                label="OUI"
                value={form.oui}
                error={Boolean(fieldErrors.oui)}
                helperText={fieldErrors.oui}
                onChange={(e) => setForm((prev) => ({ ...prev, oui: e.target.value.toUpperCase() }))}
                placeholder="001122"
              />
            </Grid>

            <Grid item xs={6} sm={4}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label="WAN Index"
                value={form.wanIndex}
                error={Boolean(fieldErrors.wanIndex)}
                helperText={fieldErrors.wanIndex}
                onChange={(e) => setForm((prev) => ({ ...prev, wanIndex: e.target.value }))}
                inputProps={{ min: 1 }}
              />
            </Grid>
            <Grid item xs={6} sm={4}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label="VLAN ID (1–4094)"
                value={form.vlanId}
                error={Boolean(fieldErrors.vlanId)}
                helperText={fieldErrors.vlanId}
                onChange={(e) => setForm((prev) => ({ ...prev, vlanId: e.target.value }))}
                placeholder="e.g. 100"
                inputProps={{ min: 1, max: 4094 }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label="Periodic Inform (s)"
                value={form.periodicInformInterval}
                error={Boolean(fieldErrors.periodicInformInterval)}
                helperText={fieldErrors.periodicInformInterval}
                onChange={(e) => setForm((prev) => ({ ...prev, periodicInformInterval: e.target.value }))}
                placeholder="e.g. 300"
                inputProps={{ min: 10 }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="PPPoE Username"
                value={form.pppoeUsername}
                error={Boolean(fieldErrors.pppoeUsername)}
                helperText={fieldErrors.pppoeUsername}
                onChange={(e) => setForm((prev) => ({ ...prev, pppoeUsername: e.target.value }))}
                placeholder="pelanggan01@isp.net"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label={editingProfile?.hasPppoePassword ? 'PPPoE Password (kept if blank)' : 'PPPoE Password'}
                type={showPppoePwd ? 'text' : 'password'}
                value={form.pppoePassword}
                error={Boolean(fieldErrors.pppoePassword)}
                helperText={fieldErrors.pppoePassword}
                onChange={(e) => setForm((prev) => ({ ...prev, pppoePassword: e.target.value }))}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" edge="end" onClick={() => setShowPppoePwd((v) => !v)}>
                        {showPppoePwd ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>

            <Grid item xs={6} sm={3}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label="WiFi Index"
                value={form.wifiIndex}
                error={Boolean(fieldErrors.wifiIndex)}
                helperText={fieldErrors.wifiIndex}
                onChange={(e) => setForm((prev) => ({ ...prev, wifiIndex: e.target.value }))}
                inputProps={{ min: 1 }}
              />
            </Grid>
            <Grid item xs={6} sm={4}>
              <TextField
                fullWidth
                size="small"
                label="WiFi SSID"
                value={form.ssid}
                error={Boolean(fieldErrors.ssid)}
                helperText={fieldErrors.ssid}
                onChange={(e) => setForm((prev) => ({ ...prev, ssid: e.target.value }))}
                placeholder="NexaNet-Home"
                inputProps={{ maxLength: 32 }}
              />
            </Grid>
            <Grid item xs={12} sm={5}>
              <TextField
                fullWidth
                size="small"
                label={editingProfile?.hasSsidKey ? 'WiFi Key (kept if blank)' : 'WiFi Passphrase (8–63)'}
                type={showSsidKey ? 'text' : 'password'}
                value={form.ssidKey}
                error={Boolean(fieldErrors.ssidKey)}
                helperText={fieldErrors.ssidKey}
                onChange={(e) => setForm((prev) => ({ ...prev, ssidKey: e.target.value }))}
                inputProps={{ maxLength: 63 }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" edge="end" onClick={() => setShowSsidKey((v) => !v)}>
                        {showSsidKey ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
          </Grid>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={form.wifiEnabled}
                  onChange={(e) => setForm((prev) => ({ ...prev, wifiEnabled: e.target.checked }))}
                />
              }
              label={<Typography variant="body2">WiFi Enabled</Typography>}
            />
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={form.autoApplyOnBoot}
                  onChange={(e) => setForm((prev) => ({ ...prev, autoApplyOnBoot: e.target.checked }))}
                />
              }
              label={<Typography variant="body2">Auto Apply on Boot / Bootstrap</Typography>}
            />
          </Stack>
        </Stack>
      </NocDialog>

      <NocDialog
        open={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="Delete Auto Provisioning Profile?"
        subtitle={`Serial Number: ${deleteTarget?.serialNumber ?? ''}`}
        icon={<DeleteOutlineIcon />}
        tone="danger"
        maxWidth="xs"
        confirmLabel={deleting ? 'Deleting...' : 'Delete Profile'}
        confirmDisabled={deleting}
        onConfirm={() => void handleConfirmDelete()}
      >
        <Typography variant="body2" color="text.secondary">
          Profile ini akan dihapus permanen. ONT tidak akan lagi di-provision otomatis pada boot berikutnya kecuali Anda membuat profile baru.
        </Typography>
      </NocDialog>

      <NocToast
        open={toast.open}
        severity={toast.severity}
        text={toast.text}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
      />
    </Box>
  );
}
