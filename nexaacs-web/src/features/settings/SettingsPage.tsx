import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
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
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SearchIcon from '@mui/icons-material/Search';
import TuneIcon from '@mui/icons-material/Tune';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useParams } from 'react-router-dom';
import { normalizeVirtualParamTemplate, useAcsStore } from '../../stores/acsStore';
import {
  extractZodFieldErrors,
  formatZodError,
  manufacturerAliasSchema,
  systemSettingsSchema,
} from '../../validation/schemas';
import { VIRTUAL_PARAM_PRESETS } from '../../services/seed-data';
import { NocDialog } from '../../components/dialogs/NocDialog';
import { NocToast } from '../../components/feedback/NocToast';
import { pageEnterSx, SettingsSkeleton, usePageSkeleton } from '../../components/skeletons/PageSkeletons';
import { TruncatedText } from '../../components/common/TruncatedText';
import type { ManufacturerAlias, SystemSettings, VirtualParameterMapping } from '../../types';

const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

const TIMEZONE_OPTIONS = [
  { value: 'Etc/GMT+12', label: '(UTC-12:00) International Date Line West' },
  { value: 'Pacific/Pago_Pago', label: '(UTC-11:00) Pago Pago / Samoa' },
  { value: 'Pacific/Honolulu', label: '(UTC-10:00) Hawaii' },
  { value: 'Pacific/Marquesas', label: '(UTC-09:30) Marquesas Islands' },
  { value: 'America/Anchorage', label: '(UTC-09:00) Alaska' },
  { value: 'America/Los_Angeles', label: '(UTC-08:00) Los Angeles / US Pacific' },
  { value: 'America/Denver', label: '(UTC-07:00) Denver / US Mountain' },
  { value: 'America/Chicago', label: '(UTC-06:00) Chicago / Mexico City' },
  { value: 'America/New_York', label: '(UTC-05:00) New York / US Eastern' },
  { value: 'America/Santiago', label: '(UTC-04:00) Santiago / Atlantic' },
  { value: 'America/St_Johns', label: '(UTC-03:30) Newfoundland' },
  { value: 'America/Sao_Paulo', label: '(UTC-03:00) Sao Paulo / Buenos Aires' },
  { value: 'Atlantic/South_Georgia', label: '(UTC-02:00) South Georgia' },
  { value: 'Atlantic/Azores', label: '(UTC-01:00) Azores / Cape Verde' },
  { value: 'UTC', label: '(UTC+00:00) UTC / London' },
  { value: 'Europe/Berlin', label: '(UTC+01:00) Berlin / Paris' },
  { value: 'Africa/Cairo', label: '(UTC+02:00) Cairo / Johannesburg' },
  { value: 'Asia/Riyadh', label: '(UTC+03:00) Riyadh / Moscow' },
  { value: 'Asia/Tehran', label: '(UTC+03:30) Tehran' },
  { value: 'Asia/Dubai', label: '(UTC+04:00) Dubai / Baku' },
  { value: 'Asia/Kabul', label: '(UTC+04:30) Kabul' },
  { value: 'Asia/Karachi', label: '(UTC+05:00) Karachi / Tashkent' },
  { value: 'Asia/Kolkata', label: '(UTC+05:30) Kolkata / New Delhi' },
  { value: 'Asia/Kathmandu', label: '(UTC+05:45) Kathmandu' },
  { value: 'Asia/Dhaka', label: '(UTC+06:00) Dhaka / Almaty' },
  { value: 'Asia/Yangon', label: '(UTC+06:30) Yangon' },
  { value: 'Asia/Jakarta', label: '(UTC+07:00) Indonesia WIB — Jakarta' },
  { value: 'Asia/Makassar', label: '(UTC+08:00) Indonesia WITA — Makassar' },
  { value: 'Asia/Jayapura', label: '(UTC+09:00) Indonesia WIT — Jayapura' },
  { value: 'Australia/Darwin', label: '(UTC+09:30) Darwin / Adelaide' },
  { value: 'Australia/Sydney', label: '(UTC+10:00) Sydney / Melbourne' },
  { value: 'Pacific/Noumea', label: '(UTC+11:00) Noumea / Solomon Islands' },
  { value: 'Pacific/Auckland', label: '(UTC+12:00) Auckland / Fiji' },
  { value: 'Pacific/Chatham', label: '(UTC+12:45) Chatham Islands' },
  { value: 'Pacific/Apia', label: '(UTC+13:00) Apia / Tonga' },
  { value: 'Pacific/Kiritimati', label: '(UTC+14:00) Kiritimati / Line Islands' },
] as const;

function infoIconTip(tip: string) {
  return (
    <Tooltip title={tip} arrow placement="top">
      <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary', cursor: 'help', flexShrink: 0 }} />
    </Tooltip>
  );
}

function infoAdornment(tip: string) {
  return {
    endAdornment: <InputAdornment position="end">{infoIconTip(tip)}</InputAdornment>,
  };
}

const EMPTY_VIRTUAL_PARAMS: VirtualParameterMapping = {
  serialNumber: '',
  manufacturer: '',
  oui: '',
  productClass: '',
  modelName: '',
  hardwareVersion: '',
  softwareVersion: '',
  rxPower: '',
  temperature: '',
  uptime: '',
  connectionRequestUrl: '',
  periodicInformInterval: '',
  wanRoot: '',
  wanExternalIp: '',
  wanPppoeUsername: '',
  wanPppoePassword: '',
  wanVlanId: '',
  wanStatus: '',
  wanAddressingType: '',
  wanSubnetMask: '',
  wanGateway: '',
  wanDnsServers: '',
  wanConnectionType: '',
  wanServiceList: '',
  wanNatEnabled: '',
  wanPortBindings: '',
  wlanRoot: '',
  wlanSsid: '',
  wlanPassphrase: '',
  wlanEnabled: '',
  wlanChannel: '',
  wlanSecurityMode: '',
  wlanBand: '',
  wlanAutoChannel: '',
  connectedHostsRoot: '',
  hostName: '',
  hostMac: '',
  hostIp: '',
  lanIp: '',
  lanSubnetMask: '',
  lanDhcpEnable: '',
  lanDhcpOption125Enable: '',
  lanDhcpLeaseTime: '',
  lanDhcpStartIp: '',
  lanDhcpEndIp: '',
  lanDhcpAssignIspDns: '',
  lanDhcpDnsServers: '',
  adminUsername: '',
  adminPassword: '',
  userUsername: '',
  userPassword: '',
};

type AliasFormState = Omit<ManufacturerAlias, 'id'>;

const EMPTY_ALIAS_FORM: AliasFormState = {
  rawName: '',
  canonicalName: '',
  oui: '',
  source: 'manual',
  confidence: 'high',
  virtualParameters: { ...EMPTY_VIRTUAL_PARAMS },
};

const VIRTUAL_PARAM_GROUPS = [
  'Device Info & Identity',
  'Telemetry & Management',
  'WAN Connections',
  'WiFi Configuration',
  'Connected Hosts',
  'LAN & DHCP Server',
  'Modem Credentials',
] as const;

