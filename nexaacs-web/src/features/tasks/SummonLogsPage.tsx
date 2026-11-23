import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  Grid,
  IconButton,
  InputAdornment,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useNavigate } from 'react-router-dom';
import { useAcsStore } from '../../stores/acsStore';
import { TaskStatusChip } from '../../components/status/StatusChip';
import { TruncatedText } from '../../components/common/TruncatedText';
import { NocToast } from '../../components/feedback/NocToast';
import { SummonLogsSkeleton, pageEnterSx } from '../../components/skeletons/PageSkeletons';
import { formatDateTime, formatRelativeTime } from '../../utils/classification';
import type { TaskRecord, TaskStatus } from '../../types';

type LogTab = 'all' | 'active' | 'completed' | 'failed';

const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
const ACTIVE_STATUSES = new Set<TaskStatus>(['pending', 'queued', 'waiting_for_device', 'executing']);
const FAILED_STATUSES = new Set<TaskStatus>(['failed', 'timeout']);

function formatDurationMs(ms: number | null, status: TaskStatus): string {
  if (ACTIVE_STATUSES.has(status)) return 'In progress';
  if (ms === null || ms < 0) return '-';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function SummonLogsPage() {
  const navigate = useNavigate();
  const tasks = useAcsStore((s) => s.tasks);
  const tasksLoading = useAcsStore((s) => s.tasksLoading);
  const backendRefreshing = useAcsStore((s) => s.backendRefreshing);
  const summonQueueSummary = useAcsStore((s) => s.summonQueueSummary);
  const apiMode = useAcsStore((s) => s.apiMode);
  const fetchTasks = useAcsStore((s) => s.fetchTasks);
  const triggerSummon = useAcsStore((s) => s.triggerSummon);
  const hasPermission = useAcsStore((s) => s.hasPermission);

  const [tab, setTab] = useState<LogTab>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedTask, setSelectedTask] = useState<TaskRecord | null>(null);
  const [toast, setToast] = useState<{ open: boolean; severity: 'success' | 'error' | 'info'; text: string }>({
    open: false,
    severity: 'info',
    text: '',
  });

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 200);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (apiMode !== 'backend') return;
    const statusParam = tab === 'all' ? undefined : tab;
    const load = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void fetchTasks({
        taskType: 'summon',
        status: statusParam,
        search: debouncedSearch || undefined,
        limit: 100,
      });
    };
    void fetchTasks({
      taskType: 'summon',
      status: statusParam,
      search: debouncedSearch || undefined,
      limit: 100,
    });
    const timer = window.setInterval(load, 4000);
    return () => window.clearInterval(timer);
  }, [apiMode, fetchTasks, tab, debouncedSearch]);

  const summonTasks = useMemo(
    () => tasks.filter((t) => t.taskType === 'summon' || t.taskType === 'refresh_params'),
    [tasks],
  );

  const counts = useMemo(() => {
    let active = 0;
    let executing = 0;
    let completed = 0;
    let failed = 0;
    for (const t of summonTasks) {
      if (ACTIVE_STATUSES.has(t.status)) active++;
      if (t.status === 'executing') executing++;
      if (t.status === 'completed') completed++;
      if (FAILED_STATUSES.has(t.status)) failed++;
    }
    return {
      active: Math.max(active, summonQueueSummary.activeCount),
      executing: Math.max(executing, summonQueueSummary.executingCount),
      completed,
      failed,
      total: summonTasks.length,
    };
  }, [summonTasks, summonQueueSummary]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return summonTasks.filter((t) => {
      if (tab === 'active' && !ACTIVE_STATUSES.has(t.status)) return false;
      if (tab === 'completed' && t.status !== 'completed') return false;
      if (tab === 'failed' && !FAILED_STATUSES.has(t.status)) return false;
      if (!q) return true;
      return (
        t.deviceSerial.toLowerCase().includes(q) ||
        t.correlationId.toLowerCase().includes(q) ||
        t.requestedBy.toLowerCase().includes(q) ||
        t.summary.toLowerCase().includes(q) ||
        (t.requestedGroups ?? []).some((g) => g.toLowerCase().includes(q))
      );
    });
  }, [summonTasks, tab, search]);

  const liveSelectedTask = useMemo(
    () => (selectedTask ? summonTasks.find((t) => t.id === selectedTask.id) ?? selectedTask : null),
    [summonTasks, selectedTask],
  );

  const handleManualRefresh = () => {
    if (apiMode === 'backend') {
      void fetchTasks({
        taskType: 'summon',
        status: tab === 'all' ? undefined : tab,
        search: debouncedSearch || undefined,
        limit: 300,
      });
    }
    setToast({ open: true, severity: 'success', text: 'Summon logs refreshed.' });
  };

  const handleRetrySummon = (t: TaskRecord) => {
    if (!hasPermission('devices.summon')) {
      setToast({ open: true, severity: 'error', text: 'Permission denied: devices.summon is required.' });
      return;
    }
    const groups = t.requestedGroups && t.requestedGroups.length > 0
      ? t.requestedGroups
      : (['optical_health', 'wan_summary', 'device_info'] as const);
    triggerSummon(t.deviceId, [...groups]);
    setToast({ open: true, severity: 'info', text: `Re-queued Summon for ${t.deviceSerial}.` });
  };

  if (apiMode === 'backend' && (backendRefreshing || (tasksLoading && summonTasks.length === 0))) {
    return <SummonLogsSkeleton />;
  }

  return (
    <Box sx={pageEnterSx}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ sm: 'center' }}
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <Typography variant="h5">Summon Logs</Typography>
        <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={handleManualRefresh}>
          Refresh
        </Button>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={6} sm={3}>
          <Card sx={{ p: 1.75 }}>
            <Typography variant="caption" color="text.secondary">
              Active Queue
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
              <Typography variant="h5" color={counts.active > 0 ? 'info.main' : 'text.primary'}>
                {counts.active}
              </Typography>
              {counts.active > 0 && <CircularProgress size={15} thickness={5} />}
            </Stack>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card sx={{ p: 1.75 }}>
            <Typography variant="caption" color="text.secondary">
              Executing Now
            </Typography>
            <Typography variant="h5" sx={{ mt: 0.5 }} color="primary.main">
              {counts.executing}
            </Typography>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card sx={{ p: 1.75 }}>
            <Typography variant="caption" color="text.secondary">
              Completed (Loaded)
            </Typography>
            <Typography variant="h5" sx={{ mt: 0.5 }} color="success.main">
              {counts.completed}
            </Typography>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card sx={{ p: 1.75 }}>
            <Typography variant="caption" color="text.secondary">
              Failed / Timeout (Loaded)
            </Typography>
            <Typography variant="h5" sx={{ mt: 0.5 }} color="error.main">
              {counts.failed}
            </Typography>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ md: 'center' }}
          spacing={1.5}
          sx={{ px: 2, pt: 1, pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}
        >
          <Tabs value={tab} onChange={(_, v) => setTab(v as LogTab)} sx={{ minHeight: 40 }}>
            <Tab label={`All (${counts.total})`} value="all" sx={{ minHeight: 40, py: 0.75, textTransform: 'none' }} />
            <Tab
              label={`Active Queue (${counts.active})`}
              value="active"
              sx={{ minHeight: 40, py: 0.75, textTransform: 'none' }}
            />
            <Tab
              label={`Completed (${counts.completed})`}
              value="completed"
              sx={{ minHeight: 40, py: 0.75, textTransform: 'none' }}
            />
            <Tab
              label={`Failed (${counts.failed})`}
              value="failed"
              sx={{ minHeight: 40, py: 0.75, textTransform: 'none' }}
            />
          </Tabs>

          <TextField
            size="small"
            placeholder="Search Serial, Groups, Correlation ID, Result..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: { xs: '100%', md: 310 } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        </Stack>

        <TableContainer>
          <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: '12%' }}>Status</TableCell>
                <TableCell sx={{ width: '17%' }}>Device Serial</TableCell>
                <TableCell sx={{ width: '9%' }}>Protocol</TableCell>
                <TableCell sx={{ width: '15%' }}>Groups</TableCell>
                <TableCell sx={{ width: '25%' }}>Summary / Result</TableCell>
                <TableCell sx={{ width: '8%' }}>Duration</TableCell>
                <TableCell sx={{ width: '8%' }}>Created</TableCell>
                <TableCell align="right" sx={{ width: '6%' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
                    <Typography variant="body2" color="text.secondary">
                      {tab === 'active'
                        ? 'No Summon jobs are currently queued or running.'
                        : 'No Summon log entries match the current filter.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((t) => {
                  const isActive = ACTIVE_STATUSES.has(t.status);
                  const isFailed = FAILED_STATUSES.has(t.status);
                  return (
                    <TableRow
                      key={t.id}
                      hover
                      sx={{
                        cursor: 'pointer',
                        bgcolor: isActive ? 'rgba(56, 189, 248, 0.05)' : 'transparent',
                        '&:last-child td': { borderBottom: 0 },
                      }}
                      onClick={() => setSelectedTask(t)}
                    >
                      <TableCell>
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          {isActive && <CircularProgress size={13} thickness={5} />}
                          <TaskStatusChip status={t.status} />
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <TruncatedText
                          text={t.deviceSerial}
                          sx={{
                            fontFamily: MONO_FONT,
                            fontWeight: 600,
                            color: 'primary.main',
                            '&:hover': { textDecoration: 'underline' },
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={t.protocol} variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                      </TableCell>
                      <TableCell>
                        <TruncatedText
                          text={t.requestedGroups && t.requestedGroups.length > 0 ? t.requestedGroups.join(', ') : 'vparams'}
                          sx={{ fontFamily: MONO_FONT, fontSize: '0.73rem' }}
                        />
                      </TableCell>
                      <TableCell>
                        <TruncatedText
                          text={t.summary}
                          sx={{ color: isFailed ? 'error.main' : 'text.primary' }}
                        />
                      </TableCell>
                      <TableCell sx={{ fontFamily: MONO_FONT, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                        {formatDurationMs(t.durationMs, t.status)}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Tooltip title={formatDateTime(t.createdAt)}>
                          <Typography variant="caption" color="text.secondary">
                            {formatRelativeTime(t.createdAt)}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Tooltip title="Inspect Logs">
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTask(t);
                            }}
                          >
                            <VisibilityOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Re-Summon Device">
                          <span>
                            <IconButton
                              size="small"
                              disabled={!hasPermission('devices.summon')}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRetrySummon(t);
                              }}
                            >
                              <SendOutlinedIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Drawer
        anchor="right"
        open={Boolean(liveSelectedTask)}
        onClose={() => setSelectedTask(null)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 460 }, p: 2.5 } }}
      >
        {liveSelectedTask && (
          <Stack spacing={2}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h6">Summon Job Detail</Typography>
                <TaskStatusChip status={liveSelectedTask.status} />
              </Stack>
              <Button
                size="small"
                variant="outlined"
                endIcon={<OpenInNewIcon fontSize="small" />}
                onClick={() => navigate(`/devices/${liveSelectedTask.deviceId}`)}
              >
                Open Device
              </Button>
            </Stack>

            <Divider />

            <Grid container spacing={1.5}>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">
                  Device Serial
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: MONO_FONT, fontWeight: 600 }}>
                  {liveSelectedTask.deviceSerial}
                </Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">
                  Protocol / Source
                </Typography>
                <Typography variant="body2">
                  {liveSelectedTask.protocol} · {liveSelectedTask.requestedBy}
                </Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="caption" color="text.secondary">
                  Correlation ID
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: MONO_FONT, fontSize: '0.78rem', wordBreak: 'break-all' }}>
                  {liveSelectedTask.correlationId}
                </Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">
                  Created
                </Typography>
                <Typography variant="body2">{formatDateTime(liveSelectedTask.createdAt)}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">
                  Duration
                </Typography>
                <Typography variant="body2">
                  {formatDurationMs(liveSelectedTask.durationMs, liveSelectedTask.status)}
                </Typography>
              </Grid>
            </Grid>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                Requested VParam Groups
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {(liveSelectedTask.requestedGroups && liveSelectedTask.requestedGroups.length > 0
                  ? liveSelectedTask.requestedGroups
                  : ['default']
                ).map((g) => (
                  <Chip key={g} size="small" label={g} variant="outlined" sx={{ fontFamily: MONO_FONT }} />
                ))}
              </Stack>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                Summary
              </Typography>
              <Typography
                variant="body2"
                color={FAILED_STATUSES.has(liveSelectedTask.status) ? 'error.main' : 'text.primary'}
              >
                {liveSelectedTask.summary}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                Execution Log
              </Typography>
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: 'var(--noc-subtle)',
                  border: '1px solid',
                  borderColor: 'divider',
                  fontFamily: MONO_FONT,
                  fontSize: '0.75rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {liveSelectedTask.logs.length > 0
                  ? liveSelectedTask.logs.join('\n')
                  : `[${liveSelectedTask.createdAt}] ${liveSelectedTask.summary}`}
              </Box>
            </Box>
          </Stack>
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
