import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Grid,
  IconButton,
  Menu,
  MenuItem,
  Pagination,
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
import { useShallow } from 'zustand/react/shallow';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BoltIcon from '@mui/icons-material/Bolt';
import RefreshIcon from '@mui/icons-material/Refresh';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import MonitorHeartOutlinedIcon from '@mui/icons-material/MonitorHeartOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import WifiOutlinedIcon from '@mui/icons-material/WifiOutlined';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import TuneIcon from '@mui/icons-material/Tune';
import SyncIcon from '@mui/icons-material/Sync';
import RouterOutlinedIcon from '@mui/icons-material/RouterOutlined';
import { TruncatedText } from '../../components/common/TruncatedText';
import { NocDialog } from '../../components/dialogs/NocDialog';
import { NocToast } from '../../components/feedback/NocToast';
import { useNavigate, useParams } from 'react-router-dom';
import {
  findAliasForDevice,
  resolveConnectedHostsFromVParams,
  resolveDhcpConfigFromVParams,
  resolveTelemetryFromVParams,
  resolveVirtualParamKeyForPath,
  resolveWanInstanceFromVParams,
  resolveWlanInstanceFromVParams,
  useAcsStore,
} from '../../stores/acsStore';
import {
  classifyRxPowerBucket,
  classifyTemperatureBucket,
  computeDeviceStatus,
  formatDateTime,
  formatDuration,
  formatRelativeTime,
} from '../../utils/classification';
import { DeviceStatusChip, InformEventChip, TaskStatusChip } from '../../components/status/StatusChip';
import { DeviceDetailSkeleton, pageEnterSx, usePageSkeleton } from '../../components/skeletons/PageSkeletons';
import {
  deviceCredentialsSchema,
  dhcpServerSchema,
  formatZodError,
  setParameterSchema,
  wanConnectionSchema,
  wifiConfigSchema,
} from '../../validation/schemas';
import type {
  Device,
  DhcpServerConfig,
  SummonGroup,
  TaskRecord,
  VirtualParameterMapping,
  WANConnection,
  WanPortBindings,
  WiFiRadio,
} from '../../types';

const VIRTUAL_PARAM_SLOTS: Array<{ key: keyof VirtualParameterMapping; label: string; canonicalKey: string }> = [
  { key: 'serialNumber', label: 'Serial Number', canonicalKey: 'device.serial_number' },
  { key: 'manufacturer', label: 'Manufacturer', canonicalKey: 'device.manufacturer' },
  { key: 'oui', label: 'Manufacturer OUI', canonicalKey: 'device.oui' },
  { key: 'productClass', label: 'Product Class', canonicalKey: 'device.product_class' },
  { key: 'modelName', label: 'Model Name', canonicalKey: 'device.model_name' },
  { key: 'hardwareVersion', label: 'Hardware Version', canonicalKey: 'device.hardware_version' },
  { key: 'softwareVersion', label: 'Software Version', canonicalKey: 'device.software_version' },
  { key: 'rxPower', label: 'RX Power', canonicalKey: 'optical.rx_power_dbm' },
  { key: 'temperature', label: 'Temperature', canonicalKey: 'device.temperature_celsius' },
  { key: 'uptime', label: 'Uptime', canonicalKey: 'device.uptime_seconds' },
  { key: 'connectionRequestUrl', label: 'Connection Request URL', canonicalKey: 'management.connection_request_url' },
  { key: 'periodicInformInterval', label: 'Periodic Inform Interval', canonicalKey: 'management.periodic_inform_interval' },
  { key: 'wanRoot', label: 'WAN Root Object', canonicalKey: 'wan.root' },
  { key: 'wanExternalIp', label: 'WAN External IP', canonicalKey: 'wan.external_ip' },
  { key: 'wanPppoeUsername', label: 'WAN PPPoE Username', canonicalKey: 'wan.pppoe_username' },
  { key: 'wanPppoePassword', label: 'WAN PPPoE Password', canonicalKey: 'wan.pppoe_password' },
  { key: 'wanVlanId', label: 'WAN VLAN ID', canonicalKey: 'wan.vlan_id' },
  { key: 'wanStatus', label: 'WAN Status', canonicalKey: 'wan.status' },
  { key: 'wanAddressingType', label: 'IPoE Addressing Mode', canonicalKey: 'wan.addressing_type' },
  { key: 'wanSubnetMask', label: 'IPoE Subnet Mask', canonicalKey: 'wan.subnet_mask' },
  { key: 'wanGateway', label: 'IPoE Default Gateway', canonicalKey: 'wan.gateway' },
  { key: 'wanDnsServers', label: 'IPoE DNS Servers', canonicalKey: 'wan.dns_servers' },
  { key: 'wanConnectionType', label: 'WAN Connection Type', canonicalKey: 'wan.connection_type' },
  { key: 'wanServiceList', label: 'WAN Service List', canonicalKey: 'wan.service_list' },
  { key: 'wanNatEnabled', label: 'WAN NAT Enable', canonicalKey: 'wan.nat_enabled' },
  { key: 'wanPortBindings', label: 'WAN Port Bindings', canonicalKey: 'wan.port_bindings' },
  { key: 'wlanRoot', label: 'WLAN Root Object', canonicalKey: 'wifi.root' },
  { key: 'wlanSsid', label: 'WLAN SSID', canonicalKey: 'wifi.ssid' },
  { key: 'wlanPassphrase', label: 'WLAN Password', canonicalKey: 'wifi.security_key' },
  { key: 'wlanEnabled', label: 'WLAN Enable', canonicalKey: 'wifi.enabled' },
  { key: 'wlanChannel', label: 'WLAN Channel', canonicalKey: 'wifi.channel' },
  { key: 'wlanSecurityMode', label: 'WLAN Security Mode', canonicalKey: 'wifi.security_mode' },
  { key: 'wlanBand', label: 'WLAN Frequency Band', canonicalKey: 'wifi.band' },
  { key: 'wlanAutoChannel', label: 'WLAN Auto Channel', canonicalKey: 'wifi.auto_channel' },
  { key: 'connectedHostsRoot', label: 'Connected Hosts Root', canonicalKey: 'hosts.root' },
  { key: 'hostName', label: 'Host Hostname', canonicalKey: 'hosts.hostname' },
  { key: 'hostMac', label: 'Host MAC Address', canonicalKey: 'hosts.mac_address' },
  { key: 'hostIp', label: 'Host IP Address', canonicalKey: 'hosts.ip_address' },
  { key: 'lanIp', label: 'LAN IP Address', canonicalKey: 'lan.ip_address' },
  { key: 'lanSubnetMask', label: 'LAN Subnet Mask', canonicalKey: 'lan.subnet_mask' },
  { key: 'lanDhcpEnable', label: 'DHCP Server Enable', canonicalKey: 'lan.dhcp_server_enabled' },
  { key: 'lanDhcpOption125Enable', label: 'DHCP Option 125 Enable', canonicalKey: 'lan.dhcp_option125_enabled' },
  { key: 'lanDhcpLeaseTime', label: 'DHCP Lease Time', canonicalKey: 'lan.dhcp_lease_time' },
  { key: 'lanDhcpStartIp', label: 'DHCP Start IP', canonicalKey: 'lan.dhcp_min_address' },
  { key: 'lanDhcpEndIp', label: 'DHCP End IP', canonicalKey: 'lan.dhcp_max_address' },
  { key: 'lanDhcpAssignIspDns', label: 'DHCP Assign ISP DNS', canonicalKey: 'lan.dhcp_assign_isp_dns' },
  { key: 'lanDhcpDnsServers', label: 'DHCP DNS Servers', canonicalKey: 'lan.dhcp_dns_servers' },
  { key: 'adminUsername', label: 'Modem Admin Username', canonicalKey: 'credentials.admin_username' },
  { key: 'adminPassword', label: 'Modem Admin Password', canonicalKey: 'credentials.admin_password' },
  { key: 'userUsername', label: 'Modem User Username', canonicalKey: 'credentials.user_username' },
  { key: 'userPassword', label: 'Modem User Password', canonicalKey: 'credentials.user_password' },
];

const VLAN_TYPE_LABELS: Record<'untag' | 'transparent' | 'tag', string> = {
  untag: 'Untag',
  transparent: 'Transparent',
  tag: 'Tag',
};

const DHCP_LEASE_TIME_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 60, label: 'One Minute (60s)' },
  { value: 3600, label: 'An Hour (3600s)' },
  { value: 86400, label: 'One Day (86400s)' },
  { value: 604800, label: 'A Week (604800s)' },
];

const PORT_BINDING_KEYS: Array<{ key: keyof WanPortBindings; label: string }> = [
  { key: 'l1', label: 'L1' },
  { key: 'l2', label: 'L2' },
  { key: 'l3', label: 'L3' },
  { key: 'l4', label: 'L4' },
  { key: 's1', label: 'S1' },
  { key: 's2', label: 'S2' },
  { key: 's3', label: 'S3' },
  { key: 's4', label: 'S4' },
];

const WAN_SERVICE_OPTIONS = ['INTERNET', 'TR069', 'TR069, INTERNET', 'VOIP', 'IPTV', 'OTHER'] as const;

