import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  InputAdornment,
  Menu,
  MenuItem,
  Pagination,
  Skeleton,
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
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import TuneIcon from '@mui/icons-material/Tune';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { useNavigate } from 'react-router-dom';
import { NocToast } from '../../components/feedback/NocToast';
import {
  findAliasForDevice,
  resolveTelemetryFromVParams,
  useAcsStore,
  type DeviceColumnKey,
  type ResolvedDeviceTelemetry,
} from '../../stores/acsStore';
import type { Device } from '../../types';
import {
  classifyRxPowerBucket,
  classifyStatusAgingBucket,
  classifyTemperatureBucket,
  classifyUptimeBucket,
  computeDeviceStatus,
  formatDuration,
  formatRelativeTime,
  formatShortDateTime,
} from '../../utils/classification';
import { DeviceStatusChip, InformEventChip, ParamStateChip } from '../../components/status/StatusChip';
import { TruncatedText } from '../../components/common/TruncatedText';
import { DevicesSkeleton, pageEnterSx, usePageSkeleton } from '../../components/skeletons/PageSkeletons';

type SortKey = 'serialNumber' | 'manufacturerCanonical' | 'modelName' | 'trSourceIp' | 'status';

const ALL_COLUMNS: ReadonlyArray<{ key: DeviceColumnKey; label: string }> = [
  { key: 'status', label: 'Status' },
  { key: 'pppoeUsername', label: 'PPP Username' },
  { key: 'ipAddress', label: 'IP Address' },
  { key: 'serialNumber', label: 'Serial Number' },
  { key: 'manufacturer', label: 'Manufacturer' },
  { key: 'model', label: 'Model' },
  { key: 'productClass', label: 'Product Class' },
  { key: 'rxPower', label: 'RX Power' },
  { key: 'lastInform', label: 'Last Inform' },
  { key: 'technology', label: 'Technology' },
  { key: 'protocol', label: 'Protocol' },
  { key: 'uptime', label: 'Uptime' },
  { key: 'temperature', label: 'Temperature' },
  { key: 'hwVersion', label: 'Hardware Version' },
  { key: 'swVersion', label: 'Software Version' },
  { key: 'oui', label: 'OUI' },
  { key: 'deviceGroup', label: 'Device Group' },
  { key: 'connectionRequestUrl', label: 'Connection Request URL' },
  { key: 'lastSummon', label: 'Last Summon' },
];

const EMPTY_DEVICES: ReturnType<typeof useAcsStore.getState>['devices'] = [];
const EMPTY_TASKS: ReturnType<typeof useAcsStore.getState>['tasks'] = [];

