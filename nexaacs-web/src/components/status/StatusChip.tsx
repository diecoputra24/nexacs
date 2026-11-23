import { Box, Chip, Tooltip, useTheme } from '@mui/material';
import type { DeviceStatus, FaultStatus, ParameterReadState, TaskStatus } from '../../types';

export function DeviceStatusChip({ status }: { status: DeviceStatus }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const map: Record<DeviceStatus, { label: string; bg: string; color: string; border: string; dot: string }> = isDark
    ? {
        online: { label: 'Online', bg: 'rgba(34, 197, 94, 0.14)', color: '#86EFAC', border: 'rgba(34, 197, 94, 0.3)', dot: '#22C55E' },
        offline: { label: 'Offline', bg: 'rgba(239, 68, 68, 0.14)', color: '#FCA5A5', border: 'rgba(239, 68, 68, 0.3)', dot: '#EF4444' },
        never_connected: { label: 'Never Connected', bg: 'rgba(245, 158, 11, 0.14)', color: '#FDE68A', border: 'rgba(245, 158, 11, 0.3)', dot: '#F59E0B' },
        unknown: { label: 'Unknown', bg: 'rgba(148, 163, 184, 0.14)', color: '#CBD5E1', border: 'rgba(148, 163, 184, 0.25)', dot: '#94A3B8' },
        disabled: { label: 'Disabled', bg: 'rgba(148, 163, 184, 0.12)', color: '#94A3B8', border: 'rgba(148, 163, 184, 0.22)', dot: '#64748B' },
      }
    : {
        online: { label: 'Online', bg: '#DCFCE7', color: '#15803D', border: '#BBF7D0', dot: '#22C55E' },
        offline: { label: 'Offline', bg: '#FEE2E2', color: '#B91C1C', border: '#FECACA', dot: '#EF4444' },
        never_connected: { label: 'Never Connected', bg: '#FEF3C7', color: '#B45309', border: '#FDE68A', dot: '#F59E0B' },
        unknown: { label: 'Unknown', bg: '#F1F5F9', color: '#475569', border: '#E2E8F0', dot: '#94A3B8' },
        disabled: { label: 'Disabled', bg: '#F1F5F9', color: '#64748B', border: '#E2E8F0', dot: '#94A3B8' },
      };
  const cfg = map[status];
  return (
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
}

export function ParamStateChip({ state }: { state: ParameterReadState }) {
  const cfg: Record<
    ParameterReadState,
    { label: string; color: 'success' | 'default' | 'warning' | 'error' | 'info'; tip: string }
  > = {
    available: { label: 'Available', color: 'success', tip: 'Successfully retrieved from device' },
    unsupported: { label: 'Unsupported', color: 'default', tip: 'Device does not support this parameter' },
    not_fetched: { label: 'Not Fetched', color: 'info', tip: 'Parameter has not been fetched yet — click Summon' },
    read_failed: { label: 'Read Failed', color: 'error', tip: 'Device returned an error or timed out reading parameter' },
    stale: { label: 'Stale', color: 'warning', tip: 'Value exceeded freshness policy' },
    redacted: { label: 'Redacted', color: 'warning', tip: 'Secret masked — requires devices.secrets.view permission' },
  };
  const item = cfg[state];
  return (
    <Tooltip title={item.tip}>
      <Chip size="small" label={item.label} color={item.color} variant="outlined" />
    </Tooltip>
  );
}

export function TaskStatusChip({ status }: { status: TaskStatus }) {
  const map: Record<TaskStatus, { label: string; color: 'success' | 'error' | 'warning' | 'info' | 'default' }> = {
    pending: { label: 'Pending', color: 'default' },
    queued: { label: 'Queued', color: 'info' },
    waiting_for_device: { label: 'Waiting for Device', color: 'warning' },
    executing: { label: 'Executing', color: 'info' },
    completed: { label: 'Completed', color: 'success' },
    failed: { label: 'Failed', color: 'error' },
    timeout: { label: 'Timeout', color: 'error' },
    cancelled: { label: 'Cancelled', color: 'default' },
  };
  const item = map[status];
  return (
    <Chip
      size="small"
      label={item.label}
      color={item.color}
      variant="outlined"
      sx={{ bgcolor: 'transparent', height: 22, fontSize: '0.73rem', fontWeight: 600 }}
    />
  );
}

export function FaultStatusChip({ status }: { status: FaultStatus }) {
  const map: Record<FaultStatus, { label: string; color: 'error' | 'warning' | 'success' | 'default' }> = {
    open: { label: 'Open', color: 'error' },
    acknowledged: { label: 'Acknowledged', color: 'warning' },
    resolved: { label: 'Resolved', color: 'success' },
    ignored: { label: 'Ignored', color: 'default' },
  };
  const item = map[status];
  return <Chip size="small" label={item.label} color={item.color} variant="filled" />;
}

export function InformEventChip({ eventCode }: { eventCode?: string | null }) {
  const code = (eventCode ?? '').trim();
  if (!code) return null;
  let color: 'primary' | 'warning' | 'info' | 'default' = 'default';
  if (code.startsWith('0 BOOTSTRAP')) color = 'primary';
  else if (code.startsWith('1 BOOT')) color = 'warning';
  else if (code.startsWith('4 VALUE CHANGE')) color = 'info';

  return (
    <Chip
      size="small"
      label={code}
      color={color}
      variant="outlined"
      sx={{
        height: 20,
        fontSize: '0.68rem',
        fontWeight: 700,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        bgcolor: 'transparent',
      }}
    />
  );
}