const VIRTUAL_PARAM_FIELDS: Array<{
  key: keyof VirtualParameterMapping;
  group: (typeof VIRTUAL_PARAM_GROUPS)[number];
  label: string;
  canonicalKey: string;
  placeholder: string;
}> = [
    {
      key: 'serialNumber',
      group: 'Device Info & Identity',
      label: 'Serial Number Path',
      canonicalKey: 'device.serial_number',
      placeholder: 'e.g. InternetGatewayDevice.DeviceInfo.SerialNumber',
    },
    {
      key: 'manufacturer',
      group: 'Device Info & Identity',
      label: 'Manufacturer Path',
      canonicalKey: 'device.manufacturer',
      placeholder: 'e.g. InternetGatewayDevice.DeviceInfo.Manufacturer',
    },
    {
      key: 'oui',
      group: 'Device Info & Identity',
      label: 'Manufacturer OUI Path',
      canonicalKey: 'device.oui',
      placeholder: 'e.g. InternetGatewayDevice.DeviceInfo.ManufacturerOUI',
    },
    {
      key: 'productClass',
      group: 'Device Info & Identity',
      label: 'Product Class Path',
      canonicalKey: 'device.product_class',
      placeholder: 'e.g. InternetGatewayDevice.DeviceInfo.ProductClass',
    },
    {
      key: 'modelName',
      group: 'Device Info & Identity',
      label: 'Model Name Path',
      canonicalKey: 'device.model_name',
      placeholder: 'e.g. InternetGatewayDevice.DeviceInfo.ModelName',
    },
    {
      key: 'hardwareVersion',
      group: 'Device Info & Identity',
      label: 'Hardware Version Path',
      canonicalKey: 'device.hardware_version',
      placeholder: 'e.g. InternetGatewayDevice.DeviceInfo.HardwareVersion',
    },
    {
      key: 'softwareVersion',
      group: 'Device Info & Identity',
      label: 'Software Version Path',
      canonicalKey: 'device.software_version',
      placeholder: 'e.g. InternetGatewayDevice.DeviceInfo.SoftwareVersion',
    },
    {
      key: 'rxPower',
      group: 'Telemetry & Management',
      label: 'Optical RX Power Path',
      canonicalKey: 'optical.rx_power_dbm',
      placeholder: 'e.g. InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RXPower',
    },
    {
      key: 'temperature',
      group: 'Telemetry & Management',
      label: 'Temperature Path',
      canonicalKey: 'device.temperature_celsius',
      placeholder: 'e.g. InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TransceiverTemperature',
    },
    {
      key: 'uptime',
      group: 'Telemetry & Management',
      label: 'Uptime Path',
      canonicalKey: 'device.uptime_seconds',
      placeholder: 'e.g. InternetGatewayDevice.DeviceInfo.UpTime',
    },
    {
      key: 'connectionRequestUrl',
      group: 'Telemetry & Management',
      label: 'Connection Request URL Path',
      canonicalKey: 'management.connection_request_url',
      placeholder: 'e.g. InternetGatewayDevice.ManagementServer.ConnectionRequestURL',
    },
    {
      key: 'periodicInformInterval',
      group: 'Telemetry & Management',
      label: 'Periodic Inform Interval Path',
      canonicalKey: 'management.periodic_inform_interval',
      placeholder: 'e.g. InternetGatewayDevice.ManagementServer.PeriodicInformInterval',
    },
    {
      key: 'wanRoot',
      group: 'WAN Connections',
      label: 'WAN Root Object',
      canonicalKey: 'wan.root',
      placeholder: 'e.g. InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}',
    },
    {
      key: 'wanExternalIp',
      group: 'WAN Connections',
      label: 'WAN External IP Path',
      canonicalKey: 'wan.external_ip',
      placeholder: 'e.g. InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.ExternalIPAddress',
    },
    {
      key: 'wanPppoeUsername',
      group: 'WAN Connections',
      label: 'WAN PPPoE Username Path',
      canonicalKey: 'wan.pppoe_username',
      placeholder: 'e.g. InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.Username',
    },
    {
      key: 'wanPppoePassword',
      group: 'WAN Connections',
      label: 'WAN PPPoE Password Path',
      canonicalKey: 'wan.pppoe_password',
      placeholder: 'e.g. InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.Password',
    },
    {
      key: 'wanVlanId',
      group: 'WAN Connections',
      label: 'WAN VLAN ID Path',
      canonicalKey: 'wan.vlan_id',
      placeholder: 'e.g. InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.X_ZTE-COM_VLANID',
    },
    {
      key: 'wanStatus',
      group: 'WAN Connections',
      label: 'WAN Connection Status Path',
      canonicalKey: 'wan.status',
      placeholder: 'e.g. InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.ConnectionStatus',
    },
    {
      key: 'wanAddressingType',
      group: 'WAN Connections',
      label: 'IPoE Addressing Type Path',
      canonicalKey: 'wan.addressing_type',
      placeholder: 'e.g. InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANIPConnection.1.AddressingType',
    },
    {
      key: 'wanSubnetMask',
      group: 'WAN Connections',
      label: 'IPoE Subnet Mask Path',
      canonicalKey: 'wan.subnet_mask',
      placeholder: 'e.g. InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANIPConnection.1.SubnetMask',
    },
    {
      key: 'wanGateway',
      group: 'WAN Connections',
      label: 'IPoE Default Gateway Path',
      canonicalKey: 'wan.gateway',
      placeholder: 'e.g. InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANIPConnection.1.DefaultGateway',
    },
    {
      key: 'wanDnsServers',
      group: 'WAN Connections',
      label: 'IPoE DNS Servers Path',
      canonicalKey: 'wan.dns_servers',
      placeholder: 'e.g. InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANIPConnection.1.DNSServers',
    },
    {
      key: 'wanConnectionType',
      group: 'WAN Connections',
      label: 'WAN Connection Type Path',
      canonicalKey: 'wan.connection_type',
      placeholder: 'e.g. InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.ConnectionType',
    },
    {
      key: 'wanServiceList',
      group: 'WAN Connections',
      label: 'WAN Service List Path',
      canonicalKey: 'wan.service_list',
      placeholder: 'e.g. InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.X_ZTE-COM_ServiceList',
    },
    {
      key: 'wanNatEnabled',
      group: 'WAN Connections',
      label: 'WAN NAT Enable Path',
      canonicalKey: 'wan.nat_enabled',
      placeholder: 'e.g. InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.NATEnabled',
    },
    {
      key: 'wanPortBindings',
      group: 'WAN Connections',
      label: 'WAN Port Binding Path',
      canonicalKey: 'wan.port_bindings',
      placeholder: 'e.g. InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.X_ZTE-COM_LanInterface',
    },
    {
      key: 'wlanRoot',
      group: 'WiFi Configuration',
      label: 'WLAN Root Object',
      canonicalKey: 'wifi.root',
      placeholder: 'e.g. InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}',
    },
    {
      key: 'wlanSsid',
      group: 'WiFi Configuration',
      label: 'WLAN SSID Path',
      canonicalKey: 'wifi.ssid',
      placeholder: 'e.g. InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.SSID',
    },
    {
      key: 'wlanPassphrase',
      group: 'WiFi Configuration',
      label: 'WLAN Password Path',
      canonicalKey: 'wifi.security_key',
      placeholder: 'e.g. InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.PreSharedKey.1.KeyPassphrase',
    },
    {
      key: 'wlanEnabled',
      group: 'WiFi Configuration',
      label: 'WLAN Enable Path',
      canonicalKey: 'wifi.enabled',
      placeholder: 'e.g. InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.Enable',
    },
    {
      key: 'wlanChannel',
      group: 'WiFi Configuration',
      label: 'WLAN Channel Path',
      canonicalKey: 'wifi.channel',
      placeholder: 'e.g. InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.Channel',
    },
    {
      key: 'wlanSecurityMode',
      group: 'WiFi Configuration',
      label: 'WLAN Security Mode Path',
      canonicalKey: 'wifi.security_mode',
      placeholder: 'e.g. InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.BeaconType',
    },
    {
      key: 'wlanBand',
      group: 'WiFi Configuration',
      label: 'WLAN Frequency Band Path',
      canonicalKey: 'wifi.band',
      placeholder: 'e.g. InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.OperatingFrequencyBand',
    },
    {
      key: 'wlanAutoChannel',
      group: 'WiFi Configuration',
      label: 'WLAN Auto Channel Path',
      canonicalKey: 'wifi.auto_channel',
      placeholder: 'e.g. InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.AutoChannelEnable',
    },
    {
      key: 'connectedHostsRoot',
      group: 'Connected Hosts',
      label: 'Connected Hosts Root',
      canonicalKey: 'hosts.root',
      placeholder: 'e.g. InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}',
    },
    {
      key: 'hostName',
      group: 'Connected Hosts',
      label: 'Host Hostname Path',
      canonicalKey: 'hosts.hostname',
      placeholder: 'e.g. InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}.HostName',
    },
    {
      key: 'hostMac',
      group: 'Connected Hosts',
      label: 'Host MAC Address Path',
      canonicalKey: 'hosts.mac_address',
      placeholder: 'e.g. InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}.MACAddress',
    },
    {
      key: 'hostIp',
      group: 'Connected Hosts',
      label: 'Host IP Address Path',
      canonicalKey: 'hosts.ip_address',
      placeholder: 'e.g. InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}.IPAddress',
    },
    {
      key: 'lanIp',
      group: 'LAN & DHCP Server',
      label: 'LAN IP Address Path',
      canonicalKey: 'lan.ip_address',
      placeholder: 'e.g. InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceIPAddress',
    },
    {
      key: 'lanSubnetMask',
      group: 'LAN & DHCP Server',
      label: 'LAN Subnet Mask Path',
      canonicalKey: 'lan.subnet_mask',
      placeholder: 'e.g. InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceSubnetMask',
    },
    {
      key: 'lanDhcpEnable',
      group: 'LAN & DHCP Server',
      label: 'DHCP Server Enable Path',
      canonicalKey: 'lan.dhcp_enabled',
      placeholder: 'e.g. InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPServerEnable',
    },
    {
      key: 'lanDhcpOption125Enable',
      group: 'LAN & DHCP Server',
      label: 'Option 125 Enable Path',
      canonicalKey: 'lan.dhcp_option125_enabled',
      placeholder: 'e.g. InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.X_HW_Option125Enable',
    },
    {
      key: 'lanDhcpLeaseTime',
      group: 'LAN & DHCP Server',
      label: 'DHCP Lease Time Path',
      canonicalKey: 'lan.dhcp_lease_time',
      placeholder: 'e.g. InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPLeaseTime',
    },
    {
      key: 'lanDhcpStartIp',
      group: 'LAN & DHCP Server',
      label: 'Start DHCP IP Path',
      canonicalKey: 'lan.dhcp_start_ip',
      placeholder: 'e.g. InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MinAddress',
    },
    {
      key: 'lanDhcpEndIp',
      group: 'LAN & DHCP Server',
      label: 'End DHCP IP Path',
      canonicalKey: 'lan.dhcp_end_ip',
      placeholder: 'e.g. InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MaxAddress',
    },
    {
      key: 'lanDhcpAssignIspDns',
      group: 'LAN & DHCP Server',
      label: 'Assign ISP DNS Enable Path',
      canonicalKey: 'lan.dhcp_assign_isp_dns',
      placeholder: 'e.g. InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.UseAllocatedWAN',
    },
    {
      key: 'lanDhcpDnsServers',
      group: 'LAN & DHCP Server',
      label: 'DHCP DNS Servers Path',
      canonicalKey: 'lan.dhcp_dns_servers',
      placeholder: 'e.g. InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DNSServers',
    },
    {
      key: 'adminUsername',
      group: 'Modem Credentials',
      label: 'Modem Admin Username Path',
      canonicalKey: 'credentials.admin_username',
      placeholder: 'e.g. InternetGatewayDevice.UserInterface.X_ZTE-COM_UserInfo.AdminName',
    },
    {
      key: 'adminPassword',
      group: 'Modem Credentials',
      label: 'Modem Admin Password Path',
      canonicalKey: 'credentials.admin_password',
      placeholder: 'e.g. InternetGatewayDevice.UserInterface.X_ZTE-COM_UserInfo.AdminPassword',
    },
    {
      key: 'userUsername',
      group: 'Modem Credentials',
      label: 'Modem User Username Path',
      canonicalKey: 'credentials.user_username',
      placeholder: 'e.g. InternetGatewayDevice.UserInterface.X_ZTE-COM_UserInfo.UserName',
    },
    {
      key: 'userPassword',
      group: 'Modem Credentials',
      label: 'Modem User Password Path',
      canonicalKey: 'credentials.user_password',
      placeholder: 'e.g. InternetGatewayDevice.UserInterface.X_ZTE-COM_UserInfo.UserPassword',
    },
  ];