const WIFI_24_CHANNEL_OPTIONS = ['Auto', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13'];
const WIFI_5_CHANNEL_OPTIONS = ['Auto', '36', '40', '44', '48', '149', '153', '157', '161', '165'];
const WIFI_SECURITY_OPTIONS = ['None', 'TKIP', 'TKIP+AES', 'AES'] as const;

function detectBridgeSupported(device: Device): boolean {
  if ((device.wanConnections ?? []).some((w) => w.connectionType === 'Bridge')) return true;
  return device.parameters.some(
    (p) =>
      (p.value && /Bridged|Bridge/i.test(p.value)) ||
      /BridgeEnable|Layer2Bridging/i.test(p.path),
  );
}

function getChannelOptions(band: WiFiRadio['band'], current?: string, ontPossibleChannels?: string[]): string[] {
  const base =
    ontPossibleChannels && ontPossibleChannels.length > 0
      ? ['Auto', ...ontPossibleChannels]
      : band === '5 GHz'
        ? [...WIFI_5_CHANNEL_OPTIONS]
        : [...WIFI_24_CHANNEL_OPTIONS];
  const cur = current?.trim();
  if (cur && !base.includes(cur)) {
    base.push(cur);
  }
  return base;
}

function getUsedPortsByOtherWans(
  wans: WANConnection[] | null | undefined,
  excludeInstanceIndex?: number,
): Map<keyof WanPortBindings, number> {
  const used = new Map<keyof WanPortBindings, number>();
  for (const w of wans ?? []) {
    if (excludeInstanceIndex !== undefined && w.instanceIndex === excludeInstanceIndex) continue;
    for (const [k, v] of Object.entries(w.portBindings ?? {})) {
      if (v) used.set(k as keyof WanPortBindings, w.instanceIndex);
    }
  }
  return used;
}

const ALL_SUMMON_GROUPS: SummonGroup[] = ['vparams'];

const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

const AUTO_FIT_TABLE_SX = {
  tableLayout: 'auto',
  width: 'max-content',
  minWidth: '100%',
  '& .MuiTableCell-head, & .MuiTableCell-body': {
    whiteSpace: 'nowrap',
    px: 1.5,
    overflow: 'visible',
    textOverflow: 'clip',
  },
} as const;

function formatWanLabel(name: string, instanceIndex: number): string {
  const clean = name.trim();
  if (clean) return clean;
  return `WAN ${instanceIndex}`;
}

const TRANSITION_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const inlineInputSx = {
  '& .MuiOutlinedInput-root': {
    height: 28,
    fontSize: '0.78rem',
    bgcolor: 'background.paper',
    transition: `border-color 220ms ${TRANSITION_EASE}, box-shadow 220ms ${TRANSITION_EASE}`,
  },
} as const;

function InlineMorphCell({
  editing,
  view,
  edit,
}: {
  editing: boolean;
  view: React.ReactNode;
  edit: React.ReactNode;
}) {
  return (
    <Box sx={{ display: 'inline-grid', alignItems: 'center', width: '100%' }}>
      <Box
        aria-hidden={editing}
        sx={{
          gridArea: '1 / 1',
          opacity: editing ? 0 : 1,
          transform: editing ? 'translateY(-6px) scale(0.97)' : 'translateY(0) scale(1)',
          pointerEvents: editing ? 'none' : 'auto',
          visibility: editing ? 'hidden' : 'visible',
          transition: `opacity 260ms ${TRANSITION_EASE}, transform 300ms ${TRANSITION_EASE}, visibility 260ms`,
        }}
      >
        {view}
      </Box>
      <Box
        aria-hidden={!editing}
        sx={{
          gridArea: '1 / 1',
          opacity: editing ? 1 : 0,
          transform: editing ? 'translateY(0) scale(1)' : 'translateY(6px) scale(0.97)',
          pointerEvents: editing ? 'auto' : 'none',
          visibility: editing ? 'visible' : 'hidden',
          transition: `opacity 280ms ${TRANSITION_EASE}, transform 320ms ${TRANSITION_EASE}, visibility 280ms`,
        }}
      >
        {edit}
      </Box>
    </Box>
  );
}

function InlineActionMorph({
  mode,
  viewAction,
  editActions,
  savingIndicator,
}: {
  mode: 'view' | 'edit' | 'saving';
  viewAction: React.ReactNode;
  editActions: React.ReactNode;
  savingIndicator: React.ReactNode;
}) {
  const layerSx = (active: boolean, inactiveTransform: string) => ({
    gridArea: '1 / 1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    opacity: active ? 1 : 0,
    transform: active ? 'scale(1) translateX(0)' : inactiveTransform,
    pointerEvents: active ? 'auto' : 'none',
    visibility: active ? 'visible' : 'hidden',
    transition: `opacity 260ms ${TRANSITION_EASE}, transform 300ms ${TRANSITION_EASE}, visibility 260ms`,
  });

  return (
    <Box sx={{ display: 'inline-grid', alignItems: 'center', width: 60, height: 28 }}>
      <Box aria-hidden={mode !== 'view'} sx={layerSx(mode === 'view', 'scale(0.8)')}>
        {viewAction}
      </Box>
      <Box aria-hidden={mode !== 'edit'} sx={layerSx(mode === 'edit', 'scale(0.86) translateX(8px)')}>
        {editActions}
      </Box>
      <Box aria-hidden={mode !== 'saving'} sx={layerSx(mode === 'saving', 'scale(0.6)')}>
        {savingIndicator}
      </Box>
    </Box>
  );
}

export function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { loading: pageLoading, trigger: triggerPageSkeleton } = usePageSkeleton(id);

  const device = useAcsStore((s) => (id ? s.devices.find((d) => d.id === id) : undefined));
  const deviceDetailLoadingId = useAcsStore((s) => s.deviceDetailLoadingId);
  const backendRefreshing = useAcsStore((s) => s.backendRefreshing);
  const taskAliasMap = useAcsStore((s) => s.taskAliasMap);
  const deviceTasks = useAcsStore(useShallow((s) => (id ? s.tasks.filter((t) => t.deviceId === id) : [])));
  const aliases = useAcsStore((s) => s.aliases);
  const settings = useAcsStore((s) => s.settings);
  const hasPermission = useAcsStore((s) => s.hasPermission);
  const triggerSummon = useAcsStore((s) => s.triggerSummon);
  const triggerParamRefresh = useAcsStore((s) => s.triggerParamRefresh);
  const refreshBackendData = useAcsStore((s) => s.refreshBackendData);
  const loadDeviceDetailFromBackend = useAcsStore((s) => s.loadDeviceDetailFromBackend);
  const apiMode = useAcsStore((s) => s.apiMode);
  const backendAuthRequired = useAcsStore((s) => s.backendAuthRequired);
  const triggerReboot = useAcsStore((s) => s.triggerReboot);
  const triggerFactoryReset = useAcsStore((s) => s.triggerFactoryReset);
  const softDeleteDevice = useAcsStore((s) => s.softDeleteDevice);
  const revealSecret = useAcsStore((s) => s.revealSecret);
  const updateDeviceCredentials = useAcsStore((s) => s.updateDeviceCredentials);
  const updateWanConnection = useAcsStore((s) => s.updateWanConnection);
  const addWanConnection = useAcsStore((s) => s.addWanConnection);
  const updateWifiConfig = useAcsStore((s) => s.updateWifiConfig);
  const addWifiRadio = useAcsStore((s) => s.addWifiRadio);
  const updateDhcpConfig = useAcsStore((s) => s.updateDhcpConfig);
  const setDeviceParameter = useAcsStore((s) => s.setDeviceParameter);
  const assignVirtualParamFromDevice = useAcsStore((s) => s.assignVirtualParamFromDevice);

  const [liveSync, setLiveSync] = useState(true);

  useEffect(() => {
    if (!id || apiMode !== 'backend' || backendAuthRequired) return;
    void loadDeviceDetailFromBackend(id);
    if (!liveSync) return;
    const detailPoll = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadDeviceDetailFromBackend(id);
      }
    }, 25000);
    return () => window.clearInterval(detailPoll);
  }, [id, apiMode, backendAuthRequired, liveSync, loadDeviceDetailFromBackend]);

  // Dialog & Toast state
  const [toast, setToast] = useState<{ open: boolean; severity: 'success' | 'error' | 'info'; text: string }>({
    open: false,
    severity: 'info',
    text: '',
  });
  const showToast = (severity: 'success' | 'error' | 'info', text: string) => {
    setToast({ open: true, severity, text });
  };
  const watchedTaskIdRef = useRef<string | null>(null);
  const [refreshAnchor, setRefreshAnchor] = useState<HTMLElement | null>(null);
  const [rebootConfirmOpen, setRebootConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetSerialInput, setResetSerialInput] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Secret reveals
  const [revealedCredentials, setRevealedCredentials] = useState(false);
  const [revealedWanIndex, setRevealedWanIndex] = useState<number | null>(null);
  const [revealedWifiIndex, setRevealedWifiIndex] = useState<number | null>(null);

  // Edit modals & inline row editors
  const [credModalOpen, setCredModalOpen] = useState(false);
  const [credForm, setCredForm] = useState({ adminPassword: '', userPassword: '', connectionRequestPassword: '' });
  const [editingWanIndex, setEditingWanIndex] = useState<number | null>(null);
  const [savingWanIndex, setSavingWanIndex] = useState<number | null>(null);
  const [wanForm, setWanForm] = useState<{
    connectionType: WANConnection['connectionType'];
    addressingMode: 'DHCP' | 'Static';
    pppoeUsername: string;
    pppoePassword: string;
    vlanEnabled: boolean;
    vlanType: 'untag' | 'transparent' | 'tag';
    vlanId: string;
    wanIp: string;
    subnetMask: string;
    gateway: string;
    dns: string;
    serviceList: string;
    natEnabled: boolean;
    portBindings: WanPortBindings;
  }>({
    connectionType: 'PPPoE',
    addressingMode: 'DHCP',
    pppoeUsername: '',
    pppoePassword: '',
    vlanEnabled: true,
    vlanType: 'tag',
    vlanId: '',
    wanIp: '',
    subnetMask: '255.255.255.0',
    gateway: '',
    dns: '1.1.1.1, 8.8.8.8',
    serviceList: 'INTERNET',
    natEnabled: true,
    portBindings: {},
  });
  const [editingWifiIndex, setEditingWifiIndex] = useState<number | null>(null);
  const [savingWifiIndex, setSavingWifiIndex] = useState<number | null>(null);
  const [wifiForm, setWifiForm] = useState<{
    enabled: boolean;
    ssid: string;
    securityMode: string;
    band: WiFiRadio['band'];
    channel: string;
    passphrase: string;
  }>({
    enabled: true,
    ssid: '',
    securityMode: 'WPA2-PSK',
    band: '2.4 GHz',
    channel: 'Auto',
    passphrase: '',
  });
  const [addingWan, setAddingWan] = useState(false);
  const [savingNewWan, setSavingNewWan] = useState(false);
  const [newWanForm, setNewWanForm] = useState<{
    connectionType: WANConnection['connectionType'];
    addressingMode: 'DHCP' | 'Static';
    pppoeUsername: string;
    pppoePassword: string;
    vlanEnabled: boolean;
    vlanType: 'untag' | 'transparent' | 'tag';
    vlanId: string;
    wanIp: string;
    subnetMask: string;
    gateway: string;
    dns: string;
    serviceList: string;
    natEnabled: boolean;
    portBindings: WanPortBindings;
  }>({
    connectionType: 'PPPoE',
    addressingMode: 'DHCP',
    pppoeUsername: '',
    pppoePassword: '',
    vlanEnabled: true,
    vlanType: 'tag',
    vlanId: '',
    wanIp: '',
    subnetMask: '',
    gateway: '',
    dns: '',
    serviceList: 'INTERNET',
    natEnabled: true,
    portBindings: {},
  });
  const [editingDhcp, setEditingDhcp] = useState(false);
  const [savingDhcp, setSavingDhcp] = useState(false);
  const [dhcpForm, setDhcpForm] = useState<DhcpServerConfig>({
    lanIp: '192.168.1.1',
    lanSubnetMask: '255.255.255.0',
    dhcpServerEnable: true,
    option125Enable: false,
    leaseTimeSeconds: 86400,
    startIp: '192.168.1.2',
    endIp: '192.168.1.254',
    assignIspDns: true,
    dns1: '',
    dns2: '',
    dns3: '',
  });
  const [addingWifi, setAddingWifi] = useState(false);
  const [savingNewWifi, setSavingNewWifi] = useState(false);
  const [newWifiForm, setNewWifiForm] = useState<{
    enabled: boolean;
    ssid: string;
    securityMode: string;
    band: WiFiRadio['band'];
    channel: string;
    passphrase: string;
  }>({
    enabled: true,
    ssid: '',
    securityMode: 'WPA2-PSK',
    band: '2.4 GHz',
    channel: 'Auto',
    passphrase: '',
  });
  const [editingParamPath, setEditingParamPath] = useState<string | null>(null);
  const [savingParamPath, setSavingParamPath] = useState<string | null>(null);
  const [inlineParamValue, setInlineParamValue] = useState('');
  const [copiedParamPath, setCopiedParamPath] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskRecord | null>(null);
  const [retainedTask, setRetainedTask] = useState<TaskRecord | null>(null);

  useEffect(() => {
    if (selectedTask) setRetainedTask(selectedTask);
  }, [selectedTask]);

  useEffect(() => () => {
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
  }, []);

  // Filters
  const [paramSearch, setParamSearch] = useState('');
  const [paramPage, setParamPage] = useState(1);
  const PARAM_PAGE_SIZE = 50;
  const [vpMapMenu, setVpMapMenu] = useState<{ anchor: HTMLElement; path: string } | null>(null);

  useEffect(() => {
    setParamPage(1);
  }, [id, paramSearch]);

  const activeTask = deviceTasks.find(
    (t) =>
      t.status === 'pending' ||
      t.status === 'queued' ||
      t.status === 'waiting_for_device' ||
      t.status === 'executing',
  );
  const isSummoning = activeTask?.taskType === 'summon' || activeTask?.taskType === 'refresh_params';

  // Poll device detail while a watched Summon task is active so completion toast fires promptly.
  useEffect(() => {
    if (!isSummoning || !id || apiMode !== 'backend') return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadDeviceDetailFromBackend(id);
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [isSummoning, id, apiMode, loadDeviceDetailFromBackend]);

  useEffect(() => {
    const idToWatch = watchedTaskIdRef.current;
    if (!idToWatch) return;
    const resolvedId = taskAliasMap[idToWatch] ?? idToWatch;
    const t = deviceTasks.find((item) => item.id === resolvedId) ?? deviceTasks.find((item) => item.id === idToWatch);
    if (!t) return;
    if (t.status === 'completed') {
      watchedTaskIdRef.current = null;
      setSavingWanIndex(null);
      setSavingWifiIndex(null);
      setEditingWanIndex(null);
      setEditingWifiIndex(null);
      setSavingNewWan(false);
      setSavingNewWifi(false);
      setAddingWan(false);
      setAddingWifi(false);
      setSavingDhcp(false);
      setEditingDhcp(false);
      setSavingParamPath(null);
      setEditingParamPath(null);
      showToast('success', t.summary || `Task ${t.taskType} completed.`);
    } else if (t.status === 'failed' || t.status === 'timeout') {
      watchedTaskIdRef.current = null;
      setSavingWanIndex(null);
      setSavingWifiIndex(null);
      setSavingNewWan(false);
      setSavingNewWifi(false);
      setSavingDhcp(false);
      setSavingParamPath(null);
      showToast('error', t.summary || `Task ${t.taskType} failed.`);
    }
  }, [deviceTasks, taskAliasMap]);

  const isAnyInlineSaving =
    savingWanIndex !== null ||
    savingNewWan ||
    savingWifiIndex !== null ||
    savingNewWifi ||
    savingDhcp ||
    Boolean(savingParamPath);

  // Poll device detail rapidly while an inline WAN/WLAN/parameter save is running,
  // and cleanly handle CPEs whose Connection Request port is firewalled (waiting for Periodic Inform).
  useEffect(() => {
    if (!isAnyInlineSaving || !id) return;
    const poll = window.setInterval(() => {
      if (apiMode === 'backend') {
        void loadDeviceDetailFromBackend(id);
      }
    }, 2000);
    const timer = window.setTimeout(() => {
      const idToWatch = watchedTaskIdRef.current;
      const state = useAcsStore.getState();
      const resolvedId = idToWatch ? (state.taskAliasMap[idToWatch] ?? idToWatch) : null;
      const currentTask = resolvedId ? state.tasks.find((item) => item.id === resolvedId) : undefined;
      watchedTaskIdRef.current = null;
      setSavingWanIndex(null);
      setSavingWifiIndex(null);
      setSavingNewWan(false);
      setSavingNewWifi(false);
      setSavingDhcp(false);
      setSavingParamPath(null);
      if (currentTask && (currentTask.status === 'queued' || currentTask.status === 'waiting_for_device')) {
        setEditingWanIndex(null);
        setEditingWifiIndex(null);
        setAddingWan(false);
        setAddingWifi(false);
        setEditingDhcp(false);
        setEditingParamPath(null);
        showToast(
          'info',
          'Perubahan masuk antrean ke ONT — akan diterapkan otomatis saat ONT terhubung / Periodic Inform berikutnya.',
        );
      } else {
        showToast('error', 'ONT tidak merespons (offline / Connection Request timeout). Silakan cek koneksi ONU.');
      }
    }, 18000);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(timer);
    };
  }, [isAnyInlineSaving, id, apiMode, loadDeviceDetailFromBackend]);

  const matchedAlias = useMemo(
    () => (device ? findAliasForDevice(device, aliases) : undefined),
    [device, aliases],
  );

  const filteredParams = useMemo(() => {
    if (!device) return [];
    const q = paramSearch.trim().toLowerCase();
    if (!q) return device.parameters;
    return device.parameters.filter((p) => {
      const vpKey = p.canonicalKey || resolveVirtualParamKeyForPath(p.path, matchedAlias) || '';
      return p.path.toLowerCase().includes(q) || vpKey.toLowerCase().includes(q);
    });
  }, [device, paramSearch, matchedAlias]);

  const paramTotalPages = Math.max(1, Math.ceil(filteredParams.length / PARAM_PAGE_SIZE));
  const safeParamPage = Math.min(paramPage, paramTotalPages);
  const pagedParams = useMemo(() => {
    const start = (safeParamPage - 1) * PARAM_PAGE_SIZE;
    return filteredParams.slice(start, start + PARAM_PAGE_SIZE);
  }, [filteredParams, safeParamPage]);

  const threshold = settings.deviceStatus.onlineThresholdSeconds;
  const nowMs = useMemo(() => Date.now(), [device]);
  const computedLiveStatus = device
    ? computeDeviceStatus(device, threshold, nowMs, settings.deviceStatus.neverConnectedPolicy)
    : 'offline';

  const resolvedTelemetry = useMemo(
    () => (device ? resolveTelemetryFromVParams(device, matchedAlias) : null),
    [device, matchedAlias],
  );
  const resolvedHosts = useMemo(
    () => (device ? resolveConnectedHostsFromVParams(device, matchedAlias) : []),
    [device, matchedAlias],
  );
  const resolvedDhcp = useMemo(
    () => (device ? resolveDhcpConfigFromVParams(device, matchedAlias) : null),
    [device, matchedAlias],
  );

  const isFetchingDetail =
    (apiMode === 'backend' && (backendRefreshing || deviceDetailLoadingId === id)) || isSummoning;

  if (pageLoading || (apiMode === 'backend' && !device && deviceDetailLoadingId === id)) {
    return <DeviceDetailSkeleton />;
  }

  if (!device || !resolvedTelemetry) {
    return (
      <Box>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/devices')} sx={{ mb: 2 }}>
          Back to Devices
        </Button>
        <Alert severity="warning">Device not found or has been archived.</Alert>
      </Box>
    );
  }

  const status = computedLiveStatus;
  const rxCategory = classifyRxPowerBucket(resolvedTelemetry.rxPowerDbm, settings.classification);
  const tempCategory = classifyTemperatureBucket(resolvedTelemetry.temperatureCelsius, settings.classification);

  const handleToggleCredentialsReveal = () => {
    if (revealedCredentials) {
      setRevealedCredentials(false);
      return;
    }
    if (!revealSecret(device.id, 'modem_credentials')) {
      showToast('error', 'Permission denied: devices.secrets.view required to reveal passwords.');
      return;
    }
    setRevealedCredentials(true);
  };

  const handleSummonAll = () => {
    if (!hasPermission('devices.summon')) {
      showToast('error', 'Permission denied: devices.summon required.');
      return;
    }
    const res = triggerSummon(device.id, ALL_SUMMON_GROUPS);
    watchedTaskIdRef.current = res.taskId;
  };

  const handleReboot = () => {
    const res = triggerReboot(device.id);
    setRebootConfirmOpen(false);
    if (res.ok && res.taskId) {
      watchedTaskIdRef.current = res.taskId;
      showToast('info', `Reboot task queued for ${device.serialNumber}.`);
    } else {
      showToast('error', res.error ?? 'Failed to queue reboot.');
    }
  };

  const handleFactoryReset = () => {
    const res = triggerFactoryReset(device.id);
    setResetConfirmOpen(false);
    setResetSerialInput('');
    if (res.ok && res.taskId) {
      watchedTaskIdRef.current = res.taskId;
      showToast('info', `Factory Reset task queued for ${device.serialNumber}.`);
    } else {
      showToast('error', res.error ?? 'Failed to queue factory reset.');
    }
  };

  const handleDelete = () => {
    const res = softDeleteDevice(device.id);
    setDeleteConfirmOpen(false);
    if (res.ok) {
      navigate('/devices');
    } else {
      showToast('error', res.error ?? 'Delete failed.');
    }
  };

  const cardSx = {
    borderRadius: '6px',
    borderColor: 'divider',
    bgcolor: 'background.paper',
  };

  const sectionHeader = (icon: React.ReactNode, title: string, right?: React.ReactNode) => (
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.75 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Box sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center' }}>{icon}</Box>
        <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: 'text.primary' }}>
          {title}
        </Typography>
      </Stack>
      {right}
    </Stack>
  );

  const actionIconBtnSx = {
    transition: `transform 180ms ${TRANSITION_EASE}, background-color 200ms ease, color 200ms ease`,
    '&:hover:not(:disabled)': { transform: 'scale(1.1)' },
    '&:active:not(:disabled)': { transform: 'scale(0.92)' },
  } as const;

  const editableRowSx = (isEditing: boolean, isSaving: boolean) => ({
    height: 46,
    bgcolor: isSaving ? 'var(--noc-accent-bg)' : isEditing ? 'var(--noc-subtle)' : 'transparent',
    boxShadow: isSaving
      ? 'inset 3px 0 0 var(--noc-accent)'
      : isEditing
        ? 'inset 3px 0 0 #38BDF8'
        : 'inset 0 0 0 transparent',
    transition: `background-color 300ms ${TRANSITION_EASE}, box-shadow 300ms ${TRANSITION_EASE}`,
    '& > td': {
      py: 0.75,
      transition: `opacity 260ms ease, background-color 300ms ${TRANSITION_EASE}`,
      opacity: isSaving ? 0.72 : 1,
    },
  });

  return (
    <Box sx={pageEnterSx}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <IconButton
            onClick={() => navigate('/devices')}
            size="small"
            sx={{
              width: 30,
              height: 30,
              borderRadius: '6px',
              border: '1px solid var(--noc-border)',
              bgcolor: 'background.paper',
              color: 'text.secondary',
              '&:hover': { bgcolor: 'var(--noc-hover)', color: 'text.primary' },
            }}
          >
            <ArrowBackIcon sx={{ fontSize: 16 }} />
          </IconButton>
          <Typography
            sx={{
              fontSize: '1.35rem',
              fontWeight: 700,
              color: 'text.primary',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
            }}
          >
            {device.serialNumber}
          </Typography>
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip
            title={
              liveSync
                ? 'Live Sync aktif (refresh tampilan detail tiap 25s tanpa auto-summon). Klik untuk pause.'
                : 'Live Sync dijeda. Klik untuk mengaktifkan kembali.'
            }
          >
            <Chip
              size="small"
              icon={<SyncIcon sx={{ fontSize: '14px !important' }} />}
              label={liveSync ? 'Live Sync: ON' : 'Live Sync: PAUSED'}
              color={liveSync ? 'success' : 'default'}
              variant="outlined"
              onClick={() => setLiveSync((v) => !v)}
              sx={{
                height: 34,
                borderRadius: '6px',
                fontSize: '0.76rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            />
          </Tooltip>
          <Button
            variant="contained"
            size="small"
            startIcon={
              isSummoning ? (
                <CircularProgress size={14} color="inherit" />
              ) : (
                <BoltIcon sx={{ fontSize: '15px !important' }} />
              )
            }
            disabled={!hasPermission('devices.summon') || isSummoning}
            onClick={handleSummonAll}
            sx={{
              height: 34,
              minWidth: 112,
              px: 1.75,
              fontSize: '0.8rem',
              fontWeight: 600,
              bgcolor: '#0284C7',
              color: '#FFFFFF',
              borderRadius: '6px',
              transition: `all 220ms ${TRANSITION_EASE}`,
              '&:hover': { bgcolor: '#0369A1' },
              '&.Mui-disabled': isSummoning
                ? { bgcolor: '#0284C7', color: '#FFFFFF', opacity: 0.88 }
                : undefined,
            }}
          >
            {isSummoning ? 'Summoning...' : 'Summon'}
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon sx={{ fontSize: '15px !important', color: 'text.secondary' }} />}
            onClick={(e) => setRefreshAnchor(e.currentTarget)}
            sx={{
              height: 34,
              px: 1.75,
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
      </Stack>

      <Menu anchorEl={refreshAnchor} open={Boolean(refreshAnchor)} onClose={() => setRefreshAnchor(null)}>
        <MenuItem
          onClick={() => {
            triggerPageSkeleton();
            refreshBackendData();
            setRefreshAnchor(null);
            showToast('success', 'Reloaded cached device data from backend database.');
          }}
        >
          Refresh UI / Database Data (No CPE traffic)
        </MenuItem>
        <MenuItem
          disabled={!hasPermission('devices.summon')}
          onClick={() => {
            const res = triggerParamRefresh(device.id);
            watchedTaskIdRef.current = res.taskId;
            setRefreshAnchor(null);
            showToast('info', `Parameter refresh queued for ${device.serialNumber}.`);
          }}
        >
          Request Device Parameter Refresh (Async RPC)
        </MenuItem>
      </Menu>

      {device.deletedAt && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          This device was soft-deleted/archived at {formatDateTime(device.deletedAt)}.
        </Alert>
      )}

      {(status === 'offline' || status === 'never_connected' || status === 'disabled' || device.simulatedUnreachable) && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <b>ONT tidak dapat dijangkau ({status.replace('_', ' ')}):</b> Perubahan WAN, WiFi, atau parameter langsung tidak dapat dikirim ke ONU saat perangkat offline.
        </Alert>
      )}

      {/* Top Row: Last Inform + 3 Device Health Metrics (4 Aligned Cards) */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6} lg={3}>
          <Tooltip title={`Last Inform: ${formatDateTime(device.lastInformAt)}`}>
            <Card sx={{ ...cardSx, height: '100%' }}>
              <CardContent sx={{ px: 2, py: 1.75, '&:last-child': { pb: 1.75 } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ minHeight: 22, mb: 0.75 }}>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: 'text.secondary' }}>
                    LAST INFORM
                  </Typography>
                  <Chip
                    size="small"
                    label={device.protocol}
                    variant="outlined"
                    sx={{ height: 20, fontSize: '0.68rem', color: 'var(--noc-text-muted)', borderColor: 'var(--noc-border-strong)' }}
                  />
                </Stack>
                <Typography sx={{ fontSize: '1.15rem', fontWeight: 700, color: 'text.primary', lineHeight: 1.25 }}>
                  {formatRelativeTime(device.lastInformAt)}
                </Typography>
              </CardContent>
            </Card>
          </Tooltip>
        </Grid>

        <Grid item xs={12} sm={6} lg={3}>
          <Tooltip
            title={`VParam: ${resolvedTelemetry.uptimePath ?? 'Fallback'} · State: ${resolvedTelemetry.uptimeReadState} · Updated: ${formatRelativeTime(device.uptimeFetchedAt)}`}
          >
            <Card sx={{ ...cardSx, height: '100%' }}>
              <CardContent sx={{ px: 2, py: 1.75, '&:last-child': { pb: 1.75 } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ minHeight: 22, mb: 0.75 }}>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: 'text.secondary' }}>
                    UPTIME
                  </Typography>
                  <MonitorHeartOutlinedIcon sx={{ fontSize: 17, color: 'text.secondary' }} />
                </Stack>
                <Typography sx={{ fontSize: '1.15rem', fontWeight: 700, color: 'text.primary', lineHeight: 1.25 }}>
                  {resolvedTelemetry.uptimeSeconds !== null ? formatDuration(resolvedTelemetry.uptimeSeconds) : 'N/A'}
                </Typography>
              </CardContent>
            </Card>
          </Tooltip>
        </Grid>

        <Grid item xs={12} sm={6} lg={3}>
          <Tooltip
            title={`VParam: ${resolvedTelemetry.rxPath ?? 'Fallback'} · State: ${resolvedTelemetry.rxReadState} · Updated: ${formatRelativeTime(device.rxPowerFetchedAt)}`}
          >
            <Card sx={{ ...cardSx, height: '100%' }}>
              <CardContent sx={{ px: 2, py: 1.75, '&:last-child': { pb: 1.75 } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ minHeight: 22, mb: 0.75 }}>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: 'text.secondary' }}>
                    OPTICAL RX POWER
                  </Typography>
                  {resolvedTelemetry.rxPowerDbm !== null && (
                    <Chip
                      size="small"
                      label={rxCategory}
                      color={rxCategory === 'Sangat Lemah' || rxCategory === 'Lemah' ? 'error' : rxCategory === 'Perlu Perhatian' ? 'warning' : 'success'}
                      sx={{ height: 20, fontSize: '0.68rem' }}
                    />
                  )}
                </Stack>
                <Typography sx={{ fontSize: '1.15rem', fontWeight: 700, color: 'text.primary', lineHeight: 1.25 }}>
                  {resolvedTelemetry.rxPowerDbm !== null ? `${resolvedTelemetry.rxPowerDbm.toFixed(2)} dBm` : 'N/A'}
                </Typography>
              </CardContent>
            </Card>
          </Tooltip>
        </Grid>

        <Grid item xs={12} sm={6} lg={3}>
          <Tooltip
            title={`VParam: ${resolvedTelemetry.temperaturePath ?? 'Fallback'} · State: ${resolvedTelemetry.tempReadState} · Updated: ${formatRelativeTime(device.temperatureFetchedAt)}`}
          >
            <Card sx={{ ...cardSx, height: '100%' }}>
              <CardContent sx={{ px: 2, py: 1.75, '&:last-child': { pb: 1.75 } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ minHeight: 22, mb: 0.75 }}>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: 'text.secondary' }}>
                    TEMPERATURE
                  </Typography>
                  {resolvedTelemetry.temperatureCelsius !== null && (
                    <Chip
                      size="small"
                      label={tempCategory}
                      color={tempCategory === 'Critical' ? 'error' : tempCategory === 'Warning' ? 'warning' : 'success'}
                      sx={{ height: 20, fontSize: '0.68rem' }}
                    />
                  )}
                </Stack>
                <Typography sx={{ fontSize: '1.15rem', fontWeight: 700, color: 'text.primary', lineHeight: 1.25 }}>
                  {resolvedTelemetry.temperatureCelsius !== null ? `${resolvedTelemetry.temperatureCelsius.toFixed(1)} °C` : 'N/A'}
                </Typography>
              </CardContent>
            </Card>
          </Tooltip>
        </Grid>
      </Grid>

      {/* Full-Width ONT Information */}
      <Card sx={{ ...cardSx, mb: 2 }}>
        <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
          {sectionHeader(<StorageOutlinedIcon sx={{ fontSize: 18 }} />, 'ONT Information')}
          <Grid container spacing={2}>
            <Grid item xs={6} sm={4} md={3}>
              <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mb: 0.35 }}>Status</Typography>
              <DeviceStatusChip status={status} />
            </Grid>
            {[
              ['Serial', resolvedTelemetry.serialNumber],
              ['OUI', resolvedTelemetry.oui || '-'],
              ['Manufacturer', resolvedTelemetry.manufacturerCanonical || '-'],
              ['Product Class', resolvedTelemetry.productClass || '-'],
              ['Model', resolvedTelemetry.modelName || '-'],
              ['Technology', device.technologyNormalized],
              ['HW Version', resolvedTelemetry.hardwareVersion || '-'],
              ['SW Version', resolvedTelemetry.softwareVersion || '-'],
              ['TR Source IP', device.trSourceIp ?? '-'],
              ['WAN IP', resolvedTelemetry.wanIp ?? '-'],
              ['Protocol', device.protocol],
              ['Last Inform', device.lastInformAt ? formatDateTime(device.lastInformAt) : 'Never'],
              ['Last Bootstrap (0 BOOTSTRAP)', device.lastBootstrapAt ? formatDateTime(device.lastBootstrapAt) : 'Never'],
              ['Last Boot (1 BOOT)', device.lastBootAt ? formatDateTime(device.lastBootAt) : 'Never'],
              ['Data Model', device.dataModelRoot],
            ].map(([label, val]) => (
              <Grid key={label} item xs={6} sm={4} md={3}>
                <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mb: 0.25 }}>{label}</Typography>
                <Typography
                  sx={{
                    fontFamily: MONO_FONT,
                    fontSize: '0.8rem',
                    color: 'text.primary',
                    fontWeight: 500,
                    wordBreak: 'break-word',
                  }}
                >
                  {val}
                </Typography>
              </Grid>
            ))}
            <Grid item xs={6} sm={4} md={3}>
              <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mb: 0.35 }}>
                Last Inform Event
              </Typography>
              {device.lastEventCode || device.events[0]?.eventCode ? (
                <InformEventChip eventCode={device.lastEventCode ?? device.events[0]?.eventCode} />
              ) : (
                <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.8rem', color: 'text.primary', fontWeight: 500 }}>
                  -
                </Typography>
              )}
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Full-Width Section: WAN Connections */}
      <Card sx={{ ...cardSx, mb: 2 }}>
        <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
          {sectionHeader(
            <HubOutlinedIcon sx={{ fontSize: 18 }} />,
            'WAN Connections',
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddIcon fontSize="small" />}
              disabled={!hasPermission('devices.parameters.write') || addingWan || savingNewWan}
              onClick={() => {
                setNewWanForm({
                  connectionType: 'PPPoE',
                  addressingMode: 'DHCP',
                  pppoeUsername: '',
                  pppoePassword: '',
                  vlanEnabled: true,
                  vlanType: 'tag',
                  vlanId: '',
                  wanIp: '',
                  subnetMask: '',
                  gateway: '',
                  dns: '',
                  serviceList: 'INTERNET',
                  natEnabled: true,
                  portBindings: {},
                });
                setAddingWan(true);
              }}
              sx={{
                height: 28,
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'none',
                borderRadius: '6px',
                borderColor: 'var(--noc-border-strong)',
                color: 'var(--noc-text-muted)',
                '&:hover': { borderColor: 'var(--noc-accent)', color: 'var(--noc-accent)', bgcolor: 'var(--noc-accent-hover-bg)' },
              }}
            >
              Add WAN
            </Button>,
          )}
          {(!device.wanConnections || device.wanConnections.length === 0) && !addingWan ? (
            isFetchingDetail ? (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 1 }}>
                <CircularProgress size={16} sx={{ color: 'var(--noc-accent)' }} />
                <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>
                  Mengambil data WAN Connections...
                </Typography>
              </Stack>
            ) : (
              <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>
                No WAN configuration data. Click Summon to fetch.
              </Typography>
            )
          ) : (() => {
            const bridgeSupported = detectBridgeSupported(device);
            const hasLinkModeOnDevice =
              (device.wanConnections ?? []).some((conn) => conn.vlanSupportsTransparent) ||
              device.parameters.some(
                (p) =>
                  /\.X_(?:CT-COM|CMCC)_(?:WANEponLinkConfig|WANGponLinkConfig)\.Mode$/i.test(p.path) ||
                  /\.X_CMCC_VLANMode$/i.test(p.path),
              );
            const addUsedPorts = getUsedPortsByOtherWans(device.wanConnections);
            const addWanTypeChoices: Array<WANConnection['connectionType']> = bridgeSupported
              ? ['PPPoE', 'IPoE', 'Bridge']
              : ['PPPoE', 'IPoE'];
            const addVlanTypeChoices: Array<'untag' | 'transparent' | 'tag'> = hasLinkModeOnDevice
              ? ['untag', 'transparent', 'tag']
              : ['untag', 'tag'];
            return (
            <TableContainer sx={{ maxHeight: 380, overflow: 'auto' }}>
              <Table size="small" stickyHeader sx={AUTO_FIT_TABLE_SX}>
                <TableHead>
                  <TableRow>
                    <TableCell>Nama</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Service</TableCell>
                    <TableCell align="center">VLAN</TableCell>
                    <TableCell>VLAN Type</TableCell>
                    <TableCell>VLAN ID</TableCell>
                    <TableCell align="center">NAT</TableCell>
                    <TableCell>PPPoE Username</TableCell>
                    <TableCell>PPPoE Password</TableCell>
                    <TableCell>Mode</TableCell>
                    <TableCell>IP Address</TableCell>
                    <TableCell>Subnet</TableCell>
                    <TableCell>Gateway</TableCell>
                    <TableCell>DNS</TableCell>
                    {PORT_BINDING_KEYS.map((b) => (
                      <TableCell key={b.key} align="center" sx={{ px: '6px !important' }}>
                        {b.label}
                      </TableCell>
                    ))}
                    <TableCell align="right">Edit</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(device.wanConnections ?? []).map((w) => {
                    const isEditing = editingWanIndex === w.instanceIndex;
                    const isSaving = savingWanIndex === w.instanceIndex;
                    const wanRevealed = revealedWanIndex === w.instanceIndex;
                    const rowMode = isSaving ? 'saving' : isEditing ? 'edit' : 'view';
                    const editUsedPorts = getUsedPortsByOtherWans(device.wanConnections, w.instanceIndex);
                    const rowTypeChoices: Array<WANConnection['connectionType']> =
                      bridgeSupported || w.connectionType === 'Bridge'
                        ? ['PPPoE', 'IPoE', 'Bridge']
                        : ['PPPoE', 'IPoE'];
                    const wanService =
                      w.serviceList ?? (w.name.toUpperCase().includes('TR069') ? 'TR069' : 'INTERNET');
                    const serviceChoices = WAN_SERVICE_OPTIONS.includes(
                      wanService as (typeof WAN_SERVICE_OPTIONS)[number],
                    )
                      ? WAN_SERVICE_OPTIONS
                      : [...WAN_SERVICE_OPTIONS, wanService];
                    const wanNat = Boolean(w.natEnabled);
                    const wanBindings = w.portBindings ?? {};
                    const resolvedWan = resolveWanInstanceFromVParams(device, matchedAlias, w);
                    const wanStatus = resolvedWan.status;
                    const wanVlanEnabled = resolvedWan.vlanEnabled;
                    const wanVlan = resolvedWan.vlanId;
                    const wanVlanType: 'untag' | 'transparent' | 'tag' =
                      resolvedWan.vlanType ?? w.vlanType ?? (wanVlanEnabled ? 'tag' : 'untag');
                    const rowSupportsTransparent = Boolean(w.vlanSupportsTransparent ?? hasLinkModeOnDevice);
                    const rowVlanTypeChoices: Array<'untag' | 'transparent' | 'tag'> = rowSupportsTransparent
                      ? ['untag', 'transparent', 'tag']
                      : wanVlanType === 'transparent'
                        ? ['untag', 'transparent', 'tag']
                        : ['untag', 'tag'];
                    const wanUsername = resolvedWan.pppoeUsername;
                    const wanPassword = resolvedWan.pppoePassword;
                    const wanIpDisplay = resolvedWan.wanIp;
                    const wanAddressingMode = resolvedWan.addressingMode;
                    const wanSubnetMask = resolvedWan.subnetMask;
                    const wanGateway = resolvedWan.gateway;
                    const wanDns = resolvedWan.dns;
                    return (
                      <TableRow key={w.instanceIndex} sx={editableRowSx(isEditing, isSaving)}>
                        <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'text.primary', whiteSpace: 'nowrap' }}>
                          <Stack direction="row" spacing={0.75} alignItems="center">
                            <Tooltip title={`Instance #${w.instanceIndex} (${wanStatus})`}>
                              <span>{formatWanLabel(w.name, w.instanceIndex)}</span>
                            </Tooltip>
                            <Typography
                              component="span"
                              sx={{
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                color:
                                  wanStatus === 'Connected'
                                    ? 'success.main'
                                    : wanStatus === 'Connecting'
                                      ? 'warning.main'
                                      : 'error.main',
                              }}
                            >
                              • {wanStatus}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <InlineMorphCell
                            editing={isEditing}
                            view={w.connectionType}
                            edit={
                              <TextField
                                select
                                size="small"
                                disabled={isSaving}
                                value={isEditing ? wanForm.connectionType : w.connectionType}
                                onChange={(e) =>
                                  setWanForm((f) => ({
                                    ...f,
                                    connectionType: e.target.value as WANConnection['connectionType'],
                                  }))
                                }
                                sx={{ minWidth: 88, ...inlineInputSx }}
                              >
                                {rowTypeChoices.map((t) => (
                                  <MenuItem key={t} value={t} sx={{ fontSize: '0.8rem' }}>
                                    {t}
                                  </MenuItem>
                                ))}
                              </TextField>
                            }
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          <InlineMorphCell
                            editing={isEditing}
                            view={wanService}
                            edit={
                              <TextField
                                select
                                size="small"
                                disabled={isSaving}
                                value={isEditing ? wanForm.serviceList : wanService}
                                onChange={(e) => setWanForm((f) => ({ ...f, serviceList: e.target.value }))}
                                sx={{ minWidth: 120, ...inlineInputSx }}
                              >
                                {serviceChoices.map((svc) => (
                                  <MenuItem key={svc} value={svc} sx={{ fontSize: '0.8rem' }}>
                                    {svc}
                                  </MenuItem>
                                ))}
                              </TextField>
                            }
                          />
                        </TableCell>
                        <TableCell align="center" sx={{ px: 0.75 }}>
                          <InlineMorphCell
                            editing={isEditing}
                            view={
                              <Checkbox
                                size="small"
                                disabled
                                checked={wanVlanEnabled}
                                sx={{ p: 0.25 }}
                              />
                            }
                            edit={
                              <Checkbox
                                size="small"
                                disabled={isSaving}
                                checked={wanForm.vlanEnabled}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setWanForm((f) => ({
                                    ...f,
                                    vlanEnabled: checked,
                                    vlanType: checked ? 'tag' : f.vlanType === 'tag' ? 'untag' : f.vlanType,
                                    vlanId: checked ? (f.vlanId === '0' ? '' : f.vlanId) : '0',
                                  }));
                                }}
                                sx={{ p: 0.25 }}
                              />
                            }
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          <InlineMorphCell
                            editing={isEditing}
                            view={
                              <Chip
                                size="small"
                                label={VLAN_TYPE_LABELS[wanVlanType]}
                                sx={{
                                  height: 20,
                                  fontSize: '0.7rem',
                                  fontWeight: 600,
                                  bgcolor:
                                    wanVlanType === 'tag'
                                      ? 'rgba(2, 132, 199, 0.12)'
                                      : wanVlanType === 'transparent'
                                        ? 'rgba(139, 92, 246, 0.12)'
                                        : 'rgba(100, 116, 139, 0.12)',
                                  color:
                                    wanVlanType === 'tag'
                                      ? '#0284C7'
                                      : wanVlanType === 'transparent'
                                        ? '#7C3AED'
                                        : '#64748B',
                                }}
                              />
                            }
                            edit={
                              <TextField
                                select
                                size="small"
                                disabled={isSaving}
                                value={isEditing ? wanForm.vlanType : wanVlanType}
                                onChange={(e) => {
                                  const nextType = e.target.value as 'untag' | 'transparent' | 'tag';
                                  setWanForm((f) => ({
                                    ...f,
                                    vlanType: nextType,
                                    vlanEnabled: nextType === 'tag',
                                    vlanId: nextType === 'tag' ? (f.vlanId === '0' ? '' : f.vlanId) : '0',
                                  }));
                                }}
                                sx={{ minWidth: 108, ...inlineInputSx }}
                              >
                                {rowVlanTypeChoices.map((vt) => (
                                  <MenuItem key={vt} value={vt} sx={{ fontSize: '0.8rem' }}>
                                    {VLAN_TYPE_LABELS[vt]}
                                  </MenuItem>
                                ))}
                              </TextField>
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <InlineMorphCell
                            editing={isEditing}
                            view={wanVlanEnabled ? (wanVlan ?? '-') : (wanVlan ?? 0)}
                            edit={
                              <TextField
                                size="small"
                                type="number"
                                disabled={isSaving || !wanForm.vlanEnabled || wanForm.vlanType !== 'tag'}
                                value={isEditing ? wanForm.vlanId : (wanVlan !== undefined ? String(wanVlan) : '')}
                                onChange={(e) => setWanForm((f) => ({ ...f, vlanId: e.target.value }))}
                                placeholder={wanForm.vlanType === 'tag' && wanForm.vlanEnabled ? 'VLAN' : 'Disabled'}
                                sx={{ width: 76, ...inlineInputSx }}
                              />
                            }
                          />
                        </TableCell>
                        <TableCell align="center" sx={{ px: 0.75 }}>
                          <InlineMorphCell
                            editing={isEditing}
                            view={
                              <Typography
                                component="span"
                                sx={{
                                  fontSize: '0.78rem',
                                  fontWeight: 600,
                                  color: wanNat ? '#15803D' : '#64748B',
                                }}
                              >
                                {wanNat ? 'On' : 'Off'}
                              </Typography>
                            }
                            edit={
                              <Checkbox
                                size="small"
                                disabled={isSaving}
                                checked={isEditing ? wanForm.natEnabled : wanNat}
                                onChange={(e) => setWanForm((f) => ({ ...f, natEnabled: e.target.checked }))}
                                sx={{ p: 0.25 }}
                              />
                            }
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          <InlineMorphCell
                            editing={isEditing}
                            view={w.connectionType === 'PPPoE' ? (wanUsername || '-') : '-'}
                            edit={
                              wanForm.connectionType === 'PPPoE' ? (
                                <TextField
                                  size="small"
                                  disabled={isSaving}
                                  value={wanForm.pppoeUsername}
                                  onChange={(e) => setWanForm((f) => ({ ...f, pppoeUsername: e.target.value }))}
                                  placeholder="PPPoE username"
                                  sx={{ minWidth: 145, ...inlineInputSx }}
                                />
                              ) : (
                                <Typography component="span" sx={{ fontSize: '0.78rem', color: '#94A3B8' }}>-</Typography>
                              )
                            }
                          />
                        </TableCell>
                        <TableCell sx={{ fontFamily: MONO_FONT, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          <InlineMorphCell
                            editing={isEditing}
                            view={
                              w.connectionType === 'PPPoE' && wanPassword ? (
                                <Stack direction="row" alignItems="center" spacing={0.5}>
                                  <span>{wanRevealed ? wanPassword : '••••••••'}</span>
                                  <IconButton
                                    size="small"
                                    onClick={() => {
                                      if (wanRevealed) {
                                        setRevealedWanIndex(null);
                                        return;
                                      }
                                      if (!revealSecret(device.id, `wan_pppoe_${w.instanceIndex}`)) {
                                        showToast('error', 'Permission denied: devices.secrets.view required.');
                                        return;
                                      }
                                      setRevealedWanIndex(w.instanceIndex);
                                    }}
                                  >
                                    {wanRevealed ? (
                                      <VisibilityOffOutlinedIcon fontSize="inherit" />
                                    ) : (
                                      <VisibilityOutlinedIcon fontSize="inherit" />
                                    )}
                                  </IconButton>
                                </Stack>
                              ) : (
                                '-'
                              )
                            }
                            edit={
                              wanForm.connectionType === 'PPPoE' ? (
                                <TextField
                                  size="small"
                                  disabled={isSaving}
                                  value={wanForm.pppoePassword}
                                  onChange={(e) => setWanForm((f) => ({ ...f, pppoePassword: e.target.value }))}
                                  placeholder="PPP password"
                                  sx={{
                                    minWidth: 130,
                                    ...inlineInputSx,
                                    '& .MuiOutlinedInput-root': {
                                      ...inlineInputSx['& .MuiOutlinedInput-root'],
                                      fontFamily: MONO_FONT,
                                    },
                                  }}
                                />
                              ) : (
                                <Typography component="span" sx={{ fontSize: '0.78rem', color: '#94A3B8' }}>-</Typography>
                              )
                            }
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          <InlineMorphCell
                            editing={isEditing}
                            view={
                              w.connectionType === 'IPoE' ? (
                                <Chip
                                  size="small"
                                  label={wanAddressingMode === 'Static' ? 'Static' : 'DHCP'}
                                  variant="outlined"
                                  sx={{ height: 20, fontSize: '0.7rem' }}
                                />
                              ) : w.connectionType === 'PPPoE' ? (
                                'PPPoE'
                              ) : (
                                'Bridge'
                              )
                            }
                            edit={
                              wanForm.connectionType === 'IPoE' ? (
                                <TextField
                                  select
                                  size="small"
                                  disabled={isSaving}
                                  value={wanForm.addressingMode}
                                  onChange={(e) =>
                                    setWanForm((f) => ({
                                      ...f,
                                      addressingMode: e.target.value as 'DHCP' | 'Static',
                                    }))
                                  }
                                  sx={{ minWidth: 118, ...inlineInputSx }}
                                >
                                  <MenuItem value="DHCP" sx={{ fontSize: '0.8rem' }}>DHCP</MenuItem>
                                  <MenuItem value="Static" sx={{ fontSize: '0.8rem' }}>Static IP</MenuItem>
                                </TextField>
                              ) : (
                                <Typography component="span" sx={{ fontSize: '0.78rem', color: '#94A3B8' }}>
                                  {wanForm.connectionType}
                                </Typography>
                              )
                            }
                          />
                        </TableCell>
                        <TableCell sx={{ fontFamily: MONO_FONT, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          {isEditing && wanForm.connectionType === 'IPoE' && wanForm.addressingMode === 'Static' ? (
                            <TextField
                              size="small"
                              disabled={isSaving}
                              value={wanForm.wanIp}
                              onChange={(e) => setWanForm((f) => ({ ...f, wanIp: e.target.value }))}
                              placeholder="Static IP (e.g. 103.1.2.10)"
                              sx={{ minWidth: 135, ...inlineInputSx }}
                            />
                          ) : (
                            <span>{wanIpDisplay || '-'}</span>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontFamily: MONO_FONT, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                          <InlineMorphCell
                            editing={isEditing}
                            view={
                              w.connectionType === 'IPoE'
                                ? wanAddressingMode === 'Static'
                                  ? wanSubnetMask || '255.255.255.0'
                                  : wanSubnetMask || 'Dynamic'
                                : '-'
                            }
                            edit={
                              wanForm.connectionType === 'IPoE' ? (
                                wanForm.addressingMode === 'Static' ? (
                                  <TextField
                                    size="small"
                                    disabled={isSaving}
                                    value={wanForm.subnetMask}
                                    onChange={(e) => setWanForm((f) => ({ ...f, subnetMask: e.target.value }))}
                                    placeholder="255.255.255.0"
                                    sx={{ minWidth: 125, ...inlineInputSx }}
                                  />
                                ) : (
                                  <Typography component="span" sx={{ fontSize: '0.76rem', color: '#64748B' }}>
                                    Auto (DHCP)
                                  </Typography>
                                )
                              ) : (
                                <Typography component="span" sx={{ fontSize: '0.78rem', color: '#94A3B8' }}>-</Typography>
                              )
                            }
                          />
                        </TableCell>
                        <TableCell sx={{ fontFamily: MONO_FONT, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                          <InlineMorphCell
                            editing={isEditing}
                            view={wanGateway && wanGateway !== '-' ? wanGateway : '-'}
                            edit={
                              wanForm.connectionType === 'IPoE' && wanForm.addressingMode === 'Static' ? (
                                <TextField
                                  size="small"
                                  disabled={isSaving}
                                  value={wanForm.gateway}
                                  onChange={(e) => setWanForm((f) => ({ ...f, gateway: e.target.value }))}
                                  placeholder="Gateway IP"
                                  sx={{ minWidth: 125, ...inlineInputSx }}
                                />
                              ) : (
                                <Typography component="span" sx={{ fontSize: '0.78rem', color: '#94A3B8' }}>
                                  {wanGateway || '-'}
                                </Typography>
                              )
                            }
                          />
                        </TableCell>
                        <TableCell sx={{ fontFamily: MONO_FONT, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                          <InlineMorphCell
                            editing={isEditing}
                            view={wanDns && wanDns !== '-' ? wanDns : '-'}
                            edit={
                              wanForm.connectionType === 'IPoE' && wanForm.addressingMode === 'Static' ? (
                                <TextField
                                  size="small"
                                  disabled={isSaving}
                                  value={wanForm.dns}
                                  onChange={(e) => setWanForm((f) => ({ ...f, dns: e.target.value }))}
                                  placeholder="1.1.1.1,8.8.8.8"
                                  sx={{ minWidth: 135, ...inlineInputSx }}
                                />
                              ) : (
                                <Typography component="span" sx={{ fontSize: '0.78rem', color: '#94A3B8' }}>
                                  {wanDns || '-'}
                                </Typography>
                              )
                            }
                          />
                        </TableCell>
                        {PORT_BINDING_KEYS.map((b) => {
                          const bound = Boolean(wanBindings[b.key]);
                          const checked = isEditing ? Boolean(wanForm.portBindings[b.key]) : bound;
                          const boundElsewhereWan = editUsedPorts.get(b.key);
                          const isBoundElsewhere = boundElsewhereWan !== undefined;
                          return (
                            <TableCell key={b.key} align="center" sx={{ px: 0.75 }}>
                              <InlineMorphCell
                                editing={isEditing}
                                view={
                                  bound ? (
                                    <CheckIcon sx={{ fontSize: 15, color: '#0284C7', display: 'block', mx: 'auto' }} />
                                  ) : (
                                    <Box component="span" sx={{ color: '#CBD5E1', fontSize: '0.8rem' }}>
                                      -
                                    </Box>
                                  )
                                }
                                edit={
                                  <Tooltip title={isBoundElsewhere ? `Already bound to WAN ${boundElsewhereWan}` : ''}>
                                    <span>
                                      <Checkbox
                                        size="small"
                                        disabled={isSaving || isBoundElsewhere}
                                        checked={isBoundElsewhere ? false : checked}
                                        onChange={(e) =>
                                          setWanForm((f) => ({
                                            ...f,
                                            portBindings: { ...f.portBindings, [b.key]: e.target.checked },
                                          }))
                                        }
                                        sx={{ p: 0.25 }}
                                      />
                                    </span>
                                  </Tooltip>
                                }
                              />
                            </TableCell>
                          );
                        })}
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          <InlineActionMorph
                            mode={rowMode}
                            viewAction={
                              <IconButton
                                size="small"
                                disabled={!hasPermission('devices.parameters.write')}
                                onClick={() => {
                                  setEditingWanIndex(w.instanceIndex);
                                  setWanForm({
                                    connectionType: w.connectionType,
                                    addressingMode: wanAddressingMode,
                                    pppoeUsername: wanUsername ?? '',
                                    pppoePassword: wanPassword ?? '',
                                    vlanEnabled: wanVlanType === 'tag' && wanVlanEnabled,
                                    vlanType: wanVlanType,
                                    vlanId: wanVlan !== undefined ? String(wanVlan) : wanVlanEnabled ? '' : '0',
                                    wanIp: wanIpDisplay && wanIpDisplay !== '-' ? wanIpDisplay : '',
                                    subnetMask: wanSubnetMask || '255.255.255.0',
                                    gateway: wanGateway && wanGateway !== '-' ? wanGateway : '',
                                    dns: wanDns || '1.1.1.1, 8.8.8.8',
                                    serviceList: wanService,
                                    natEnabled: wanNat,
                                    portBindings: { ...wanBindings },
                                  });
                                }}
                                sx={actionIconBtnSx}
                              >
                                <EditOutlinedIcon fontSize="small" />
                              </IconButton>
                            }
                            editActions={
                              <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                <Tooltip title="Save">
                                  <IconButton
                                    size="small"
                                    onClick={() => {
                                      if (status === 'never_connected' || status === 'disabled' || device.simulatedUnreachable) {
                                        showToast('error', `ONT tidak dapat dijangkau (${status.replace('_', ' ')}). Tidak dapat mengirim perubahan WAN.`);
                                        return;
                                      }
                                      const effectiveVlanEnabled = wanForm.vlanType === 'tag' && wanForm.vlanEnabled;
                                      const parsedVlan = effectiveVlanEnabled
                                        ? wanForm.vlanId.trim()
                                          ? Number(wanForm.vlanId)
                                          : null
                                        : 0;
                                      const wanValidation = wanConnectionSchema.safeParse({
                                        connectionType: wanForm.connectionType,
                                        addressingMode: wanForm.addressingMode,
                                        pppoeUsername: wanForm.pppoeUsername,
                                        pppoePassword: wanForm.pppoePassword,
                                        vlanEnabled: effectiveVlanEnabled,
                                        vlanType: wanForm.vlanType,
                                        vlanId: parsedVlan !== null && !Number.isNaN(parsedVlan) ? parsedVlan : null,
                                        wanIp: wanForm.wanIp,
                                        subnetMask: wanForm.subnetMask,
                                        gateway: wanForm.gateway,
                                        dns: wanForm.dns,
                                        serviceList: wanForm.serviceList,
                                        natEnabled: wanForm.natEnabled,
                                      });
                                      if (!wanValidation.success) {
                                        showToast('error', formatZodError(wanValidation.error));
                                        return;
                                      }
                                      const res = updateWanConnection(device.id, w.instanceIndex, {
                                        ...wanValidation.data,
                                        portBindings: wanForm.portBindings,
                                      });
                                      if (!res.ok) {
                                        showToast('error', res.error ?? 'Failed to update WAN');
                                        return;
                                      }
                                      setSavingWanIndex(w.instanceIndex);
                                      if (res.taskId) watchedTaskIdRef.current = res.taskId;
                                    }}
                                    sx={{ ...actionIconBtnSx, color: '#15803D' }}
                                  >
                                    <CheckIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Cancel">
                                  <IconButton
                                    size="small"
                                    onClick={() => setEditingWanIndex(null)}
                                    sx={{ ...actionIconBtnSx, color: '#64748B' }}
                                  >
                                    <CloseIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Stack>
                            }
                            savingIndicator={
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28 }}>
                                <CircularProgress size={16} sx={{ color: '#0284C7' }} />
                              </Box>
                            }
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {addingWan && (
                    <TableRow sx={editableRowSx(true, savingNewWan)}>
                      <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#0284C7', whiteSpace: 'nowrap' }}>
                        Auto (ONT)
                      </TableCell>
                      <TableCell>
                        <TextField
                          select
                          size="small"
                          disabled={savingNewWan}
                          value={newWanForm.connectionType}
                          onChange={(e) =>
                            setNewWanForm((f) => ({
                              ...f,
                              connectionType: e.target.value as WANConnection['connectionType'],
                            }))
                          }
                          sx={{ minWidth: 88, ...inlineInputSx }}
                        >
                          {addWanTypeChoices.map((t) => (
                            <MenuItem key={t} value={t} sx={{ fontSize: '0.8rem' }}>
                              {t}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell>
                        <TextField
                          select
                          size="small"
                          disabled={savingNewWan}
                          value={newWanForm.serviceList}
                          onChange={(e) => setNewWanForm((f) => ({ ...f, serviceList: e.target.value }))}
                          sx={{ minWidth: 120, ...inlineInputSx }}
                        >
                          {WAN_SERVICE_OPTIONS.map((svc) => (
                            <MenuItem key={svc} value={svc} sx={{ fontSize: '0.8rem' }}>
                              {svc}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell align="center" sx={{ px: 0.75 }}>
                        <Checkbox
                          size="small"
                          disabled={savingNewWan}
                          checked={newWanForm.vlanEnabled}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setNewWanForm((f) => ({
                              ...f,
                              vlanEnabled: checked,
                              vlanType: checked ? 'tag' : f.vlanType === 'tag' ? 'untag' : f.vlanType,
                              vlanId: checked ? (f.vlanId === '0' ? '' : f.vlanId) : '0',
                            }));
                          }}
                          sx={{ p: 0.25 }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          select
                          size="small"
                          disabled={savingNewWan}
                          value={newWanForm.vlanType}
                          onChange={(e) => {
                            const nextType = e.target.value as 'untag' | 'transparent' | 'tag';
                            setNewWanForm((f) => ({
                              ...f,
                              vlanType: nextType,
                              vlanEnabled: nextType === 'tag',
                              vlanId: nextType === 'tag' ? (f.vlanId === '0' ? '' : f.vlanId) : '0',
                            }));
                          }}
                          sx={{ minWidth: 108, ...inlineInputSx }}
                        >
                          {addVlanTypeChoices.map((vt) => (
                            <MenuItem key={vt} value={vt} sx={{ fontSize: '0.8rem' }}>
                              {VLAN_TYPE_LABELS[vt]}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          type="number"
                          disabled={savingNewWan || !newWanForm.vlanEnabled || newWanForm.vlanType !== 'tag'}
                          value={newWanForm.vlanId}
                          onChange={(e) => setNewWanForm((f) => ({ ...f, vlanId: e.target.value }))}
                          placeholder={newWanForm.vlanType === 'tag' && newWanForm.vlanEnabled ? 'VLAN' : 'Disabled'}
                          sx={{ width: 76, ...inlineInputSx }}
                        />
                      </TableCell>
                      <TableCell align="center" sx={{ px: 0.75 }}>
                        <Checkbox
                          size="small"
                          disabled={savingNewWan}
                          checked={newWanForm.natEnabled}
                          onChange={(e) => setNewWanForm((f) => ({ ...f, natEnabled: e.target.checked }))}
                          sx={{ p: 0.25 }}
                        />
                      </TableCell>
                      <TableCell>
                        {newWanForm.connectionType === 'PPPoE' ? (
                          <TextField
                            size="small"
                            disabled={savingNewWan}
                            value={newWanForm.pppoeUsername}
                            onChange={(e) => setNewWanForm((f) => ({ ...f, pppoeUsername: e.target.value }))}
                            placeholder="PPPoE username"
                            sx={{ minWidth: 145, ...inlineInputSx }}
                          />
                        ) : (
                          <Typography component="span" sx={{ fontSize: '0.78rem', color: '#94A3B8' }}>-</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {newWanForm.connectionType === 'PPPoE' ? (
                          <TextField
                            size="small"
                            disabled={savingNewWan}
                            value={newWanForm.pppoePassword}
                            onChange={(e) => setNewWanForm((f) => ({ ...f, pppoePassword: e.target.value }))}
                            placeholder="PPP password"
                            sx={{
                              minWidth: 130,
                              ...inlineInputSx,
                              '& .MuiOutlinedInput-root': {
                                ...inlineInputSx['& .MuiOutlinedInput-root'],
                                fontFamily: MONO_FONT,
                              },
                            }}
                          />
                        ) : (
                          <Typography component="span" sx={{ fontSize: '0.78rem', color: '#94A3B8' }}>-</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {newWanForm.connectionType === 'IPoE' ? (
                          <TextField
                            select
                            size="small"
                            disabled={savingNewWan}
                            value={newWanForm.addressingMode}
                            onChange={(e) =>
                              setNewWanForm((f) => ({
                                ...f,
                                addressingMode: e.target.value as 'DHCP' | 'Static',
                              }))
                            }
                            sx={{ minWidth: 118, ...inlineInputSx }}
                          >
                            <MenuItem value="DHCP" sx={{ fontSize: '0.8rem' }}>DHCP</MenuItem>
                            <MenuItem value="Static" sx={{ fontSize: '0.8rem' }}>Static IP</MenuItem>
                          </TextField>
                        ) : (
                          <Typography component="span" sx={{ fontSize: '0.78rem', color: '#94A3B8' }}>
                            {newWanForm.connectionType}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ fontFamily: MONO_FONT, fontSize: '0.78rem', color: '#94A3B8', whiteSpace: 'nowrap' }}>
                        {newWanForm.connectionType === 'IPoE' && newWanForm.addressingMode === 'Static' ? (
                          <TextField
                            size="small"
                            disabled={savingNewWan}
                            value={newWanForm.wanIp}
                            onChange={(e) => setNewWanForm((f) => ({ ...f, wanIp: e.target.value }))}
                            placeholder="Static IP"
                            sx={{ minWidth: 135, ...inlineInputSx }}
                          />
                        ) : newWanForm.connectionType === 'IPoE' ? (
                          'DHCP Auto'
                        ) : (
                          'Auto'
                        )}
                      </TableCell>
                      <TableCell>
                        {newWanForm.connectionType === 'IPoE' ? (
                          newWanForm.addressingMode === 'Static' ? (
                            <TextField
                              size="small"
                              disabled={savingNewWan}
                              value={newWanForm.subnetMask}
                              onChange={(e) => setNewWanForm((f) => ({ ...f, subnetMask: e.target.value }))}
                              placeholder="255.255.255.0"
                              sx={{ minWidth: 125, ...inlineInputSx }}
                            />
                          ) : (
                            <Typography component="span" sx={{ fontSize: '0.76rem', color: '#64748B' }}>
                              Auto (DHCP)
                            </Typography>
                          )
                        ) : (
                          <Typography component="span" sx={{ fontSize: '0.78rem', color: '#94A3B8' }}>-</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {newWanForm.connectionType === 'IPoE' && newWanForm.addressingMode === 'Static' ? (
                          <TextField
                            size="small"
                            disabled={savingNewWan}
                            value={newWanForm.gateway}
                            onChange={(e) => setNewWanForm((f) => ({ ...f, gateway: e.target.value }))}
                            placeholder="Gateway IP"
                            sx={{ minWidth: 125, ...inlineInputSx }}
                          />
                        ) : (
                          <Typography component="span" sx={{ fontSize: '0.78rem', color: '#94A3B8' }}>-</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {newWanForm.connectionType === 'IPoE' && newWanForm.addressingMode === 'Static' ? (
                          <TextField
                            size="small"
                            disabled={savingNewWan}
                            value={newWanForm.dns}
                            onChange={(e) => setNewWanForm((f) => ({ ...f, dns: e.target.value }))}
                            placeholder="1.1.1.1,8.8.8.8"
                            sx={{ minWidth: 135, ...inlineInputSx }}
                          />
                        ) : (
                          <Typography component="span" sx={{ fontSize: '0.78rem', color: '#94A3B8' }}>-</Typography>
                        )}
                      </TableCell>
                      {PORT_BINDING_KEYS.map((b) => {
                        const boundElsewhereWan = addUsedPorts.get(b.key);
                        const isBoundElsewhere = boundElsewhereWan !== undefined;
                        return (
                          <TableCell key={b.key} align="center" sx={{ px: 0.75 }}>
                            <Tooltip title={isBoundElsewhere ? `Already bound to WAN ${boundElsewhereWan}` : ''}>
                              <span>
                                <Checkbox
                                  size="small"
                                  disabled={savingNewWan || isBoundElsewhere}
                                  checked={!isBoundElsewhere && Boolean(newWanForm.portBindings[b.key])}
                                  onChange={(e) =>
                                    setNewWanForm((f) => ({
                                      ...f,
                                      portBindings: { ...f.portBindings, [b.key]: e.target.checked },
                                    }))
                                  }
                                  sx={{ p: 0.25 }}
                                />
                              </span>
                            </Tooltip>
                          </TableCell>
                        );
                      })}
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <InlineActionMorph
                          mode={savingNewWan ? 'saving' : 'edit'}
                          viewAction={null}
                          editActions={
                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                              <Tooltip title="Save">
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    if (status === 'never_connected' || status === 'disabled' || device.simulatedUnreachable) {
                                      showToast('error', `ONT tidak dapat dijangkau (${status.replace('_', ' ')}). Gagal menambah WAN.`);
                                      return;
                                    }
                                    const effectiveVlanEnabled = newWanForm.vlanType === 'tag' && newWanForm.vlanEnabled;
                                    const parsedVlan = effectiveVlanEnabled
                                      ? newWanForm.vlanId.trim()
                                        ? Number(newWanForm.vlanId)
                                        : null
                                      : 0;
                                    const wanValidation = wanConnectionSchema.safeParse({
                                      connectionType: newWanForm.connectionType,
                                      addressingMode: newWanForm.addressingMode,
                                      pppoeUsername: newWanForm.pppoeUsername,
                                      pppoePassword: newWanForm.pppoePassword,
                                      vlanEnabled: effectiveVlanEnabled,
                                      vlanType: newWanForm.vlanType,
                                      vlanId: parsedVlan !== null && !Number.isNaN(parsedVlan) ? parsedVlan : null,
                                      wanIp: newWanForm.wanIp,
                                      subnetMask: newWanForm.subnetMask,
                                      gateway: newWanForm.gateway,
                                      dns: newWanForm.dns,
                                      serviceList: newWanForm.serviceList,
                                      natEnabled: newWanForm.natEnabled,
                                    });
                                    if (!wanValidation.success) {
                                      showToast('error', formatZodError(wanValidation.error));
                                      return;
                                    }
                                    const res = addWanConnection(device.id, {
                                      ...wanValidation.data,
                                      portBindings: newWanForm.portBindings,
                                    });
                                    if (!res.ok) {
                                      showToast('error', res.error ?? 'Failed to add WAN');
                                      return;
                                    }
                                    setSavingNewWan(true);
                                    if (res.taskId) watchedTaskIdRef.current = res.taskId;
                                  }}
                                  sx={{ ...actionIconBtnSx, color: '#15803D' }}
                                >
                                  <CheckIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Cancel">
                                <IconButton
                                  size="small"
                                  onClick={() => setAddingWan(false)}
                                  sx={{ ...actionIconBtnSx, color: '#64748B' }}
                                >
                                  <CloseIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          }
                          savingIndicator={
                            <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28 }}>
                              <CircularProgress size={16} sx={{ color: '#0284C7' }} />
                            </Box>
                          }
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            );
          })()}
        </CardContent>
      </Card>

      {/* Full-Width Section: WiFi Configuration */}
      <Card sx={{ ...cardSx, mb: 2 }}>
        <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
          {sectionHeader(
            <WifiOutlinedIcon sx={{ fontSize: 18 }} />,
            'WiFi Configuration',
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddIcon fontSize="small" />}
              disabled={!hasPermission('devices.parameters.write') || addingWifi || savingNewWifi}
              onClick={() => {
                const nextIdx = Math.max(0, ...(device.wifiRadios ?? []).map((w) => w.index)) + 1;
                setNewWifiForm({
                  enabled: true,
                  ssid: '',
                  securityMode: 'TKIP+AES',
                  band: nextIdx >= 5 ? '5 GHz' : '2.4 GHz',
                  channel: 'Auto',
                  passphrase: '',
                });
                setAddingWifi(true);
              }}
              sx={{
                height: 28,
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'none',
                borderRadius: '6px',
                borderColor: 'var(--noc-border-strong)',
                color: 'var(--noc-text-muted)',
                '&:hover': { borderColor: 'var(--noc-accent)', color: 'var(--noc-accent)', bgcolor: 'var(--noc-accent-hover-bg)' },
              }}
            >
              Add WLAN
            </Button>,
          )}
          {(!device.wifiRadios || device.wifiRadios.length === 0) && !addingWifi ? (
            isFetchingDetail ? (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 1 }}>
                <CircularProgress size={16} sx={{ color: 'var(--noc-accent)' }} />
                <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>
                  Mengambil data WiFi Configuration...
                </Typography>
              </Stack>
            ) : (
              <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>
                No WiFi configuration data. Click Summon to fetch.
              </Typography>
            )
          ) : (() => {
            const newWifiIdx = Math.max(0, ...(device.wifiRadios ?? []).map((w) => w.index)) + 1;
            const newWifiBand: WiFiRadio['band'] = newWifiIdx >= 5 ? '5 GHz' : '2.4 GHz';
            const ontPossibleChannels = (device.wifiRadios ?? []).find((r) => r.band === newWifiBand && r.possibleChannels?.length)?.possibleChannels
              ?? (device.wifiRadios ?? []).find((r) => r.possibleChannels?.length)?.possibleChannels;
            const ontActiveChannel = (device.wifiRadios ?? []).find((r) => r.band === newWifiBand && r.activeChannel)?.activeChannel
              ?? (device.wifiRadios ?? []).find((r) => r.activeChannel)?.activeChannel;
            const newWifiSecChoices: string[] = WIFI_SECURITY_OPTIONS.includes(newWifiForm.securityMode as (typeof WIFI_SECURITY_OPTIONS)[number])
              ? [...WIFI_SECURITY_OPTIONS]
              : [...WIFI_SECURITY_OPTIONS, newWifiForm.securityMode];
            const newWifiChannelChoices = getChannelOptions(newWifiBand, newWifiForm.channel, ontPossibleChannels);
            return (
            <TableContainer sx={{ maxHeight: 300, overflow: 'auto' }}>
              <Table size="small" stickyHeader sx={AUTO_FIT_TABLE_SX}>
                <TableHead>
                  <TableRow>
                    <TableCell>Index</TableCell>
                    <TableCell align="center">On</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>SSID Name</TableCell>
                    <TableCell>Security</TableCell>
                    <TableCell>Band</TableCell>
                    <TableCell>Ch</TableCell>
                    <TableCell>Password</TableCell>
                    <TableCell align="right">Edit</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(device.wifiRadios ?? []).map((radio) => {
                    const revealed = revealedWifiIndex === radio.index;
                    const isEditing = editingWifiIndex === radio.index;
                    const isSaving = savingWifiIndex === radio.index;
                    const rowMode = isSaving ? 'saving' : isEditing ? 'edit' : 'view';
                    const resolvedWlan = resolveWlanInstanceFromVParams(device, matchedAlias, radio);
                    const radioEnabled = resolvedWlan.enabled;
                    const radioSsid = resolvedWlan.ssid;
                    const radioChannel = resolvedWlan.channel;
                    const radioPassphrase = resolvedWlan.passphrase;
                    const radioSecurity = resolvedWlan.securityMode;
                    const radioBand = resolvedWlan.band;
                    const securityChoices: string[] = WIFI_SECURITY_OPTIONS.includes(radioSecurity as (typeof WIFI_SECURITY_OPTIONS)[number])
                      ? [...WIFI_SECURITY_OPTIONS]
                      : [...WIFI_SECURITY_OPTIONS, radioSecurity];
                    const channelChoices = getChannelOptions(
                      radioBand,
                      isEditing ? wifiForm.channel : radioChannel,
                      radio.possibleChannels,
                    );
                    const chDisplay =
                      radioChannel === 'Auto' && radio.activeChannel
                        ? `Auto (${radio.activeChannel})`
                        : radioChannel;
                    return (
                      <TableRow key={radio.index} sx={editableRowSx(isEditing, isSaving)}>
                        <TableCell sx={{ fontWeight: 600, color: 'var(--noc-text-muted)', whiteSpace: 'nowrap' }}>
                          {`WLAN ${radio.index}`}
                        </TableCell>
                        <TableCell align="center" sx={{ px: 0.75 }}>
                          <InlineMorphCell
                            editing={isEditing}
                            view={
                              <Typography
                                component="span"
                                sx={{
                                  fontSize: '0.78rem',
                                  fontWeight: 600,
                                  color: radioEnabled ? 'success.main' : 'text.secondary',
                                }}
                              >
                                {radioEnabled ? 'On' : 'Off'}
                              </Typography>
                            }
                            edit={
                              <Checkbox
                                size="small"
                                disabled={isSaving}
                                checked={isEditing ? wifiForm.enabled : radioEnabled}
                                onChange={(e) => setWifiForm((f) => ({ ...f, enabled: e.target.checked }))}
                                sx={{ p: 0.25 }}
                              />
                            }
                          />
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Typography
                            component="span"
                            sx={{
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              color: radioEnabled ? 'success.main' : 'error.main',
                            }}
                          >
                            {radioEnabled ? 'Up' : 'Down'}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>
                          <InlineMorphCell
                            editing={isEditing}
                            view={radioSsid || '-'}
                            edit={
                              <TextField
                                size="small"
                                disabled={isSaving}
                                value={isEditing ? wifiForm.ssid : radioSsid}
                                onChange={(e) => setWifiForm((f) => ({ ...f, ssid: e.target.value }))}
                                placeholder="SSID (1–32 chars)"
                                sx={{ minWidth: 145, ...inlineInputSx }}
                              />
                            }
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }}>
                          <InlineMorphCell
                            editing={isEditing}
                            view={radioSecurity || '-'}
                            edit={
                              <TextField
                                select
                                size="small"
                                disabled={isSaving}
                                value={isEditing ? wifiForm.securityMode : radioSecurity}
                                onChange={(e) => {
                                  const nextSec = e.target.value;
                                  setWifiForm((f) => ({
                                    ...f,
                                    securityMode: nextSec,
                                    passphrase: nextSec === 'None' ? '' : f.passphrase,
                                  }));
                                }}
                                sx={{ minWidth: 112, ...inlineInputSx }}
                              >
                                {securityChoices.map((sec) => (
                                  <MenuItem key={sec} value={sec} sx={{ fontSize: '0.8rem' }}>
                                    {sec}
                                  </MenuItem>
                                ))}
                              </TextField>
                            }
                          />
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'text.secondary' }}>
                          {radio.index >= 5 ? '5 GHz' : radioBand}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <InlineMorphCell
                            editing={isEditing}
                            view={chDisplay}
                            edit={
                              <TextField
                                select
                                size="small"
                                disabled={isSaving}
                                value={isEditing ? wifiForm.channel : radioChannel}
                                onChange={(e) => setWifiForm((f) => ({ ...f, channel: e.target.value }))}
                                sx={{ minWidth: 96, ...inlineInputSx }}
                              >
                                {channelChoices.map((ch) => (
                                  <MenuItem key={ch} value={ch} sx={{ fontSize: '0.8rem' }}>
                                    {ch === 'Auto' && radio.activeChannel ? `Auto (${radio.activeChannel})` : ch}
                                  </MenuItem>
                                ))}
                              </TextField>
                            }
                          />
                        </TableCell>
                        <TableCell sx={{ fontFamily: MONO_FONT, whiteSpace: 'nowrap' }}>
                          <InlineMorphCell
                            editing={isEditing}
                            view={
                              radioSecurity === 'None' || radio.securityMode === 'Open' || !radioPassphrase ? (
                                '-'
                              ) : (
                                <Stack direction="row" alignItems="center" spacing={0.5}>
                                  <span>{revealed ? radioPassphrase : '••••••••'}</span>
                                  <IconButton
                                    size="small"
                                    onClick={() => {
                                      if (revealed) {
                                        setRevealedWifiIndex(null);
                                        return;
                                      }
                                      if (!revealSecret(device.id, `wifi_radio_${radio.index}`)) {
                                        showToast('error', 'Permission denied: devices.secrets.view required.');
                                        return;
                                      }
                                      setRevealedWifiIndex(radio.index);
                                    }}
                                  >
                                    {revealed ? <VisibilityOffOutlinedIcon fontSize="inherit" /> : <VisibilityOutlinedIcon fontSize="inherit" />}
                                  </IconButton>
                                </Stack>
                              )
                            }
                            edit={
                              <TextField
                                size="small"
                                disabled={isSaving || wifiForm.securityMode === 'None'}
                                value={wifiForm.securityMode === 'None' ? '' : wifiForm.passphrase}
                                onChange={(e) => setWifiForm((f) => ({ ...f, passphrase: e.target.value }))}
                                placeholder={
                                  wifiForm.securityMode === 'None'
                                    ? 'Disabled (None)'
                                    : 'Kosongkan jika tak ubah'
                                }
                                sx={{
                                  minWidth: 135,
                                  ...inlineInputSx,
                                  '& .MuiOutlinedInput-root': {
                                    ...inlineInputSx['& .MuiOutlinedInput-root'],
                                    fontFamily: MONO_FONT,
                                  },
                                }}
                              />
                            }
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          <InlineActionMorph
                            mode={rowMode}
                            viewAction={
                              <IconButton
                                size="small"
                                disabled={!hasPermission('devices.parameters.write')}
                                onClick={() => {
                                  setEditingWifiIndex(radio.index);
                                  setWifiForm({
                                    enabled: radioEnabled,
                                    ssid: radioSsid,
                                    securityMode: radioSecurity,
                                    band: radioBand,
                                    channel: radioChannel,
                                    passphrase: /^•+$/.test(radioPassphrase) ? '' : radioPassphrase,
                                  });
                                }}
                                sx={actionIconBtnSx}
                              >
                                <EditOutlinedIcon fontSize="small" />
                              </IconButton>
                            }
                            editActions={
                              <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                <Tooltip title="Save">
                                  <IconButton
                                    size="small"
                                    onClick={() => {
                                      if (status === 'never_connected' || status === 'disabled' || device.simulatedUnreachable) {
                                        showToast('error', `ONT tidak dapat dijangkau (${status.replace('_', ' ')}). Gagal menyimpan konfigurasi WiFi.`);
                                        return;
                                      }
                                      const wifiValidation = wifiConfigSchema.safeParse({
                                        enabled: wifiForm.enabled,
                                        ssid: wifiForm.ssid,
                                        securityMode: wifiForm.securityMode,
                                        band: wifiForm.band,
                                        channel: wifiForm.channel,
                                        passphrase: wifiForm.passphrase,
                                        allowBlankPassphrase: true,
                                      });
                                      if (!wifiValidation.success) {
                                        showToast('error', formatZodError(wifiValidation.error));
                                        return;
                                      }
                                      const res = updateWifiConfig(
                                        device.id,
                                        radio.index,
                                        wifiValidation.data.ssid,
                                        wifiValidation.data.passphrase,
                                        wifiValidation.data.channel,
                                        {
                                          enabled: wifiValidation.data.enabled,
                                          securityMode: wifiValidation.data.securityMode,
                                          band: wifiValidation.data.band,
                                        },
                                      );
                                      if (!res.ok) {
                                        showToast('error', res.error ?? 'Validation failed');
                                        return;
                                      }
                                      setSavingWifiIndex(radio.index);
                                      if (res.taskId) watchedTaskIdRef.current = res.taskId;
                                    }}
                                    sx={{ ...actionIconBtnSx, color: '#15803D' }}
                                  >
                                    <CheckIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Cancel">
                                  <IconButton
                                    size="small"
                                    onClick={() => setEditingWifiIndex(null)}
                                    sx={{ ...actionIconBtnSx, color: '#64748B' }}
                                  >
                                    <CloseIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Stack>
                            }
                            savingIndicator={
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28 }}>
                                <CircularProgress size={16} sx={{ color: '#0284C7' }} />
                              </Box>
                            }
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {addingWifi && (
                    <TableRow sx={editableRowSx(true, savingNewWifi)}>
                      <TableCell sx={{ fontWeight: 600, color: '#0284C7', whiteSpace: 'nowrap' }}>
                        {`WLAN ${Math.max(0, ...(device.wifiRadios ?? []).map((w) => w.index)) + 1}`}
                      </TableCell>
                      <TableCell align="center" sx={{ px: 0.75 }}>
                        <Checkbox
                          size="small"
                          disabled={savingNewWifi}
                          checked={newWifiForm.enabled}
                          onChange={(e) => setNewWifiForm((f) => ({ ...f, enabled: e.target.checked }))}
                          sx={{ p: 0.25 }}
                        />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Typography component="span" sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748B' }}>
                          New
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          disabled={savingNewWifi}
                          value={newWifiForm.ssid}
                          onChange={(e) => setNewWifiForm((f) => ({ ...f, ssid: e.target.value }))}
                          placeholder="SSID (1–32 chars)"
                          sx={{ minWidth: 145, ...inlineInputSx }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          select
                          size="small"
                          disabled={savingNewWifi}
                          value={newWifiForm.securityMode}
                          onChange={(e) => {
                            const nextSec = e.target.value;
                            setNewWifiForm((f) => ({
                              ...f,
                              securityMode: nextSec,
                              passphrase: nextSec === 'None' ? '' : f.passphrase,
                            }));
                          }}
                          sx={{ minWidth: 112, ...inlineInputSx }}
                        >
                          {newWifiSecChoices.map((sec) => (
                            <MenuItem key={sec} value={sec} sx={{ fontSize: '0.8rem' }}>
                              {sec}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'text.secondary' }}>
                        {newWifiBand}
                      </TableCell>
                      <TableCell>
                        <TextField
                          select
                          size="small"
                          disabled={savingNewWifi}
                          value={newWifiForm.channel}
                          onChange={(e) => setNewWifiForm((f) => ({ ...f, channel: e.target.value }))}
                          sx={{ minWidth: 96, ...inlineInputSx }}
                        >
                          {newWifiChannelChoices.map((ch) => (
                            <MenuItem key={ch} value={ch} sx={{ fontSize: '0.8rem' }}>
                              {ch === 'Auto' && ontActiveChannel ? `Auto (${ontActiveChannel})` : ch}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          disabled={savingNewWifi || newWifiForm.securityMode === 'None'}
                          value={newWifiForm.securityMode === 'None' ? '' : newWifiForm.passphrase}
                          onChange={(e) => setNewWifiForm((f) => ({ ...f, passphrase: e.target.value }))}
                          placeholder={newWifiForm.securityMode === 'None' ? 'Disabled (None)' : '8–63 chars'}
                          sx={{
                            minWidth: 135,
                            ...inlineInputSx,
                            '& .MuiOutlinedInput-root': {
                              ...inlineInputSx['& .MuiOutlinedInput-root'],
                              fontFamily: MONO_FONT,
                            },
                          }}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <InlineActionMorph
                          mode={savingNewWifi ? 'saving' : 'edit'}
                          viewAction={null}
                          editActions={
                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                              <Tooltip title="Save">
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    if (status === 'never_connected' || status === 'disabled' || device.simulatedUnreachable) {
                                      showToast('error', `ONT tidak dapat dijangkau (${status.replace('_', ' ')}). Gagal menambah SSID WiFi.`);
                                      return;
                                    }
                                    const wifiValidation = wifiConfigSchema.safeParse(newWifiForm);
                                    if (!wifiValidation.success) {
                                      showToast('error', formatZodError(wifiValidation.error));
                                      return;
                                    }
                                    const res = addWifiRadio(device.id, wifiValidation.data);
                                    if (!res.ok) {
                                      showToast('error', res.error ?? 'Validation failed');
                                      return;
                                    }
                                    setSavingNewWifi(true);
                                    if (res.taskId) watchedTaskIdRef.current = res.taskId;
                                  }}
                                  sx={{ ...actionIconBtnSx, color: '#15803D' }}
                                >
                                  <CheckIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Cancel">
                                <IconButton
                                  size="small"
                                  onClick={() => setAddingWifi(false)}
                                  sx={{ ...actionIconBtnSx, color: '#64748B' }}
                                >
                                  <CloseIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          }
                          savingIndicator={
                            <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28 }}>
                              <CircularProgress size={16} sx={{ color: '#0284C7' }} />
                            </Box>
                          }
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            );
          })()}
        </CardContent>
      </Card>

      {/* Full-Width Section: LAN & DHCP Server */}
      <Card sx={{ ...cardSx, mb: 2 }}>
        <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
          {sectionHeader(
            <RouterOutlinedIcon sx={{ fontSize: 18 }} />,
            'LAN & DHCP Server',
            editingDhcp ? (
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="contained"
                  disabled={savingDhcp}
                  startIcon={savingDhcp ? <CircularProgress size={14} color="inherit" /> : <CheckIcon fontSize="small" />}
                  onClick={() => {
                    if (status === 'never_connected' || status === 'disabled' || device.simulatedUnreachable) {
                      showToast('error', `ONT tidak dapat dijangkau (${status.replace('_', ' ')}). Tidak dapat mengirim perubahan LAN & DHCP.`);
                      return;
                    }
                    const validation = dhcpServerSchema.safeParse(dhcpForm);
                    if (!validation.success) {
                      showToast('error', formatZodError(validation.error));
                      return;
                    }
                    const res = updateDhcpConfig(device.id, validation.data);
                    if (!res.ok) {
                      showToast('error', res.error ?? 'Gagal memperbarui LAN & DHCP Server');
                      return;
                    }
                    setSavingDhcp(true);
                    if (res.taskId) watchedTaskIdRef.current = res.taskId;
                  }}
                  sx={{
                    height: 28,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'none',
                    borderRadius: '6px',
                  }}
                >
                  {savingDhcp ? 'Saving...' : 'Save'}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={savingDhcp}
                  startIcon={<CloseIcon fontSize="small" />}
                  onClick={() => setEditingDhcp(false)}
                  sx={{
                    height: 28,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'none',
                    borderRadius: '6px',
                    borderColor: 'var(--noc-border-strong)',
                    color: 'var(--noc-text-muted)',
                  }}
                >
                  Cancel
                </Button>
              </Stack>
            ) : (
              <Button
                size="small"
                variant="outlined"
                startIcon={<EditOutlinedIcon fontSize="small" />}
                disabled={!hasPermission('devices.parameters.write') || savingDhcp}
                onClick={() => {
                  const base: DhcpServerConfig = resolvedDhcp ?? {
                    lanIp: '192.168.1.1',
                    lanSubnetMask: '255.255.255.0',
                    dhcpServerEnable: true,
                    option125Enable: false,
                    leaseTimeSeconds: 86400,
                    startIp: '192.168.1.2',
                    endIp: '192.168.1.254',
                    assignIspDns: true,
                    dns1: '',
                    dns2: '',
                    dns3: '',
                  };
                  setDhcpForm({ ...base });
                  setEditingDhcp(true);
                }}
                sx={{
                  height: 28,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  borderRadius: '6px',
                  borderColor: 'var(--noc-border-strong)',
                  color: 'var(--noc-text-muted)',
                  '&:hover': { borderColor: 'var(--noc-accent)', color: 'var(--noc-accent)', bgcolor: 'var(--noc-accent-hover-bg)' },
                }}
              >
                Edit
              </Button>
            ),
          )}
          {!resolvedDhcp && !editingDhcp ? (
            isFetchingDetail ? (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 1 }}>
                <CircularProgress size={16} sx={{ color: 'var(--noc-accent)' }} />
                <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>
                  Mengambil data LAN & DHCP Server...
                </Typography>
              </Stack>
            ) : (
              <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>
                No LAN / DHCP Server configuration data. Click Summon to fetch.
              </Typography>
            )
          ) : (() => {
            const viewCfg: DhcpServerConfig = resolvedDhcp ?? dhcpForm;
            const currentLease = editingDhcp ? dhcpForm.leaseTimeSeconds : viewCfg.leaseTimeSeconds;
            const leaseChoices = DHCP_LEASE_TIME_OPTIONS.some((opt) => opt.value === currentLease)
              ? DHCP_LEASE_TIME_OPTIONS
              : [...DHCP_LEASE_TIME_OPTIONS, { value: currentLease, label: `${formatDuration(currentLease)} (${currentLease}s)` }];
            const leaseLabel = leaseChoices.find((opt) => opt.value === viewCfg.leaseTimeSeconds)?.label ?? `${viewCfg.leaseTimeSeconds}s`;
            const fieldLabelSx = {
              fontSize: '0.72rem',
              fontWeight: 600,
              color: 'text.secondary',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.03em',
              mb: 0.5,
            };
            const fieldValueSx = {
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'text.primary',
              fontFamily: MONO_FONT,
            };
            return (
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography sx={fieldLabelSx}>IP Address (LAN)</Typography>
                  {editingDhcp ? (
                    <TextField
                      fullWidth
                      size="small"
                      disabled={savingDhcp}
                      value={dhcpForm.lanIp}
                      onChange={(e) => setDhcpForm((f) => ({ ...f, lanIp: e.target.value }))}
                      placeholder="192.168.1.1"
                      sx={inlineInputSx}
                    />
                  ) : (
                    <Typography sx={fieldValueSx}>{viewCfg.lanIp || '-'}</Typography>
                  )}
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography sx={fieldLabelSx}>Subnet Mask</Typography>
                  {editingDhcp ? (
                    <TextField
                      fullWidth
                      size="small"
                      disabled={savingDhcp}
                      value={dhcpForm.lanSubnetMask}
                      onChange={(e) => setDhcpForm((f) => ({ ...f, lanSubnetMask: e.target.value }))}
                      placeholder="255.255.255.0"
                      sx={inlineInputSx}
                    />
                  ) : (
                    <Typography sx={fieldValueSx}>{viewCfg.lanSubnetMask || '-'}</Typography>
                  )}
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography sx={fieldLabelSx}>DHCP Server</Typography>
                  {editingDhcp ? (
                    <TextField
                      select
                      fullWidth
                      size="small"
                      disabled={savingDhcp}
                      value={dhcpForm.dhcpServerEnable ? 'enable' : 'disable'}
                      onChange={(e) => setDhcpForm((f) => ({ ...f, dhcpServerEnable: e.target.value === 'enable' }))}
                      sx={inlineInputSx}
                    >
                      <MenuItem value="enable" sx={{ fontSize: '0.82rem' }}>Enable</MenuItem>
                      <MenuItem value="disable" sx={{ fontSize: '0.82rem' }}>Disable</MenuItem>
                    </TextField>
                  ) : (
                    <Chip
                      size="small"
                      label={viewCfg.dhcpServerEnable ? 'Enable' : 'Disable'}
                      sx={{
                        height: 22,
                        fontSize: '0.73rem',
                        fontWeight: 600,
                        bgcolor: viewCfg.dhcpServerEnable ? 'rgba(21, 128, 61, 0.12)' : 'rgba(100, 116, 139, 0.12)',
                        color: viewCfg.dhcpServerEnable ? '#15803D' : '#64748B',
                      }}
                    />
                  )}
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography sx={fieldLabelSx}>Option 125</Typography>
                  {editingDhcp ? (
                    <TextField
                      select
                      fullWidth
                      size="small"
                      disabled={savingDhcp}
                      value={dhcpForm.option125Enable ? 'enable' : 'disable'}
                      onChange={(e) => setDhcpForm((f) => ({ ...f, option125Enable: e.target.value === 'enable' }))}
                      sx={inlineInputSx}
                    >
                      <MenuItem value="enable" sx={{ fontSize: '0.82rem' }}>Enable</MenuItem>
                      <MenuItem value="disable" sx={{ fontSize: '0.82rem' }}>Disable</MenuItem>
                    </TextField>
                  ) : (
                    <Chip
                      size="small"
                      label={viewCfg.option125Enable ? 'Enable' : 'Disable'}
                      sx={{
                        height: 22,
                        fontSize: '0.73rem',
                        fontWeight: 600,
                        bgcolor: viewCfg.option125Enable ? 'rgba(21, 128, 61, 0.12)' : 'rgba(100, 116, 139, 0.12)',
                        color: viewCfg.option125Enable ? '#15803D' : '#64748B',
                      }}
                    />
                  )}
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography sx={fieldLabelSx}>Start DHCP IP Address</Typography>
                  {editingDhcp ? (
                    <TextField
                      fullWidth
                      size="small"
                      disabled={savingDhcp}
                      value={dhcpForm.startIp}
                      onChange={(e) => setDhcpForm((f) => ({ ...f, startIp: e.target.value }))}
                      placeholder="192.168.1.2"
                      sx={inlineInputSx}
                    />
                  ) : (
                    <Typography sx={fieldValueSx}>{viewCfg.startIp || '-'}</Typography>
                  )}
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography sx={fieldLabelSx}>End DHCP IP Address</Typography>
                  {editingDhcp ? (
                    <TextField
                      fullWidth
                      size="small"
                      disabled={savingDhcp}
                      value={dhcpForm.endIp}
                      onChange={(e) => setDhcpForm((f) => ({ ...f, endIp: e.target.value }))}
                      placeholder="192.168.1.254"
                      sx={inlineInputSx}
                    />
                  ) : (
                    <Typography sx={fieldValueSx}>{viewCfg.endIp || '-'}</Typography>
                  )}
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography sx={fieldLabelSx}>Lease Time</Typography>
                  {editingDhcp ? (
                    <TextField
                      select
                      fullWidth
                      size="small"
                      disabled={savingDhcp}
                      value={dhcpForm.leaseTimeSeconds}
                      onChange={(e) => setDhcpForm((f) => ({ ...f, leaseTimeSeconds: Number(e.target.value) }))}
                      sx={inlineInputSx}
                    >
                      {leaseChoices.map((opt) => (
                        <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: '0.82rem' }}>
                          {opt.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  ) : (
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'text.primary' }}>{leaseLabel}</Typography>
                  )}
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography sx={fieldLabelSx}>Assign ISP DNS</Typography>
                  {editingDhcp ? (
                    <TextField
                      select
                      fullWidth
                      size="small"
                      disabled={savingDhcp}
                      value={dhcpForm.assignIspDns ? 'enable' : 'disable'}
                      onChange={(e) => setDhcpForm((f) => ({ ...f, assignIspDns: e.target.value === 'enable' }))}
                      sx={inlineInputSx}
                    >
                      <MenuItem value="enable" sx={{ fontSize: '0.82rem' }}>Enable</MenuItem>
                      <MenuItem value="disable" sx={{ fontSize: '0.82rem' }}>Disable</MenuItem>
                    </TextField>
                  ) : (
                    <Chip
                      size="small"
                      label={viewCfg.assignIspDns ? 'Enable' : 'Disable'}
                      sx={{
                        height: 22,
                        fontSize: '0.73rem',
                        fontWeight: 600,
                        bgcolor: viewCfg.assignIspDns ? 'rgba(2, 132, 199, 0.12)' : 'rgba(100, 116, 139, 0.12)',
                        color: viewCfg.assignIspDns ? '#0284C7' : '#64748B',
                      }}
                    />
                  )}
                </Grid>
                <Grid item xs={12} sm={4} md={4}>
                  <Typography sx={fieldLabelSx}>DNS 1</Typography>
                  {editingDhcp ? (
                    <TextField
                      fullWidth
                      size="small"
                      disabled={savingDhcp || dhcpForm.assignIspDns}
                      value={dhcpForm.dns1}
                      onChange={(e) => setDhcpForm((f) => ({ ...f, dns1: e.target.value }))}
                      placeholder={dhcpForm.assignIspDns ? 'Auto (ISP DNS)' : 'e.g. 8.8.8.8'}
                      sx={inlineInputSx}
                    />
                  ) : (
                    <Typography sx={{ ...fieldValueSx, color: viewCfg.assignIspDns ? 'text.secondary' : 'text.primary' }}>
                      {viewCfg.dns1 || '-'}
                    </Typography>
                  )}
                </Grid>
                <Grid item xs={12} sm={4} md={4}>
                  <Typography sx={fieldLabelSx}>DNS 2</Typography>
                  {editingDhcp ? (
                    <TextField
                      fullWidth
                      size="small"
                      disabled={savingDhcp || dhcpForm.assignIspDns}
                      value={dhcpForm.dns2}
                      onChange={(e) => setDhcpForm((f) => ({ ...f, dns2: e.target.value }))}
                      placeholder={dhcpForm.assignIspDns ? 'Auto (ISP DNS)' : 'e.g. 1.1.1.1'}
                      sx={inlineInputSx}
                    />
                  ) : (
                    <Typography sx={{ ...fieldValueSx, color: viewCfg.assignIspDns ? 'text.secondary' : 'text.primary' }}>
                      {viewCfg.dns2 || '-'}
                    </Typography>
                  )}
                </Grid>
                <Grid item xs={12} sm={4} md={4}>
                  <Typography sx={fieldLabelSx}>DNS 3</Typography>
                  {editingDhcp ? (
                    <TextField
                      fullWidth
                      size="small"
                      disabled={savingDhcp || dhcpForm.assignIspDns}
                      value={dhcpForm.dns3}
                      onChange={(e) => setDhcpForm((f) => ({ ...f, dns3: e.target.value }))}
                      placeholder={dhcpForm.assignIspDns ? 'Auto (ISP DNS)' : 'Optional DNS 3'}
                      sx={inlineInputSx}
                    />
                  ) : (
                    <Typography sx={{ ...fieldValueSx, color: viewCfg.assignIspDns ? 'text.secondary' : 'text.primary' }}>
                      {viewCfg.dns3 || '-'}
                    </Typography>
                  )}
                </Grid>
                {editingDhcp && dhcpForm.assignIspDns && (
                  <Grid item xs={12}>
                    <Typography sx={{ fontSize: '0.74rem', color: 'text.secondary' }}>
                      Assign ISP DNS aktif: kolom DNS 1, DNS 2, DNS 3 dinonaktifkan. Ubah ke Disable untuk mengisi DNS secara manual.
                    </Typography>
                  </Grid>
                )}
              </Grid>
            );
          })()}
        </CardContent>
      </Card>

      {/* Main 2-Column Workspace */}
      <Grid container spacing={2} alignItems="flex-start">
        {/* Left Sidebar: Credentials, Remote Actions */}
        <Grid item xs={12} lg={4}>
          <Stack spacing={2}>
            {/* Modem Credentials */}
            <Card sx={cardSx}>
              <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
                {sectionHeader(
                  <VpnKeyOutlinedIcon sx={{ fontSize: 18 }} />,
                  'Modem Credentials',
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <Tooltip title="Edit / Rotate Credentials">
                      <span>
                        <IconButton
                          size="small"
                          disabled={!hasPermission('devices.credentials.edit')}
                          onClick={() => {
                            setCredForm({
                              adminPassword: resolvedTelemetry.adminPassword || device.credentials.adminPassword || 'admin',
                              userPassword: resolvedTelemetry.userPassword || device.credentials.userPassword,
                              connectionRequestPassword: device.credentials.connectionRequestPassword,
                            });
                            setCredModalOpen(true);
                          }}
                          sx={{ color: '#0284C7' }}
                        >
                          <EditOutlinedIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title={revealedCredentials ? 'Hide Passwords' : 'Reveal Passwords (Audited)'}>
                      <IconButton
                        size="small"
                        onClick={handleToggleCredentialsReveal}
                        sx={{
                          border: '1px solid var(--noc-border)',
                          borderRadius: '6px',
                          width: 30,
                          height: 28,
                          color: 'text.secondary',
                        }}
                      >
                        {revealedCredentials ? (
                          <VisibilityOffOutlinedIcon sx={{ fontSize: 16 }} />
                        ) : (
                          <VisibilityOutlinedIcon sx={{ fontSize: 16 }} />
                        )}
                      </IconButton>
                    </Tooltip>
                  </Stack>,
                )}

                <Grid container spacing={1.5}>
                  <Grid item xs={6}>
                    <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mb: 0.25 }}>Admin Username</Typography>
                    <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.8rem', color: 'text.primary' }}>
                      {resolvedTelemetry.adminUsername || device.credentials.adminUsername || 'admin'}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mb: 0.25 }}>Admin Password</Typography>
                    <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.8rem', color: 'text.primary' }}>
                      {revealedCredentials ? resolvedTelemetry.adminPassword || device.credentials.adminPassword || 'admin' : '••••••••'}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mb: 0.25 }}>User Username</Typography>
                    <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.8rem', color: 'text.primary' }}>
                      {resolvedTelemetry.userUsername || '-'}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', mb: 0.25 }}>User Password</Typography>
                    <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.8rem', color: 'text.primary' }}>
                      {revealedCredentials ? resolvedTelemetry.userPassword || '-' : '••••••••'}
                    </Typography>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>

            {/* Remote Actions */}
            <Card sx={cardSx}>
              <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
                {sectionHeader(<SendOutlinedIcon sx={{ fontSize: 17 }} />, 'Actions')}
                <Stack direction="row" spacing={1}>
                  <Button
                    fullWidth
                    variant="outlined"
                    size="small"
                    startIcon={<RestartAltIcon sx={{ fontSize: '15px !important' }} />}
                    disabled={!hasPermission('devices.reboot')}
                    onClick={() => setRebootConfirmOpen(true)}
                    sx={{
                      height: 36,
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: 'var(--noc-text-muted)',
                      bgcolor: 'var(--noc-subtle)',
                      borderColor: 'divider',
                      borderRadius: '6px',
                      '&:hover': { bgcolor: 'var(--noc-hover)', borderColor: 'var(--noc-border-strong)' },
                    }}
                  >
                    Reboot
                  </Button>
                  <Button
                    fullWidth
                    variant="outlined"
                    size="small"
                    startIcon={<SettingsBackupRestoreIcon sx={{ fontSize: '15px !important' }} />}
                    disabled={!hasPermission('devices.factory_reset')}
                    onClick={() => setResetConfirmOpen(true)}
                    sx={{
                      height: 36,
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: 'warning.main',
                      bgcolor: 'rgba(245, 158, 11, 0.1)',
                      borderColor: 'rgba(245, 158, 11, 0.35)',
                      borderRadius: '6px',
                      '&:hover': { bgcolor: 'rgba(245, 158, 11, 0.18)', borderColor: 'warning.main' },
                    }}
                  >
                    Reset
                  </Button>
                  <Button
                    fullWidth
                    variant="outlined"
                    size="small"
                    startIcon={<DeleteOutlineIcon sx={{ fontSize: '15px !important' }} />}
                    disabled={!hasPermission('devices.delete')}
                    onClick={() => setDeleteConfirmOpen(true)}
                    sx={{
                      height: 36,
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: 'error.main',
                      bgcolor: 'rgba(239, 68, 68, 0.1)',
                      borderColor: 'rgba(239, 68, 68, 0.35)',
                      borderRadius: '6px',
                      '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.18)', borderColor: 'error.main' },
                    }}
                  >
                    Delete
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Grid>

        {/* Right Main Pane: Connected Hosts */}
        <Grid item xs={12} lg={8}>
          <Stack spacing={2}>
            {/* Connected Hosts */}
            <Card sx={cardSx}>
              <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
                {sectionHeader(
                  <GroupOutlinedIcon sx={{ fontSize: 18 }} />,
                  `Connected Hosts (${resolvedHosts.length})`,
                )}
                {resolvedHosts.length === 0 ? (
                  <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>
                    No connected hosts data. Click Summon to fetch.
                  </Typography>
                ) : (
                  <TableContainer sx={{ maxHeight: 260, overflow: 'auto' }}>
                    <Table size="small" stickyHeader sx={AUTO_FIT_TABLE_SX}>
                      <TableHead>
                        <TableRow>
                          <TableCell>Hostname</TableCell>
                          <TableCell>MAC Address</TableCell>
                          <TableCell>IP Address</TableCell>
                          <TableCell>Interface</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {resolvedHosts.map((h) => (
                          <TableRow key={h.macAddress || h.ipAddress}>
                            <TableCell>{h.hostname || 'Unknown'}</TableCell>
                            <TableCell sx={{ fontFamily: MONO_FONT, fontSize: '0.78rem' }}>{h.macAddress || '-'}</TableCell>
                            <TableCell sx={{ fontFamily: MONO_FONT, fontSize: '0.78rem' }}>{h.ipAddress || '-'}</TableCell>
                            <TableCell>{h.interfaceName || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>

      {/* Full-Width Section: Task History */}
      <Card sx={{ ...cardSx, mt: 2 }}>
        <Box sx={{ px: 2.25, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: 'text.primary' }}>
            Task History ({deviceTasks.length})
          </Typography>
        </Box>
        {deviceTasks.length === 0 ? (
          <Box sx={{ py: 3.5, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>No tasks yet</Typography>
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: 280, overflow: 'auto' }}>
            <Table size="small" stickyHeader sx={AUTO_FIT_TABLE_SX}>
              <TableHead>
                <TableRow>
                  <TableCell>Time</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell>Summary</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {deviceTasks.map((t) => (
                  <TableRow key={t.id} hover sx={{ cursor: 'pointer' }} onClick={() => setSelectedTask(t)}>
                    <TableCell><TruncatedText text={formatRelativeTime(t.createdAt)} tooltip={formatDateTime(t.createdAt)} /></TableCell>
                    <TableCell sx={{ fontFamily: MONO_FONT, fontSize: '0.76rem' }}>{t.taskType}</TableCell>
                    <TableCell><TaskStatusChip status={t.status} /></TableCell>
                    <TableCell>{t.durationMs !== null ? `${t.durationMs}ms` : '-'}</TableCell>
                    <TableCell sx={{ maxWidth: 420 }}><TruncatedText text={t.summary} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      {/* Full-Width Section: Inform Events (0 BOOTSTRAP, 1 BOOT, etc.) */}
      <Card sx={{ ...cardSx, mt: 2 }}>
        <Box sx={{ px: 2.25, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: 'text.primary' }}>
            Inform Events ({device.events.length})
          </Typography>
        </Box>
        {device.events.length === 0 ? (
          <Box sx={{ py: 3.5, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>No inform events recorded yet</Typography>
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: 240, overflow: 'auto' }}>
            <Table size="small" stickyHeader sx={AUTO_FIT_TABLE_SX}>
              <TableHead>
                <TableRow>
                  <TableCell>Time</TableCell>
                  <TableCell>Protocol</TableCell>
                  <TableCell>Event Code</TableCell>
                  <TableCell>Summary</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {device.events.map((ev) => (
                  <TableRow key={ev.id} hover>
                    <TableCell>
                      <TruncatedText text={formatRelativeTime(ev.createdAt)} tooltip={formatDateTime(ev.createdAt)} />
                    </TableCell>
                    <TableCell sx={{ fontFamily: MONO_FONT, fontSize: '0.76rem' }}>
                      {ev.protocol}
                    </TableCell>
                    <TableCell>
                      <InformEventChip eventCode={ev.eventCode} />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 480 }}><TruncatedText text={ev.summary || '-'} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      {/* Full-Width Bottom Section: All Parameters */}
      <Card sx={{ ...cardSx, mt: 2 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems={{ xs: 'stretch', sm: 'center' }}
          spacing={2}
          sx={{ px: 2.25, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}
        >
          <Stack direction="row" spacing={1} alignItems="center" sx={{ whiteSpace: 'nowrap' }}>
            <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: 'text.primary' }}>
              All Parameters ({device.parameters.length})
            </Typography>
            {matchedAlias && (
              <Chip
                size="small"
                variant="outlined"
                label={`Virtual Profile: ${matchedAlias.canonicalName}`}
                sx={{
                  fontSize: '0.7rem',
                  height: 22,
                  color: 'var(--noc-accent)',
                  borderColor: 'var(--noc-border-strong)',
                  bgcolor: 'var(--noc-accent-bg)',
                }}
              />
            )}
          </Stack>
          <TextField
            size="small"
            fullWidth
            placeholder="Filter..."
            value={paramSearch}
            onChange={(e) => setParamSearch(e.target.value)}
            sx={{
              '& .MuiOutlinedInput-root': {
                height: 34,
                fontSize: '0.8rem',
                bgcolor: 'background.paper',
                borderRadius: '6px',
              },
            }}
          />
        </Stack>

        <TableContainer sx={{ maxHeight: 360, overflowY: 'auto', overflowX: 'hidden' }}>
          <Table
            size="small"
            stickyHeader
            sx={{
              tableLayout: 'fixed',
              width: '100%',
              '& .MuiTableCell-head': {
                bgcolor: 'var(--noc-subtle)',
                color: 'text.secondary',
                fontSize: '0.72rem',
                fontWeight: 600,
                py: 0.75,
                px: 1.5,
                borderBottom: '1px solid var(--noc-border)',
              },
              '& .MuiTableCell-body': {
                py: 0.75,
                px: 1.5,
                fontSize: '0.76rem',
                color: 'text.primary',
                borderBottom: '1px solid var(--noc-border)',
              },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: '43%' }}>Name</TableCell>
                <TableCell sx={{ width: '21%' }}>Virtual Parameter</TableCell>
                <TableCell sx={{ width: '26%' }}>Value</TableCell>
                <TableCell align="right" sx={{ width: 92 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {pagedParams.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    No matching parameters.
                  </TableCell>
                </TableRow>
              ) : (
                pagedParams.map((p) => {
                  const vpKey = p.canonicalKey || resolveVirtualParamKeyForPath(p.path, matchedAlias);
                  const isEditingParam = editingParamPath === p.path;
                  const isSavingParam = savingParamPath === p.path;
                  const isCopied = copiedParamPath === p.path;
                  return (
                    <TableRow
                      key={p.path}
                      hover={!isEditingParam}
                      sx={{
                        height: 40,
                        bgcolor: isSavingParam ? 'var(--noc-accent-bg)' : isEditingParam ? 'var(--noc-subtle)' : 'transparent',
                        '& > td': { py: 0.65 },
                        '&:last-child td': { borderBottom: 0 },
                      }}
                    >
                      <TableCell sx={{ fontFamily: MONO_FONT, color: 'var(--noc-text-muted) !important' }}>
                        <TruncatedText text={p.path} />
                      </TableCell>
                      <TableCell>
                        {vpKey ? (
                          <Chip
                            size="small"
                            variant="outlined"
                            label={vpKey}
                            title={vpKey}
                            sx={{
                              maxWidth: '100%',
                              fontFamily: MONO_FONT,
                              fontSize: '0.68rem',
                              height: 20,
                              color: 'var(--noc-accent)',
                              borderColor: 'var(--noc-border-strong)',
                              '& .MuiChip-label': {
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              },
                            }}
                          />
                        ) : (
                          <Box component="span" sx={{ color: '#94A3B8' }}>-</Box>
                        )}
                      </TableCell>
                      <TableCell sx={{ fontFamily: MONO_FONT }}>
                        {isEditingParam ? (
                          <TextField
                            size="small"
                            fullWidth
                            autoFocus
                            disabled={isSavingParam}
                            placeholder={p.isSecret ? 'Enter new secret value' : 'Enter value'}
                            value={inlineParamValue}
                            onChange={(e) => setInlineParamValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape' && !isSavingParam) {
                                setEditingParamPath(null);
                              }
                            }}
                            sx={{
                              ...inlineInputSx,
                              '& .MuiOutlinedInput-root': {
                                ...inlineInputSx['& .MuiOutlinedInput-root'],
                                fontFamily: MONO_FONT,
                              },
                            }}
                          />
                        ) : (
                          <TruncatedText
                            text={p.isSecret ? '••••••••' : p.value ?? ''}
                            tooltip={p.isSecret ? 'Secret hidden' : p.value ?? ''}
                            fallback="-"
                          />
                        )}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {isSavingParam ? (
                          <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28 }}>
                            <CircularProgress size={16} sx={{ color: '#0284C7' }} />
                          </Box>
                        ) : isEditingParam ? (
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <IconButton
                              size="small"
                              title="Save & Summon"
                              onClick={() => {
                                const paramValidation = setParameterSchema.safeParse({ path: p.path, value: inlineParamValue });
                                if (!paramValidation.success) {
                                  showToast('error', formatZodError(paramValidation.error));
                                  return;
                                }
                                const res = setDeviceParameter(device.id, paramValidation.data.path, paramValidation.data.value);
                                if (!res.ok) {
                                  showToast('error', res.error ?? 'Failed');
                                  return;
                                }
                                setSavingParamPath(p.path);
                                if (res.taskId) watchedTaskIdRef.current = res.taskId;
                              }}
                              sx={{ color: '#15803D' }}
                            >
                              <CheckIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              title="Cancel"
                              onClick={() => setEditingParamPath(null)}
                              sx={{ color: '#64748B' }}
                            >
                              <CloseIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                        ) : (
                          <Stack direction="row" spacing={0.25} justifyContent="flex-end" alignItems="center">
                            <IconButton
                              size="small"
                              title="Map as Virtual Parameter"
                              disabled={!hasPermission('settings.manage')}
                              onClick={(e) => setVpMapMenu({ anchor: e.currentTarget, path: p.path })}
                            >
                              <TuneIcon sx={{ fontSize: 14, color: vpKey ? '#0284C7' : '#64748B' }} />
                            </IconButton>
                            <IconButton
                              size="small"
                              title={isCopied ? 'Copied!' : 'Copy parameter path'}
                              onClick={() => {
                                navigator.clipboard?.writeText(p.path);
                                setCopiedParamPath(p.path);
                                if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
                                copyTimerRef.current = window.setTimeout(() => {
                                  setCopiedParamPath((curr) => (curr === p.path ? null : curr));
                                }, 1600);
                                showToast('success', `Copied path: ${p.path}`);
                              }}
                            >
                              {isCopied ? (
                                <CheckIcon sx={{ fontSize: 14, color: '#15803D' }} />
                              ) : (
                                <ContentCopyIcon sx={{ fontSize: 14, color: '#94A3B8' }} />
                              )}
                            </IconButton>
                            {p.isWritable && (
                              <IconButton
                                size="small"
                                title="Edit parameter"
                                disabled={!hasPermission('devices.parameters.write')}
                                onClick={() => {
                                  setEditingParamPath(p.path);
                                  setInlineParamValue(p.isSecret ? '' : p.value ?? '');
                                }}
                              >
                                <EditOutlinedIcon sx={{ fontSize: 14, color: '#0284C7' }} />
                              </IconButton>
                            )}
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
        {filteredParams.length > 0 && (
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ px: 2, py: 1, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}
          >
            <Typography variant="caption" color="text.secondary">
              Showing {(safeParamPage - 1) * PARAM_PAGE_SIZE + 1}–{Math.min(filteredParams.length, safeParamPage * PARAM_PAGE_SIZE)} of {filteredParams.length} parameter(s)
            </Typography>
            <Pagination
              count={paramTotalPages}
              page={safeParamPage}
              onChange={(_, p) => setParamPage(p)}
              size="small"
              color="primary"
            />
          </Stack>
        )}
      </Card>

      <Menu
        anchorEl={vpMapMenu?.anchor ?? null}
        open={Boolean(vpMapMenu)}
        onClose={() => setVpMapMenu(null)}
        PaperProps={{ sx: { minWidth: 260, maxHeight: 380 } }}
      >
        <Box sx={{ px: 2, py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'text.secondary' }}>
            Map to Virtual Parameter ({device.manufacturerCanonical})
          </Typography>
        </Box>
        {VIRTUAL_PARAM_SLOTS.map((slot) => (
          <MenuItem
            key={slot.key}
            dense
            onClick={() => {
              if (!vpMapMenu) return;
              const res = assignVirtualParamFromDevice(device.id, slot.key, vpMapMenu.path);
              setVpMapMenu(null);
              if (res.ok) {
                showToast(
                  'success',
                  `Mapped "${slot.label}" (${slot.canonicalKey}) → ${res.mappedPath ?? vpMapMenu.path} for ${res.vendorName}.`,
                );
              } else {
                showToast('error', res.error ?? 'Mapping failed.');
              }
            }}
          >
            <Stack direction="row" justifyContent="space-between" spacing={1.5} sx={{ width: '100%' }}>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{slot.label}</Typography>
              <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.72rem', color: 'text.secondary' }}>
                {slot.canonicalKey}
              </Typography>
            </Stack>
          </MenuItem>
        ))}
      </Menu>

      {/* Dialog: Reboot Confirmation */}
      <NocDialog
        open={rebootConfirmOpen}
        onClose={() => setRebootConfirmOpen(false)}
        title="Reboot Device"
        subtitle={`${device.serialNumber} · ${device.trSourceIp ?? 'No IP'}`}
        icon={<RestartAltIcon sx={{ fontSize: 18 }} />}
        tone="warning"
        confirmLabel="Confirm Reboot"
        onConfirm={handleReboot}
      >
        <Typography sx={{ fontSize: '0.84rem', color: 'var(--noc-text-muted)', lineHeight: 1.55, mb: 1.5 }}>
          Queue a <b>Reboot</b> RPC for this CPE/ONT? Active subscriber internet and WiFi sessions will drop briefly while the device restarts.
        </Typography>
        <Box sx={{ p: 1.25, bgcolor: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.35)', borderRadius: '6px' }}>
          <Typography sx={{ fontSize: '0.76rem', color: 'warning.main' }}>
            Executed asynchronously via {device.protocol} and recorded in Audit Logs.
          </Typography>
        </Box>
      </NocDialog>

      {/* Dialog: Factory Reset Confirmation */}
      <NocDialog
        open={resetConfirmOpen}
        onClose={() => {
          setResetConfirmOpen(false);
          setResetSerialInput('');
        }}
        title="Factory Reset Device"
        subtitle={device.serialNumber}
        icon={<WarningAmberOutlinedIcon sx={{ fontSize: 18 }} />}
        tone="danger"
        confirmLabel="Execute Factory Reset"
        confirmDisabled={resetSerialInput !== device.serialNumber}
        onConfirm={handleFactoryReset}
      >
        <Box sx={{ p: 1.25, bgcolor: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: '6px', mb: 2 }}>
          <Typography sx={{ fontSize: '0.78rem', color: 'error.main', lineHeight: 1.5 }}>
            <b>Destructive action:</b> Factory Reset wipes PPPoE, WiFi, and local configuration. Auto-retry is disabled by safety policy.
          </Typography>
        </Box>
        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', mb: 1 }}>
          Type serial number <Box component="span" sx={{ fontFamily: MONO_FONT, fontWeight: 700, color: 'text.primary' }}>{device.serialNumber}</Box> to confirm:
        </Typography>
        <TextField
          size="small"
          fullWidth
          value={resetSerialInput}
          onChange={(e) => setResetSerialInput(e.target.value)}
          placeholder={device.serialNumber}
          sx={{
            '& .MuiOutlinedInput-root': {
              height: 36,
              fontSize: '0.82rem',
              fontFamily: MONO_FONT,
              borderRadius: '6px',
            },
          }}
        />
      </NocDialog>

      {/* Dialog: Soft Delete Warning */}
      <NocDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Archive Device Record"
        subtitle={device.serialNumber}
        icon={<DeleteOutlineIcon sx={{ fontSize: 18 }} />}
        tone="danger"
        confirmLabel="Archive Device"
        onConfirm={handleDelete}
      >
        <Typography sx={{ fontSize: '0.84rem', color: 'var(--noc-text-muted)', lineHeight: 1.55, mb: 1.5 }}>
          This archives the device record from NexACS without resetting the physical ONT.
        </Typography>
        <Box sx={{ p: 1.25, bgcolor: 'var(--noc-subtle)', border: '1px solid', borderColor: 'divider', borderRadius: '6px' }}>
          <Typography sx={{ fontSize: '0.76rem', color: 'text.secondary', lineHeight: 1.45 }}>
            If auto-enrollment is enabled, the device will reappear automatically if it sends a new CWMP Inform.
          </Typography>
        </Box>
      </NocDialog>

      {/* Dialog: Edit Credentials */}
      <NocDialog
        open={credModalOpen}
        onClose={() => setCredModalOpen(false)}
        title="Rotate Device Credentials"
        subtitle={device.serialNumber}
        icon={<VpnKeyOutlinedIcon sx={{ fontSize: 18 }} />}
        tone="primary"
        confirmLabel="Save & Audit"
        onConfirm={() => {
          const credValidation = deviceCredentialsSchema.safeParse(credForm);
          if (!credValidation.success) {
            showToast('error', formatZodError(credValidation.error));
            return;
          }
          const res = updateDeviceCredentials(device.id, credValidation.data);
          setCredModalOpen(false);
          if (res.ok) showToast('success', 'Credentials encrypted & rotated.');
          else showToast('error', res.error ?? 'Error');
        }}
      >
        <Stack spacing={1.75}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              Default ONT Admin credential: <b>admin / admin</b>
            </Typography>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setCredForm((f) => ({ ...f, adminPassword: 'admin' }))}
              sx={{ fontSize: '0.72rem', textTransform: 'none', py: 0.25 }}
            >
              Use Default (admin)
            </Button>
          </Stack>
          <TextField
            size="small"
            label="Admin Password"
            type="password"
            value={credForm.adminPassword}
            onChange={(e) => setCredForm((f) => ({ ...f, adminPassword: e.target.value }))}
          />
          <TextField
            size="small"
            label="User Password"
            type="password"
            value={credForm.userPassword}
            onChange={(e) => setCredForm((f) => ({ ...f, userPassword: e.target.value }))}
          />
          <TextField
            size="small"
            label="Connection Request Password"
            type="password"
            value={credForm.connectionRequestPassword}
            onChange={(e) => setCredForm((f) => ({ ...f, connectionRequestPassword: e.target.value }))}
          />
        </Stack>
      </NocDialog>

      {/* Dialog: Task Details */}
      <NocDialog
        open={Boolean(selectedTask)}
        onClose={() => setSelectedTask(null)}
        title={`Task Detail`}
        subtitle={(selectedTask ?? retainedTask)?.id}
        icon={<StorageOutlinedIcon sx={{ fontSize: 18 }} />}
        tone="neutral"
        maxWidth="sm"
        cancelLabel="Close"
      >
        {(selectedTask ?? retainedTask) && (() => {
          const t = (selectedTask ?? retainedTask)!;
          return (
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} alignItems="center">
                <TaskStatusChip status={t.status} />
                <Typography sx={{ fontSize: '0.76rem', color: 'text.secondary' }}>
                  Correlation: <Box component="span" sx={{ fontFamily: MONO_FONT, color: 'text.primary' }}>{t.correlationId}</Box>
                </Typography>
              </Stack>
              <Typography sx={{ fontSize: '0.84rem', color: 'var(--noc-text-muted)' }}>{t.summary}</Typography>
              <Box sx={{ p: 1.5, bgcolor: '#0B1120', color: '#E2E8F0', border: '1px solid var(--noc-border)', borderRadius: '6px', fontFamily: MONO_FONT, fontSize: '0.75rem' }}>
                {t.logs.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </Box>
            </Stack>
          );
        })()}
      </NocDialog>

      <NocToast
        open={toast.open}
        severity={toast.severity}
        text={toast.text}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
      />
    </Box>
  );
}
