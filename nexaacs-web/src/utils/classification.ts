import type { Device, DeviceStatus, SystemSettings } from '../types';

export function computeDeviceStatus(
  device: Device,
  onlineThresholdSeconds: number,
  nowMs: number = Date.now(),
  neverConnectedPolicy: SystemSettings['deviceStatus']['neverConnectedPolicy'] = 'separate_bucket',
): DeviceStatus {
  if (device.deletedAt || device.adminDisabled) {
    return 'disabled';
  }
  if (!device.lastInformAt) {
    return neverConnectedPolicy === 'treat_unknown' ? 'unknown' : 'never_connected';
  }
  const ageSec = (nowMs - new Date(device.lastInformAt).getTime()) / 1000;
  if (Number.isNaN(ageSec)) {
    return 'unknown';
  }
  return ageSec <= onlineThresholdSeconds ? 'online' : 'offline';
}

export function computeAvailability(
  devices: Device[],
  onlineThresholdSeconds: number,
  nowMs: number = Date.now(),
): {
  totalEligible: number;
  online: number;
  offline: number;
  neverConnected: number;
  availabilityPct: number | null;
} {
  let totalEligible = 0;
  let online = 0;
  let offline = 0;
  let neverConnected = 0;

  for (const d of devices) {
    if (d.deletedAt || d.adminDisabled) continue;
    totalEligible += 1;
    const status = computeDeviceStatus(d, onlineThresholdSeconds, nowMs);
    if (status === 'online') online += 1;
    else if (status === 'offline') offline += 1;
    else if (status === 'never_connected') neverConnected += 1;
  }

  return {
    totalEligible,
    online,
    offline,
    neverConnected,
    availabilityPct: totalEligible === 0 ? null : (online / totalEligible) * 100,
  };
}

export const STATUS_AGING_ORDER = [
  'Online',
  'Offline > 30m',
  'Offline > 2h',
  'Offline > 1d',
  'Offline > 1w',
  'Offline > 1mo',
  'Never Connected',
] as const;

export function classifyStatusAgingBucket(
  device: Device,
  onlineThresholdSeconds: number,
  nowMs: number = Date.now(),
): string {
  const status = computeDeviceStatus(device, onlineThresholdSeconds, nowMs);
  if (status === 'never_connected') return 'Never Connected';
  if (status === 'online') return 'Online';
  if (status === 'disabled' || status === 'unknown' || !device.lastInformAt) return 'Never Connected';

  const ageSec = (nowMs - new Date(device.lastInformAt).getTime()) / 1000;
  if (ageSec <= 2 * 3600) return 'Offline > 30m'; // > threshold up to 2h
  if (ageSec <= 24 * 3600) return 'Offline > 2h'; // > 2h up to 24h
  if (ageSec <= 7 * 86400) return 'Offline > 1d'; // > 1d up to 7d
  if (ageSec <= 30 * 86400) return 'Offline > 1w'; // > 7d up to 30d
  return 'Offline > 1mo'; // > 30d
}

export const UPTIME_BUCKET_ORDER = [
  '< 1h',
  '1–12h',
  '12–24h',
  '1–7d',
  '7–30d',
  '> 1 month',
  'N/A',
] as const;

export function classifyUptimeBucket(uptimeSeconds: number | null): string {
  if (uptimeSeconds === null || uptimeSeconds < 0) return 'N/A';
  if (uptimeSeconds < 3600) return '< 1h';
  if (uptimeSeconds < 12 * 3600) return '1–12h';
  if (uptimeSeconds < 24 * 3600) return '12–24h';
  if (uptimeSeconds < 7 * 86400) return '1–7d';
  if (uptimeSeconds <= 30 * 86400) return '7–30d';
  return '> 1 month';
}

export const TEMP_BUCKET_ORDER = ['Normal', 'Warning', 'Critical', 'N/A'] as const;

export function classifyTemperatureBucket(
  tempC: number | null,
  cfg: SystemSettings['classification'],
): string {
  if (tempC === null) return 'N/A';
  if (tempC < cfg.tempWarningC) return 'Normal';
  if (tempC <= cfg.tempCriticalC) return 'Warning';
  return 'Critical';
}

export const RX_BUCKET_ORDER = [
  'Sangat Kuat',
  'Baik',
  'Perlu Perhatian',
  'Lemah',
  'Sangat Lemah',
  'N/A',
] as const;

export function classifyRxPowerBucket(
  rxDbm: number | null,
  cfg: SystemSettings['classification'],
): string {
  if (rxDbm === null) return 'N/A';
  if (rxDbm >= cfg.rxStrongMinDbm) return 'Sangat Kuat';
  if (rxDbm >= cfg.rxGoodMinDbm) return 'Baik';
  if (rxDbm >= cfg.rxAttentionMinDbm) return 'Perlu Perhatian';
  if (rxDbm >= cfg.rxWeakMinDbm) return 'Lemah';
  return 'Sangat Lemah';
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds < 0) return 'N/A';
  const days = Math.floor(seconds / 86400);
  const hrs = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m ${seconds % 60}s`;
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

let activeTimezone = 'Asia/Jakarta';

export function setActiveTimezone(tz?: string | null): void {
  if (typeof tz === 'string' && tz.trim()) {
    activeTimezone = tz.trim();
  }
}

function formatWithTimezone(
  iso: string | null,
  options: Intl.DateTimeFormatOptions,
  timeZone?: string,
  emptyFallback = 'N/A',
): string {
  if (!iso) return emptyFallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return emptyFallback;
  const tz = (timeZone && timeZone.trim()) || activeTimezone;
  try {
    return d.toLocaleString('en-GB', { ...options, timeZone: tz });
  } catch {
    return d.toLocaleString('en-GB', options);
  }
}

export function formatDateTime(iso: string | null, timeZone?: string): string {
  return formatWithTimezone(
    iso,
    {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    },
    timeZone,
    'N/A',
  );
}

export function formatShortDateTime(iso: string | null, timeZone?: string): string {
  return formatWithTimezone(
    iso,
    {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    },
    timeZone,
    '-',
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