export function SettingsPage() {
  const { section } = useParams<{ section?: string }>();
  const sectionKey = section ?? 'general';
  return <SettingsPageSection key={sectionKey} section={sectionKey} />;
}

function SettingsPageSection({ section }: { section: string }) {
  const settings = useAcsStore((s) => s.settings);
  const apiMode = useAcsStore((s) => s.apiMode);
  const backendRefreshing = useAcsStore((s) => s.backendRefreshing);
  const aliases = useAcsStore((s) => s.aliases);
  const devices = useAcsStore((s) => s.devices);
  const updateSettings = useAcsStore((s) => s.updateSettings);
  const addManufacturerAlias = useAcsStore((s) => s.addManufacturerAlias);
  const updateManufacturerAlias = useAcsStore((s) => s.updateManufacturerAlias);
  const removeManufacturerAlias = useAcsStore((s) => s.removeManufacturerAlias);
  const hasPermission = useAcsStore((s) => s.hasPermission);

  const sectionMap: Record<string, { tab: number; title: string; subtitle: string }> = {
    general: {
      tab: 0,
      title: 'General & Device Status',
      subtitle: 'Configure system identity, retention, and device online/offline inform policies.',
    },
    thresholds: {
      tab: 1,
      title: 'Health Thresholds',
      subtitle: 'Configure temperature and optical RX power classification buckets used across dashboards.',
    },
    aliases: {
      tab: 2,
      title: 'Aliases & Virtual Parameters',
      subtitle: 'Manage manufacturer aliases, OUI catalog, and TR-069/TR-369 Virtual Parameter paths.',
    },
    protocol: {
      tab: 3,
      title: 'Protocol (CWMP / USP)',
      subtitle: 'Configure TR-069 CWMP endpoint, timeouts, and TR-369 USP controller transport.',
    },
  };
  const activeSection = sectionMap[section] ?? sectionMap.general;
  const tab = activeSection.tab;

  const [draft, setDraft] = useState<SystemSettings>(settings);
  useEffect(() => {
    setDraft(settings);
  }, [settings]);
  const [toast, setToast] = useState<{ open: boolean; severity: 'success' | 'error' | 'info'; text: string }>({
    open: false,
    severity: 'success',
    text: '',
  });
  const showToast = (severity: 'success' | 'error' | 'info', text: string) => {
    setToast({ open: true, severity, text });
  };
  const [aliasSearch, setAliasSearch] = useState('');
  const [aliasModalOpen, setAliasModalOpen] = useState(false);
  const [editingAliasId, setEditingAliasId] = useState<string | null>(null);
  const [aliasForm, setAliasForm] = useState<AliasFormState>(EMPTY_ALIAS_FORM);
  const [aliasFormError, setAliasFormError] = useState('');
  const [aliasFieldErrors, setAliasFieldErrors] = useState<Record<string, string>>({});
  const [sampleDeviceId, setSampleDeviceId] = useState<string>('');
  const { loading } = usePageSkeleton();

  const canEdit = hasPermission('settings.manage');

  const activeDevices = useMemo(() => devices.filter((d) => !d.deletedAt), [devices]);

  const filteredAliases = useMemo(() => {
    const q = aliasSearch.trim().toLowerCase();
    if (!q) return aliases;
    return aliases.filter((a) => {
      const vpValues = Object.values(a.virtualParameters).join(' ').toLowerCase();
      return (
        a.rawName.toLowerCase().includes(q) ||
        a.canonicalName.toLowerCase().includes(q) ||
        a.oui.toLowerCase().includes(q) ||
        vpValues.includes(q)
      );
    });
  }, [aliases, aliasSearch]);

  const sampleDevice = useMemo(
    () => activeDevices.find((d) => d.id === sampleDeviceId) ?? null,
    [activeDevices, sampleDeviceId],
  );

  const availablePathOptions = useMemo(() => {
    const sourceDevices = sampleDevice ? [sampleDevice] : activeDevices;
    const seen = new Map<string, string>();
    for (const dev of sourceDevices) {
      for (const p of dev.parameters) {
        if (!seen.has(p.path)) {
          seen.set(p.path, p.isSecret ? '••••••••' : (p.value ?? ''));
        }
      }
    }
    return Array.from(seen.entries()).map(([path, sampleValue]) => ({ path, sampleValue }));
  }, [sampleDevice, activeDevices]);

  const openAddAliasModal = () => {
    setEditingAliasId(null);
    setAliasForm({ ...EMPTY_ALIAS_FORM, virtualParameters: { ...EMPTY_VIRTUAL_PARAMS } });
    setAliasFormError('');
    setAliasFieldErrors({});
    setSampleDeviceId('');
    setAliasModalOpen(true);
  };

  const openEditAliasModal = (a: ManufacturerAlias) => {
    setEditingAliasId(a.id);
    setAliasForm({
      rawName: a.rawName,
      canonicalName: a.canonicalName,
      oui: a.oui,
      source: a.source,
      confidence: a.confidence,
      virtualParameters: { ...a.virtualParameters },
    });
    setAliasFormError('');
    setAliasFieldErrors({});
    setSampleDeviceId('');
    setAliasModalOpen(true);
  };

  const handleSaveAliasModal = () => {
    if (!canEdit) return;
    setAliasFormError('');
    setAliasFieldErrors({});
    const parsed = manufacturerAliasSchema.safeParse(aliasForm);
    if (!parsed.success) {
      setAliasFieldErrors(extractZodFieldErrors(parsed.error));
      setAliasFormError(formatZodError(parsed.error));
      return;
    }
    const payload: AliasFormState = {
      ...aliasForm,
      rawName: parsed.data.rawName,
      canonicalName: parsed.data.canonicalName,
      oui: parsed.data.oui,
      confidence: parsed.data.confidence,
    };
    if (editingAliasId) {
      updateManufacturerAlias(editingAliasId, payload);
      showToast('success', `Updated alias "${payload.canonicalName}" & Virtual Parameter mappings.`);
    } else {
      addManufacturerAlias(payload);
      showToast('success', `Added alias "${payload.canonicalName}" with Virtual Parameter mappings.`);
    }
    setAliasModalOpen(false);
  };

  const applySampleDevice = (deviceId: string) => {
    setSampleDeviceId(deviceId);
    const dev = activeDevices.find((d) => d.id === deviceId);
    if (!dev) return;
    const findPath = (key: string, fallbackMatch: RegExp) =>
      dev.parameters.find((p) => p.canonicalKey === key)?.path ??
      dev.parameters.find((p) => fallbackMatch.test(p.path))?.path ??
      '';
    const isTr181 = dev.dataModelRoot === 'Device.';
    setAliasForm((prev) => ({
      ...prev,
      rawName: prev.rawName || dev.manufacturerRaw,
      canonicalName: prev.canonicalName || dev.manufacturerCanonical,
      oui: prev.oui || dev.oui,
      virtualParameters: {
        serialNumber: findPath('device.serial_number', /\.SerialNumber$/i) || prev.virtualParameters.serialNumber,
        manufacturer: findPath('device.manufacturer', /\.Manufacturer$/i) || prev.virtualParameters.manufacturer,
        oui: findPath('device.oui', /\.ManufacturerOUI$/i) || prev.virtualParameters.oui,
        productClass: findPath('device.product_class', /\.ProductClass$/i) || prev.virtualParameters.productClass,
        modelName: findPath('device.model_name', /\.ModelName$/i) || prev.virtualParameters.modelName,
        hardwareVersion: findPath('device.hardware_version', /\.HardwareVersion$/i) || prev.virtualParameters.hardwareVersion,
        softwareVersion: findPath('device.software_version', /\.SoftwareVersion$/i) || prev.virtualParameters.softwareVersion,
        rxPower: findPath('optical.rx_power_dbm', /RXPower|OpticalSignalLevel/i) || prev.virtualParameters.rxPower,
        temperature: findPath('device.temperature_celsius', /Temperature/i) || prev.virtualParameters.temperature,
        uptime: findPath('device.uptime_seconds', /UpTime/i) || prev.virtualParameters.uptime,
        connectionRequestUrl:
          findPath('management.connection_request_url', /ConnectionRequestURL$/i) ||
          prev.virtualParameters.connectionRequestUrl,
        periodicInformInterval:
          findPath('management.periodic_inform_interval', /PeriodicInformInterval$/i) ||
          prev.virtualParameters.periodicInformInterval,
        wanRoot: isTr181
          ? 'Device.IP.Interface.{i}'
          : 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}',
        wanExternalIp:
          normalizeVirtualParamTemplate('wanExternalIp', findPath('wan.external_ip', /ExternalIPAddress|IPv4Address/i)) ||
          prev.virtualParameters.wanExternalIp,
        wanPppoeUsername:
          normalizeVirtualParamTemplate('wanPppoeUsername', findPath('wan.pppoe_username', /PPP.*Username/i)) ||
          prev.virtualParameters.wanPppoeUsername,
        wanPppoePassword:
          normalizeVirtualParamTemplate('wanPppoePassword', findPath('wan.pppoe_password', /PPP.*Password/i)) ||
          prev.virtualParameters.wanPppoePassword,
        wanVlanId:
          normalizeVirtualParamTemplate('wanVlanId', findPath('wan.vlan_id', /VLAN/i)) ||
          prev.virtualParameters.wanVlanId,
        wanStatus:
          normalizeVirtualParamTemplate(
            'wanStatus',
            findPath('wan.status', /ConnectionStatus|\.IP\.Interface\.\d+\.Status$/i),
          ) || prev.virtualParameters.wanStatus,
        wlanRoot: isTr181
          ? 'Device.WiFi.SSID.{i}'
          : 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}',
        wlanSsid:
          normalizeVirtualParamTemplate('wlanSsid', findPath('wifi.ssid', /\.SSID$/i)) ||
          prev.virtualParameters.wlanSsid,
        wlanPassphrase:
          normalizeVirtualParamTemplate('wlanPassphrase', findPath('wifi.security_key', /KeyPassphrase|PreSharedKey/i)) ||
          prev.virtualParameters.wlanPassphrase,
        wlanEnabled:
          normalizeVirtualParamTemplate(
            'wlanEnabled',
            findPath('wifi.enabled', /(WLANConfiguration|WiFi\.SSID)\.\d+\.Enable$/i),
          ) || prev.virtualParameters.wlanEnabled,
        wlanChannel:
          normalizeVirtualParamTemplate('wlanChannel', findPath('wifi.channel', /\.Channel$/i)) ||
          prev.virtualParameters.wlanChannel,
        connectedHostsRoot: isTr181
          ? 'Device.Hosts.Host.{i}'
          : 'InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}',
        hostName:
          normalizeVirtualParamTemplate('hostName', findPath('hosts.hostname', /\.HostName$/i)) ||
          prev.virtualParameters.hostName,
        hostMac:
          normalizeVirtualParamTemplate('hostMac', findPath('hosts.mac_address', /(PhysAddress|MACAddress)$/i)) ||
          prev.virtualParameters.hostMac,
        hostIp:
          normalizeVirtualParamTemplate('hostIp', findPath('hosts.ip_address', /Host\.\d+\.IPAddress$/i)) ||
          prev.virtualParameters.hostIp,
        lanIp:
          findPath('lan.ip_address', /LANHostConfigManagement\.IPInterface\.\d+\.IPInterfaceIPAddress$/i) ||
          prev.virtualParameters.lanIp,
        lanSubnetMask:
          findPath('lan.subnet_mask', /LANHostConfigManagement\.IPInterface\.\d+\.IPInterfaceSubnetMask$/i) ||
          prev.virtualParameters.lanSubnetMask,
        lanDhcpEnable:
          findPath('lan.dhcp_enabled', /LANHostConfigManagement\.DHCPServerEnable$/i) ||
          prev.virtualParameters.lanDhcpEnable,
        lanDhcpOption125Enable:
          findPath('lan.dhcp_option125_enabled', /LANHostConfigManagement\..*Option125.*Enable$/i) ||
          prev.virtualParameters.lanDhcpOption125Enable,
        lanDhcpLeaseTime:
          findPath('lan.dhcp_lease_time', /LANHostConfigManagement\.DHCPLeaseTime$/i) ||
          prev.virtualParameters.lanDhcpLeaseTime,
        lanDhcpStartIp:
          findPath('lan.dhcp_start_ip', /LANHostConfigManagement\.MinAddress$/i) ||
          prev.virtualParameters.lanDhcpStartIp,
        lanDhcpEndIp:
          findPath('lan.dhcp_end_ip', /LANHostConfigManagement\.MaxAddress$/i) ||
          prev.virtualParameters.lanDhcpEndIp,
        lanDhcpAssignIspDns:
          findPath('lan.dhcp_assign_isp_dns', /LANHostConfigManagement\.(?:UseAllocatedWAN|.*DNSRelayEnable)$/i) ||
          prev.virtualParameters.lanDhcpAssignIspDns,
        lanDhcpDnsServers:
          findPath('lan.dhcp_dns_servers', /LANHostConfigManagement\.DNSServers$/i) ||
          prev.virtualParameters.lanDhcpDnsServers,
        adminUsername: findPath('credentials.admin_username', /AdminName|User\.1\.Username/i) || prev.virtualParameters.adminUsername,
        adminPassword: findPath('credentials.admin_password', /AdminPassword|User\.1\.Password/i) || prev.virtualParameters.adminPassword,
        userUsername: findPath('credentials.user_username', /UserName|User\.2\.Username/i) || prev.virtualParameters.userUsername,
        userPassword: findPath('credentials.user_password', /UserPassword|User\.2\.Password/i) || prev.virtualParameters.userPassword,
      },
    }));
  };

  const handleSave = () => {
    if (!canEdit) return;
    const parsed = systemSettingsSchema.safeParse(draft);
    if (!parsed.success) {
      showToast('error', formatZodError(parsed.error));
      return;
    }
    updateSettings(parsed.data);
    showToast('success', 'System settings saved. Dashboard and device status thresholds updated.');
  };

  if (loading || (apiMode === 'backend' && backendRefreshing)) {
    return <SettingsSkeleton section={section} />;
  }

  return (
    <Box sx={pageEnterSx}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1.5} sx={{ mb: 2 }}>
        <Typography variant="h5">Settings · {activeSection.title}</Typography>
        {tab !== 2 && (
          <Button variant="contained" startIcon={<SaveIcon />} disabled={!canEdit} onClick={handleSave}>
            Save Settings
          </Button>
        )}
      </Stack>

      {!canEdit && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Read-only mode: <code>settings.manage</code> permission is required to modify settings.
        </Alert>
      )}

      {tab === 0 && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="subtitle1" sx={{ mb: 2 }}>
                  General Settings
                </Typography>
                <Stack spacing={2}>
                  <TextField
                    fullWidth
                    size="small"
                    label="System Name"
                    disabled={!canEdit}
                    value={draft.general.systemName}
                    onChange={(e) => setDraft({ ...draft, general: { ...draft.general, systemName: e.target.value } })}
                    InputProps={infoAdornment('Nama identitas platform ACS Anda yang tersimpan di konfigurasi sistem.')}
                  />
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <TextField
                      select
                      fullWidth
                      size="small"
                      label="Timezone"
                      disabled={!canEdit}
                      value={draft.general.timezone}
                      onChange={(e) => setDraft({ ...draft, general: { ...draft.general, timezone: e.target.value } })}
                    >
                      {!TIMEZONE_OPTIONS.some((tz) => tz.value === draft.general.timezone) && draft.general.timezone && (
                        <MenuItem value={draft.general.timezone}>{draft.general.timezone}</MenuItem>
                      )}
                      {TIMEZONE_OPTIONS.map((tz) => (
                        <MenuItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </MenuItem>
                      ))}
                    </TextField>
                    {infoIconTip('Zona waktu global (UTC-12 hingga UTC+14). Langsung mengubah tampilan tanggal & jam di seluruh dashboard web.')}
                  </Stack>
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    label="Default Table Page Size"
                    disabled={!canEdit}
                    value={draft.general.defaultPageSize}
                    onChange={(e) => setDraft({ ...draft, general: { ...draft.general, defaultPageSize: Number(e.target.value) || 15 } })}
                    InputProps={infoAdornment('Jumlah baris data default per halaman pada tabel daftar Devices.')}
                  />
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    label="Telemetry Retention (Days)"
                    disabled={!canEdit}
                    value={draft.general.retentionDays}
                    onChange={(e) => setDraft({ ...draft, general: { ...draft.general, retentionDays: Number(e.target.value) || 90 } })}
                    InputProps={infoAdornment('Batas lama penyimpanan riwayat Inform Events, Sessions, & Task selesai sebelum dibersihkan otomatis oleh worker.')}
                  />
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="subtitle1" sx={{ mb: 2 }}>
                  Device Online/Offline Status Policy
                </Typography>
                <Stack spacing={2}>
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    label="Online Threshold (Seconds)"
                    helperText="Default: 1800s (30 minutes). Immediately affects Overview, Devices, & API status."
                    disabled={!canEdit}
                    value={draft.deviceStatus.onlineThresholdSeconds}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        deviceStatus: { ...draft.deviceStatus, onlineThresholdSeconds: Number(e.target.value) || 1800 },
                      })
                    }
                    InputProps={infoAdornment('Batas waktu sejak Last Inform sebelum ONT dianggap Offline. Langsung memengaruhi status di UI dan backend API.')}
                  />
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    label="Expected Periodic Inform Interval (Seconds)"
                    disabled={!canEdit}
                    value={draft.deviceStatus.periodicInformExpectationSeconds}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        deviceStatus: { ...draft.deviceStatus, periodicInformExpectationSeconds: Number(e.target.value) || 900 },
                      })
                    }
                    InputProps={infoAdornment('Target interval Inform berkala dari ONT (misal 900s = 15 menit). Disarankan Online Threshold minimal 2x nilai ini.')}
                  />
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <TextField
                      select
                      fullWidth
                      size="small"
                      label="Never Connected Policy"
                      disabled={!canEdit}
                      value={draft.deviceStatus.neverConnectedPolicy}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          deviceStatus: {
                            ...draft.deviceStatus,
                            neverConnectedPolicy: e.target.value as 'separate_bucket' | 'treat_unknown',
                          },
                        })
                      }
                    >
                      <MenuItem value="separate_bucket">Separate Bucket (Never Connected)</MenuItem>
                      <MenuItem value="treat_unknown">Treat as Unknown</MenuItem>
                    </TextField>
                    {infoIconTip('Menentukan status ONT yang sudah terdaftar (mis. lewat pre-provisioning) namun belum pernah Inform: dipisah sebagai Never Connected atau digabung ke Unknown.')}
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {tab === 1 && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ mb: 2 }}>
                  Temperature Thresholds (°C)
                </Typography>
                <Stack spacing={2}>
                  <TextField
                    size="small"
                    type="number"
                    label="Warning Start (°C)"
                    helperText="Normal is strictly below this value (default 45°C)"
                    disabled={!canEdit}
                    value={draft.classification.tempWarningC}
                    onChange={(e) =>
                      setDraft({ ...draft, classification: { ...draft.classification, tempWarningC: Number(e.target.value) } })
                    }
                    InputProps={infoAdornment('Batas awal suhu ONT masuk kategori Warning. Nilai di bawah angka ini dianggap Normal.')}
                  />
                  <TextField
                    size="small"
                    type="number"
                    label="Critical Threshold (°C)"
                    helperText="Strictly above this value is Critical (default > 55°C, covering 56°C+)"
                    disabled={!canEdit}
                    value={draft.classification.tempCriticalC}
                    onChange={(e) =>
                      setDraft({ ...draft, classification: { ...draft.classification, tempCriticalC: Number(e.target.value) } })
                    }
                    InputProps={infoAdornment('Batas suhu di mana ONT diklasifikasikan Critical (panas berlebih) di Overview & API.')}
                  />
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ mb: 2 }}>
                  Optical RX Power Thresholds (dBm)
                </Typography>
                <Stack spacing={2}>
                  <TextField
                    size="small"
                    type="number"
                    label="Sangat Kuat Min (dBm)"
                    disabled={!canEdit}
                    value={draft.classification.rxStrongMinDbm}
                    onChange={(e) =>
                      setDraft({ ...draft, classification: { ...draft.classification, rxStrongMinDbm: Number(e.target.value) } })
                    }
                    InputProps={infoAdornment('Nilai RX optik minimal (>= nilai ini) untuk masuk kategori Sangat Kuat, misal -12 dBm.')}
                  />
                  <TextField
                    size="small"
                    type="number"
                    label="Baik Min (dBm)"
                    disabled={!canEdit}
                    value={draft.classification.rxGoodMinDbm}
                    onChange={(e) =>
                      setDraft({ ...draft, classification: { ...draft.classification, rxGoodMinDbm: Number(e.target.value) } })
                    }
                    InputProps={infoAdornment('Batas bawah kategori Baik (Normal), misal -20 dBm.')}
                  />
                  <TextField
                    size="small"
                    type="number"
                    label="Perlu Perhatian Min (dBm)"
                    disabled={!canEdit}
                    value={draft.classification.rxAttentionMinDbm}
                    onChange={(e) =>
                      setDraft({ ...draft, classification: { ...draft.classification, rxAttentionMinDbm: Number(e.target.value) } })
                    }
                    InputProps={infoAdornment('Batas bawah kategori Perlu Perhatian sebelum redaman masuk kategori Lemah, misal -24 dBm.')}
                  />
                  <TextField
                    size="small"
                    type="number"
                    label="Lemah Min (dBm)"
                    helperText="Below this threshold is Sangat Lemah"
                    disabled={!canEdit}
                    value={draft.classification.rxWeakMinDbm}
                    onChange={(e) =>
                      setDraft({ ...draft, classification: { ...draft.classification, rxWeakMinDbm: Number(e.target.value) } })
                    }
                    InputProps={infoAdornment('Batas bawah kategori Lemah (misal -27 dBm); redaman di bawah ini dianggap Sangat Lemah / LOS risk.')}
                  />
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {tab === 2 && (
        <Card>
          <CardContent>
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
              <TextField
                size="small"
                placeholder="Filter vendor, OUI, path..."
                value={aliasSearch}
                onChange={(e) => setAliasSearch(e.target.value)}
                sx={{ width: { xs: '100%', sm: 260 } }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }}
              />
              <Button
                variant="contained"
                size="small"
                startIcon={<AddIcon />}
                disabled={!canEdit}
                onClick={openAddAliasModal}
                sx={{ whiteSpace: 'nowrap', height: 38 }}
              >
                Add Alias
              </Button>
            </Stack>

            <TableContainer>
              <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: '28%' }}>Raw Inform String</TableCell>
                    <TableCell sx={{ width: '18%' }}>Canonical Name</TableCell>
                    <TableCell sx={{ width: '12%' }}>OUI</TableCell>
                    <TableCell sx={{ width: '18%' }}>Virtual Parameters</TableCell>
                    <TableCell sx={{ width: '12%' }}>Confidence</TableCell>
                    <TableCell align="right" sx={{ width: '12%' }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredAliases.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                        No manufacturer aliases matching filter.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAliases.map((a) => {
                      const mappedCount = Object.values(a.virtualParameters).filter((v) => v.trim().length > 0).length;
                      return (
                        <TableRow key={a.id} hover>
                          <TableCell><TruncatedText text={a.rawName} /></TableCell>
                          <TableCell sx={{ fontWeight: 600 }}><TruncatedText text={a.canonicalName} /></TableCell>
                          <TableCell sx={{ fontFamily: MONO_FONT }}><TruncatedText text={a.oui || '-'} /></TableCell>
                          <TableCell>
                            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'text.primary' }}>
                              {mappedCount} / {VIRTUAL_PARAM_FIELDS.length} mapped
                            </Typography>
                          </TableCell>
                          <TableCell><TruncatedText text={a.confidence} /></TableCell>
                          <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                            <Tooltip title="Edit Alias & Virtual Parameters">
                              <span>
                                <IconButton size="small" disabled={!canEdit} onClick={() => openEditAliasModal(a)}>
                                  <EditOutlinedIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title="Delete Alias">
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={!canEdit}
                                  onClick={() => {
                                    removeManufacturerAlias(a.id);
                                    showToast('info', `Removed alias "${a.canonicalName}".`);
                                  }}
                                >
                                  <DeleteIcon fontSize="small" />
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
          </CardContent>
        </Card>
      )}

      {tab === 3 && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ mb: 2 }}>
                  TR-069 / CWMP Engine
                </Typography>
                <Stack spacing={2}>
                  <TextField
                    size="small"
                    label="CWMP Public Endpoint URL"
                    disabled={!canEdit}
                    value={draft.protocol.cwmpEndpoint}
                    onChange={(e) => setDraft({ ...draft, protocol: { ...draft.protocol, cwmpEndpoint: e.target.value } })}
                    InputProps={infoAdornment('Catatan referensi URL publik ACS (TR-069 / CWMP) untuk teknisi (mis. http://<IP-SERVER>:7547/cwmp). Tidak memblokir koneksi ONT.')}
                  />
                  <TextField
                    size="small"
                    type="number"
                    label="Session Timeout (Seconds)"
                    disabled={!canEdit}
                    value={draft.protocol.sessionTimeoutSeconds}
                    onChange={(e) =>
                      setDraft({ ...draft, protocol: { ...draft.protocol, sessionTimeoutSeconds: Number(e.target.value) || 60 } })
                    }
                    InputProps={infoAdornment('Batas waktu sesi CWMP aktif sebelum dianggap timeout. Langsung diterapkan ke engine nexaacs-cwmp.')}
                  />
                  <TextField
                    size="small"
                    type="number"
                    label="Connection Request Timeout (Seconds)"
                    disabled={!canEdit}
                    value={draft.protocol.connectionRequestTimeoutSeconds}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        protocol: { ...draft.protocol, connectionRequestTimeoutSeconds: Number(e.target.value) || 10 },
                      })
                    }
                    InputProps={infoAdornment('Batas waktu tunggu HTTP saat ACS/Worker memanggil Connection Request ke IP ONT (Summon / Reboot / Push).')}
                  />
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <FormControlLabel
                      sx={{ mr: 0 }}
                      control={
                        <Switch
                          disabled={!canEdit}
                          checked={draft.protocol.allowAutoEnrollment}
                          onChange={(e) =>
                            setDraft({ ...draft, protocol: { ...draft.protocol, allowAutoEnrollment: e.target.checked } })
                          }
                        />
                      }
                      label="Allow Auto-Enrollment on Inform"
                    />
                    {infoIconTip('Jika aktif, ONT baru yang mengirim Inform langsung terdaftar otomatis. Jika nonaktif, nexaacs-cwmp menolak (403) ONT yang belum terdaftar / pre-provisioned.')}
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ mb: 2 }}>
                  TR-369 / USP Controller
                </Typography>
                <Stack spacing={2}>
                  <TextField
                    size="small"
                    label="USP Controller Endpoint ID"
                    disabled={!canEdit}
                    value={draft.protocol.uspControllerId}
                    onChange={(e) => setDraft({ ...draft, protocol: { ...draft.protocol, uspControllerId: e.target.value } })}
                    InputProps={infoAdornment('Identitas unik Controller TR-369 (USP) sesuai standar Broadband Forum yang dikenali router/agent TR-369.')}
                  />
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <TextField
                      select
                      fullWidth
                      size="small"
                      label="Primary MTP Transport"
                      disabled={!canEdit}
                      value={draft.protocol.uspMtp}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          protocol: { ...draft.protocol, uspMtp: e.target.value as SystemSettings['protocol']['uspMtp'] },
                        })
                      }
                    >
                      <MenuItem value="mqtt">MQTT</MenuItem>
                      <MenuItem value="websocket">WebSocket</MenuItem>
                      <MenuItem value="stomp">STOMP</MenuItem>
                      <MenuItem value="coap">CoAP</MenuItem>
                    </TextField>
                    {infoIconTip('Message Transfer Protocol (MTP) utama yang digunakan Controller TR-369 / USP (MQTT, WebSocket, STOMP, atau CoAP).')}
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
      {/* Dialog: Add / Edit Manufacturer Alias & Virtual Parameters */}
      <NocDialog
        open={aliasModalOpen}
        onClose={() => setAliasModalOpen(false)}
        title={editingAliasId ? 'Edit Manufacturer Alias & Virtual Parameters' : 'Add Manufacturer Alias & Virtual Parameters'}
        subtitle="Map vendor OUI and TR-069 / TR-369 parameter paths for telemetry, WAN, and WLAN"
        icon={<TuneIcon sx={{ fontSize: 18 }} />}
        tone="primary"
        maxWidth="md"
        confirmLabel={editingAliasId ? 'Save Changes' : 'Create Alias'}
        confirmDisabled={!canEdit}
        onConfirm={handleSaveAliasModal}
      >
        <Stack spacing={2.25}>
          {aliasFormError && <Alert severity="error">{aliasFormError}</Alert>}
          {/* Quick Presets & Sample From Device */}
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', md: 'center' }}
            spacing={1.25}
            sx={{ p: 1.5, bgcolor: 'var(--noc-subtle)', borderRadius: '6px', border: '1px solid', borderColor: 'divider' }}
          >
            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary', mr: 0.5 }}>
                Presets:
              </Typography>
              {(
                [
                  { id: 'china_telecom_tr098', label: 'China Telecom (CT-COM)' },
                  { id: 'china_mobile_tr098', label: 'China Mobile (CMCC)' },
                  { id: 'huawei_tr098', label: 'Huawei TR-098' },
                  { id: 'zte_tr098', label: 'ZTE TR-098' },
                  { id: 'fiberhome_tr098', label: 'FiberHome TR-098' },
                ] as const
              ).map((preset) => (
                <Chip
                  key={preset.id}
                  size="small"
                  label={preset.label}
                  variant="outlined"
                  onClick={() =>
                    setAliasForm((prev) => ({
                      ...prev,
                      virtualParameters: { ...VIRTUAL_PARAM_PRESETS[preset.id] },
                    }))
                  }
                  sx={{ cursor: 'pointer', fontSize: '0.74rem' }}
                />
              ))}
            </Stack>

            <TextField
              select
              size="small"
              label="Extract Paths From Device"
              value={sampleDeviceId}
              onChange={(e) => applySampleDevice(e.target.value)}
              sx={{ minWidth: 230 }}
            >
              <MenuItem value="">Select registered device...</MenuItem>
              {activeDevices.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.serialNumber} ({d.manufacturerCanonical} {d.modelName})
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          {/* Vendor / OUI Identity */}
          <Box>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'text.primary', mb: 1.25 }}>
              Vendor &amp; OUI Identity
            </Typography>
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={4}>
                <TextField
                  size="small"
                  fullWidth
                  label="Raw Inform String"
                  placeholder="e.g. CT-COM, GM, Xtetch"
                  value={aliasForm.rawName}
                  error={Boolean(aliasFieldErrors.rawName)}
                  helperText={aliasFieldErrors.rawName}
                  onChange={(e) => setAliasForm((f) => ({ ...f, rawName: e.target.value }))}
                />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField
                  size="small"
                  fullWidth
                  label="Canonical Name"
                  placeholder="e.g. Huawei"
                  value={aliasForm.canonicalName}
                  error={Boolean(aliasFieldErrors.canonicalName)}
                  helperText={aliasFieldErrors.canonicalName}
                  onChange={(e) => setAliasForm((f) => ({ ...f, canonicalName: e.target.value }))}
                />
              </Grid>
              <Grid item xs={6} sm={2}>
                <TextField
                  size="small"
                  fullWidth
                  label="OUI (6 hex)"
                  placeholder="00E0FC or 00259E, 00E0FC"
                  value={aliasForm.oui}
                  error={Boolean(aliasFieldErrors.oui)}
                  helperText={aliasFieldErrors.oui}
                  onChange={(e) => setAliasForm((f) => ({ ...f, oui: e.target.value.toUpperCase() }))}
                  inputProps={{ style: { fontFamily: MONO_FONT } }}
                />
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField
                  select
                  size="small"
                  fullWidth
                  label="Confidence"
                  value={aliasForm.confidence}
                  onChange={(e) =>
                    setAliasForm((f) => ({
                      ...f,
                      confidence: e.target.value as ManufacturerAlias['confidence'],
                    }))
                  }
                >
                  <MenuItem value="high">high</MenuItem>
                  <MenuItem value="medium">medium</MenuItem>
                  <MenuItem value="low">low</MenuItem>
                </TextField>
              </Grid>
            </Grid>
          </Box>

          <Divider />

          {/* Virtual Parameter Mappings */}
          <Box>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'text.primary', mb: 0.25 }}>
              Virtual Parameters Mapping ({VIRTUAL_PARAM_FIELDS.length} Standardized Paths)
            </Typography>
            <Typography sx={{ fontSize: '0.74rem', color: 'text.secondary', mb: 1.75 }}>
              Use <code>{'{i}'}</code> for multi-instance WAN / WLAN / Host indices. Every panel on Devices &amp; Device Detail resolves from these configured paths.
            </Typography>
            <Stack spacing={2.25}>
              {VIRTUAL_PARAM_GROUPS.map((groupName) => {
                const groupFields = VIRTUAL_PARAM_FIELDS.filter((f) => f.group === groupName);
                return (
                  <Box key={groupName}>
                    <Typography
                      sx={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        color: 'primary.main',
                        mb: 1,
                      }}
                    >
                      {groupName} ({groupFields.length})
                    </Typography>
                    <Grid container spacing={1.5}>
                      {groupFields.map((field) => (
                        <Grid key={field.key} item xs={12} md={6}>
                          <Autocomplete
                            freeSolo
                            size="small"
                            options={availablePathOptions}
                            value={aliasForm.virtualParameters[field.key]}
                            inputValue={aliasForm.virtualParameters[field.key]}
                            onChange={(_, val) => {
                              const picked = typeof val === 'string' ? val : (val?.path ?? '');
                              const nextPath = normalizeVirtualParamTemplate(field.key, picked);
                              setAliasForm((f) => ({
                                ...f,
                                virtualParameters: { ...f.virtualParameters, [field.key]: nextPath },
                              }));
                            }}
                            onInputChange={(_, nextVal) =>
                              setAliasForm((f) => ({
                                ...f,
                                virtualParameters: { ...f.virtualParameters, [field.key]: nextVal },
                              }))
                            }
                            getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt.path)}
                            filterOptions={(options, state) => {
                              const q = state.inputValue.trim().toLowerCase();
                              if (!q) return options;
                              return options.filter(
                                (o) =>
                                  o.path.toLowerCase().includes(q) || o.sampleValue.toLowerCase().includes(q),
                              );
                            }}
                            renderOption={(props, opt) => (
                              <Box
                                component="li"
                                {...props}
                                key={opt.path}
                                sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}
                              >
                                <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.73rem', wordBreak: 'break-all' }}>
                                  {opt.path}
                                </Typography>
                                {opt.sampleValue && (
                                  <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.7rem', color: 'text.secondary', flexShrink: 0 }}>
                                    = {opt.sampleValue}
                                  </Typography>
                                )}
                              </Box>
                            )}
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                label={`${field.label} (${field.canonicalKey})`}
                                placeholder={field.placeholder}
                                InputLabelProps={{ shrink: true }}
                                inputProps={{
                                  ...params.inputProps,
                                  style: { fontFamily: MONO_FONT, fontSize: '0.76rem' },
                                }}
                              />
                            )}
                          />
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                );
              })}
            </Stack>
          </Box>

          <Typography sx={{ fontSize: '0.73rem', color: 'text.secondary' }}>
            Tip: Click any path input above to browse &amp; pick live parameters directly from{' '}
            {sampleDevice ? <b>{sampleDevice.serialNumber}</b> : 'all registered devices'}, or click a Preset above.
          </Typography>
        </Stack>
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
