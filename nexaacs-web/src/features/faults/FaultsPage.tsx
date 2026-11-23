import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  Stack,
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
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReplayIcon from '@mui/icons-material/Replay';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { useNavigate } from 'react-router-dom';
import { useAcsStore } from '../../stores/acsStore';
import { FaultStatusChip } from '../../components/status/StatusChip';
import { TruncatedText } from '../../components/common/TruncatedText';
import { NocToast } from '../../components/feedback/NocToast';
import { FaultsSkeleton, pageEnterSx, usePageSkeleton } from '../../components/skeletons/PageSkeletons';
import { formatDateTime } from '../../utils/classification';
import type { FaultRecord } from '../../types';
import { faultResolutionSchema, formatZodError } from '../../validation/schemas';

type FaultTab = 'active' | 'resolved' | 'all';

const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

export function FaultsPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const navigate = useNavigate();
  const faults = useAcsStore((s) => s.faults);
  const acknowledgeFault = useAcsStore((s) => s.acknowledgeFault);
  const resolveFault = useAcsStore((s) => s.resolveFault);
  const retryFault = useAcsStore((s) => s.retryFault);
  const deleteFault = useAcsStore((s) => s.deleteFault);
  const refreshBackendData = useAcsStore((s) => s.refreshBackendData);
  const hasPermission = useAcsStore((s) => s.hasPermission);

  const [tab, setTab] = useState<FaultTab>('active');
  const [search, setSearch] = useState('');
  const [selectedFault, setSelectedFault] = useState<FaultRecord | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [resolutionError, setResolutionError] = useState('');
  const [toast, setToast] = useState<{ open: boolean; severity: 'success' | 'error' | 'info'; text: string }>({
    open: false,
    severity: 'info',
    text: '',
  });
  const { loading, trigger: triggerPageSkeleton } = usePageSkeleton();
  const apiMode = useAcsStore((s) => s.apiMode);
  const backendRefreshing = useAcsStore((s) => s.backendRefreshing);

  const isFaultActive = (status: FaultRecord['status']) => status === 'open' || status === 'acknowledged';

  const counts = useMemo(() => {
    const active = faults.filter((f) => isFaultActive(f.status)).length;
    const resolved = faults.length - active;
    return { active, resolved, total: faults.length };
  }, [faults]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return faults.filter((f) => {
      if (tab === 'active' && !isFaultActive(f.status)) return false;
      if (tab === 'resolved' && isFaultActive(f.status)) return false;
      if (q) {
        return (
          f.id.toLowerCase().includes(q) ||
          f.deviceSerial.toLowerCase().includes(q) ||
          f.errorCode.toLowerCase().includes(q) ||
          f.errorMessage.toLowerCase().includes(q) ||
          f.failedParameters.some((p) => p.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [faults, tab, search]);

  const activeFault = selectedFault ? faults.find((f) => f.id === selectedFault.id) ?? null : null;
  const [retainedFault, setRetainedFault] = useState<FaultRecord | null>(null);

  useEffect(() => {
    if (activeFault) setRetainedFault(activeFault);
  }, [activeFault]);

  const displayFault = activeFault ?? retainedFault;

  const handleRetry = (faultId: string) => {
    const res = retryFault(faultId);
    setToast(
      res.ok
        ? { open: true, severity: 'success', text: `Safe retry executed for ${faultId}; fault resolved.` }
        : { open: true, severity: 'error', text: res.error ?? 'Retry blocked' },
    );
  };

  const handleQuickResolve = (faultId: string) => {
    if (!hasPermission('faults.manage')) {
      setToast({ open: true, severity: 'error', text: 'Permission denied: faults.manage required.' });
      return;
    }
    resolveFault(faultId, 'Resolved by operator from Fault center');
    setToast({ open: true, severity: 'success', text: `Fault ${faultId} marked resolved.` });
  };

  const handleDeleteFault = (faultId: string) => {
    if (!hasPermission('faults.manage')) {
      setToast({ open: true, severity: 'error', text: 'Permission denied: faults.manage required.' });
      return;
    }
    deleteFault(faultId);
    if (selectedFault?.id === faultId) setSelectedFault(null);
    setToast({ open: true, severity: 'info', text: `Fault ${faultId} removed.` });
  };

  const handleRefresh = () => {
    triggerPageSkeleton();
    refreshBackendData();
    setToast({ open: true, severity: 'success', text: 'Fault records refreshed.' });
  };

  if (loading || (apiMode === 'backend' && backendRefreshing)) {
    return <FaultsSkeleton />;
  }

  return (
    <Box sx={pageEnterSx}>
      {/* Top Header Bar */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={1.5}
        sx={{ pb: 2, mb: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: 'text.primary', lineHeight: 1.3 }}>
          Fault center
        </Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<RefreshIcon sx={{ fontSize: '15px !important', color: 'text.secondary' }} />}
          onClick={handleRefresh}
          sx={{
            height: 34,
            px: 1.5,
            fontSize: '0.8rem',
            fontWeight: 600,
            color: 'var(--noc-text-muted)',
            borderColor: 'var(--noc-border-strong)',
            bgcolor: 'background.paper',
            borderRadius: '6px',
            '&:hover': { borderColor: 'text.secondary', bgcolor: 'var(--noc-subtle)' },
          }}
        >
          Refresh
        </Button>
      </Stack>

      {/* 3-Column Segmented Summary Strip */}
      <Card
        sx={{
          mb: 2.5,
          borderRadius: '6px',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
          }}
        >
          <Box
            sx={{
              p: 2.25,
              borderRight: { md: '1px solid var(--noc-border)' },
              borderBottom: { xs: '1px solid var(--noc-border)', md: 'none' },
            }}
          >
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 500, color: 'text.secondary' }}>
              Active faults
            </Typography>
            <Typography sx={{ fontSize: '1.65rem', fontWeight: 700, color: isDark ? '#F87171' : '#DC2626', lineHeight: 1.25, my: 0.5 }}>
              {counts.active}
            </Typography>
            <Typography sx={{ fontSize: '0.74rem', color: 'text.secondary' }}>
              Awaiting operator action
            </Typography>
          </Box>

          <Box
            sx={{
              p: 2.25,
              borderRight: { md: '1px solid var(--noc-border)' },
              borderBottom: { xs: '1px solid var(--noc-border)', md: 'none' },
            }}
          >
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 500, color: 'text.secondary' }}>
              Resolved
            </Typography>
            <Typography sx={{ fontSize: '1.65rem', fontWeight: 700, color: isDark ? '#4ADE80' : '#15803D', lineHeight: 1.25, my: 0.5 }}>
              {counts.resolved}
            </Typography>
            <Typography sx={{ fontSize: '0.74rem', color: 'text.secondary' }}>
              Closed fault records
            </Typography>
          </Box>

          <Box sx={{ p: 2.25 }}>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 500, color: 'text.secondary' }}>
              Total recorded
            </Typography>
            <Typography sx={{ fontSize: '1.65rem', fontWeight: 700, color: 'text.primary', lineHeight: 1.25, my: 0.5 }}>
              {counts.total}
            </Typography>
            <Typography sx={{ fontSize: '0.74rem', color: 'text.secondary' }}>
              All CWMP / USP fault events
            </Typography>
          </Box>
        </Box>
      </Card>

      {/* Pill Filters & Search */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'center' }}
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          {(isDark
            ? ([
              { key: 'active', label: 'Active', activeBg: 'rgba(239, 68, 68, 0.16)', activeColor: '#FCA5A5', activeBorder: 'rgba(239, 68, 68, 0.35)' },
              { key: 'resolved', label: 'Resolved', activeBg: 'rgba(34, 197, 94, 0.16)', activeColor: '#86EFAC', activeBorder: 'rgba(34, 197, 94, 0.35)' },
              { key: 'all', label: 'All', activeBg: 'rgba(56, 189, 248, 0.16)', activeColor: '#7DD3FC', activeBorder: 'rgba(56, 189, 248, 0.35)' },
            ] as const)
            : ([
              { key: 'active', label: 'Active', activeBg: '#FEE2E2', activeColor: '#DC2626', activeBorder: '#FECACA' },
              { key: 'resolved', label: 'Resolved', activeBg: '#DCFCE7', activeColor: '#15803D', activeBorder: '#BBF7D0' },
              { key: 'all', label: 'All', activeBg: '#E0F2FE', activeColor: '#0284C7', activeBorder: '#BAE6FD' },
            ] as const)
          ).map((item) => {
            const selected = tab === item.key;
            return (
              <Button
                key={item.key}
                size="small"
                onClick={() => setTab(item.key)}
                sx={{
                  height: 32,
                  px: 1.75,
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  borderRadius: '6px',
                  bgcolor: selected ? item.activeBg : 'var(--noc-hover)',
                  color: selected ? item.activeColor : 'text.secondary',
                  border: '1px solid',
                  borderColor: selected ? item.activeBorder : 'divider',
                  '&:hover': {
                    bgcolor: selected ? item.activeBg : 'action.selected',
                  },
                }}
              >
                {item.label}
              </Button>
            );
          })}
        </Stack>

        <TextField
          size="small"
          placeholder="Search faults..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{
            width: { xs: '100%', sm: 230 },
            '& .MuiOutlinedInput-root': {
              height: 34,
              fontSize: '0.8rem',
              bgcolor: 'background.paper',
              borderRadius: '6px',
            },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              </InputAdornment>
            ),
          }}
        />
      </Stack>

      {/* Fault Records Table */}
      <Card sx={{ borderRadius: '6px', borderColor: 'divider', bgcolor: 'background.paper', overflow: 'hidden' }}>
        <TableContainer>
          <Table
            size="small"
            sx={{
              tableLayout: 'fixed',
              width: '100%',
              '& .MuiTableCell-head': {
                bgcolor: 'var(--noc-subtle)',
                color: 'text.secondary',
                fontSize: '0.72rem',
                fontWeight: 600,
                py: 0.9,
                px: 1.25,
                borderBottom: '1px solid var(--noc-border)',
                whiteSpace: 'nowrap',
              },
              '& .MuiTableCell-body': {
                py: 0.9,
                px: 1.25,
                fontSize: '0.78rem',
                color: 'var(--noc-text-muted)',
                borderBottom: '1px solid var(--noc-border)',
              },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: '15%' }}>Device</TableCell>
                <TableCell sx={{ width: '8%' }}>Code</TableCell>
                <TableCell sx={{ width: '28%' }}>Message</TableCell>
                <TableCell sx={{ width: '21%' }}>Parameter</TableCell>
                <TableCell sx={{ width: '13%' }}>Time</TableCell>
                <TableCell sx={{ width: '8%' }}>Status</TableCell>
                <TableCell align="right" sx={{ width: 92 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                    <Typography variant="body2" color="text.secondary">
                      No fault records matching the current filter.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((f) => {
                  const isActive = isFaultActive(f.status);
                  const paramLabel = f.failedParameters[0] ?? '-';
                  return (
                    <TableRow
                      key={f.id}
                      hover
                      sx={{
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'var(--noc-subtle)' },
                        '&:last-child td': { borderBottom: 0 },
                      }}
                      onClick={() => setSelectedFault(f)}
                    >
                      <TableCell
                        sx={{
                          fontFamily: MONO_FONT,
                          fontWeight: 500,
                          color: 'var(--noc-accent) !important',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/devices/${f.deviceId}`);
                        }}
                      >
                        <TruncatedText text={f.deviceSerial} />
                      </TableCell>
                      <TableCell
                        sx={{
                          fontFamily: MONO_FONT,
                          fontSize: '0.76rem !important',
                          fontWeight: 700,
                          color: isDark ? '#FBBF24 !important' : '#D97706 !important',
                        }}
                      >
                        <TruncatedText text={f.errorCode} />
                      </TableCell>
                      <TableCell>
                        <TruncatedText text={f.errorMessage} />
                      </TableCell>
                      <TableCell
                        sx={{
                          fontFamily: MONO_FONT,
                          fontSize: '0.76rem !important',
                          color: 'var(--noc-text-secondary) !important',
                        }}
                      >
                        <TruncatedText text={paramLabel} />
                      </TableCell>
                      <TableCell sx={{ fontFamily: MONO_FONT, fontSize: '0.76rem !important', color: 'var(--noc-text-secondary) !important' }}>
                        <TruncatedText text={formatDateTime(f.createdAt)} />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Box
                          component="span"
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            px: 1,
                            py: 0.3,
                            borderRadius: '4px',
                            fontSize: '0.73rem',
                            fontWeight: 600,
                            bgcolor: isDark
                              ? isActive
                                ? 'rgba(239, 68, 68, 0.16)'
                                : 'rgba(34, 197, 94, 0.16)'
                              : isActive
                                ? '#FEE2E2'
                                : '#DCFCE7',
                            color: isDark
                              ? isActive
                                ? '#FCA5A5'
                                : '#86EFAC'
                              : isActive
                                ? '#DC2626'
                                : '#15803D',
                            border: '1px solid',
                            borderColor: isDark
                              ? isActive
                                ? 'rgba(239, 68, 68, 0.35)'
                                : 'rgba(34, 197, 94, 0.35)'
                              : isActive
                                ? '#FECACA'
                                : '#BBF7D0',
                          }}
                        >
                          {isActive ? 'Active' : 'Resolved'}
                        </Box>
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                        <Stack direction="row" spacing={0.25} justifyContent="flex-end">
                          <Tooltip title={isActive ? 'Mark Resolved' : 'Already Resolved'}>
                            <span>
                              <IconButton
                                size="small"
                                disabled={!isActive || !hasPermission('faults.manage')}
                                onClick={() => handleQuickResolve(f.id)}
                                sx={{
                                  color: isActive ? 'text.secondary' : 'text.disabled',
                                  '&:hover': {
                                    color: isDark ? '#4ADE80' : '#15803D',
                                    bgcolor: isDark ? 'rgba(34, 197, 94, 0.14)' : '#F0FDF4',
                                  },
                                }}
                              >
                                <CheckCircleOutlineIcon sx={{ fontSize: 17 }} />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Delete Fault Record">
                            <span>
                              <IconButton
                                size="small"
                                disabled={!hasPermission('faults.manage')}
                                onClick={() => handleDeleteFault(f.id)}
                                sx={{
                                  color: 'text.secondary',
                                  '&:hover': {
                                    color: isDark ? '#F87171' : '#DC2626',
                                    bgcolor: isDark ? 'rgba(239, 68, 68, 0.14)' : '#FEF2F2',
                                  },
                                }}
                              >
                                <DeleteOutlineIcon sx={{ fontSize: 17 }} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Fault Detail Drawer */}
      <Drawer anchor="right" open={Boolean(activeFault)} onClose={() => setSelectedFault(null)}>
        {displayFault && (
          <Box sx={{ width: { xs: 340, sm: 460 }, p: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
              <Typography variant="h6" fontFamily={MONO_FONT}>
                {displayFault.id}
              </Typography>
              <FaultStatusChip status={displayFault.status} />
            </Stack>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {displayFault.manufacturerModel} · Serial:{' '}
              <Button size="small" sx={{ p: 0, minWidth: 0 }} onClick={() => navigate(`/devices/${displayFault.deviceId}`)}>
                {displayFault.deviceSerial}
              </Button>
            </Typography>

            <Stack spacing={1.25} sx={{ mb: 2 }}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">Operation / Category</Typography>
                <Typography variant="caption" fontWeight={600}>{displayFault.operation} ({displayFault.category})</Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">Correlation ID</Typography>
                <Typography variant="caption" fontFamily={MONO_FONT}>{displayFault.correlationId}</Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">Task / Summon Job ID</Typography>
                <Typography variant="caption" fontFamily={MONO_FONT}>{displayFault.taskId ?? 'N/A'} / {displayFault.summonJobId ?? '-'}</Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">Created / Last Attempt</Typography>
                <Typography variant="caption">{formatDateTime(displayFault.createdAt)}</Typography>
              </Stack>
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
              Error Summary ({displayFault.errorCode})
            </Typography>
            <Alert severity={displayFault.status === 'resolved' ? 'success' : 'error'} sx={{ mb: 2 }}>
              {displayFault.errorMessage}
            </Alert>

            {displayFault.failedParameters.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
                  Failed Parameters
                </Typography>
                <Stack spacing={0.5}>
                  {displayFault.failedParameters.map((p) => (
                    <Chip key={p} size="small" label={p} sx={{ justifyContent: 'flex-start', fontFamily: MONO_FONT }} />
                  ))}
                </Stack>
              </Box>
            )}

            <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
              Sanitized Technical Logs
            </Typography>
            <Box sx={{ p: 1.5, bgcolor: '#0F172A', color: '#E2E8F0', borderRadius: 1, fontFamily: MONO_FONT, fontSize: '0.75rem', mb: 2, overflowX: 'auto' }}>
              {displayFault.sanitizedLogs}
            </Box>

            {displayFault.status !== 'resolved' && (
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="contained"
                    startIcon={<ReplayIcon />}
                    disabled={!hasPermission('faults.manage') || displayFault.category === 'factory_reset_failed'}
                    onClick={() => handleRetry(displayFault.id)}
                  >
                    Safe Retry
                  </Button>
                  {displayFault.status === 'open' && (
                    <Button
                      variant="outlined"
                      startIcon={<VisibilityIcon />}
                      disabled={!hasPermission('faults.manage')}
                      onClick={() => acknowledgeFault(displayFault.id)}
                    >
                      Acknowledge
                    </Button>
                  )}
                </Stack>

                <TextField
                  size="small"
                  fullWidth
                  label="Resolution Note"
                  value={resolutionNote}
                  error={Boolean(resolutionError)}
                  helperText={resolutionError}
                  onChange={(e) => {
                    setResolutionNote(e.target.value);
                    if (resolutionError) setResolutionError('');
                  }}
                />
                <Button
                  variant="outlined"
                  color="success"
                  startIcon={<CheckCircleOutlineIcon />}
                  disabled={!hasPermission('faults.manage')}
                  onClick={() => {
                    const parsed = faultResolutionSchema.safeParse({ note: resolutionNote });
                    if (!parsed.success) {
                      const msg = formatZodError(parsed.error);
                      setResolutionError(msg);
                      setToast({ open: true, severity: 'error', text: msg });
                      return;
                    }
                    setResolutionError('');
                    resolveFault(displayFault.id, parsed.data.note);
                    setResolutionNote('');
                    setToast({ open: true, severity: 'success', text: `Fault ${displayFault.id} marked resolved.` });
                  }}
                >
                  Mark Resolved
                </Button>
              </Stack>
            )}

            {displayFault.status === 'resolved' && displayFault.resolutionNote && (
              <Alert severity="success">
                Resolved: {displayFault.resolutionNote} ({formatDateTime(displayFault.resolvedAt)})
              </Alert>
            )}
          </Box>
        )}
      </Drawer>

      <NocToast
        open={toast.open}
        severity={toast.severity}
        text={toast.text}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
      />
    </Box>
  );
}