export function DevicesPage() {
  const navigate = useNavigate();
  const apiMode = useAcsStore((s) => s.apiMode);
  const devices = useAcsStore((s) => (s.apiMode === 'backend' ? EMPTY_DEVICES : s.devices));
  const devicePageItems = useAcsStore((s) => s.devicePageItems);
  const devicePageTotal = useAcsStore((s) => s.devicePageTotal);
  const devicePageLoading = useAcsStore((s) => s.devicePageLoading);
  const backendRefreshing = useAcsStore((s) => s.backendRefreshing);
  const fetchDevicesPage = useAcsStore((s) => s.fetchDevicesPage);
  const aliases = useAcsStore((s) => s.aliases);
  const activeQueueCount = useAcsStore((s) => s.summonQueueSummary.activeCount);
  const settings = useAcsStore((s) => s.settings);
  const dashboardFilter = useAcsStore((s) => s.dashboardFilter);
  const setDashboardFilter = useAcsStore((s) => s.setDashboardFilter);
  const visibleCols = useAcsStore((s) => s.deviceVisibleCols);
  const columnOrder = useAcsStore((s) => s.deviceColumnOrder);
  const toggleDeviceColumn = useAcsStore((s) => s.toggleDeviceColumn);
  const reorderDeviceColumns = useAcsStore((s) => s.reorderDeviceColumns);
  const resetDeviceColumns = useAcsStore((s) => s.resetDeviceColumns);
  const triggerBatchSummon = useAcsStore((s) => s.triggerBatchSummon);
  const refreshBackendData = useAcsStore((s) => s.refreshBackendData);
  const hasPermission = useAcsStore((s) => s.hasPermission);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('serialNumber');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const effectivePageSize = settings.general.defaultPageSize || 25;
  const [colMenuAnchor, setColMenuAnchor] = useState<HTMLElement | null>(null);
  const [draggedCol, setDraggedCol] = useState<DeviceColumnKey | null>(null);
  const [dragOverCol, setDragOverCol] = useState<DeviceColumnKey | null>(null);
  const { loading, trigger: triggerPageSkeleton } = usePageSkeleton();
  const [summonBatchIds, setSummonBatchIds] = useState<string[]>([]);
  const trackedBatchTasks = useAcsStore((s) => (summonBatchIds.length > 0 ? s.tasks : EMPTY_TASKS));
  const prevActiveQueueRef = useRef(activeQueueCount);
  const [toast, setToast] = useState<{ open: boolean; severity: 'success' | 'error' | 'info'; text: string }>({
    open: false,
    severity: 'info',
    text: '',
  });
  const isSummoningAll = summonBatchIds.length > 0;

  useEffect(() => {
    if (summonBatchIds.length === 0) return;
    const batchTasks = summonBatchIds
      .map((id) => trackedBatchTasks.find((t) => t.id === id))
      .filter((t): t is NonNullable<typeof t> => Boolean(t));
    if (batchTasks.length < summonBatchIds.length) return;
    const stillRunning = batchTasks.some(
      (t) =>
        t.status === 'pending' ||
        t.status === 'queued' ||
        t.status === 'waiting_for_device' ||
        t.status === 'executing',
    );
    if (stillRunning) return;
    const failedCount = batchTasks.filter((t) => t.status === 'failed' || t.status === 'timeout').length;
    const okCount = batchTasks.length - failedCount;
    setSummonBatchIds([]);
    if (failedCount === 0) {
      setToast({ open: true, severity: 'success', text: `Summon All berhasil untuk ${okCount} perangkat.` });
    } else if (okCount === 0) {
      setToast({ open: true, severity: 'error', text: `Summon All gagal untuk seluruh ${failedCount} perangkat.` });
    } else {
      setToast({ open: true, severity: 'info', text: `Summon All selesai: ${okCount} berhasil, ${failedCount} gagal.` });
    }
  }, [trackedBatchTasks, summonBatchIds]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (apiMode !== 'backend') return;
    void fetchDevicesPage({
      page,
      limit: effectivePageSize,
      search: debouncedSearch,
      sortBy,
      sortDir,
      filter: dashboardFilter,
    });
  }, [apiMode, fetchDevicesPage, page, effectivePageSize, debouncedSearch, sortBy, sortDir, dashboardFilter]);

  // Refresh the visible page once when an active Summon queue finishes instead of thrashing during progress.
  useEffect(() => {
    const prev = prevActiveQueueRef.current;
    prevActiveQueueRef.current = activeQueueCount;
    if (apiMode === 'backend' && prev > 0 && activeQueueCount === 0) {
      void fetchDevicesPage({
        page,
        limit: effectivePageSize,
        search: debouncedSearch,
        sortBy,
        sortDir,
        filter: dashboardFilter,
      });
    }
  }, [apiMode, activeQueueCount, fetchDevicesPage, page, effectivePageSize, debouncedSearch, sortBy, sortDir, dashboardFilter]);

  const threshold = settings.deviceStatus.onlineThresholdSeconds;
  const nowMs = useMemo(() => Date.now(), [page, devicePageItems, devices]);

  const activeDevices = useMemo(
    () => (apiMode === 'backend' ? EMPTY_DEVICES : devices.filter((d) => !d.deletedAt)),
    [apiMode, devices],
  );

  const filtered = useMemo(() => {
    if (apiMode === 'backend') return EMPTY_DEVICES;
    const q = search.trim().toLowerCase();
    return activeDevices.filter((d) => {
      if (q) {
        const hit =
          d.serialNumber.toLowerCase().includes(q) ||
          d.manufacturerCanonical.toLowerCase().includes(q) ||
          d.modelName.toLowerCase().includes(q) ||
          d.productClass.toLowerCase().includes(q) ||
          (d.trSourceIp ?? '').toLowerCase().includes(q) ||
          (d.wanIp ?? '').toLowerCase().includes(q) ||
          (d.pppoeUsername ?? '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (dashboardFilter.manufacturer && d.manufacturerCanonical !== dashboardFilter.manufacturer) return false;
      if (dashboardFilter.model && d.modelName !== dashboardFilter.model) return false;
      if (dashboardFilter.productClass && d.productClass !== dashboardFilter.productClass) return false;
      if (dashboardFilter.technology && d.technologyNormalized !== dashboardFilter.technology) return false;
      if (dashboardFilter.protocol && d.protocol !== dashboardFilter.protocol) return false;
      if (dashboardFilter.deviceGroup && d.deviceGroup !== dashboardFilter.deviceGroup) return false;
      if (dashboardFilter.statusBucket) {
        if (classifyStatusAgingBucket(d, threshold, nowMs) !== dashboardFilter.statusBucket) return false;
      }
      if (dashboardFilter.rxBucket) {
        if (classifyRxPowerBucket(d.rxPowerDbm, settings.classification) !== dashboardFilter.rxBucket) return false;
      }
      if (dashboardFilter.tempBucket) {
        if (classifyTemperatureBucket(d.temperatureCelsius, settings.classification) !== dashboardFilter.tempBucket) return false;
      }
      if (dashboardFilter.uptimeBucket) {
        if (classifyUptimeBucket(d.uptimeSeconds) !== dashboardFilter.uptimeBucket) return false;
      }
      return true;
    });
  }, [apiMode, activeDevices, search, dashboardFilter, threshold, nowMs, settings.classification]);

  const sorted = useMemo(() => {
    if (apiMode === 'backend') return EMPTY_DEVICES;
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'status') {
        const policy = settings.deviceStatus.neverConnectedPolicy;
        cmp = computeDeviceStatus(a, threshold, nowMs, policy).localeCompare(computeDeviceStatus(b, threshold, nowMs, policy));
      } else if (sortBy === 'trSourceIp') {
        cmp = (a.trSourceIp ?? '').localeCompare(b.trSourceIp ?? '');
      } else {
        cmp = (a[sortBy] ?? '').localeCompare(b[sortBy] ?? '');
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [apiMode, filtered, sortBy, sortDir, threshold, nowMs, settings.deviceStatus.neverConnectedPolicy]);

  const paged = sorted.slice((page - 1) * effectivePageSize, page * effectivePageSize);
  const displayRows = apiMode === 'backend' ? devicePageItems : paged;
  const displayTotal = apiMode === 'backend' ? devicePageTotal : sorted.length;
  const totalPages = Math.max(1, Math.ceil(displayTotal / effectivePageSize));

  const computedRows = useMemo(
    () =>
      displayRows.map((d) => {
        const resolved = resolveTelemetryFromVParams(d, findAliasForDevice(d, aliases));
        const status = computeDeviceStatus(d, threshold, nowMs, settings.deviceStatus.neverConnectedPolicy);
        const rxBucket = classifyRxPowerBucket(resolved.rxPowerDbm, settings.classification);
        return { device: d, resolved, status, rxBucket };
      }),
    [displayRows, aliases, threshold, nowMs, settings.deviceStatus.neverConnectedPolicy, settings.classification],
  );

  const toggleSort = (key: SortKey) => {
    setPage(1);
    if (sortBy === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(key);
      setSortDir('asc');
    }
  };

  const handleSummonAll = async () => {
    if (!hasPermission('devices.summon')) {
      setToast({ open: true, severity: 'error', text: 'Permission denied: devices.summon is required.' });
      return;
    }
    const targets = displayRows.map((d) => d.id);
    if (targets.length === 0) return;
    const ids = await triggerBatchSummon(targets, ['vparams']);
    setSummonBatchIds(ids);
    setToast({
      open: true,
      severity: 'info',
      text: ids.length > 0
        ? `Queued summon for ${ids.length} devices.`
        : 'All visible devices already have an active summon queued.',
    });
  };

  const handleRefresh = () => {
    triggerPageSkeleton();
    refreshBackendData();
    if (apiMode === 'backend') {
      void fetchDevicesPage({
        page,
        limit: effectivePageSize,
        search: debouncedSearch,
        sortBy,
        sortDir,
        filter: dashboardFilter,
      });
    }
    setToast({ open: true, severity: 'success', text: 'Device inventory refreshed.' });
  };

  const sortHeaderCell = (label: string, key: SortKey) => (
    <Box
      component="span"
      onClick={() => toggleSort(key)}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.4,
        cursor: 'pointer',
        userSelect: 'none',
        color: sortBy === key ? 'text.primary' : 'text.secondary',
        '&:hover': { color: 'text.primary' },
      }}
    >
      {label}
      <UnfoldMoreIcon sx={{ fontSize: 13, color: sortBy === key ? 'var(--noc-text)' : '#94A3B8' }} />
    </Box>
  );

  const toolbarBtnSx = {
    height: 34,
    px: 1.5,
    fontSize: '0.8rem',
    fontWeight: 600,
    color: 'var(--noc-text-muted)',
    borderColor: 'var(--noc-border-strong)',
    bgcolor: 'background.paper',
    borderRadius: '6px',
    whiteSpace: 'nowrap',
    '&:hover': {
      borderColor: 'text.secondary',
      bgcolor: 'var(--noc-subtle)',
    },
  };

  const orderedVisibleCols = useMemo(
    () =>
      columnOrder.filter(
        (key) => visibleCols[key] && (key !== 'connectionRequestUrl' || hasPermission('devices.secrets.view')),
      ),
    [columnOrder, visibleCols, hasPermission],
  );

  const columnLabelMap = useMemo(
    () => Object.fromEntries(ALL_COLUMNS.map((c) => [c.key, c.label])) as Record<DeviceColumnKey, string>,
    [],
  );

  const renderHeaderContent = (key: DeviceColumnKey) => {
    switch (key) {
      case 'serialNumber':
        return sortHeaderCell('Serial Number', 'serialNumber');
      case 'manufacturer':
        return sortHeaderCell('Manufacturer', 'manufacturerCanonical');
      case 'model':
        return sortHeaderCell('Model', 'modelName');
      case 'productClass':
        return 'Product Class';
      case 'ipAddress':
        return (
          <Tooltip title="TR-069/USP Source IP">
            <span>{sortHeaderCell('IP Address', 'trSourceIp')}</span>
          </Tooltip>
        );
      case 'rxPower':
        return 'RX Power';
      case 'pppoeUsername':
        return 'PPP Username';
      case 'status':
        return sortHeaderCell('Status', 'status');
      case 'lastInform':
        return 'Last Inform';
      case 'technology':
        return 'Technology';
      case 'protocol':
        return 'Protocol';
      case 'uptime':
        return 'Uptime';
      case 'temperature':
        return 'Temp';
      case 'hwVersion':
        return 'HW Ver';
      case 'swVersion':
        return 'SW Ver';
      case 'oui':
        return 'OUI';
      case 'deviceGroup':
        return 'Group';
      case 'connectionRequestUrl':
        return 'Connection Request URL';
      case 'lastSummon':
        return 'Last Summon';
    }
  };

  const renderBodyCell = (
    key: DeviceColumnKey,
    d: Device,
    status: ReturnType<typeof computeDeviceStatus>,
    rxBucket: string,
    resolved: ResolvedDeviceTelemetry,
  ) => {
    switch (key) {
      case 'serialNumber':
        return (
          <TableCell
            key={key}
            sx={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontWeight: 500,
              color: 'var(--noc-accent) !important',
            }}
          >
            {resolved.serialNumber}
          </TableCell>
        );
      case 'manufacturer':
        return <TableCell key={key}><TruncatedText text={resolved.manufacturerCanonical || '-'} /></TableCell>;
      case 'model':
        return <TableCell key={key}><TruncatedText text={resolved.modelName || '-'} /></TableCell>;
      case 'productClass':
        return <TableCell key={key}><TruncatedText text={resolved.productClass || '-'} /></TableCell>;
      case 'ipAddress':
        return (
          <TableCell
            key={key}
            sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
          >
            <TruncatedText text={d.trSourceIp ?? '-'} />
          </TableCell>
        );
      case 'rxPower':
        return (
          <TableCell key={key}>
            {resolved.rxPowerDbm !== null ? (
              <Tooltip title={`Category: ${rxBucket}${resolved.rxPath ? ` · VParam: ${resolved.rxPath}` : ''}`}>
                <Box component="span" sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                  {resolved.rxPowerDbm.toFixed(2)} dBm
                </Box>
              </Tooltip>
            ) : (
              '-'
            )}
          </TableCell>
        );
      case 'pppoeUsername':
        return <TableCell key={key}><TruncatedText text={resolved.pppoeUsername || '-'} /></TableCell>;
      case 'status':
        return (
          <TableCell key={key}>
            <DeviceStatusChip status={status} />
          </TableCell>
        );
      case 'lastInform': {
        const bootTip = [
          d.lastBootstrapAt ? `Last 0 BOOTSTRAP: ${formatShortDateTime(d.lastBootstrapAt)}` : null,
          d.lastBootAt ? `Last 1 BOOT: ${formatShortDateTime(d.lastBootAt)}` : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <TableCell key={key} sx={{ color: 'text.secondary', fontSize: '0.8rem !important' }}>
            <Tooltip title={bootTip || 'No bootstrap/boot inform recorded yet'} disableHoverListener={!bootTip}>
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0, overflow: 'hidden' }}>
                <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {formatShortDateTime(d.lastInformAt)}
                </Box>
                <InformEventChip eventCode={d.lastEventCode ?? d.events[0]?.eventCode} />
              </Stack>
            </Tooltip>
          </TableCell>
        );
      }
      case 'technology':
        return <TableCell key={key}><TruncatedText text={d.technologyNormalized} /></TableCell>;
      case 'protocol':
        return <TableCell key={key}><TruncatedText text={d.protocol} /></TableCell>;
      case 'uptime':
        return <TableCell key={key}><TruncatedText text={formatDuration(resolved.uptimeSeconds)} /></TableCell>;
      case 'temperature':
        return (
          <TableCell key={key}>
            {resolved.temperatureCelsius !== null ? (
              `${resolved.temperatureCelsius.toFixed(1)} °C`
            ) : (
              <ParamStateChip state={resolved.tempReadState} />
            )}
          </TableCell>
        );
      case 'hwVersion':
        return <TableCell key={key}><TruncatedText text={resolved.hardwareVersion || '-'} /></TableCell>;
      case 'swVersion':
        return <TableCell key={key}><TruncatedText text={resolved.softwareVersion || '-'} /></TableCell>;
      case 'oui':
        return <TableCell key={key} sx={{ fontFamily: 'monospace' }}><TruncatedText text={resolved.oui || '-'} /></TableCell>;
      case 'deviceGroup':
        return <TableCell key={key}><TruncatedText text={d.deviceGroup || '-'} /></TableCell>;
      case 'connectionRequestUrl':
        return (
          <TableCell key={key} sx={{ fontFamily: 'monospace', fontSize: '0.76rem' }}>
            <TruncatedText text={d.connectionRequestUrl ?? '-'} />
          </TableCell>
        );
      case 'lastSummon':
        return <TableCell key={key}><TruncatedText text={formatRelativeTime(d.lastSummonAt)} /></TableCell>;
    }
  };

  if (loading || (apiMode === 'backend' && (backendRefreshing || (devicePageLoading && displayRows.length === 0)))) {
    return <DevicesSkeleton />;
  }

  return (
    <Box sx={pageEnterSx}>
      {/* Top Header Bar */}
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', md: 'center' }}
        spacing={1.5}
        sx={{ pb: 2, mb: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Typography sx={{ fontSize: '1.15rem', fontWeight: 700, color: 'text.primary', lineHeight: 1.3 }}>
          Device inventory
        </Typography>

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <TextField
            size="small"
            placeholder="Search SN, model, IP, PPPoE..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            sx={{
              width: 220,
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

          <Button
            variant="outlined"
            size="small"
            sx={toolbarBtnSx}
            startIcon={<TuneIcon sx={{ fontSize: '15px !important', color: 'text.secondary' }} />}
            onClick={(e) => setColMenuAnchor(e.currentTarget)}
          >
            Columns
          </Button>

          <Button
            variant="outlined"
            size="small"
            sx={{ ...toolbarBtnSx, minWidth: 118, transition: 'all 220ms cubic-bezier(0.22, 1, 0.36, 1)' }}
            disabled={!hasPermission('devices.summon') || displayRows.length === 0 || isSummoningAll}
            startIcon={
              isSummoningAll ? (
                <CircularProgress size={14} sx={{ color: 'var(--noc-accent)' }} />
              ) : (
                <SendOutlinedIcon sx={{ fontSize: '14px !important', color: 'text.secondary' }} />
              )
            }
            onClick={handleSummonAll}
          >
            {isSummoningAll ? 'Summoning...' : 'Summon All'}
          </Button>

          <Button
            variant="outlined"
            size="small"
            sx={toolbarBtnSx}
            startIcon={<RefreshIcon sx={{ fontSize: '15px !important', color: 'text.secondary' }} />}
            onClick={handleRefresh}
          >
            Refresh
          </Button>
        </Stack>
      </Stack>

      {Object.values(dashboardFilter).some(Boolean) && (
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            Active drill-down:
          </Typography>
          {Object.entries(dashboardFilter).map(([k, v]) =>
            v ? (
              <Chip
                key={k}
                size="small"
                label={`${k}: ${v}`}
                onDelete={() => setDashboardFilter({ ...dashboardFilter, [k]: undefined })}
              />
            ) : null,
          )}
        </Stack>
      )}

      {/* Devices Table */}
      <Card sx={{ borderRadius: '8px', borderColor: 'divider', overflow: 'hidden' }}>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table
            size="small"
            sx={{
              tableLayout: 'auto',
              width: 'max-content',
              minWidth: '100%',
              '& .MuiTableCell-head': {
                bgcolor: 'var(--noc-subtle)',
                color: 'text.secondary',
                fontSize: '0.72rem',
                fontWeight: 600,
                py: 0.9,
                px: 1.5,
                borderBottom: '1px solid var(--noc-border)',
                whiteSpace: 'nowrap',
                overflow: 'visible',
                textOverflow: 'clip',
              },
              '& .MuiTableCell-body': {
                py: 0.9,
                px: 1.5,
                fontSize: '0.78rem',
                color: 'var(--noc-text-muted)',
                borderBottom: '1px solid var(--noc-border)',
                whiteSpace: 'nowrap',
              },
            }}
          >
            <TableHead>
              <TableRow>
                {orderedVisibleCols.map((colKey) => {
                  const isDragging = draggedCol === colKey;
                  const isDropTarget = dragOverCol === colKey && draggedCol !== colKey;
                  return (
                    <TableCell
                      key={colKey}
                      draggable
                      onDragStart={(e) => {
                        setDraggedCol(colKey);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', colKey);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (dragOverCol !== colKey) setDragOverCol(colKey);
                      }}
                      onDragLeave={() => {
                        if (dragOverCol === colKey) setDragOverCol(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedCol && draggedCol !== colKey) {
                          reorderDeviceColumns(draggedCol, colKey);
                        }
                        setDraggedCol(null);
                        setDragOverCol(null);
                      }}
                      onDragEnd={() => {
                        setDraggedCol(null);
                        setDragOverCol(null);
                      }}
                      sx={{
                        minWidth: colKey === 'lastInform' ? 165 : colKey === 'serialNumber' ? 145 : colKey === 'pppoeUsername' ? 145 : undefined,
                        cursor: isDragging ? 'grabbing' : 'grab',
                        userSelect: 'none',
                        opacity: isDragging ? 0.45 : 1,
                        bgcolor: isDropTarget ? 'var(--noc-accent-bg) !important' : undefined,
                        boxShadow: isDropTarget ? 'inset 2px 0 0 var(--noc-accent)' : undefined,
                        transition: 'opacity 160ms ease, background-color 160ms ease, box-shadow 160ms ease',
                      }}
                    >
                      {renderHeaderContent(colKey)}
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableHead>
            <TableBody>
              {orderedVisibleCols.length === 0 ? (
                <TableRow>
                  <TableCell align="center" sx={{ py: 5 }}>
                    <Typography variant="body2" color="text.secondary">
                      No columns selected. Open Columns above to choose columns.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : apiMode === 'backend' && devicePageLoading ? (
                Array.from({ length: Math.min(8, effectivePageSize) }).map((_, rIdx) => (
                  <TableRow key={`sk-${rIdx}`}>
                    {orderedVisibleCols.map((colKey) => (
                      <TableCell key={colKey} sx={{ py: 1.1 }}>
                        <Skeleton animation="wave" variant="text" width="75%" height={18} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : displayRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={orderedVisibleCols.length} align="center" sx={{ py: 5 }}>
                    <Typography variant="body2" color="text.secondary">
                      {apiMode === 'backend' && devicePageLoading
                        ? 'Loading devices...'
                        : 'No devices found matching the current search or filters.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                computedRows.map(({ device: d, resolved, status, rxBucket }) => (
                  <TableRow
                    key={d.id}
                    hover
                    sx={{
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'var(--noc-subtle)' },
                      '&:last-child td': { borderBottom: 0 },
                    }}
                    onClick={() => navigate(`/devices/${d.id}`)}
                  >
                    {orderedVisibleCols.map((colKey) => renderBodyCell(colKey, d, status, rxBucket, resolved))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ px: 2, py: 1.25, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            {apiMode === 'backend' && devicePageLoading && <CircularProgress size={14} />}
            <Typography variant="caption" color="text.secondary">
              {displayTotal === 0
                ? 'Showing 0 of 0 device(s)'
                : `Showing ${(page - 1) * effectivePageSize + 1}–${Math.min(
                    displayTotal,
                    (page - 1) * effectivePageSize + displayRows.length,
                  )} of ${displayTotal} device(s)`}
            </Typography>
          </Stack>
          <Pagination count={totalPages} page={page} onChange={(_, p) => setPage(p)} size="small" color="primary" />
        </Stack>
      </Card>

      <Menu
        anchorEl={colMenuAnchor}
        open={Boolean(colMenuAnchor)}
        onClose={() => setColMenuAnchor(null)}
        PaperProps={{ sx: { maxHeight: 380, minWidth: 245 } }}
      >
        {columnOrder.map((key) => {
          const disabled = key === 'connectionRequestUrl' && !hasPermission('devices.secrets.view');
          const isDropTarget = dragOverCol === key && draggedCol !== key;
          return (
            <MenuItem
              key={key}
              dense
              disabled={disabled}
              draggable={!disabled}
              onDragStart={(e) => {
                setDraggedCol(key);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', key);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverCol !== key) setDragOverCol(key);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedCol && draggedCol !== key) {
                  reorderDeviceColumns(draggedCol, key);
                }
                setDraggedCol(null);
                setDragOverCol(null);
              }}
              onDragEnd={() => {
                setDraggedCol(null);
                setDragOverCol(null);
              }}
              onClick={() => toggleDeviceColumn(key)}
              sx={{
                bgcolor: isDropTarget ? 'var(--noc-accent-bg)' : undefined,
                borderTop: isDropTarget ? '2px solid var(--noc-accent)' : '2px solid transparent',
              }}
            >
              <DragIndicatorIcon sx={{ fontSize: 15, color: '#94A3B8', mr: 0.5, cursor: 'grab' }} />
              <Checkbox size="small" checked={Boolean(visibleCols[key]) && !disabled} />
              <Typography variant="body2">{columnLabelMap[key]}</Typography>
            </MenuItem>
          );
        })}
        <Divider sx={{ my: 0.5 }} />
        <MenuItem
          dense
          onClick={() => {
            resetDeviceColumns();
          }}
          sx={{ color: 'var(--noc-accent)', fontWeight: 600 }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem', pl: 1 }}>
            Reset Default Columns
          </Typography>
        </MenuItem>
      </Menu>

      <NocToast
        open={toast.open}
        severity={toast.severity}
        text={toast.text}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
      />
    </Box>
  );
}
