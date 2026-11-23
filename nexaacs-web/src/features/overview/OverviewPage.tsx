import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import { useNavigate } from 'react-router-dom';
import { useAcsStore } from '../../stores/acsStore';
import {
  classifyRxPowerBucket,
  classifyStatusAgingBucket,
  classifyTemperatureBucket,
  classifyUptimeBucket,
  computeAvailability,
  RX_BUCKET_ORDER,
  STATUS_AGING_ORDER,
  TEMP_BUCKET_ORDER,
  UPTIME_BUCKET_ORDER,
} from '../../utils/classification';
import { EChartBox } from '../../components/charts/EChartBox';
import { OverviewSkeleton, pageEnterSx, usePageSkeleton } from '../../components/skeletons/PageSkeletons';
import type { DashboardFilter } from '../../types';

function countByOrderedBuckets(items: string[], order?: readonly string[]): Array<{ name: string; value: number }> {
  const map = new Map<string, number>();
  if (order) {
    for (const k of order) map.set(k, 0);
  }
  for (const item of items) {
    map.set(item, (map.get(item) ?? 0) + 1);
  }
  const entries = Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  if (!order) {
    entries.sort((a, b) => b.value - a.value);
  }
  return entries;
}

export function OverviewPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const navigate = useNavigate();
  const apiMode = useAcsStore((s) => s.apiMode);
  const devices = useAcsStore((s) => s.devices);
  const overviewStats = useAcsStore((s) => s.overviewStats);
  const overviewLoading = useAcsStore((s) => s.overviewLoading);
  const backendRefreshing = useAcsStore((s) => s.backendRefreshing);
  const settings = useAcsStore((s) => s.settings);
  const refreshBackendData = useAcsStore((s) => s.refreshBackendData);
  const fetchOverviewStats = useAcsStore((s) => s.fetchOverviewStats);
  const setDashboardFilter = useAcsStore((s) => s.setDashboardFilter);

  const [filter, setFilter] = useState<DashboardFilter>({});
  const { loading, trigger: triggerPageSkeleton } = usePageSkeleton();

  useEffect(() => {
    if (apiMode === 'backend') {
      void fetchOverviewStats(filter);
    }
  }, [apiMode, fetchOverviewStats, filter]);

  const useBackendStats = Boolean(apiMode === 'backend' && overviewStats);

  const activeDevices = useMemo(() => devices.filter((d) => !d.deletedAt), [devices]);

  const uniqueOptions = useMemo(() => {
    const groups = Array.from(new Set(activeDevices.map((d) => d.deviceGroup))).sort();
    if (useBackendStats && overviewStats) {
      return {
        mfgs: overviewStats.filterManufacturers,
        models: overviewStats.filterModels,
        pcs: overviewStats.filterProductClasses,
        groups:
          overviewStats.filterDeviceGroups && overviewStats.filterDeviceGroups.length > 0
            ? overviewStats.filterDeviceGroups
            : groups,
      };
    }
    const mfgs = Array.from(new Set(activeDevices.map((d) => d.manufacturerCanonical))).sort();
    const models = Array.from(new Set(activeDevices.map((d) => d.modelName))).sort();
    const pcs = Array.from(new Set(activeDevices.map((d) => d.productClass))).sort();
    return { mfgs, models, pcs, groups };
  }, [activeDevices, useBackendStats, overviewStats]);

  const filteredDevices = useMemo(() => {
    return activeDevices.filter((d) => {
      if (filter.manufacturer && d.manufacturerCanonical !== filter.manufacturer) return false;
      if (filter.model && d.modelName !== filter.model) return false;
      if (filter.productClass && d.productClass !== filter.productClass) return false;
      if (filter.technology && d.technologyNormalized !== filter.technology) return false;
      if (filter.protocol && d.protocol !== filter.protocol) return false;
      if (filter.deviceGroup && d.deviceGroup !== filter.deviceGroup) return false;
      return true;
    });
  }, [activeDevices, filter]);

  const threshold = settings.deviceStatus.onlineThresholdSeconds;
  const nowMs = Date.now();

  const localSummary = useMemo(
    () => computeAvailability(filteredDevices, threshold, nowMs),
    [filteredDevices, threshold, nowMs],
  );
  const summary = useMemo(() => {
    if (useBackendStats && overviewStats) {
      const totalEligible = overviewStats.online + overviewStats.offline;
      return {
        totalEligible,
        online: overviewStats.online,
        offline: overviewStats.offline,
        neverConnected: overviewStats.neverConnected,
        availabilityPct: totalEligible > 0 ? overviewStats.availabilityPct : null,
      };
    }
    return localSummary;
  }, [useBackendStats, overviewStats, localSummary]);

  const statusDist = useMemo(
    () =>
      useBackendStats && overviewStats
        ? overviewStats.statusBuckets
        : countByOrderedBuckets(
            filteredDevices.map((d) => classifyStatusAgingBucket(d, threshold, nowMs)),
            STATUS_AGING_ORDER,
          ),
    [useBackendStats, overviewStats, filteredDevices, threshold, nowMs],
  );

  const uptimeDist = useMemo(
    () =>
      useBackendStats && overviewStats
        ? overviewStats.uptimeBuckets
        : countByOrderedBuckets(
            filteredDevices.map((d) => classifyUptimeBucket(d.uptimeSeconds)),
            UPTIME_BUCKET_ORDER,
          ),
    [useBackendStats, overviewStats, filteredDevices],
  );

  const tempDist = useMemo(
    () =>
      useBackendStats && overviewStats
        ? overviewStats.tempBuckets
        : countByOrderedBuckets(
            filteredDevices.map((d) => classifyTemperatureBucket(d.temperatureCelsius, settings.classification)),
            TEMP_BUCKET_ORDER,
          ),
    [useBackendStats, overviewStats, filteredDevices, settings.classification],
  );

  const rxDist = useMemo(
    () =>
      useBackendStats && overviewStats
        ? overviewStats.rxBuckets
        : countByOrderedBuckets(
            filteredDevices.map((d) => classifyRxPowerBucket(d.rxPowerDbm, settings.classification)),
            RX_BUCKET_ORDER,
          ),
    [useBackendStats, overviewStats, filteredDevices, settings.classification],
  );

  const techDist = useMemo(
    () =>
      useBackendStats && overviewStats
        ? overviewStats.techBuckets
        : countByOrderedBuckets(
            filteredDevices.map((d) => d.technologyNormalized),
            ['GPON', 'EPON', 'Router', 'N/A'],
          ),
    [useBackendStats, overviewStats, filteredDevices],
  );

  const mfgDist = useMemo(
    () =>
      useBackendStats && overviewStats
        ? overviewStats.manufacturers
        : countByOrderedBuckets(filteredDevices.map((d) => d.manufacturerCanonical)).slice(0, 10),
    [useBackendStats, overviewStats, filteredDevices],
  );

  const pcDist = useMemo(
    () =>
      useBackendStats && overviewStats
        ? overviewStats.productClasses
        : countByOrderedBuckets(filteredDevices.map((d) => d.productClass || 'N/A')).slice(0, 8),
    [useBackendStats, overviewStats, filteredDevices],
  );

  const modelDist = useMemo(
    () =>
      useBackendStats && overviewStats
        ? overviewStats.models
        : countByOrderedBuckets(filteredDevices.map((d) => d.modelName || 'N/A')).slice(0, 8),
    [useBackendStats, overviewStats, filteredDevices],
  );

  const drillDown = (patch: DashboardFilter) => {
    setDashboardFilter({ ...filter, ...patch });
    navigate('/devices');
  };

  const totalCount = useBackendStats && overviewStats ? overviewStats.total : filteredDevices.length;

  const buildBarOption = (data: Array<{ name: string; value: number }>, palette?: string[]) => ({
    tooltip: {
      trigger: 'axis',
      backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
      borderColor: theme.palette.divider,
      textStyle: { color: theme.palette.text.primary, fontSize: 12 },
      formatter: (params: Array<{ name: string; value: number }>) => {
        const p = params[0];
        const pct = totalCount > 0 ? ((p.value / totalCount) * 100).toFixed(1) : '0.0';
        return `${p.name}: <b>${p.value}</b> (${pct}%)`;
      },
    },
    grid: { left: 10, right: 16, top: 18, bottom: 26, containLabel: true },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.name),
      axisLabel: { fontSize: 11, color: theme.palette.text.secondary, interval: 0, rotate: data.length > 5 ? 20 : 0 },
      axisLine: { lineStyle: { color: theme.palette.divider } },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { fontSize: 11, color: theme.palette.text.secondary },
      splitLine: { lineStyle: { color: theme.palette.divider } },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 34,
        data: data.map((d, idx) => ({
          value: d.value,
          itemStyle: {
            color: palette ? palette[idx % palette.length] : '#0284C7',
            borderRadius: [3, 3, 0, 0],
          },
        })),
        label: {
          show: true,
          position: 'top',
          fontSize: 11,
          color: theme.palette.text.primary,
          formatter: (p: { value: number }) => (p.value > 0 ? `${p.value}` : ''),
        },
      },
    ],
  });

  const buildHorizontalBar = (data: Array<{ name: string; value: number }>, color = '#0284C7') => ({
    tooltip: {
      trigger: 'axis',
      backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
      borderColor: theme.palette.divider,
      textStyle: { color: theme.palette.text.primary, fontSize: 12 },
      formatter: (params: Array<{ name: string; value: number }>) => {
        const p = params[0];
        const pct = totalCount > 0 ? ((p.value / totalCount) * 100).toFixed(1) : '0.0';
        return `${p.name}: <b>${p.value}</b> (${pct}%)`;
      },
    },
    grid: { left: 10, right: 28, top: 10, bottom: 16, containLabel: true },
    xAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { fontSize: 11, color: theme.palette.text.secondary },
      splitLine: { lineStyle: { color: theme.palette.divider } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: data.map((d) => d.name),
      axisLabel: { fontSize: 11, color: theme.palette.text.primary },
      axisLine: { lineStyle: { color: theme.palette.divider } },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 20,
        data: data.map((d) => d.value),
        itemStyle: { color, borderRadius: [0, 3, 3, 0] },
        label: {
          show: true,
          position: 'right',
          fontSize: 11,
          color: theme.palette.text.primary,
          formatter: (p: { value: number }) => {
            const pct = totalCount > 0 ? ((p.value / totalCount) * 100).toFixed(0) : '0';
            return `${p.value} (${pct}%)`;
          },
        },
      },
    ],
  });

  if (loading || (apiMode === 'backend' && (overviewLoading || backendRefreshing))) {
    return <OverviewSkeleton />;
  }

  return (
    <Box sx={pageEnterSx}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1.5} sx={{ mb: 2.5 }}>
        <Typography variant="h5">Overview Dashboard</Typography>
        <Stack direction="row" spacing={1}>
          {Object.values(filter).some(Boolean) && (
            <Button size="small" variant="outlined" startIcon={<ClearAllIcon />} onClick={() => setFilter({})}>
              Clear Filters
            </Button>
          )}
          <Button
            size="small"
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={() => {
              triggerPageSkeleton();
              refreshBackendData();
              if (apiMode === 'backend') void fetchOverviewStats(filter);
            }}
          >
            Refresh Dashboard
          </Button>
        </Stack>
      </Stack>

      {/* Dashboard Filters (Section 3.9) */}
      <Card sx={{ mb: 2.5 }}>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Grid container spacing={1.5}>
            <Grid item xs={6} sm={4} md={2}>
              <TextField
                select
                size="small"
                fullWidth
                label="Manufacturer"
                value={filter.manufacturer ?? ''}
                onChange={(e) => setFilter((f) => ({ ...f, manufacturer: e.target.value || undefined }))}
              >
                <MenuItem value="">All</MenuItem>
                {uniqueOptions.mfgs.map((m) => (
                  <MenuItem key={m} value={m}>{m}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <TextField
                select
                size="small"
                fullWidth
                label="Product Class"
                value={filter.productClass ?? ''}
                onChange={(e) => setFilter((f) => ({ ...f, productClass: e.target.value || undefined }))}
              >
                <MenuItem value="">All</MenuItem>
                {uniqueOptions.pcs.map((p) => (
                  <MenuItem key={p} value={p}>{p}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <TextField
                select
                size="small"
                fullWidth
                label="Model"
                value={filter.model ?? ''}
                onChange={(e) => setFilter((f) => ({ ...f, model: e.target.value || undefined }))}
              >
                <MenuItem value="">All</MenuItem>
                {uniqueOptions.models.map((m) => (
                  <MenuItem key={m} value={m}>{m}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <TextField
                select
                size="small"
                fullWidth
                label="Technology"
                value={filter.technology ?? ''}
                onChange={(e) => setFilter((f) => ({ ...f, technology: e.target.value || undefined }))}
              >
                <MenuItem value="">All</MenuItem>
                {['GPON', 'EPON', 'Router', 'N/A'].map((t) => (
                  <MenuItem key={t} value={t}>{t}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <TextField
                select
                size="small"
                fullWidth
                label="Protocol"
                value={filter.protocol ?? ''}
                onChange={(e) => setFilter((f) => ({ ...f, protocol: e.target.value || undefined }))}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="TR-069">TR-069 (CWMP)</MenuItem>
                <MenuItem value="TR-369">TR-369 (USP)</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <TextField
                select
                size="small"
                fullWidth
                label="Device Group"
                value={filter.deviceGroup ?? ''}
                onChange={(e) => setFilter((f) => ({ ...f, deviceGroup: e.target.value || undefined }))}
              >
                <MenuItem value="">All</MenuItem>
                {uniqueOptions.groups.map((g) => (
                  <MenuItem key={g} value={g}>{g}</MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Summary Cards (Section 3.1) */}
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card
            sx={{ height: '100%', cursor: 'pointer', '&:hover': { borderColor: 'primary.main' } }}
            onClick={() => drillDown({})}
          >
            <CardContent
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                px: 2.25,
                py: 2,
                '&:last-child': { pb: 2 },
              }}
            >
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block">
                  TOTAL ELIGIBLE DEVICES
                </Typography>
                <Typography variant="h4" fontWeight={700} sx={{ my: 0.5 }}>
                  {summary.totalEligible}
                </Typography>
              </Box>
              <Box sx={{ minHeight: 20, display: 'flex', alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {summary.neverConnected} Never Connected (excluded)
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card
            sx={{ height: '100%', cursor: 'pointer', '&:hover': { borderColor: 'success.main' } }}
            onClick={() => drillDown({ statusBucket: 'Online' })}
          >
            <CardContent
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                px: 2.25,
                py: 2,
                '&:last-child': { pb: 2 },
              }}
            >
              <Box>
                <Typography variant="caption" color="success.main" fontWeight={700} display="block">
                  ONLINE DEVICES
                </Typography>
                <Typography variant="h4" fontWeight={700} color="success.main" sx={{ my: 0.5 }}>
                  {summary.online}
                </Typography>
              </Box>
              <Box sx={{ minHeight: 20, display: 'flex', alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary" noWrap>
                  Last Inform within {Math.round(threshold / 60)}m threshold
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card
            sx={{ height: '100%', cursor: 'pointer', '&:hover': { borderColor: 'error.main' } }}
            onClick={() => drillDown({ statusBucket: 'Offline > 30m' })}
          >
            <CardContent
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                px: 2.25,
                py: 2,
                '&:last-child': { pb: 2 },
              }}
            >
              <Box>
                <Typography variant="caption" color="error.main" fontWeight={700} display="block">
                  OFFLINE DEVICES
                </Typography>
                <Typography variant="h4" fontWeight={700} color="error.main" sx={{ my: 0.5 }}>
                  {summary.offline}
                </Typography>
              </Box>
              <Box sx={{ minHeight: 20, display: 'flex', alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary" noWrap>
                  Exceeded {Math.round(threshold / 60)}m inform threshold
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                px: 2.25,
                py: 2,
                '&:last-child': { pb: 2 },
              }}
            >
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block">
                  FLEET AVAILABILITY
                </Typography>
                <Typography variant="h4" fontWeight={700} color="primary.main" sx={{ my: 0.5 }}>
                  {summary.availabilityPct === null ? 'N/A' : `${summary.availabilityPct.toFixed(1)}%`}
                </Typography>
              </Box>
              <Box sx={{ minHeight: 20, display: 'flex', alignItems: 'center' }}>
                {summary.availabilityPct !== null && (
                  <LinearProgress
                    variant="determinate"
                    value={summary.availabilityPct}
                    color={summary.availabilityPct >= 90 ? 'success' : summary.availabilityPct >= 70 ? 'warning' : 'error'}
                    sx={{ width: '100%', height: 6, borderRadius: 3 }}
                  />
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {totalCount === 0 ? (
        <Alert severity="info">No devices match the active dashboard filters.</Alert>
      ) : (
        <Grid container spacing={2}>
          {/* 3.2 Status & Offline Aging */}
          <Grid item xs={12} lg={6}>
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle1">Status & Offline Aging Distribution</Typography>
                  <Chip size="small" label="Click bar to filter" variant="outlined" />
                </Stack>
                <EChartBox
                  option={buildBarOption(statusDist, ['#15803D', '#F59E0B', '#EA580C', '#DC2626', '#991B1B', '#7F1D1D', '#64748B'])}
                  onBarClick={(name) => drillDown({ statusBucket: name })}
                />
              </CardContent>
            </Card>
          </Grid>

          {/* 3.5 Optical RX Power */}
          <Grid item xs={12} lg={6}>
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle1">Optical RX Power Distribution (dBm)</Typography>
                  <Chip size="small" label="Includes N/A" variant="outlined" />
                </Stack>
                <EChartBox
                  option={buildBarOption(rxDist, ['#0369A1', '#15803D', '#D97706', '#EA580C', '#B91C1C', '#94A3B8'])}
                  onBarClick={(name) => drillDown({ rxBucket: name })}
                />
              </CardContent>
            </Card>
          </Grid>

          {/* 3.3 Uptime Distribution */}
          <Grid item xs={12} md={6} lg={4}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  Device Uptime Distribution
                </Typography>
                <EChartBox
                  option={buildBarOption(uptimeDist, ['#0284C7', '#0EA5E9', '#14B8A6', '#10B981', '#15803D', '#0F4C81', '#94A3B8'])}
                  onBarClick={(name) => drillDown({ uptimeBucket: name })}
                />
              </CardContent>
            </Card>
          </Grid>

          {/* 3.4 Temperature Distribution */}
          <Grid item xs={12} md={6} lg={4}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  Temperature Distribution (°C)
                </Typography>
                <EChartBox
                  option={buildBarOption(tempDist, ['#15803D', '#D97706', '#B91C1C', '#94A3B8'])}
                  onBarClick={(name) => drillDown({ tempBucket: name })}
                />
              </CardContent>
            </Card>
          </Grid>

          {/* 3.6 Technology Distribution */}
          <Grid item xs={12} md={12} lg={4}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  Technology Distribution
                </Typography>
                <EChartBox
                  option={buildBarOption(techDist, ['#0F4C81', '#0369A1', '#475569', '#94A3B8'])}
                  onBarClick={(name) => drillDown({ technology: name })}
                />
              </CardContent>
            </Card>
          </Grid>

          {/* 3.7 Manufacturer Distribution */}
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  Manufacturer Distribution
                </Typography>
                <EChartBox
                  height={280}
                  option={buildHorizontalBar(mfgDist, '#0F4C81')}
                  onBarClick={(name) => drillDown({ manufacturer: name })}
                />
              </CardContent>
            </Card>
          </Grid>

          {/* 3.8 Top Product Class */}
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  Top Product Class
                </Typography>
                <EChartBox
                  height={280}
                  option={buildHorizontalBar(pcDist, '#0369A1')}
                  onBarClick={(name) => drillDown({ productClass: name })}
                />
              </CardContent>
            </Card>
          </Grid>

          {/* 3.8 Top Model */}
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  Top Device Models
                </Typography>
                <EChartBox
                  height={280}
                  option={buildHorizontalBar(modelDist, '#334155')}
                  onBarClick={(name) => drillDown({ model: name })}
                />
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
