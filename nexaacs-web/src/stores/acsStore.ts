import { create } from 'zustand';
import type {
  AuditLogEntry,
  DashboardFilter,
  Device,
  DeviceCredentials,
  DeviceListPageQuery,
  DeviceParameter,
  DhcpServerConfig,
  FaultRecord,
  FirmwareDeploymentJob,
  FirmwareImage,
  ManufacturerAlias,
  OverviewStats,
  PermissionCode,
  PlatformUser,
  ProvisioningInput,
  ProvisioningProfile,
  RealtimeEvent,
  RoleDefinition,
  RoleName,
  SummonGroup,
  SummonQueueSummary,
  SystemSettings,
  TaskRecord,
  TaskStatus,
  TelemetrySample,
  VirtualParameterMapping,
  WANConnection,
  WiFiRadio,
} from '../types';
import {
  DEFAULT_SETTINGS,
  INITIAL_ALIASES,
  INITIAL_AUDIT_LOGS,
  INITIAL_DEVICES,
  INITIAL_FAULTS,
  INITIAL_FIRMWARE,
  INITIAL_FIRMWARE_JOBS,
  INITIAL_TASKS,
  ROLE_PERMISSIONS,
  VIRTUAL_PARAM_PRESETS,
} from '../services/seed-data';
import {
  apiClient,
  checkBackendHealth,
  getStoredAccessToken,
  setStoredAccessToken,
} from '../services/api-client';
import { createEventWebSocket } from '../services/websocket';
import {
  mapApiAliasToFrontend,
  mapApiAuditLogToFrontend,
  mapApiDeviceToFrontend,
  mapApiEventToFrontend,
  mapApiFaultToFrontend,
  mapApiFirmwareJobToFrontend,
  mapApiFirmwareToFrontend,
  mapApiSessionToFrontend,
  mapApiTaskToFrontend,
  mergeBackendSettings,
  type ApiDeviceRecord,
} from '../services/live-mappers';
import { setActiveTimezone } from '../utils/classification';

const DEVICE_COLUMNS_STORAGE_KEY = 'nexaacs.deviceVisibleCols';
const DEVICE_COLUMN_ORDER_STORAGE_KEY = 'nexaacs.deviceColumnOrder.v2';
const MANUFACTURER_ALIASES_STORAGE_KEY = 'nexaacs.manufacturerAliases';
const THEME_MODE_STORAGE_KEY = 'nexacs.themeMode';
const LAST_ACTIVITY_STORAGE_KEY = 'nexacs.lastActivityAt';
const TOKEN_ISSUED_AT_STORAGE_KEY = 'nexacs.tokenIssuedAt';
const SIM_AUTH_STORAGE_KEY = 'nexacs.simAuth';
export const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

function loadLastActivityAt(): number {
  if (typeof window === 'undefined') return Date.now();
  try {
    const raw = window.localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function saveLastActivityAt(ts: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(ts));
  } catch {
    // ignore
  }
}

function clearSessionStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
    window.localStorage.removeItem(TOKEN_ISSUED_AT_STORAGE_KEY);
    window.localStorage.removeItem(SIM_AUTH_STORAGE_KEY);
  } catch {
    // ignore
  }
}

let themeSwitchTimer: number | null = null;

function loadPersistedThemeMode(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  try {
    const raw = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
    return raw === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function loadPersistedAliases(): ManufacturerAlias[] {
  if (typeof window === 'undefined') return INITIAL_ALIASES;
  try {
    const raw = window.localStorage.getItem(MANUFACTURER_ALIASES_STORAGE_KEY);
    if (!raw) return INITIAL_ALIASES;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return INITIAL_ALIASES;
    return parsed.map((item) => {
      const a = item as Partial<ManufacturerAlias>;
      const seedMatch = INITIAL_ALIASES.find(
        (x) => x.id === a.id || (a.oui && x.oui.toUpperCase() === a.oui.toUpperCase()),
      );
      const isTr181 = Object.values(a.virtualParameters ?? {}).some(
        (v) => typeof v === 'string' && v.startsWith('Device.'),
      );
      const basePreset =
        seedMatch?.virtualParameters ??
        (isTr181 ? VIRTUAL_PARAM_PRESETS.nokia_tr181 : VIRTUAL_PARAM_PRESETS.zte_tr098);
      return {
        id: a.id || uid('al'),
        rawName: a.rawName ?? '',
        canonicalName: a.canonicalName ?? '',
        oui: a.oui ?? '',
        source: a.source ?? 'manual',
        confidence: a.confidence ?? 'high',
        virtualParameters: {
          ...basePreset,
          ...(a.virtualParameters ?? {}),
        },
      };
    });
  } catch {
    return INITIAL_ALIASES;
  }
}

function savePersistedAliases(aliases: ManufacturerAlias[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MANUFACTURER_ALIASES_STORAGE_KEY, JSON.stringify(aliases));
  } catch {
    // Ignore storage errors
  }
}

function matchAliasToken(candidate: string, pattern: string): boolean {
  const c = candidate.trim().toLowerCase();
  if (!c) return false;
  return pattern
    .split(',')
    .some((part) => part.trim().toLowerCase() === c);
}

export function findAliasForDevice(
  device: Pick<Device, 'oui' | 'manufacturerRaw' | 'manufacturerCanonical'>,
  aliases: ManufacturerAlias[],
): ManufacturerAlias | undefined {
  const devOui = device.oui.trim();
  const devRaw = device.manufacturerRaw.trim();
  const devCanon = device.manufacturerCanonical.trim();
  return (
    aliases.find((a) => matchAliasToken(devOui, a.oui)) ??
    aliases.find((a) => matchAliasToken(devRaw, a.rawName)) ??
    aliases.find((a) => matchAliasToken(devCanon, a.canonicalName))
  );
}

const VP_REGEX_CACHE = new Map<string, RegExp>();

function matchVirtualPathTemplate(actualPath: string, template: string, asPrefix = false): boolean {
  const t = template.trim();
  if (!t) return false;
  const normalized = actualPath.trim();
  if (!asPrefix && normalized === t) return true;
  if (asPrefix && (normalized === t || normalized.startsWith(`${t}.`))) return true;
  if (!t.includes('{i}')) return false;
  const cacheKey = `${asPrefix ? 'P:' : 'E:'}${t}`;
  let re = VP_REGEX_CACHE.get(cacheKey);
  if (!re) {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{i\\\}/g, '\\d+');
    re = new RegExp(asPrefix ? `^${escaped}(?:\\.|$)` : `^${escaped}$`);
    if (VP_REGEX_CACHE.size > 500) VP_REGEX_CACHE.clear();
    VP_REGEX_CACHE.set(cacheKey, re);
  }
  return re.test(normalized);
}

const MULTI_INSTANCE_VP_FIELDS = new Set<keyof VirtualParameterMapping>([
  'wanRoot',
  'wanExternalIp',
  'wanPppoeUsername',
  'wanPppoePassword',
  'wanVlanId',
  'wanStatus',
  'wanAddressingType',
  'wanSubnetMask',
  'wanGateway',
  'wanDnsServers',
  'wanConnectionType',
  'wanServiceList',
  'wanNatEnabled',
  'wanPortBindings',
  'wlanRoot',
  'wlanSsid',
  'wlanPassphrase',
  'wlanEnabled',
  'wlanChannel',
  'wlanSecurityMode',
  'wlanBand',
  'wlanAutoChannel',
  'connectedHostsRoot',
  'hostName',
  'hostMac',
  'hostIp',
]);

/**
 * Automatically turns concrete instance numbers (e.g. `.1.` in `WLANConfiguration.1.SSID` or
 * `Device.IP.Interface.2.IPv4Address.1.IPAddress`) into `{i}` templates for multi-instance VParam slots.
 */
export function normalizeVirtualParamTemplate(
  field: keyof VirtualParameterMapping,
  rawPath: string,
): string {
  const trimmed = rawPath.trim();
  if (!trimmed || !MULTI_INSTANCE_VP_FIELDS.has(field)) return trimmed;

  let next = trimmed;
  if (field === 'connectedHostsRoot' || field === 'hostName' || field === 'hostMac' || field === 'hostIp') {
    next = next.replace(/\.Host\.(?:\d+|\{i\})\b/g, '.Host.{i}');
    if (field === 'connectedHostsRoot') {
      const idx = next.indexOf('.Host.{i}');
      if (idx >= 0) return next.slice(0, idx + '.Host.{i}'.length);
    }
    return next;
  }

  if (field === 'wlanRoot' || field === 'wlanSsid' || field === 'wlanPassphrase' || field === 'wlanEnabled' || field === 'wlanChannel') {
    next = next
      .replace(/\.WLANConfiguration\.(?:\d+|\{i\})\b/g, '.WLANConfiguration.{i}')
      .replace(/\.(WiFi\.(?:SSID|AccessPoint|Radio))\.(?:\d+|\{i\})\b/g, '.$1.{i}');
    if (field === 'wlanRoot') {
      const match = /^(.*?\.(?:WLANConfiguration|WiFi\.SSID)\.\{i\})/.exec(next);
      if (match) return match[1];
    }
    return next;
  }

  // WAN slots
  next = next
    .replace(/\.WANConnectionDevice\.(?:\d+|\{i\})\b/g, '.WANConnectionDevice.{i}')
    .replace(/\.(IP\.Interface|PPP\.Interface|Ethernet\.VLANTermination)\.(?:\d+|\{i\})\b/g, '.$1.{i}');
  if (field === 'wanRoot') {
    const match = /^(.*?\.(?:WANConnectionDevice|IP\.Interface)\.\{i\})/.exec(next);
    if (match) return match[1];
  }
  return next;
}

function instantiateVirtualTemplate(template: string, instanceIndex = 1): string {
  const t = template.trim();
  if (!t) return '';
  return t.replace(/\{i\}/g, String(instanceIndex));
}

function findParamByVirtualTemplate(
  parameters: DeviceParameter[],
  template: string | undefined,
  preferredIndex?: number,
): DeviceParameter | undefined {
  const t = template?.trim() ?? '';
  if (!t) return undefined;
  const matches = parameters.filter((p) => matchVirtualPathTemplate(p.path, t));
  if (matches.length === 0) return undefined;
  if (preferredIndex !== undefined) {
    const exactInstance = instantiateVirtualTemplate(t, preferredIndex);
    const byIdx = matches.find((p) => p.path === exactInstance);
    if (byIdx) return byIdx;
  }
  return (
    matches.find((p) => p.readState === 'available' && p.value !== null && p.value.trim() !== '') ??
    matches[0]
  );
}

function upsertVirtualParamInList(
  parameters: DeviceParameter[],
  template: string | undefined,
  canonicalKey: string,
  value: string,
  protocol: Device['protocol'],
  instanceIndex: number,
  nowIso: string,
  opts?: { isWritable?: boolean; isSecret?: boolean; valueType?: string },
): DeviceParameter[] {
  const path = instantiateVirtualTemplate(template ?? '', instanceIndex);
  if (!path) return parameters;
  const idx = parameters.findIndex((p) => p.path === path);
  if (idx >= 0) {
    return parameters.map((p, i) =>
      i === idx
        ? {
          ...p,
          canonicalKey,
          value,
          readState: 'available',
          lastAttemptAt: nowIso,
          lastSuccessAt: nowIso,
        }
        : p,
    );
  }
  return [
    ...parameters,
    {
      path,
      canonicalKey,
      value,
      valueType: opts?.valueType ?? (protocol === 'TR-369' ? 'string' : 'xsd:string'),
      readState: 'available',
      isWritable: opts?.isWritable ?? true,
      isSecret: opts?.isSecret ?? false,
      sourceProtocol: protocol,
      lastAttemptAt: nowIso,
      lastSuccessAt: nowIso,
    },
  ];
}

type BackendSetParam = { name: string; type: string; value: string };

function resolveWanIpoePathsFromVParams(
  dataModelRoot: Device['dataModelRoot'],
  vp: VirtualParameterMapping | undefined,
  instanceIndex: number,
): {
  addressingType: string;
  externalIp: string;
  subnetMask: string;
  gateway: string;
  dnsServers: string;
} {
  const root = dataModelRoot === 'Device.' ? 'Device.' : 'InternetGatewayDevice.';
  const wanRootPath = instantiateVirtualTemplate(vp?.wanRoot ?? '', instanceIndex);
  const extIpPath = instantiateVirtualTemplate(vp?.wanExternalIp ?? '', instanceIndex);
  let ipBase = '';
  if (extIpPath && /WANIPConnection/i.test(extIpPath)) {
    ipBase = extIpPath.replace(/\.ExternalIPAddress$/i, '');
  } else if (wanRootPath && root === 'InternetGatewayDevice.') {
    ipBase = `${wanRootPath}.WANIPConnection.1`;
  } else if (root === 'InternetGatewayDevice.') {
    ipBase = `${root}WANDevice.1.WANConnectionDevice.${instanceIndex}.WANIPConnection.1`;
  }

  return {
    addressingType:
      instantiateVirtualTemplate(vp?.wanAddressingType ?? '', instanceIndex) ||
      (ipBase ? `${ipBase}.AddressingType` : `${root}IP.Interface.${instanceIndex}.IPv4Address.1.AddressingType`),
    externalIp:
      (extIpPath && (/WANIPConnection/i.test(extIpPath) || root === 'Device.') ? extIpPath : '') ||
      (ipBase ? `${ipBase}.ExternalIPAddress` : `${root}IP.Interface.${instanceIndex}.IPv4Address.1.IPAddress`),
    subnetMask:
      instantiateVirtualTemplate(vp?.wanSubnetMask ?? '', instanceIndex) ||
      (ipBase ? `${ipBase}.SubnetMask` : `${root}IP.Interface.${instanceIndex}.IPv4Address.1.SubnetMask`),
    gateway:
      instantiateVirtualTemplate(vp?.wanGateway ?? '', instanceIndex) ||
      (ipBase ? `${ipBase}.DefaultGateway` : `${root}Routing.Router.1.IPv4Forwarding.1.GatewayIPAddress`),
    dnsServers:
      instantiateVirtualTemplate(vp?.wanDnsServers ?? '', instanceIndex) ||
      (ipBase ? `${ipBase}.DNSServers` : `${root}DNS.Client.Server.1.DNSServer`),
  };
}

function buildWanSetParams(
  dev: Device,
  aliases: ManufacturerAlias[],
  instanceIndex: number,
  input: {
    connectionType?: WANConnection['connectionType'];
    addressingMode?: WANConnection['addressingMode'];
    pppoeUsername?: string;
    pppoePassword?: string;
    vlanEnabled?: boolean;
    vlanType?: 'untag' | 'transparent' | 'tag';
    vlanId?: number;
    wanIp?: string;
    subnetMask?: string;
    gateway?: string;
    dns?: string;
    serviceList?: string;
    natEnabled?: boolean;
  },
): BackendSetParam[] {
  const matched = findAliasForDevice(dev, aliases);
  const root = dev.dataModelRoot === 'Device.' ? 'Device.' : 'InternetGatewayDevice.';
  const params: BackendSetParam[] = [];
  const connPrefix = `${root}WANDevice.1.WANConnectionDevice.${instanceIndex}.`;
  const existingConnParams = dev.parameters.filter((p) => p.path.startsWith(connPrefix));
  const findExistingConnLeaf = (re: RegExp) => existingConnParams.find((p) => re.test(p.path))?.path;

  if (input.connectionType === 'IPoE') {
    const addrType = input.addressingMode === 'Static' ? 'Static' : 'DHCP';
    const ipPaths = resolveWanIpoePathsFromVParams(dev.dataModelRoot, matched?.virtualParameters, instanceIndex);
    const addrPath = findExistingConnLeaf(/\.WANIPConnection\.\d+\.AddressingType$/) || ipPaths.addressingType;
    const extIpPath = findExistingConnLeaf(/\.WANIPConnection\.\d+\.ExternalIPAddress$/) || ipPaths.externalIp;
    const maskPath = findExistingConnLeaf(/\.WANIPConnection\.\d+\.SubnetMask$/) || ipPaths.subnetMask;
    const gwPath = findExistingConnLeaf(/\.WANIPConnection\.\d+\.DefaultGateway$/) || ipPaths.gateway;
    const dnsPath = findExistingConnLeaf(/\.WANIPConnection\.\d+\.DNSServers$/) || ipPaths.dnsServers;
    params.push({ name: addrPath, type: 'xsd:string', value: addrType });
    if (addrType === 'Static') {
      if (input.wanIp) params.push({ name: extIpPath, type: 'xsd:string', value: input.wanIp });
      if (input.subnetMask) params.push({ name: maskPath, type: 'xsd:string', value: input.subnetMask });
      if (input.gateway) params.push({ name: gwPath, type: 'xsd:string', value: input.gateway });
      if (input.dns) params.push({ name: dnsPath, type: 'xsd:string', value: input.dns });
    }
  } else if (input.connectionType === 'PPPoE') {
    if (input.pppoeUsername !== undefined) {
      const path =
        findExistingConnLeaf(/\.WANPPPConnection\.\d+\.Username$/) ||
        instantiateVirtualTemplate(matched?.virtualParameters.wanPppoeUsername ?? '', instanceIndex) ||
        `${connPrefix}WANPPPConnection.1.Username`;
      params.push({ name: path, type: 'xsd:string', value: input.pppoeUsername });
    }
    if (input.pppoePassword !== undefined && input.pppoePassword !== '') {
      const path =
        findExistingConnLeaf(/\.WANPPPConnection\.\d+\.Password$/) ||
        instantiateVirtualTemplate(matched?.virtualParameters.wanPppoePassword ?? '', instanceIndex) ||
        `${connPrefix}WANPPPConnection.1.Password`;
      params.push({ name: path, type: 'xsd:string', value: input.pppoePassword });
    }
  }

  if (input.vlanType !== undefined || input.vlanEnabled !== undefined || input.vlanId !== undefined) {
    const vlanType: 'untag' | 'transparent' | 'tag' =
      input.vlanType ?? (input.vlanEnabled === false ? 'untag' : input.vlanId !== undefined && input.vlanId > 0 ? 'tag' : input.vlanEnabled ? 'tag' : 'untag');
    const vlanEnabled = vlanType === 'tag';
    const linkVlanPath = findExistingConnLeaf(/\.X_(?:CT-COM|CMCC)_WAN(?:Gpon|Epon)LinkConfig\.VLANIDMark$/);
    const linkModePath = findExistingConnLeaf(/\.X_(?:CT-COM|CMCC)_WAN(?:Gpon|Epon)LinkConfig\.Mode$/);
    const cuVlanPath = findExistingConnLeaf(/\.X_CU_VLAN$/);
    const cuEnablePath = findExistingConnLeaf(/\.X_CU_VLANEnabled$/);
    const cmccVlanPath = findExistingConnLeaf(/\.X_CMCC_VLANIDMark$/);
    const cmccModePath = findExistingConnLeaf(/\.X_CMCC_VLANMode$/);
    const hwVlanPath = findExistingConnLeaf(/\.X_HW_VLAN$/);

    const vlanPath =
      linkVlanPath ||
      cuVlanPath ||
      cmccVlanPath ||
      hwVlanPath ||
      findExistingConnLeaf(/\.X_ZTE-COM_VLANID$/) ||
      instantiateVirtualTemplate(matched?.virtualParameters.wanVlanId ?? '', instanceIndex) ||
      `${connPrefix}X_CT-COM_WANGponLinkConfig.VLANIDMark`;

    const modeNumeric = vlanType === 'tag' ? '2' : vlanType === 'transparent' ? '1' : '0';
    if (cuEnablePath) {
      params.push({ name: cuEnablePath, type: 'xsd:boolean', value: vlanEnabled ? 'true' : 'false' });
    } else if (linkModePath) {
      params.push({ name: linkModePath, type: 'xsd:unsignedInt', value: modeNumeric });
    } else if (cmccModePath) {
      params.push({ name: cmccModePath, type: 'xsd:unsignedInt', value: modeNumeric });
    }

    if (vlanEnabled && input.vlanId !== undefined) {
      params.push({ name: vlanPath, type: 'xsd:unsignedInt', value: String(input.vlanId) });
    } else if (!vlanEnabled) {
      params.push({ name: vlanPath, type: 'xsd:unsignedInt', value: '0' });
    }
  }

  if (input.serviceList !== undefined && input.serviceList.trim() !== '') {
    const svcPath = findExistingConnLeaf(/(?:ServiceList|X_HW_SERVICELIST)$/i);
    if (svcPath) {
      params.push({ name: svcPath, type: 'xsd:string', value: input.serviceList.trim() });
    }
  }
  if (input.natEnabled !== undefined) {
    const natPath = findExistingConnLeaf(/\.NATEnabled$/);
    if (natPath) {
      params.push({ name: natPath, type: 'xsd:boolean', value: input.natEnabled ? 'true' : 'false' });
    }
  }
  return params;
}

function buildDhcpSetParams(
  dev: Device,
  aliases: ManufacturerAlias[],
  input: DhcpServerConfig,
): BackendSetParam[] {
  const matched = findAliasForDevice(dev, aliases);
  const vp = matched?.virtualParameters;
  const root = dev.dataModelRoot === 'Device.' ? 'Device.' : 'InternetGatewayDevice.';
  const lanMgmtPrefix =
    root === 'Device.'
      ? 'Device.DHCPv4.Server.'
      : 'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.';

  const findExistingLanLeaf = (re: RegExp) =>
    dev.parameters.find(
      (p) =>
        (p.path.includes('.LANHostConfigManagement.') ||
          p.path.startsWith('Device.DHCPv4.Server.') ||
          p.path.startsWith('Device.IP.Interface.1.')) &&
        re.test(p.path),
    )?.path;

  const params: BackendSetParam[] = [];
  const lanIpPath =
    findExistingLanLeaf(/\.IPInterface\.1\.IPInterfaceIPAddress$|\.IPv4Address\.1\.IPAddress$/) ||
    vp?.lanIp ||
    `${lanMgmtPrefix}IPInterface.1.IPInterfaceIPAddress`;
  const subnetPath =
    findExistingLanLeaf(/\.IPInterface\.1\.IPInterfaceSubnetMask$|\.LANHostConfigManagement\.SubnetMask$|\.IPv4Address\.1\.SubnetMask$/) ||
    vp?.lanSubnetMask ||
    `${lanMgmtPrefix}IPInterface.1.IPInterfaceSubnetMask`;
  const dhcpEnablePath =
    findExistingLanLeaf(/\.DHCPServerEnable$|^Device\.DHCPv4\.Server\.Enable$/) ||
    vp?.lanDhcpEnable ||
    `${lanMgmtPrefix}DHCPServerEnable`;
  const opt125Path =
    findExistingLanLeaf(/Option125.*Enabl/i) ||
    vp?.lanDhcpOption125Enable ||
    '';
  const leasePath =
    findExistingLanLeaf(/\.DHCPLeaseTime$|\.LeaseTime$/) ||
    vp?.lanDhcpLeaseTime ||
    `${lanMgmtPrefix}DHCPLeaseTime`;
  const minAddrPath =
    findExistingLanLeaf(/\.MinAddress$/) ||
    vp?.lanDhcpStartIp ||
    `${lanMgmtPrefix}MinAddress`;
  const maxAddrPath =
    findExistingLanLeaf(/\.MaxAddress$/) ||
    vp?.lanDhcpEndIp ||
    `${lanMgmtPrefix}MaxAddress`;
  const assignIspPath =
    findExistingLanLeaf(/\.(?:UseAllocatedWAN|.*DNSRelayEnable|AssignIspDns)$/i) ||
    vp?.lanDhcpAssignIspDns ||
    '';
  const dnsServersPath =
    findExistingLanLeaf(/\.DNSServers$/) ||
    vp?.lanDhcpDnsServers ||
    `${lanMgmtPrefix}DNSServers`;

  params.push({ name: lanIpPath, type: 'xsd:string', value: input.lanIp.trim() });
  params.push({ name: subnetPath, type: 'xsd:string', value: input.lanSubnetMask.trim() });
  params.push({ name: dhcpEnablePath, type: 'xsd:boolean', value: input.dhcpServerEnable ? 'true' : 'false' });
  if (opt125Path) {
    params.push({ name: opt125Path, type: 'xsd:boolean', value: input.option125Enable ? 'true' : 'false' });
  }
  params.push({ name: leasePath, type: 'xsd:int', value: String(Math.max(60, Math.round(input.leaseTimeSeconds))) });
  params.push({ name: minAddrPath, type: 'xsd:string', value: input.startIp.trim() });
  params.push({ name: maxAddrPath, type: 'xsd:string', value: input.endIp.trim() });

  if (assignIspPath) {
    const existingVal = dev.parameters.find((p) => p.path === assignIspPath)?.value?.trim().toLowerCase() ?? '';
    const isEnumMode = existingVal === 'normal' || existingVal === 'passthrough' || existingVal === 'auto' || existingVal === 'static';
    if (isEnumMode) {
      params.push({ name: assignIspPath, type: 'xsd:string', value: input.assignIspDns ? 'Normal' : 'Passthrough' });
    } else {
      params.push({ name: assignIspPath, type: 'xsd:boolean', value: input.assignIspDns ? 'true' : 'false' });
    }
  }

  if (!input.assignIspDns) {
    const dnsList = [input.dns1.trim(), input.dns2.trim(), input.dns3.trim()].filter(Boolean);
    const dns1Path = findExistingLanLeaf(/\.DNSServer1$/);
    const dns2Path = findExistingLanLeaf(/\.DNSServer2$/);
    const dns3Path = findExistingLanLeaf(/\.DNSServer3$/);
    if (dns1Path || dns2Path || dns3Path) {
      if (dns1Path) params.push({ name: dns1Path, type: 'xsd:string', value: input.dns1.trim() });
      if (dns2Path) params.push({ name: dns2Path, type: 'xsd:string', value: input.dns2.trim() });
      if (dns3Path) params.push({ name: dns3Path, type: 'xsd:string', value: input.dns3.trim() });
    } else {
      params.push({ name: dnsServersPath, type: 'xsd:string', value: dnsList.join(',') });
    }
  }
  return params;
}

function buildWlanSecurityParams(
  dev: Device,
  findWlanPath: (template: string | undefined, suffixRe: RegExp, fallback: string) => string,
  vpSecurityTemplate: string | undefined,
  exactWlanPrefix: string,
  anyWlanParams: DeviceParameter[],
  uiMode: string,
): BackendSetParam[] {
  const mode = uiMode.trim();
  const root = dev.dataModelRoot === 'Device.' ? 'Device.' : 'InternetGatewayDevice.';
  const out: BackendSetParam[] = [];
  const rawTokens = new Set<string>();
  for (const r of dev.wifiRadios ?? []) {
    if (r.securityMode) rawTokens.add(r.securityMode.trim());
  }
  for (const p of dev.parameters) {
    if (!p.value) continue;
    if (/(BeaconType|PossibleBeaconTypes|ModeEnabled|ModesSupported|AllowedSecurityModes|EncryptionModes)$/i.test(p.path)) {
      for (const tok of p.value.split(/[,;/|]+/)) {
        const t = tok.trim();
        if (t) rawTokens.add(t);
      }
    }
  }
  const hasToken = (re: RegExp) => Array.from(rawTokens).some((t) => re.test(t));
  const secPath = findWlanPath(
    vpSecurityTemplate,
    /\.(?:BeaconType|Security\.ModeEnabled)$/,
    root === 'Device.' ? `${root}WiFi.AccessPoint.1.Security.ModeEnabled` : `${exactWlanPrefix}BeaconType`,
  );

  if (root === 'Device.') {
    const val = /^(None|Open)$/i.test(mode)
      ? 'None'
      : /^AES$/i.test(mode)
        ? 'WPA2-Personal'
        : 'WPA-WPA2-Personal';
    out.push({ name: secPath, type: 'xsd:string', value: val });
    return out;
  }

  const isCtComStyle =
    hasToken(/^(WPA\/WPA2|WPA2|None|TKIPandAESEncryption)$/i) ||
    dev.parameters.some((p) => p.path.includes('X_CT-COM_') || p.path.includes('X_CMCC_'));
  const isHuaweiStyle = hasToken(/^(WPAand11i|11i|Basic)$/i);
  const hasLeaf = (re: RegExp) => anyWlanParams.some((p) => re.test(p.path));

  if (/^(None|Open|Basic)$/i.test(mode)) {
    const beaconVal = hasToken(/^None$/i) || (isCtComStyle && !isHuaweiStyle) ? 'None' : 'Basic';
    out.push({ name: secPath, type: 'xsd:string', value: beaconVal });
    if (hasLeaf(/\.BasicEncryptionModes$/)) {
      out.push({
        name: findWlanPath(undefined, /\.BasicEncryptionModes$/, `${exactWlanPrefix}BasicEncryptionModes`),
        type: 'xsd:string',
        value: 'None',
      });
    }
    return out;
  }

  if (/^TKIP$/i.test(mode)) {
    const beaconVal = isCtComStyle && !hasToken(/^WPA$/i) ? 'WPA/WPA2' : 'WPA';
    out.push({ name: secPath, type: 'xsd:string', value: beaconVal });
    if (hasLeaf(/\.WPAEncryptionModes$/)) {
      out.push({
        name: findWlanPath(undefined, /\.WPAEncryptionModes$/, `${exactWlanPrefix}WPAEncryptionModes`),
        type: 'xsd:string',
        value: 'TKIPEncryption',
      });
    }
    return out;
  }

  if (/^AES$/i.test(mode)) {
    const beaconVal = hasToken(/^11i$/i) || (isHuaweiStyle && !hasToken(/^WPA2$/i)) ? '11i' : isCtComStyle ? 'WPA2' : '11i';
    out.push({ name: secPath, type: 'xsd:string', value: beaconVal });
    if (hasLeaf(/\.IEEE11iEncryptionModes$/)) {
      out.push({
        name: findWlanPath(undefined, /\.IEEE11iEncryptionModes$/, `${exactWlanPrefix}IEEE11iEncryptionModes`),
        type: 'xsd:string',
        value: 'AESEncryption',
      });
    }
    return out;
  }

  // TKIP+AES
  const beaconVal = hasToken(/^WPAand11i$/i) || (isHuaweiStyle && !hasToken(/^WPA\/WPA2$/i)) ? 'WPAand11i' : isCtComStyle ? 'WPA/WPA2' : 'WPAand11i';
  out.push({ name: secPath, type: 'xsd:string', value: beaconVal });
  if (isCtComStyle && !isHuaweiStyle) {
    if (hasLeaf(/\.WPAEncryptionModes$/)) {
      out.push({
        name: findWlanPath(undefined, /\.WPAEncryptionModes$/, `${exactWlanPrefix}WPAEncryptionModes`),
        type: 'xsd:string',
        value: 'TKIPandAESEncryption',
      });
    }
    if (hasLeaf(/\.IEEE11iEncryptionModes$/)) {
      out.push({
        name: findWlanPath(undefined, /\.IEEE11iEncryptionModes$/, `${exactWlanPrefix}IEEE11iEncryptionModes`),
        type: 'xsd:string',
        value: 'TKIPandAESEncryption',
      });
    }
  } else if (isHuaweiStyle) {
    if (hasLeaf(/\.WPAEncryptionModes$/)) {
      out.push({
        name: findWlanPath(undefined, /\.WPAEncryptionModes$/, `${exactWlanPrefix}WPAEncryptionModes`),
        type: 'xsd:string',
        value: 'TKIPEncryption',
      });
    }
    if (hasLeaf(/\.IEEE11iEncryptionModes$/)) {
      out.push({
        name: findWlanPath(undefined, /\.IEEE11iEncryptionModes$/, `${exactWlanPrefix}IEEE11iEncryptionModes`),
        type: 'xsd:string',
        value: 'AESEncryption',
      });
    }
  }
  return out;
}

function buildWifiSetParams(
  dev: Device,
  aliases: ManufacturerAlias[],
  radioIndex: number,
  input: {
    ssid?: string;
    passphrase?: string;
    channel?: string | number;
    enabled?: boolean;
    securityMode?: string;
    band?: WiFiRadio['band'];
  },
): BackendSetParam[] {
  const matched = findAliasForDevice(dev, aliases);
  const vp = matched?.virtualParameters;
  const root = dev.dataModelRoot === 'Device.' ? 'Device.' : 'InternetGatewayDevice.';
  const params: BackendSetParam[] = [];

  const exactWlanPrefix =
    root === 'Device.'
      ? `Device.WiFi.`
      : `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radioIndex}.`;
  const anyWlanParams = dev.parameters.filter((p) =>
    root === 'Device.'
      ? p.path.startsWith('Device.WiFi.')
      : /^InternetGatewayDevice\.LANDevice\.\d+\.WLANConfiguration\.\d+\./.test(p.path),
  );
  const rowWlanParams = dev.parameters.filter((p) =>
    root === 'Device.'
      ? new RegExp(`^Device\\.WiFi\\.(?:SSID|Radio|AccessPoint)\\.${radioIndex}\\.`).test(p.path)
      : p.path.startsWith(exactWlanPrefix),
  );
  const findWlanPath = (template: string | undefined, suffixRe: RegExp, fallback: string): string => {
    const instantiated = instantiateVirtualTemplate(template ?? '', radioIndex);
    if (instantiated && rowWlanParams.some((p) => p.path === instantiated)) {
      return instantiated;
    }
    const exactMatch = rowWlanParams.find((p) => suffixRe.test(p.path))?.path;
    if (exactMatch) return exactMatch;
    if (root !== 'Device.') {
      const sibling = anyWlanParams.find((p) => suffixRe.test(p.path))?.path;
      if (sibling) {
        return sibling.replace(/(\.WLANConfiguration\.)\d+\./, `$1${radioIndex}.`);
      }
    }
    return instantiated || fallback;
  };

  if (input.ssid !== undefined) {
    const path = findWlanPath(
      vp?.wlanSsid,
      /\.SSID$/,
      root === 'Device.' ? `${root}WiFi.SSID.${radioIndex}.SSID` : `${exactWlanPrefix}SSID`,
    );
    params.push({ name: path, type: 'xsd:string', value: input.ssid });
  }
  if (input.securityMode !== undefined) {
    params.push(
      ...buildWlanSecurityParams(dev, findWlanPath, vp?.wlanSecurityMode, exactWlanPrefix, anyWlanParams, input.securityMode),
    );
  }
  const isUnencrypted = input.securityMode === 'None' || input.securityMode === 'Open';
  const rawPassphrase = input.passphrase ?? '';
  const hasRealPassphrase =
    rawPassphrase.trim() !== '' &&
    !/^•+$/.test(rawPassphrase.trim());
  if (hasRealPassphrase && !isUnencrypted) {
    const instantiatedVp = instantiateVirtualTemplate(vp?.wlanPassphrase ?? '', radioIndex);
    let passPath = '';
    if (instantiatedVp && rowWlanParams.some((p) => p.path === instantiatedVp)) {
      passPath = instantiatedVp;
    } else if (instantiatedVp && root !== 'Device.' && anyWlanParams.some((p) => p.path === instantiatedVp.replace(/(\.WLANConfiguration\.)\d+\./, '$11.'))) {
      passPath = instantiatedVp;
    } else {
      const pool = rowWlanParams.length > 0 ? rowWlanParams : anyWlanParams;
      const pskKeypass = pool.find((p) => /\.PreSharedKey\.\d+\.KeyPassphrase$/.test(p.path))?.path;
      const pskPreShared = pool.find((p) => /\.PreSharedKey\.\d+\.PreSharedKey$/.test(p.path))?.path;
      const topKeypass = pool.find((p) => /\.WLANConfiguration\.\d+\.KeyPassphrase$/.test(p.path))?.path;
      const tr181Pass = pool.find((p) => /\.Security\.KeyPassphrase$/.test(p.path))?.path;
      const picked = pskKeypass || pskPreShared || topKeypass || tr181Pass;
      passPath = picked
        ? picked.replace(/(\.WLANConfiguration\.)\d+\./, `$1${radioIndex}.`)
        : instantiatedVp || `${exactWlanPrefix}PreSharedKey.1.PreSharedKey`;
    }
    params.push({ name: passPath, type: 'xsd:string', value: rawPassphrase });
  }
  if (input.channel !== undefined) {
    const chVal = String(input.channel).trim();
    const isAuto = chVal.toLowerCase() === 'auto' || chVal === '0';
    const hasAutoChannel =
      anyWlanParams.length > 0
        ? anyWlanParams.some((p) => /\.AutoChannelEnable$/i.test(p.path))
        : Boolean(vp?.wlanAutoChannel?.trim());
    const channelPath = findWlanPath(
      vp?.wlanChannel,
      /\.Channel$/,
      root === 'Device.' ? `${root}WiFi.Radio.${radioIndex}.Channel` : `${exactWlanPrefix}Channel`,
    );
    if (hasAutoChannel) {
      const autoPath = findWlanPath(
        vp?.wlanAutoChannel,
        /\.AutoChannelEnable$/,
        root === 'Device.' ? `${root}WiFi.Radio.${radioIndex}.AutoChannelEnable` : `${exactWlanPrefix}AutoChannelEnable`,
      );
      params.push({ name: autoPath, type: 'xsd:boolean', value: isAuto ? 'true' : 'false' });
      if (!isAuto) {
        params.push({ name: channelPath, type: 'xsd:unsignedInt', value: chVal });
      }
    } else {
      params.push({ name: channelPath, type: 'xsd:unsignedInt', value: isAuto ? '0' : chVal });
    }
  }
  if (input.enabled !== undefined) {
    const path = findWlanPath(
      vp?.wlanEnabled,
      /\.Enable$/,
      root === 'Device.' ? `${root}WiFi.SSID.${radioIndex}.Enable` : `${exactWlanPrefix}Enable`,
    );
    params.push({ name: path, type: 'xsd:boolean', value: input.enabled ? 'true' : 'false' });
  }
  return params;
}

export interface ResolvedDeviceTelemetry {
  rxPowerDbm: number | null;
  rxReadState: Device['rxReadState'];
  rxPath: string | null;
  temperatureCelsius: number | null;
  tempReadState: Device['tempReadState'];
  temperaturePath: string | null;
  uptimeSeconds: number | null;
  uptimeReadState: Device['uptimeReadState'];
  uptimePath: string | null;
  connectionRequestUrl: string | null;
  periodicInformInterval: number | null;
  wanIp: string | null;
  wanIpPath: string | null;
  pppoeUsername: string | null;
  pppoeUsernamePath: string | null;
  pppoePassword: string | null;
  wanVlanId: number | null;
  wanStatus: string | null;
  wlanSsid: string | null;
  wlanSsidPath: string | null;
  wlanPassphrase: string | null;
  wlanPassphrasePath: string | null;
  wlanEnabled: boolean | null;
  wlanChannel: string | null;
  adminUsername: string;
  adminPassword: string;
  userUsername: string;
  userPassword: string;
  serialNumber: string;
  oui: string;
  manufacturerCanonical: string;
  productClass: string;
  modelName: string;
  hardwareVersion: string;
  softwareVersion: string;
  matchedProfileName: string | null;
}

export function resolveTelemetryFromVParams(
  device: Device,
  alias: ManufacturerAlias | undefined,
): ResolvedDeviceTelemetry {
  const hasParameters = device.parameters.length > 0;
  const parseNumericParam = (
    param: DeviceParameter | undefined,
    fallbackVal: number | null,
    fallbackState: Device['rxReadState'],
    hasAlias: boolean,
    mode: 'raw' | 'rx' | 'temp' = 'raw',
  ): { val: number | null; state: Device['rxReadState']; path: string | null } => {
    if (!hasAlias || !hasParameters) {
      return { val: fallbackVal, state: fallbackState, path: null };
    }
    if (!param) {
      return {
        val: fallbackVal,
        state: fallbackVal !== null ? 'available' : fallbackState === 'unsupported' ? 'unsupported' : 'not_fetched',
        path: null,
      };
    }
    if (param.readState !== 'available' || param.value === null || param.value.trim() === '') {
      return { val: fallbackVal, state: fallbackVal !== null ? 'available' : param.readState, path: param.path };
    }
    let parsed = Number(param.value);
    if (!Number.isFinite(parsed)) {
      return { val: fallbackVal, state: fallbackVal !== null ? 'available' : 'read_failed', path: param.path };
    }
    // ZTE ONTs without a readable transceiver temp sensor report sentinel 256 / 256.000000;
    // XST99 / XSF609 ONTs without DDM temp report 0.
    if (mode === 'temp' && (parsed === 0 || parsed === 256)) {
      return { val: fallbackVal, state: fallbackVal !== null ? 'available' : 'unsupported', path: param.path };
    }
    if (mode === 'rx' && parsed > 10 && parsed <= 100000) {
      parsed = Math.round(10 * Math.log10(parsed * 0.0001) * 100) / 100;
    } else if (mode === 'temp' && parsed > 512 && parsed < 40000) {
      parsed = Math.round((parsed / 256) * 10) / 10;
    }
    return { val: parsed, state: 'available', path: param.path };
  };

  const parseStringParam = (
    param: DeviceParameter | undefined,
    fallbackVal: string | null,
    hasAlias: boolean,
  ): { val: string | null; path: string | null } => {
    if (!hasAlias || !hasParameters) {
      return { val: fallbackVal, path: null };
    }
    if (!param || param.value === null || param.value.trim() === '') {
      return { val: fallbackVal, path: param?.path ?? null };
    }
    if (param.readState !== 'available' && param.readState !== 'redacted') {
      return { val: fallbackVal, path: param.path };
    }
    return { val: param.value, path: param.path };
  };

  const hasAlias = Boolean(alias);
  const vp = alias?.virtualParameters;

  const serial = parseStringParam(findParamByVirtualTemplate(device.parameters, vp?.serialNumber), device.serialNumber, hasAlias);
  const mfg = parseStringParam(findParamByVirtualTemplate(device.parameters, vp?.manufacturer), device.manufacturerCanonical, hasAlias);
  const oui = parseStringParam(findParamByVirtualTemplate(device.parameters, vp?.oui), device.oui, hasAlias);
  const pc = parseStringParam(findParamByVirtualTemplate(device.parameters, vp?.productClass), device.productClass, hasAlias);
  const model = parseStringParam(findParamByVirtualTemplate(device.parameters, vp?.modelName), device.modelName, hasAlias);
  const hw = parseStringParam(findParamByVirtualTemplate(device.parameters, vp?.hardwareVersion), device.hardwareVersion, hasAlias);
  const sw = parseStringParam(findParamByVirtualTemplate(device.parameters, vp?.softwareVersion), device.softwareVersion, hasAlias);

  const rxParam =
    findParamByVirtualTemplate(device.parameters, vp?.rxPower) ??
    device.parameters.find((p) => p.path.endsWith('.RXPower') && !p.path.endsWith('.CATVRXPower'));
  const vpTempParam = findParamByVirtualTemplate(device.parameters, vp?.temperature);
  const fallbackTempParam = device.parameters.find(
    (p) =>
      p.path.endsWith('.TransceiverTemperature') ||
      p.path.endsWith('.OpticalTransceiver.Temperature') ||
      ((p.path.includes('Optical') ||
        p.path.includes('PONInterfaceConfig') ||
        p.path.includes('GponInterafceConfig') ||
        p.path.includes('EponInterfaceConfig') ||
        p.path.includes('EponInterafceConfig')) &&
        p.path.endsWith('.Temperature')),
  );
  const tempParam =
    vpTempParam && Number(vpTempParam.value) !== 256
      ? vpTempParam
      : fallbackTempParam ?? vpTempParam;
  const rx = parseNumericParam(
    rxParam,
    device.rxPowerDbm,
    device.rxReadState,
    hasAlias,
    'rx',
  );
  const temp = parseNumericParam(
    tempParam,
    device.temperatureCelsius,
    device.tempReadState,
    hasAlias,
    'temp',
  );
  const uptime = parseNumericParam(
    findParamByVirtualTemplate(device.parameters, vp?.uptime),
    device.uptimeSeconds,
    device.uptimeReadState,
    hasAlias,
  );
  const crUrl = parseStringParam(
    findParamByVirtualTemplate(device.parameters, vp?.connectionRequestUrl),
    device.connectionRequestUrl,
    hasAlias,
  );
  const periodicInform = parseNumericParam(
    findParamByVirtualTemplate(device.parameters, vp?.periodicInformInterval),
    device.periodicInformInterval,
    'available',
    hasAlias,
  );
  const wanIp = parseStringParam(findParamByVirtualTemplate(device.parameters, vp?.wanExternalIp), device.wanIp, hasAlias);
  const pppoe = parseStringParam(
    findParamByVirtualTemplate(device.parameters, vp?.wanPppoeUsername),
    device.pppoeUsername,
    hasAlias,
  );
  const pppoePwd = parseStringParam(
    findParamByVirtualTemplate(device.parameters, vp?.wanPppoePassword),
    device.wanConnections?.[0]?.pppoePassword ?? null,
    hasAlias,
  );
  const wanVlan = parseNumericParam(
    findParamByVirtualTemplate(device.parameters, vp?.wanVlanId),
    device.wanConnections?.[0]?.vlanId ?? null,
    'available',
    hasAlias,
  );
  const wanStatus = parseStringParam(
    findParamByVirtualTemplate(device.parameters, vp?.wanStatus),
    device.wanConnections?.[0]?.status ?? null,
    hasAlias,
  );
  const ssid = parseStringParam(
    findParamByVirtualTemplate(device.parameters, vp?.wlanSsid),
    device.wifiRadios?.[0]?.ssid ?? null,
    hasAlias,
  );
  const passphrase = parseStringParam(
    findParamByVirtualTemplate(device.parameters, vp?.wlanPassphrase),
    device.wifiRadios?.[0]?.passphrase ?? null,
    hasAlias,
  );
  const wlanEnableStr = parseStringParam(
    findParamByVirtualTemplate(device.parameters, vp?.wlanEnabled),
    device.wifiRadios?.[0] ? String(device.wifiRadios[0].enabled) : null,
    hasAlias,
  );
  const wlanChannel = parseStringParam(
    findParamByVirtualTemplate(device.parameters, vp?.wlanChannel),
    device.wifiRadios?.[0]?.channel ?? null,
    hasAlias,
  );
  const adminUser = parseStringParam(
    findParamByVirtualTemplate(device.parameters, vp?.adminUsername),
    device.credentials.adminUsername,
    hasAlias,
  );
  const adminPwd = parseStringParam(
    findParamByVirtualTemplate(device.parameters, vp?.adminPassword),
    device.credentials.adminPassword,
    hasAlias,
  );
  const userUser = parseStringParam(
    findParamByVirtualTemplate(device.parameters, vp?.userUsername),
    device.credentials.userUsername,
    hasAlias,
  );
  const userPwd = parseStringParam(
    findParamByVirtualTemplate(device.parameters, vp?.userPassword),
    device.credentials.userPassword,
    hasAlias,
  );

  return {
    rxPowerDbm: rx.val,
    rxReadState: rx.state,
    rxPath: rx.path,
    temperatureCelsius: temp.val,
    tempReadState: temp.state,
    temperaturePath: temp.path,
    uptimeSeconds: uptime.val,
    uptimeReadState: uptime.state,
    uptimePath: uptime.path,
    connectionRequestUrl: crUrl.val,
    periodicInformInterval: periodicInform.val ?? device.periodicInformInterval,
    wanIp: wanIp.val,
    wanIpPath: wanIp.path,
    pppoeUsername: pppoe.val,
    pppoeUsernamePath: pppoe.path,
    pppoePassword: pppoePwd.val,
    wanVlanId: wanVlan.val,
    wanStatus: wanStatus.val,
    wlanSsid: ssid.val,
    wlanSsidPath: ssid.path,
    wlanPassphrase: passphrase.val,
    wlanPassphrasePath: passphrase.path,
    wlanEnabled:
      wlanEnableStr.val !== null ? wlanEnableStr.val === 'true' || wlanEnableStr.val === '1' : null,
    wlanChannel: wlanChannel.val,
    adminUsername: adminUser.val ?? (hasAlias ? '-' : device.credentials.adminUsername),
    adminPassword: adminPwd.val ?? (hasAlias ? '' : device.credentials.adminPassword),
    userUsername: userUser.val ?? (hasAlias ? '-' : device.credentials.userUsername),
    userPassword: userPwd.val ?? (hasAlias ? '' : device.credentials.userPassword),
    serialNumber: serial.val ?? (hasAlias ? '-' : device.serialNumber),
    oui: oui.val ?? (hasAlias ? '-' : device.oui),
    manufacturerCanonical: alias?.canonicalName || mfg.val || device.manufacturerCanonical,
    productClass: pc.val ?? (hasAlias ? '-' : device.productClass),
    modelName: model.val ?? (hasAlias ? '-' : device.modelName),
    hardwareVersion: hw.val ?? (hasAlias ? '-' : device.hardwareVersion),
    softwareVersion: sw.val ?? (hasAlias ? '-' : device.softwareVersion),
    matchedProfileName: alias?.canonicalName ?? null,
  };
}

export function resolveConnectedHostsFromVParams(
  device: Device,
  alias: ManufacturerAlias | undefined,
): NonNullable<Device['connectedHosts']> {
  const hosts = device.connectedHosts ?? [];
  if (!alias) return hosts;
  const vp = alias.virtualParameters;
  const rootTemplate = vp.connectedHostsRoot.trim();
  const hasAnyHostRule = Boolean(rootTemplate || vp.hostName.trim() || vp.hostMac.trim() || vp.hostIp.trim());
  if (!hasAnyHostRule) return [];

  const grouped = new Map<string, Partial<NonNullable<Device['connectedHosts']>[number]>>();
  const collectByTemplate = (template: string, assign: (target: Partial<NonNullable<Device['connectedHosts']>[number]>, val: string) => void) => {
    if (!template.trim()) return;
    const escaped = template.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{i\\\}/g, '(\\d+)');
    const regex = new RegExp(`^${escaped}$`);
    for (const p of device.parameters) {
      if (p.readState !== 'available' || p.value === null) continue;
      const m = regex.exec(p.path.trim());
      if (!m) continue;
      const instanceKey = m[1] || '1';
      const current = grouped.get(instanceKey) ?? {};
      assign(current, p.value);
      grouped.set(instanceKey, current);
    }
  };

  collectByTemplate(vp.hostName, (item, v) => {
    item.hostname = v;
  });
  collectByTemplate(vp.hostMac, (item, v) => {
    item.macAddress = v;
  });
  collectByTemplate(vp.hostIp, (item, v) => {
    item.ipAddress = v;
  });

  if (rootTemplate) {
    const rootPrefixParams = device.parameters.filter((p) =>
      matchVirtualPathTemplate(p.path, rootTemplate, true),
    );
    const escapedRoot = rootTemplate
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\{i\\\}/g, '(\\d+)');
    const leafRegex = new RegExp(`^${escapedRoot}\\.([^.]+)$`);

    for (const p of rootPrefixParams) {
      if (p.readState !== 'available' || p.value === null) continue;
      const match = leafRegex.exec(p.path);
      if (!match) continue;
      const instanceKey = match[2] ? match[1] : '1';
      const prop = match[2] ?? match[1];
      const current = grouped.get(instanceKey) ?? {};
      if (prop === 'HostName' && !current.hostname) current.hostname = p.value;
      else if ((prop === 'PhysAddress' || prop === 'MACAddress') && !current.macAddress) current.macAddress = p.value;
      else if (prop === 'IPAddress' && !current.ipAddress) current.ipAddress = p.value;
      else if ((prop === 'Layer1Interface' || prop === 'InterfaceType') && !current.interfaceName) current.interfaceName = p.value;
      grouped.set(instanceKey, current);
    }
  }

  if (grouped.size === 0) return hosts;

  const parsed: NonNullable<Device['connectedHosts']> = [];
  for (const [idxStr, item] of grouped.entries()) {
    const existing = hosts[Number(idxStr) - 1] ?? hosts.find((h) => h.macAddress === item.macAddress);
    if (item.hostname || item.ipAddress || item.macAddress) {
      parsed.push({
        hostname: item.hostname ?? existing?.hostname ?? `Host-${idxStr}`,
        macAddress: item.macAddress ?? existing?.macAddress ?? '-',
        ipAddress: item.ipAddress ?? existing?.ipAddress ?? '-',
        interfaceName: item.interfaceName ?? existing?.interfaceName ?? '-',
        connectionType: existing?.connectionType ?? 'Ethernet',
        active: existing?.active ?? true,
        lastSeenAt: existing?.lastSeenAt ?? device.lastInformAt ?? new Date().toISOString(),
      });
    }
  }
  return parsed.length > 0 ? parsed : hosts;
}

export function extractInstanceIndexFromPath(actualPath: string, template?: string): number | null {
  const t = template?.trim() ?? '';
  if (!t || !t.includes('{i}')) return 1;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{i\\\}/g, '(\\d+)');
  const match = new RegExp(`^${escaped}$`).exec(actualPath.trim());
  if (!match) return null;
  return Number(match[1]) || 1;
}

export function resolveWanInstanceFromVParams(
  device: Device,
  alias: ManufacturerAlias | undefined,
  wan: WANConnection,
): {
  status: string;
  vlanEnabled: boolean;
  vlanType: 'untag' | 'transparent' | 'tag';
  vlanSupportsTransparent: boolean;
  vlanId: number | undefined;
  pppoeUsername: string | undefined;
  pppoePassword: string | undefined;
  wanIp: string;
  addressingMode: 'DHCP' | 'Static';
  subnetMask: string;
  gateway: string;
  dns: string;
} {
  const defaultVlanEnabled = wan.vlanEnabled ?? (wan.vlanId !== undefined ? wan.vlanId > 0 : false);
  const defaultVlanType: 'untag' | 'transparent' | 'tag' = wan.vlanType ?? (defaultVlanEnabled ? 'tag' : 'untag');
  if (!alias) {
    return {
      status: wan.status,
      vlanEnabled: defaultVlanType === 'tag',
      vlanType: defaultVlanType,
      vlanSupportsTransparent: Boolean(wan.vlanSupportsTransparent),
      vlanId: wan.vlanId,
      pppoeUsername: wan.pppoeUsername,
      pppoePassword: wan.pppoePassword,
      wanIp: wan.wanIp,
      addressingMode: wan.addressingMode ?? 'DHCP',
      subnetMask: wan.subnetMask ?? '255.255.255.0',
      gateway: wan.gateway,
      dns: wan.dns,
    };
  }
  const vp = alias.virtualParameters;
  const getBySlot = (tmpl?: string) => {
    if (!tmpl || !tmpl.trim()) return undefined;
    // Match the exact instance index only when template has {i}; otherwise only instance 1 owns singleton templates
    if (!tmpl.includes('{i}') && wan.instanceIndex !== 1) return undefined;
    const concretePath = instantiateVirtualTemplate(tmpl, wan.instanceIndex);
    const p = device.parameters.find((item) => item.path === concretePath);
    if (!p || p.value === null || (p.readState !== 'available' && p.readState !== 'redacted')) return undefined;
    return p.value;
  };

  const ipPaths = resolveWanIpoePathsFromVParams(device.dataModelRoot, vp, wan.instanceIndex);
  const getByConcrete = (path: string) => {
    const p = device.parameters.find((item) => item.path === path);
    if (!p || p.value === null || p.readState !== 'available') return undefined;
    return p.value;
  };

  const statusVal = getBySlot(vp.wanStatus);
  const vlanVal = getBySlot(vp.wanVlanId);
  const userVal = getBySlot(vp.wanPppoeUsername);
  const pwdVal = getBySlot(vp.wanPppoePassword);
  const ipVal = getBySlot(vp.wanExternalIp) ?? getByConcrete(ipPaths.externalIp);
  const addrVal = getBySlot(vp.wanAddressingType) ?? getByConcrete(ipPaths.addressingType);
  const maskVal = getBySlot(vp.wanSubnetMask) ?? getByConcrete(ipPaths.subnetMask);
  const gwVal = getBySlot(vp.wanGateway) ?? getByConcrete(ipPaths.gateway);
  const dnsVal = getBySlot(vp.wanDnsServers) ?? getByConcrete(ipPaths.dnsServers);

  const resolvedVlanId = vlanVal !== undefined && Number.isFinite(Number(vlanVal)) ? Number(vlanVal) : wan.vlanId;
  const resolvedVlanType: 'untag' | 'transparent' | 'tag' =
    wan.vlanType ?? ((wan.vlanEnabled ?? (resolvedVlanId !== undefined ? resolvedVlanId > 0 : false)) ? 'tag' : 'untag');
  const resolvedVlanEnabled = resolvedVlanType === 'tag';

  return {
    status: statusVal ?? wan.status,
    vlanEnabled: resolvedVlanEnabled,
    vlanType: resolvedVlanType,
    vlanSupportsTransparent: Boolean(wan.vlanSupportsTransparent),
    vlanId: resolvedVlanId,
    pppoeUsername: userVal !== undefined ? (userVal || undefined) : wan.pppoeUsername,
    pppoePassword: pwdVal !== undefined ? (pwdVal || undefined) : wan.pppoePassword,
    wanIp: ipVal ?? wan.wanIp,
    addressingMode: addrVal === 'Static' ? 'Static' : addrVal === 'DHCP' ? 'DHCP' : (wan.addressingMode ?? 'DHCP'),
    subnetMask: maskVal ?? wan.subnetMask ?? '255.255.255.0',
    gateway: gwVal ?? wan.gateway,
    dns: dnsVal ?? wan.dns,
  };
}

export function resolveWlanInstanceFromVParams(
  device: Device,
  alias: ManufacturerAlias | undefined,
  radio: WiFiRadio,
): {
  enabled: boolean;
  ssid: string;
  channel: string;
  passphrase: string;
  securityMode: string;
  band: WiFiRadio['band'];
} {
  if (!alias) {
    return {
      enabled: radio.enabled,
      ssid: radio.ssid,
      channel: radio.channel,
      passphrase: radio.passphrase,
      securityMode: radio.securityMode,
      band: radio.band,
    };
  }
  const vp = alias.virtualParameters;
  const getBySlot = (tmpl?: string) => {
    if (!tmpl || !tmpl.trim()) return undefined;
    if (!tmpl.includes('{i}') && radio.index !== 1) return undefined;
    const concretePath = instantiateVirtualTemplate(tmpl, radio.index);
    const p = device.parameters.find((item) => item.path === concretePath);
    if (!p || p.value === null || (p.readState !== 'available' && p.readState !== 'redacted')) return undefined;
    return p.value;
  };

  const enabledVal = getBySlot(vp.wlanEnabled);
  const ssidVal = getBySlot(vp.wlanSsid);
  const channelVal = getBySlot(vp.wlanChannel);
  const autoChannelVal = getBySlot(vp.wlanAutoChannel);
  const pwdVal =
    getBySlot(vp.wlanPassphrase) ??
    getBySlot('InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.PreSharedKey.1.PreSharedKey') ??
    getBySlot('InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.KeyPassphrase');
  const secVal = getBySlot(vp.wlanSecurityMode);
  const bandVal = getBySlot(vp.wlanBand);

  // Use parsed encryption mode from live-mappers unless VParam specifically points elsewhere and isn't already normalized
  const resolvedSec =
    secVal && /^(None|TKIP|TKIP\+AES|AES)$/i.test(secVal)
      ? secVal
      : radio.securityMode;

  const normalizedBand: WiFiRadio['band'] =
    radio.index >= 5
      ? '5 GHz'
      : bandVal && (/^(a|ac|ax)$/i.test(bandVal.trim()) || /5\s*g|802\.11(a|ac|ax)/i.test(bandVal))
        ? '5 GHz'
        : radio.band;

  return {
    enabled: enabledVal !== undefined ? enabledVal === 'true' || enabledVal === '1' : radio.enabled,
    ssid: ssidVal ?? radio.ssid,
    channel:
      autoChannelVal === 'true' || autoChannelVal === '1' || channelVal === '0'
        ? 'Auto'
        : (channelVal ?? radio.channel),
    passphrase: resolvedSec === 'None' ? '' : (pwdVal || radio.passphrase),
    securityMode: resolvedSec,
    band: normalizedBand,
  };
}

function syncWanConnectionParams(
  parameters: DeviceParameter[],
  wan: WANConnection,
  alias: ManufacturerAlias | undefined,
  protocol: Device['protocol'],
  nowIso: string,
): DeviceParameter[] {
  const vp = alias?.virtualParameters;
  if (!vp) return parameters;
  let next = parameters;
  if (wan.wanIp && wan.wanIp !== '-') {
    next = upsertVirtualParamInList(next, vp.wanExternalIp, 'wan.external_ip', wan.wanIp, protocol, wan.instanceIndex, nowIso, {
      isWritable: false,
    });
  }
  if (wan.pppoeUsername !== undefined) {
    next = upsertVirtualParamInList(
      next,
      vp.wanPppoeUsername,
      'wan.pppoe_username',
      wan.pppoeUsername || '',
      protocol,
      wan.instanceIndex,
      nowIso,
      { isWritable: true },
    );
  }
  if (wan.pppoePassword !== undefined) {
    next = upsertVirtualParamInList(
      next,
      vp.wanPppoePassword,
      'wan.pppoe_password',
      wan.pppoePassword || '',
      protocol,
      wan.instanceIndex,
      nowIso,
      { isWritable: true, isSecret: true },
    );
  }
  if (wan.vlanId !== undefined) {
    next = upsertVirtualParamInList(next, vp.wanVlanId, 'wan.vlan_id', String(wan.vlanId), protocol, wan.instanceIndex, nowIso, {
      isWritable: true,
    });
  }
  if (wan.connectionType === 'IPoE') {
    next = upsertVirtualParamInList(next, vp.wanAddressingType, 'wan.addressing_type', wan.addressingMode ?? 'DHCP', protocol, wan.instanceIndex, nowIso, {
      isWritable: true,
    });
    if (wan.addressingMode === 'Static') {
      if (wan.subnetMask) {
        next = upsertVirtualParamInList(next, vp.wanSubnetMask, 'wan.subnet_mask', wan.subnetMask, protocol, wan.instanceIndex, nowIso, {
          isWritable: true,
        });
      }
      if (wan.gateway && wan.gateway !== '-') {
        next = upsertVirtualParamInList(next, vp.wanGateway, 'wan.gateway', wan.gateway, protocol, wan.instanceIndex, nowIso, {
          isWritable: true,
        });
      }
      if (wan.dns) {
        next = upsertVirtualParamInList(next, vp.wanDnsServers, 'wan.dns_servers', wan.dns, protocol, wan.instanceIndex, nowIso, {
          isWritable: true,
        });
      }
    }
  }
  next = upsertVirtualParamInList(next, vp.wanStatus, 'wan.status', wan.status, protocol, wan.instanceIndex, nowIso, {
    isWritable: false,
  });
  return next;
}

function syncWifiRadioParams(
  parameters: DeviceParameter[],
  radio: WiFiRadio,
  alias: ManufacturerAlias | undefined,
  protocol: Device['protocol'],
  nowIso: string,
): DeviceParameter[] {
  const vp = alias?.virtualParameters;
  if (!vp) return parameters;
  let next = parameters;
  next = upsertVirtualParamInList(next, vp.wlanSsid, 'wifi.ssid', radio.ssid, protocol, radio.index, nowIso, {
    isWritable: true,
  });
  if (radio.passphrase) {
    next = upsertVirtualParamInList(
      next,
      vp.wlanPassphrase,
      'wifi.security_key',
      radio.passphrase,
      protocol,
      radio.index,
      nowIso,
      { isWritable: true, isSecret: true },
    );
  }
  next = upsertVirtualParamInList(next, vp.wlanEnabled, 'wifi.enabled', String(radio.enabled), protocol, radio.index, nowIso, {
    isWritable: true,
  });
  next = upsertVirtualParamInList(next, vp.wlanChannel, 'wifi.channel', radio.channel, protocol, radio.index, nowIso, {
    isWritable: true,
  });
  next = upsertVirtualParamInList(next, vp.wlanAutoChannel, 'wifi.auto_channel', radio.channel === 'Auto' ? 'true' : 'false', protocol, radio.index, nowIso, {
    isWritable: true,
  });
  next = upsertVirtualParamInList(next, vp.wlanSecurityMode, 'wifi.security_mode', radio.securityMode, protocol, radio.index, nowIso, {
    isWritable: true,
  });
  next = upsertVirtualParamInList(next, vp.wlanBand, 'wifi.band', radio.band, protocol, radio.index, nowIso, {
    isWritable: true,
  });
  return next;
}

export function resolveVirtualParamKeyForPath(
  path: string,
  alias: ManufacturerAlias | undefined,
): string | undefined {
  if (!alias) return undefined;
  const vp = alias.virtualParameters;
  const leafPairs: Array<[string, string]> = [
    [vp.serialNumber, 'device.serial_number'],
    [vp.manufacturer, 'device.manufacturer'],
    [vp.oui, 'device.oui'],
    [vp.productClass, 'device.product_class'],
    [vp.modelName, 'device.model_name'],
    [vp.hardwareVersion, 'device.hardware_version'],
    [vp.softwareVersion, 'device.software_version'],
    [vp.rxPower, 'optical.rx_power_dbm'],
    [vp.temperature, 'device.temperature_celsius'],
    [vp.uptime, 'device.uptime_seconds'],
    [vp.connectionRequestUrl, 'management.connection_request_url'],
    [vp.periodicInformInterval, 'management.periodic_inform_interval'],
    [vp.wanExternalIp, 'wan.external_ip'],
    [vp.wanPppoeUsername, 'wan.pppoe_username'],
    [vp.wanPppoePassword, 'wan.pppoe_password'],
    [vp.wanVlanId, 'wan.vlan_id'],
    [vp.wanStatus, 'wan.status'],
    [vp.wlanSsid, 'wifi.ssid'],
    [vp.wlanPassphrase, 'wifi.security_key'],
    [vp.wlanEnabled, 'wifi.enabled'],
    [vp.wlanChannel, 'wifi.channel'],
    [vp.hostName, 'hosts.hostname'],
    [vp.hostMac, 'hosts.mac_address'],
    [vp.hostIp, 'hosts.ip_address'],
    [vp.lanIp ?? '', 'lan.ip_address'],
    [vp.lanSubnetMask ?? '', 'lan.subnet_mask'],
    [vp.lanDhcpEnable ?? '', 'lan.dhcp_enabled'],
    [vp.lanDhcpOption125Enable ?? '', 'lan.dhcp_option125_enabled'],
    [vp.lanDhcpLeaseTime ?? '', 'lan.dhcp_lease_time'],
    [vp.lanDhcpStartIp ?? '', 'lan.dhcp_start_ip'],
    [vp.lanDhcpEndIp ?? '', 'lan.dhcp_end_ip'],
    [vp.lanDhcpAssignIspDns ?? '', 'lan.dhcp_assign_isp_dns'],
    [vp.lanDhcpDnsServers ?? '', 'lan.dhcp_dns_servers'],
    [vp.adminUsername, 'credentials.admin_username'],
    [vp.adminPassword, 'credentials.admin_password'],
    [vp.userUsername, 'credentials.user_username'],
    [vp.userPassword, 'credentials.user_password'],
  ];
  for (const [tmpl, key] of leafPairs) {
    if (matchVirtualPathTemplate(path, tmpl, false)) return key;
  }
  const rootPairs: Array<[string, string]> = [
    [vp.wanRoot, 'wan.root'],
    [vp.wlanRoot, 'wifi.root'],
    [vp.connectedHostsRoot, 'hosts.root'],
  ];
  for (const [tmpl, key] of rootPairs) {
    if (matchVirtualPathTemplate(path, tmpl, true)) return key;
  }
  return undefined;
}

export function resolveDhcpConfigFromVParams(
  device: Device,
  alias: ManufacturerAlias | undefined,
): DhcpServerConfig | null {
  const base = device.dhcpServer ?? null;
  const vp = alias?.virtualParameters;
  const getByPath = (path?: string) => {
    const clean = path?.trim();
    if (!clean) return undefined;
    const p = device.parameters.find((item) => item.path === clean);
    if (!p || p.value === null || p.readState !== 'available') return undefined;
    return p.value.trim();
  };
  const toBool = (raw?: string): boolean | undefined => {
    if (raw === undefined) return undefined;
    const low = raw.toLowerCase();
    if (low === 'true' || low === '1' || low === 'enabled' || low === 'normal' || low === 'auto') return true;
    if (low === 'false' || low === '0' || low === 'disabled' || low === 'passthrough' || low === 'static') return false;
    return undefined;
  };

  const vpIp = getByPath(vp?.lanIp);
  const vpMask = getByPath(vp?.lanSubnetMask);
  const vpEnable = toBool(getByPath(vp?.lanDhcpEnable));
  const vpOpt125 = toBool(getByPath(vp?.lanDhcpOption125Enable));
  const vpLeaseRaw = getByPath(vp?.lanDhcpLeaseTime);
  const vpLease = vpLeaseRaw !== undefined && Number.isFinite(Number(vpLeaseRaw)) && Number(vpLeaseRaw) > 0 ? Math.round(Number(vpLeaseRaw)) : undefined;
  const vpStart = getByPath(vp?.lanDhcpStartIp);
  const vpEnd = getByPath(vp?.lanDhcpEndIp);
  const vpAssignDns = toBool(getByPath(vp?.lanDhcpAssignIspDns));
  const vpDnsRaw = getByPath(vp?.lanDhcpDnsServers);

  const hasVp = [vpIp, vpMask, vpEnable, vpOpt125, vpLease, vpStart, vpEnd, vpAssignDns, vpDnsRaw].some((x) => x !== undefined);
  if (!base && !hasVp) return null;

  let dns1 = base?.dns1 ?? '';
  let dns2 = base?.dns2 ?? '';
  let dns3 = base?.dns3 ?? '';
  if (vpDnsRaw !== undefined) {
    const parts = vpDnsRaw.split(',').map((s) => s.trim()).filter((s) => s && s !== '0.0.0.0');
    dns1 = parts[0] ?? '';
    dns2 = parts[1] ?? '';
    dns3 = parts[2] ?? '';
  }

  return {
    lanIp: vpIp ?? base?.lanIp ?? '192.168.1.1',
    lanSubnetMask: vpMask ?? base?.lanSubnetMask ?? '255.255.255.0',
    dhcpServerEnable: vpEnable ?? base?.dhcpServerEnable ?? true,
    option125Enable: vpOpt125 ?? base?.option125Enable ?? false,
    leaseTimeSeconds: vpLease ?? base?.leaseTimeSeconds ?? 86400,
    startIp: vpStart ?? base?.startIp ?? '192.168.1.2',
    endIp: vpEnd ?? base?.endIp ?? '192.168.1.254',
    assignIspDns: vpAssignDns ?? base?.assignIspDns ?? (!dns1 && !dns2 && !dns3),
    dns1,
    dns2,
    dns3,
  };
}

function applyAliasToDevice(dev: Device, aliases: ManufacturerAlias[]): Device {
  const matched = findAliasForDevice(dev, aliases);
  if (!matched) return dev;
  return {
    ...dev,
    manufacturerCanonical: matched.canonicalName || dev.manufacturerCanonical,
    parameters: dev.parameters.map((p) => {
      const vpKey = resolveVirtualParamKeyForPath(p.path, matched);
      return vpKey ? { ...p, canonicalKey: vpKey } : p;
    }),
  };
}

export type DeviceColumnKey =
  | 'serialNumber'
  | 'manufacturer'
  | 'model'
  | 'productClass'
  | 'ipAddress'
  | 'rxPower'
  | 'pppoeUsername'
  | 'status'
  | 'lastInform'
  | 'technology'
  | 'protocol'
  | 'uptime'
  | 'temperature'
  | 'hwVersion'
  | 'swVersion'
  | 'oui'
  | 'deviceGroup'
  | 'connectionRequestUrl'
  | 'lastSummon';

export const DEFAULT_DEVICE_COLUMN_ORDER: DeviceColumnKey[] = [
  'status',
  'pppoeUsername',
  'ipAddress',
  'serialNumber',
  'manufacturer',
  'model',
  'productClass',
  'rxPower',
  'lastInform',
  'technology',
  'protocol',
  'uptime',
  'temperature',
  'hwVersion',
  'swVersion',
  'oui',
  'deviceGroup',
  'connectionRequestUrl',
  'lastSummon',
];

export const DEFAULT_DEVICE_VISIBLE_COLS: Record<DeviceColumnKey, boolean> = {
  serialNumber: true,
  manufacturer: true,
  model: true,
  productClass: true,
  ipAddress: true,
  rxPower: true,
  pppoeUsername: true,
  status: true,
  lastInform: true,
  technology: false,
  protocol: false,
  uptime: false,
  temperature: false,
  hwVersion: false,
  swVersion: false,
  oui: false,
  deviceGroup: false,
  connectionRequestUrl: false,
  lastSummon: false,
};

function loadPersistedDeviceColumns(): Record<DeviceColumnKey, boolean> {
  const base = { ...DEFAULT_DEVICE_VISIBLE_COLS };
  if (typeof window === 'undefined') return base;
  try {
    const raw = window.localStorage.getItem(DEVICE_COLUMNS_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Record<DeviceColumnKey, unknown>>;
    for (const key of Object.keys(base) as DeviceColumnKey[]) {
      if (typeof parsed[key] === 'boolean') {
        base[key] = parsed[key];
      }
    }
  } catch {
    return base;
  }
  return base;
}

function savePersistedDeviceColumns(cols: Record<DeviceColumnKey, boolean>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DEVICE_COLUMNS_STORAGE_KEY, JSON.stringify(cols));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

function loadPersistedDeviceColumnOrder(): DeviceColumnKey[] {
  const valid = new Set<DeviceColumnKey>(DEFAULT_DEVICE_COLUMN_ORDER);
  if (typeof window === 'undefined') return [...DEFAULT_DEVICE_COLUMN_ORDER];
  try {
    const raw = window.localStorage.getItem(DEVICE_COLUMN_ORDER_STORAGE_KEY);
    if (!raw) return [...DEFAULT_DEVICE_COLUMN_ORDER];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_DEVICE_COLUMN_ORDER];
    const seen = new Set<DeviceColumnKey>();
    const result: DeviceColumnKey[] = [];
    for (const item of parsed) {
      if (typeof item === 'string' && valid.has(item as DeviceColumnKey) && !seen.has(item as DeviceColumnKey)) {
        const k = item as DeviceColumnKey;
        seen.add(k);
        result.push(k);
      }
    }
    for (const k of DEFAULT_DEVICE_COLUMN_ORDER) {
      if (!seen.has(k)) result.push(k);
    }
    return result;
  } catch {
    return [...DEFAULT_DEVICE_COLUMN_ORDER];
  }
}

function savePersistedDeviceColumnOrder(order: DeviceColumnKey[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DEVICE_COLUMN_ORDER_STORAGE_KEY, JSON.stringify(order));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

interface AcsState {
  currentUser: {
    username: string;
    fullName: string;
    role: RoleName;
  };
  devices: Device[];
  devicePageItems: Device[];
  devicePageTotal: number;
  devicePageLoading: boolean;
  deviceDetailLoadingId: string | null;
  backendRefreshing: boolean;
  overviewLoading: boolean;
  tasksLoading: boolean;
  taskAliasMap: Record<string, string>;
  overviewStats: OverviewStats | null;
  tasks: TaskRecord[];
  summonQueueSummary: SummonQueueSummary;
  summonBatchTrackedIds: string[];
  faults: FaultRecord[];
  firmwareImages: FirmwareImage[];
  firmwareJobs: FirmwareDeploymentJob[];
  provisioningProfiles: ProvisioningProfile[];
  auditLogs: AuditLogEntry[];
  aliases: ManufacturerAlias[];
  settings: SystemSettings;
  realtimeEvents: RealtimeEvent[];
  dashboardFilter: DashboardFilter;
  deviceVisibleCols: Record<DeviceColumnKey, boolean>;
  deviceColumnOrder: DeviceColumnKey[];
  lastDataUpdate: string;
  apiMode: 'simulator' | 'backend';
  backendAuthRequired: boolean;
  isAuthenticated: boolean;
  authChecking: boolean;
  lastActivityAt: number;
  idleTimeoutNotice: string | null;
  users: PlatformUser[];
  roles: RoleDefinition[];
  rolePermissions: Record<RoleName, PermissionCode[]>;
  themeMode: 'light' | 'dark';
  setThemeMode: (mode: 'light' | 'dark') => void;
  toggleThemeMode: () => void;

  // Backend Session & Sync
  bootstrapBackend: () => Promise<void>;
  loginBackend: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logoutBackend: (reason?: string) => void;
  recordUserActivity: () => void;
  clearIdleNotice: () => void;
  loadDeviceDetailFromBackend: (deviceId: string) => Promise<void>;

  // Auth / RBAC & User Management
  setCurrentRole: (role: RoleName) => void;
  hasPermission: (perm: PermissionCode) => boolean;
  createUser: (input: {
    username: string;
    fullName?: string;
    password: string;
    role: RoleName;
    status?: 'active' | 'disabled';
  }) => Promise<{ ok: boolean; error?: string }>;
  updateUser: (
    userId: string,
    patch: { fullName?: string; role?: RoleName; status?: 'active' | 'disabled'; password?: string },
  ) => Promise<{ ok: boolean; error?: string }>;
  deleteUser: (userId: string) => Promise<{ ok: boolean; error?: string }>;
  updateRolePermissions: (
    roleName: RoleName,
    permissions: PermissionCode[],
  ) => Promise<{ ok: boolean; error?: string }>;

  // Navigation / Filters
  setDashboardFilter: (filter: DashboardFilter) => void;
  toggleDeviceColumn: (key: DeviceColumnKey) => void;
  reorderDeviceColumns: (sourceKey: DeviceColumnKey, targetKey: DeviceColumnKey) => void;
  resetDeviceColumns: () => void;
  refreshBackendData: (opts?: { silent?: boolean }) => Promise<void>;
  fetchDevicesPage: (query: DeviceListPageQuery) => Promise<void>;
  fetchOverviewStats: (filter?: DashboardFilter) => Promise<void>;
  fetchTasks: (opts?: { taskType?: string; status?: string; search?: string; limit?: number }) => Promise<void>;
  runPingDiagnostics: (deviceId: string, host: string, count?: number) => Promise<{ ok: boolean; error?: string }>;

  // Device Operations
  triggerSummon: (deviceId: string, groups: SummonGroup[]) => { taskId: string; status: string };
  triggerBatchSummon: (deviceIds: string[], groups: SummonGroup[]) => Promise<string[]>;
  triggerParamRefresh: (deviceId: string) => { taskId: string };
  triggerReboot: (deviceId: string) => { ok: boolean; error?: string; taskId?: string };
  triggerFactoryReset: (deviceId: string) => { ok: boolean; error?: string; taskId?: string };
  softDeleteDevice: (deviceId: string) => { ok: boolean; error?: string };
  revealSecret: (deviceId: string, scope: string) => boolean;
  updateDeviceCredentials: (deviceId: string, next: Partial<DeviceCredentials>) => { ok: boolean; error?: string };
  updateWanConnection: (
    deviceId: string,
    instanceIndex: number,
    patch: {
      connectionType: WANConnection['connectionType'];
      addressingMode?: WANConnection['addressingMode'];
      pppoeUsername: string;
      pppoePassword?: string;
      vlanEnabled?: boolean;
      vlanType?: 'untag' | 'transparent' | 'tag';
      vlanId: number | null;
      wanIp?: string;
      subnetMask?: string;
      gateway?: string;
      dns?: string;
      serviceList?: string;
      natEnabled?: boolean;
      portBindings?: WANConnection['portBindings'];
    },
  ) => { ok: boolean; error?: string; taskId?: string };
  addWanConnection: (
    deviceId: string,
    input: {
      connectionType: WANConnection['connectionType'];
      addressingMode?: WANConnection['addressingMode'];
      pppoeUsername: string;
      pppoePassword?: string;
      vlanEnabled?: boolean;
      vlanType?: 'untag' | 'transparent' | 'tag';
      vlanId: number | null;
      wanIp?: string;
      subnetMask?: string;
      gateway?: string;
      dns?: string;
      serviceList: string;
      natEnabled: boolean;
      portBindings?: WANConnection['portBindings'];
    },
  ) => { ok: boolean; error?: string; taskId?: string };
  updateWifiConfig: (
    deviceId: string,
    radioIndex: number,
    ssid: string,
    passphrase: string,
    channel?: string,
    opts?: { enabled?: boolean; securityMode?: string; band?: WiFiRadio['band'] },
  ) => { ok: boolean; error?: string; taskId?: string };
  addWifiRadio: (
    deviceId: string,
    input: {
      enabled: boolean;
      ssid: string;
      securityMode: string;
      band: WiFiRadio['band'];
      channel: string;
      passphrase: string;
    },
  ) => { ok: boolean; error?: string; taskId?: string };
  setDeviceParameter: (deviceId: string, path: string, value: string) => { ok: boolean; error?: string; taskId?: string };
  updateDhcpConfig: (deviceId: string, input: DhcpServerConfig) => { ok: boolean; error?: string; taskId?: string };
  simulateOntInform: (serial: string, manufacturer: string, model: string, productClass: string, technology: Device['technologyNormalized']) => string;

  // Fault Operations
  acknowledgeFault: (faultId: string) => void;
  resolveFault: (faultId: string, note: string) => void;
  retryFault: (faultId: string) => { ok: boolean; error?: string };
  deleteFault: (faultId: string) => void;

  // Firmware
  addFirmwareImage: (img: Omit<FirmwareImage, 'id' | 'uploadedAt'>) => void;
  deployFirmware: (firmwareId: string, deviceIds: string[]) => { ok: boolean; deployed: number; skipped: string[] };

  // Auto Provisioning
  upsertProvisioningProfile: (
    input: ProvisioningInput,
  ) => Promise<{ ok: boolean; error?: string; executionMode?: string; profile?: ProvisioningProfile }>;
  deleteProvisioningProfile: (serialNumber: string) => Promise<{ ok: boolean; error?: string }>;
  provisionDeviceNow: (
    deviceId: string,
    input: Omit<ProvisioningInput, 'serialNumber'>,
  ) => Promise<{ ok: boolean; error?: string; executionMode?: string }>;

  // Settings & Aliases
  updateSettings: (next: SystemSettings) => void;
  addManufacturerAlias: (alias: Omit<ManufacturerAlias, 'id'>) => void;
  updateManufacturerAlias: (id: string, alias: Omit<ManufacturerAlias, 'id'>) => void;
  removeManufacturerAlias: (id: string) => void;
  assignVirtualParamFromDevice: (
    deviceId: string,
    field: keyof VirtualParameterMapping,
    path: string,
  ) => { ok: boolean; error?: string; vendorName?: string; mappedPath?: string };
}

const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

const ROLE_USERNAMES: Record<RoleName, { username: string; fullName: string }> = {
  'Super Admin': { username: 'admin', fullName: 'admin' },
  'NOC Engineer': { username: 'noc', fullName: 'NOC Engineer' },
  Technician: { username: 'tech', fullName: 'Technician' },
  Viewer: { username: 'viewer', fullName: 'Viewer' },
};

let activeBackendWs: WebSocket | null = null;
let backendBootstrapped = false;
let refreshDebounceTimer: number | null = null;
let tokenRefreshInFlight = false;
let globalPollingTimer: number | null = null;

function startGlobalBackendPolling(refreshFn: () => Promise<void>, isActiveFn: () => boolean) {
  if (typeof window === 'undefined' || globalPollingTimer !== null) return;
  globalPollingTimer = window.setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (!isActiveFn()) return;
    void refreshFn();
  }, 60000);
}

let pendingWsEvents: RealtimeEvent[] = [];

function attachBackendWebSocket(
  set: (partial: Partial<AcsState> | ((state: AcsState) => Partial<AcsState>)) => void,
  get: () => AcsState,
) {
  if (activeBackendWs) return;
  activeBackendWs = createEventWebSocket((rawEv) => {
    const ev = rawEv as { type?: string; device_id?: string; timestamp?: string };
    if (!ev?.type) return;
    pendingWsEvents.unshift({
      id: uid('rt'),
      type: (ev.type || 'task.completed') as RealtimeEvent['type'],
      deviceId: ev.device_id,
      message: `${ev.type}${ev.device_id ? ` (${ev.device_id.slice(0, 8)})` : ''}`,
      timestamp: ev.timestamp || new Date().toISOString(),
    });
    if (pendingWsEvents.length > 30) {
      pendingWsEvents.length = 30;
    }
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (refreshDebounceTimer !== null) return;
    // Cooldown WS state flush + lightweight /tasks poll to max once per 2.5s (prevents UI re-render storms).
    refreshDebounceTimer = window.setTimeout(() => {
      refreshDebounceTimer = null;
      if (pendingWsEvents.length > 0) {
        const batch = pendingWsEvents;
        pendingWsEvents = [];
        set((s) => ({
          realtimeEvents: [...batch, ...s.realtimeEvents].slice(0, 30),
        }));
      }
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void get().fetchTasks({ limit: 60 });
      }
    }, 2500);
  });
}

function stopGlobalBackendPolling() {
  if (globalPollingTimer !== null) {
    window.clearInterval(globalPollingTimer);
    globalPollingTimer = null;
  }
}

function buildDefaultUsers(): PlatformUser[] {
  const created = new Date().toISOString();
  return [
    {
      id: 'usr-001',
      username: 'admin',
      fullName: 'admin',
      role: 'Super Admin',
      status: 'active',
      password: 'admin',
      lastLoginAt: null,
      createdAt: created,
    },
  ];
}

function buildDefaultRoles(perms: Record<RoleName, PermissionCode[]>): RoleDefinition[] {
  return [
    { id: 'role-super-admin', name: 'Super Admin', description: 'Full administrative control', isSystem: true, permissions: [...perms['Super Admin']] },
    { id: 'role-noc-engineer', name: 'NOC Engineer', description: 'Troubleshooting, summon, reboot, firmware & fault resolution', isSystem: true, permissions: [...perms['NOC Engineer']] },
    { id: 'role-technician', name: 'Technician', description: 'Field operations: summon, parameter/WiFi edit, reboot', isSystem: true, permissions: [...perms.Technician] },
    { id: 'role-viewer', name: 'Viewer', description: 'Read-only access to dashboards, devices & faults', isSystem: true, permissions: [...perms.Viewer] },
  ];
}

function extractApiErrorMessage(err: unknown, fallback = 'ONT sedang offline / tidak dapat dijangkau.'): string {
  const respErr = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
  if (typeof respErr === 'string' && respErr.trim()) return respErr.trim();
  const msg = (err as { message?: string })?.message;
  if (typeof msg === 'string' && msg.trim()) return msg.trim();
  return fallback;
}

const EMPTY_SUMMON_QUEUE: SummonQueueSummary = {
  activeCount: 0,
  queuedCount: 0,
  waitingCount: 0,
  executingCount: 0,
};

const ACTIVE_TASK_STATUSES = new Set<TaskStatus>(['pending', 'queued', 'waiting_for_device', 'executing']);

function isSummonTaskRecord(t: TaskRecord): boolean {
  return t.taskType === 'summon' || t.taskType === 'refresh_params';
}

function reconcileSummonTracker(
  prevTrackedIds: string[],
  tasks: TaskRecord[],
  backendQueue?: SummonQueueSummary,
): { summonBatchTrackedIds: string[]; summonQueueSummary: SummonQueueSummary } {
  const activeSummons = tasks.filter((t) => isSummonTaskRecord(t) && ACTIVE_TASK_STATUSES.has(t.status));
  const summary: SummonQueueSummary = backendQueue
    ? {
      activeCount: Math.max(backendQueue.activeCount, activeSummons.length),
      queuedCount: Math.max(
        backendQueue.queuedCount,
        activeSummons.filter((t) => t.status === 'pending' || t.status === 'queued').length,
      ),
      waitingCount: Math.max(
        backendQueue.waitingCount,
        activeSummons.filter((t) => t.status === 'waiting_for_device').length,
      ),
      executingCount: Math.max(
        backendQueue.executingCount,
        activeSummons.filter((t) => t.status === 'executing').length,
      ),
    }
    : {
      activeCount: activeSummons.length,
      queuedCount: activeSummons.filter((t) => t.status === 'pending' || t.status === 'queued').length,
      waitingCount: activeSummons.filter((t) => t.status === 'waiting_for_device').length,
      executingCount: activeSummons.filter((t) => t.status === 'executing').length,
    };

  if (summary.activeCount === 0) {
    return { summonBatchTrackedIds: [], summonQueueSummary: EMPTY_SUMMON_QUEUE };
  }

  const nextTracked = new Set(prevTrackedIds);
  for (const t of activeSummons) {
    nextTracked.add(t.id);
  }
  return {
    summonBatchTrackedIds: Array.from(nextTracked),
    summonQueueSummary: summary,
  };
}

function dispatchBackendSetParams(
  setFn: (updater: (s: AcsState) => Partial<AcsState>) => void,
  getFn: () => AcsState,
  deviceId: string,
  optimisticTaskId: string,
  payload: Record<string, unknown>,
  endpoint = `/devices/${deviceId}/parameters/set`,
): void {
  void apiClient
    .post<{ data?: { task_id?: string } }>(endpoint, payload)
    .then((res) => {
      const realTaskId = res.data?.data?.task_id;
      if (realTaskId) {
        setFn((s) => ({
          taskAliasMap: { ...s.taskAliasMap, [optimisticTaskId]: realTaskId },
          tasks: s.tasks.map((t) =>
            t.id === optimisticTaskId ? { ...t, id: realTaskId, correlationId: realTaskId } : t,
          ),
        }));
      }
      window.setTimeout(() => void getFn().loadDeviceDetailFromBackend(deviceId), 1200);
    })
    .catch((err) => markTaskBackendFailed(setFn, optimisticTaskId, err));
}

function markTaskBackendFailed(
  setFn: (updater: (s: AcsState) => Partial<AcsState>) => void,
  taskId: string,
  err: unknown,
): void {
  const nowIso = new Date().toISOString();
  const reason = extractApiErrorMessage(err);
  setFn((s) => {
    const nextTasks = s.tasks.map((t) =>
      t.id === taskId
        ? {
          ...t,
          status: 'failed' as const,
          completedAt: nowIso,
          summary: reason,
          logs: [...t.logs, `[${nowIso}] ERROR: ${reason}`],
        }
        : t,
    );
    return {
      tasks: nextTasks,
      ...reconcileSummonTracker(s.summonBatchTrackedIds, nextTasks),
    };
  });
}

export const useAcsStore = create<AcsState>((set, get) => ({
  currentUser: {
    username: 'admin',
    fullName: 'admin',
    role: 'Super Admin',
  },
  devices: INITIAL_DEVICES,
  devicePageItems: [],
  devicePageTotal: 0,
  devicePageLoading: false,
  deviceDetailLoadingId: null,
  backendRefreshing: false,
  overviewLoading: false,
  tasksLoading: false,
  taskAliasMap: {},
  overviewStats: null,
  tasks: INITIAL_TASKS,
  summonQueueSummary: EMPTY_SUMMON_QUEUE,
  summonBatchTrackedIds: [],
  faults: INITIAL_FAULTS,
  firmwareImages: INITIAL_FIRMWARE,
  firmwareJobs: INITIAL_FIRMWARE_JOBS,
  provisioningProfiles: [],
  auditLogs: INITIAL_AUDIT_LOGS,
  aliases: loadPersistedAliases(),
  settings: DEFAULT_SETTINGS,
  realtimeEvents: [],
  dashboardFilter: {},
  deviceVisibleCols: loadPersistedDeviceColumns(),
  deviceColumnOrder: loadPersistedDeviceColumnOrder(),
  lastDataUpdate: new Date().toISOString(),
  apiMode: 'simulator',
  backendAuthRequired: true,
  isAuthenticated: false,
  authChecking: true,
  lastActivityAt: loadLastActivityAt(),
  idleTimeoutNotice: null,
  users: buildDefaultUsers(),
  roles: buildDefaultRoles(ROLE_PERMISSIONS),
  rolePermissions: {
    'Super Admin': [...ROLE_PERMISSIONS['Super Admin']],
    'NOC Engineer': [...ROLE_PERMISSIONS['NOC Engineer']],
    Technician: [...ROLE_PERMISSIONS.Technician],
    Viewer: [...ROLE_PERMISSIONS.Viewer],
  },
  themeMode: loadPersistedThemeMode(),

  setThemeMode: (mode) => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.add('theme-switching');
      if (themeSwitchTimer !== null) window.clearTimeout(themeSwitchTimer);
      themeSwitchTimer = window.setTimeout(() => {
        themeSwitchTimer = null;
        document.documentElement.classList.remove('theme-switching');
      }, 420);
    }
    try {
      window.localStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
    } catch {
      // ignore storage failures
    }
    set({ themeMode: mode });
  },

  toggleThemeMode: () => {
    const next = get().themeMode === 'dark' ? 'light' : 'dark';
    get().setThemeMode(next);
  },

  bootstrapBackend: async () => {
    if (backendBootstrapped) return;
    backendBootstrapped = true;

    const storedLastActivity = loadLastActivityAt();
    const isIdleExpired = storedLastActivity > 0 && Date.now() - storedLastActivity >= IDLE_TIMEOUT_MS;

    const healthy = await checkBackendHealth();
    if (!healthy) {
      let simUserRaw: string | null = null;
      try {
        simUserRaw = window.localStorage.getItem(SIM_AUTH_STORAGE_KEY);
      } catch {
        // ignore
      }
      if (isIdleExpired && simUserRaw) {
        clearSessionStorage();
        set({
          apiMode: 'simulator',
          backendAuthRequired: false,
          isAuthenticated: false,
          authChecking: false,
          idleTimeoutNotice: 'Session expired after 1 hour of inactivity. Please sign in again.',
        });
        return;
      }
      if (simUserRaw) {
        const matched = get().users.find((u) => u.username.toLowerCase() === simUserRaw!.toLowerCase() && u.status === 'active');
        if (matched) {
          const nowTs = Date.now();
          saveLastActivityAt(nowTs);
          set({
            apiMode: 'simulator',
            backendAuthRequired: false,
            isAuthenticated: true,
            authChecking: false,
            lastActivityAt: nowTs,
            currentUser: { username: matched.username, fullName: matched.fullName || matched.username, role: matched.role },
          });
          return;
        }
      }
      set({ apiMode: 'simulator', backendAuthRequired: false, isAuthenticated: false, authChecking: false });
      return;
    }

    const token = getStoredAccessToken();
    if (!token || isIdleExpired) {
      if (token && isIdleExpired) {
        setStoredAccessToken(null);
        clearSessionStorage();
      }
      set({
        apiMode: 'backend',
        backendAuthRequired: true,
        isAuthenticated: false,
        authChecking: false,
        idleTimeoutNotice: isIdleExpired && token ? 'Session expired after 1 hour of inactivity. Please sign in again.' : null,
      });
      return;
    }

    try {
      const meRes = await apiClient.get('/auth/me');
      const userData = meRes.data?.data;
      const uname = userData?.username || userData?.email;
      if (uname) {
        const nowTs = Date.now();
        saveLastActivityAt(nowTs);
        set((s) => ({
          apiMode: 'backend',
          backendAuthRequired: false,
          isAuthenticated: true,
          authChecking: false,
          lastActivityAt: nowTs,
          idleTimeoutNotice: null,
          currentUser: {
            username: uname,
            fullName: userData.fullName || uname,
            role: (userData.role as RoleName) || s.currentUser.role,
          },
        }));
      } else {
        set({ apiMode: 'backend', backendAuthRequired: false, isAuthenticated: true, authChecking: false });
      }
      await get().refreshBackendData();
      attachBackendWebSocket(set, get);
      startGlobalBackendPolling(
        () => get().refreshBackendData({ silent: true }),
        () => get().apiMode === 'backend' && get().isAuthenticated && !get().backendAuthRequired,
      );
    } catch {
      setStoredAccessToken(null);
      clearSessionStorage();
      set({ apiMode: 'backend', backendAuthRequired: true, isAuthenticated: false, authChecking: false });
    }
  },

  loginBackend: async (username, password) => {
    const cleanUser = username.trim().toLowerCase();
    if (!cleanUser || !password) {
      return { ok: false, error: 'Username and password are required.' };
    }
    if (get().apiMode !== 'backend') {
      const matched = get().users.find(
        (u) => u.username.toLowerCase() === cleanUser && (u.password ?? 'admin') === password,
      );
      if (!matched) {
        return { ok: false, error: 'Invalid username or password' };
      }
      if (matched.status !== 'active') {
        return { ok: false, error: 'Account is disabled' };
      }
      const nowTs = Date.now();
      const nowIso = new Date(nowTs).toISOString();
      saveLastActivityAt(nowTs);
      try {
        window.localStorage.setItem(SIM_AUTH_STORAGE_KEY, matched.username);
      } catch {
        // ignore
      }
      set((s) => ({
        isAuthenticated: true,
        backendAuthRequired: false,
        authChecking: false,
        lastActivityAt: nowTs,
        idleTimeoutNotice: null,
        currentUser: {
          username: matched.username,
          fullName: matched.fullName || matched.username,
          role: matched.role,
        },
        users: s.users.map((u) => (u.id === matched.id ? { ...u, lastLoginAt: nowIso } : u)),
      }));
      return { ok: true };
    }
    try {
      const res = await apiClient.post('/auth/login', { username: cleanUser, password });
      const data = res.data?.data;
      if (!data?.access_token) {
        return { ok: false, error: 'Invalid server response' };
      }
      setStoredAccessToken(data.access_token);
      const nowTs = Date.now();
      saveLastActivityAt(nowTs);
      try {
        window.localStorage.setItem(TOKEN_ISSUED_AT_STORAGE_KEY, String(nowTs));
      } catch {
        // ignore
      }
      const loggedUsername = data.user?.username || cleanUser;
      set({
        apiMode: 'backend',
        backendAuthRequired: false,
        isAuthenticated: true,
        authChecking: false,
        lastActivityAt: nowTs,
        idleTimeoutNotice: null,
        currentUser: {
          username: loggedUsername,
          fullName: data.user?.fullName || loggedUsername,
          role: (data.user?.role as RoleName) || 'Super Admin',
        },
      });
      await get().refreshBackendData();
      attachBackendWebSocket(set, get);
      startGlobalBackendPolling(
        () => get().refreshBackendData({ silent: true }),
        () => get().apiMode === 'backend' && get().isAuthenticated && !get().backendAuthRequired,
      );
      return { ok: true };
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Login failed';
      return { ok: false, error: msg };
    }
  },

  logoutBackend: (reason) => {
    setStoredAccessToken(null);
    clearSessionStorage();
    stopGlobalBackendPolling();
    if (activeBackendWs) {
      activeBackendWs.close();
      activeBackendWs = null;
    }
    if (get().apiMode === 'backend') {
      void apiClient.post('/auth/logout').catch(() => undefined);
    }
    set((s) => ({
      isAuthenticated: false,
      backendAuthRequired: s.apiMode === 'backend',
      idleTimeoutNotice: reason ?? null,
      provisioningProfiles: [],
      devicePageItems: [],
      devicePageTotal: 0,
      devicePageLoading: false,
      overviewStats: null,
      summonQueueSummary: EMPTY_SUMMON_QUEUE,
      summonBatchTrackedIds: [],
    }));
  },

  recordUserActivity: () => {
    if (!get().isAuthenticated) return;
    const nowTs = Date.now();
    saveLastActivityAt(nowTs);
    set({ lastActivityAt: nowTs });

    if (get().apiMode === 'backend' && !tokenRefreshInFlight) {
      let issuedAt = 0;
      try {
        issuedAt = Number(window.localStorage.getItem(TOKEN_ISSUED_AT_STORAGE_KEY) ?? '0') || 0;
      } catch {
        issuedAt = 0;
      }
      // Sliding JWT refresh every 20 minutes while user is actively interacting
      if (nowTs - issuedAt > 20 * 60 * 1000) {
        tokenRefreshInFlight = true;
        void apiClient
          .post<{ access_token?: string }>('/auth/refresh')
          .then((res) => {
            if (res.data?.access_token) {
              setStoredAccessToken(res.data.access_token);
              try {
                window.localStorage.setItem(TOKEN_ISSUED_AT_STORAGE_KEY, String(Date.now()));
              } catch {
                // ignore
              }
            }
          })
          .catch(() => undefined)
          .finally(() => {
            tokenRefreshInFlight = false;
          });
      }
    }
  },

  clearIdleNotice: () => set({ idleTimeoutNotice: null }),

  loadDeviceDetailFromBackend: async (deviceId) => {
    if (get().apiMode !== 'backend' || get().backendAuthRequired) return;
    set({ deviceDetailLoadingId: deviceId });
    try {
      const res = await apiClient.get(`/devices/${deviceId}`);
      const detail = res.data?.data;
      if (!detail?.device) return;
      const params: DeviceParameter[] = Array.isArray(detail.parameters) ? detail.parameters : [];
      const mappedEvents = Array.isArray(detail.events) ? detail.events.map(mapApiEventToFrontend) : undefined;
      const mappedSessions = Array.isArray(detail.sessions) ? detail.sessions.map(mapApiSessionToFrontend) : undefined;
      const mappedHistory = Array.isArray(detail.telemetryHistory)
        ? (detail.telemetryHistory as TelemetrySample[])
        : undefined;
      set((s) => {
        const existingDev = s.devices.find((d) => d.id === deviceId);
        const baseMapped = mapApiDeviceToFrontend(detail.device, existingDev, params);
        const merged = applyAliasToDevice(
          {
            ...baseMapped,
            events: mappedEvents ?? baseMapped.events,
            sessions: mappedSessions ?? baseMapped.sessions,
            telemetryHistory: mappedHistory ?? baseMapped.telemetryHistory,
          },
          s.aliases,
        );
        const mappedTasks = Array.isArray(detail.tasks) ? detail.tasks.map(mapApiTaskToFrontend) : [];
        const serverTaskIds = new Set(mappedTasks.map((t: TaskRecord) => t.id));
        const now = Date.now();
        const retainedOptimistic = s.tasks.filter(
          (t) =>
            t.deviceId === deviceId &&
            t.id.startsWith('tsk_') &&
            !serverTaskIds.has(s.taskAliasMap[t.id] ?? '') &&
            now - new Date(t.createdAt).getTime() < 20000,
        );
        const otherTasks = s.tasks.filter((t) => t.deviceId !== deviceId);
        return {
          devices: s.devices.some((d) => d.id === deviceId)
            ? s.devices.map((d) => (d.id === deviceId ? merged : d))
            : [merged, ...s.devices],
          tasks: [...retainedOptimistic, ...mappedTasks, ...otherTasks],
        };
      });
    } catch {
      // Ignore transient detail fetch failures
    } finally {
      set((s) => (s.deviceDetailLoadingId === deviceId ? { deviceDetailLoadingId: null } : {}));
    }
  },

  setCurrentRole: (role) => {
    const profile = ROLE_USERNAMES[role];
    set((s) => ({
      currentUser: { ...profile, role },
      auditLogs: [
        {
          id: uid('aud'),
          actorUsername: profile.username,
          actorEmail: profile.username,
          actorRole: role,
          action: 'session.role_switched',
          targetType: 'session',
          targetId: role,
          metadata: { mode: 'simulator_rbac_check' },
          createdAt: new Date().toISOString(),
        },
        ...s.auditLogs,
      ],
    }));
  },

  hasPermission: (perm) => {
    const { role } = get().currentUser;
    const perms = get().rolePermissions[role] ?? ROLE_PERMISSIONS[role] ?? [];
    return perms.includes(perm);
  },

  createUser: async (input) => {
    if (!get().hasPermission('security.users.manage')) {
      return { ok: false, error: 'Permission denied: security.users.manage required' };
    }
    const cleanUsername = input.username.trim().toLowerCase();
    const cleanFullName = (input.fullName ?? '').trim() || cleanUsername;
    if (cleanUsername.length < 2 || input.password.length < 4) {
      return { ok: false, error: 'Username (min 2 chars) and password (min 4 chars) are required.' };
    }
    const nowIso = new Date().toISOString();
    if (get().apiMode === 'backend') {
      try {
        const res = await apiClient.post<{ data?: PlatformUser }>('/users', {
          username: cleanUsername,
          fullName: cleanFullName,
          password: input.password,
          role: input.role,
          status: input.status ?? 'active',
        });
        const created = res.data?.data;
        if (created) {
          set((s) => ({ users: [...s.users, created] }));
        } else {
          await get().refreshBackendData();
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, error: extractApiErrorMessage(err, 'Failed to add user') };
      }
    }
    if (get().users.some((u) => u.username.toLowerCase() === cleanUsername)) {
      return { ok: false, error: `Username ${cleanUsername} is already registered.` };
    }
    const created: PlatformUser = {
      id: uid('usr'),
      username: cleanUsername,
      fullName: cleanFullName,
      role: input.role,
      status: input.status ?? 'active',
      password: input.password,
      lastLoginAt: null,
      createdAt: nowIso,
    };
    set((s) => ({
      users: [...s.users, created],
      auditLogs: [
        {
          id: uid('aud'),
          actorUsername: s.currentUser.username,
          actorEmail: s.currentUser.username,
          actorRole: s.currentUser.role,
          action: 'user.created',
          targetType: 'user',
          targetId: created.username,
          metadata: { role: created.role },
          createdAt: nowIso,
        },
        ...s.auditLogs,
      ],
    }));
    return { ok: true };
  },

  updateUser: async (userId, patch) => {
    if (!get().hasPermission('security.users.manage')) {
      return { ok: false, error: 'Permission denied: security.users.manage required' };
    }
    if (patch.password && patch.password.length < 4) {
      return { ok: false, error: 'New password must be at least 4 characters.' };
    }
    const nowIso = new Date().toISOString();
    if (get().apiMode === 'backend') {
      try {
        const res = await apiClient.put<{ data?: PlatformUser }>(`/users/${userId}`, patch);
        const updated = res.data?.data;
        if (updated) {
          set((s) => ({ users: s.users.map((u) => (u.id === userId ? updated : u)) }));
        } else {
          await get().refreshBackendData();
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, error: extractApiErrorMessage(err, 'Failed to update user') };
      }
    }
    set((s) => ({
      users: s.users.map((u) =>
        u.id === userId
          ? {
            ...u,
            fullName: patch.fullName?.trim() || u.fullName,
            role: patch.role ?? u.role,
            status: patch.status ?? u.status,
            password: patch.password ? patch.password : u.password,
          }
          : u,
      ),
      auditLogs: [
        {
          id: uid('aud'),
          actorUsername: s.currentUser.username,
          actorEmail: s.currentUser.username,
          actorRole: s.currentUser.role,
          action: 'user.updated',
          targetType: 'user',
          targetId: userId,
          metadata: { role: patch.role ?? '', status: patch.status ?? '' },
          createdAt: nowIso,
        },
        ...s.auditLogs,
      ],
    }));
    return { ok: true };
  },

  deleteUser: async (userId) => {
    if (!get().hasPermission('security.users.manage')) {
      return { ok: false, error: 'Permission denied: security.users.manage required' };
    }
    const target = get().users.find((u) => u.id === userId);
    if (target && target.username.toLowerCase() === get().currentUser.username.toLowerCase()) {
      return { ok: false, error: 'Cannot delete the currently logged-in account.' };
    }
    if (get().apiMode === 'backend') {
      try {
        await apiClient.delete(`/users/${userId}`);
        set((s) => ({ users: s.users.filter((u) => u.id !== userId) }));
        return { ok: true };
      } catch (err) {
        return { ok: false, error: extractApiErrorMessage(err, 'Failed to delete user') };
      }
    }
    const nowIso = new Date().toISOString();
    set((s) => ({
      users: s.users.filter((u) => u.id !== userId),
      auditLogs: [
        {
          id: uid('aud'),
          actorUsername: s.currentUser.username,
          actorEmail: s.currentUser.username,
          actorRole: s.currentUser.role,
          action: 'user.deleted',
          targetType: 'user',
          targetId: target?.username ?? userId,
          metadata: {},
          createdAt: nowIso,
        },
        ...s.auditLogs,
      ],
    }));
    return { ok: true };
  },

  updateRolePermissions: async (roleName, permissions) => {
    if (!get().hasPermission('security.users.manage')) {
      return { ok: false, error: 'Permission denied: security.users.manage required' };
    }
    const cleanPerms = Array.from(new Set(permissions));
    if (roleName === 'Super Admin' && !cleanPerms.includes('security.users.manage')) {
      cleanPerms.push('security.users.manage');
    }
    const roleObj = get().roles.find((r) => r.name === roleName);
    if (get().apiMode === 'backend' && roleObj?.id) {
      try {
        await apiClient.put(`/roles/${roleObj.id}/permissions`, { permissions: cleanPerms });
      } catch (err) {
        return { ok: false, error: extractApiErrorMessage(err, 'Gagal menyimpan izin role') };
      }
    }
    const nowIso = new Date().toISOString();
    set((s) => ({
      rolePermissions: { ...s.rolePermissions, [roleName]: cleanPerms },
      roles: s.roles.map((r) => (r.name === roleName ? { ...r, permissions: cleanPerms } : r)),
      auditLogs: [
        {
          id: uid('aud'),
          actorUsername: s.currentUser.username,
          actorEmail: s.currentUser.username,
          actorRole: s.currentUser.role,
          action: 'role.permissions_updated',
          targetType: 'role',
          targetId: roleName,
          metadata: { count: cleanPerms.length },
          createdAt: nowIso,
        },
        ...s.auditLogs,
      ],
    }));
    return { ok: true };
  },

  setDashboardFilter: (filter) => set({ dashboardFilter: filter }),

  toggleDeviceColumn: (key) =>
    set((s) => {
      const next = { ...s.deviceVisibleCols, [key]: !s.deviceVisibleCols[key] };
      savePersistedDeviceColumns(next);
      return { deviceVisibleCols: next };
    }),

  reorderDeviceColumns: (sourceKey, targetKey) =>
    set((s) => {
      if (sourceKey === targetKey) return s;
      const next = [...s.deviceColumnOrder];
      const fromIdx = next.indexOf(sourceKey);
      const toIdx = next.indexOf(targetKey);
      if (fromIdx === -1 || toIdx === -1) return s;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, sourceKey);
      savePersistedDeviceColumnOrder(next);
      return { deviceColumnOrder: next };
    }),

  resetDeviceColumns: () => {
    const nextCols = { ...DEFAULT_DEVICE_VISIBLE_COLS };
    const nextOrder = [...DEFAULT_DEVICE_COLUMN_ORDER];
    savePersistedDeviceColumns(nextCols);
    savePersistedDeviceColumnOrder(nextOrder);
    set({ deviceVisibleCols: nextCols, deviceColumnOrder: nextOrder });
  },

  refreshBackendData: async (opts) => {
    const nowIso = new Date().toISOString();
    if (get().apiMode !== 'backend' || get().backendAuthRequired) {
      set({ lastDataUpdate: nowIso });
      return;
    }
    if (!opts?.silent) {
      set({ backendRefreshing: true });
    }
    try {
      const [
        devRes,
        aliasRes,
        taskRes,
        faultRes,
        fwRes,
        audRes,
        genSet,
        statSet,
        clsSet,
        protoSet,
        autoSummonSet,
        usersRes,
        rolesRes,
        provRes,
        overviewRes,
      ] = await Promise.allSettled([
        apiClient.get('/devices?limit=100'),
        apiClient.get('/aliases'),
        apiClient.get('/tasks?limit=60'),
        apiClient.get('/faults?limit=150'),
        apiClient.get('/firmware'),
        apiClient.get('/audit-logs'),
        apiClient.get('/settings/general'),
        apiClient.get('/settings/device_status'),
        apiClient.get('/settings/classification'),
        apiClient.get('/settings/protocol'),
        apiClient.get('/settings/auto_summon'),
        apiClient.get('/users'),
        apiClient.get('/roles'),
        apiClient.get('/provisioning'),
        apiClient.get('/dashboard/overview'),
      ]);

      set((s) => {
        const nextAliases =
          aliasRes.status === 'fulfilled' && Array.isArray(aliasRes.value.data?.items)
            ? aliasRes.value.data.items.map(mapApiAliasToFrontend)
            : s.aliases;
        const existingMap = new Map(s.devices.map((d) => [d.id, d]));
        let nextDevices = s.devices;
        if (devRes.status === 'fulfilled' && Array.isArray(devRes.value.data?.data?.items)) {
          const fromList = (devRes.value.data.data.items as ApiDeviceRecord[]).map((raw) =>
            applyAliasToDevice(mapApiDeviceToFrontend(raw, existingMap.get(raw.id)), nextAliases),
          );
          const listIds = new Set(fromList.map((d) => d.id));
          // Preserve detail-loaded devices not in the first 100 so open Device Detail views never vanish on refresh.
          const preservedDetails = s.devices.filter((d) => !listIds.has(d.id) && d.parameters.length > 0);
          nextDevices = [...fromList, ...preservedDetails];
        }
        const nextTasks =
          taskRes.status === 'fulfilled' && Array.isArray(taskRes.value.data?.items)
            ? taskRes.value.data.items.map(mapApiTaskToFrontend)
            : s.tasks;
        const backendQueue =
          taskRes.status === 'fulfilled' && taskRes.value.data?.queue
            ? (taskRes.value.data.queue as SummonQueueSummary)
            : undefined;
        const nextQueueTracker = reconcileSummonTracker(s.summonBatchTrackedIds, nextTasks, backendQueue);
        const nextFaults =
          faultRes.status === 'fulfilled' && Array.isArray(faultRes.value.data?.items)
            ? faultRes.value.data.items.map(mapApiFaultToFrontend)
            : s.faults;
        const nextFw =
          fwRes.status === 'fulfilled' && Array.isArray(fwRes.value.data?.items)
            ? fwRes.value.data.items.map(mapApiFirmwareToFrontend)
            : s.firmwareImages;
        const nextFwJobs =
          fwRes.status === 'fulfilled' && Array.isArray(fwRes.value.data?.jobs)
            ? fwRes.value.data.jobs.map(mapApiFirmwareJobToFrontend)
            : s.firmwareJobs;
        const nextAudit =
          audRes.status === 'fulfilled' && Array.isArray(audRes.value.data?.items)
            ? audRes.value.data.items.map(mapApiAuditLogToFrontend)
            : s.auditLogs;
        const nextSettings = mergeBackendSettings({
          general: genSet.status === 'fulfilled' ? genSet.value.data?.data : undefined,
          device_status: statSet.status === 'fulfilled' ? statSet.value.data?.data : undefined,
          classification: clsSet.status === 'fulfilled' ? clsSet.value.data?.data : undefined,
          protocol: protoSet.status === 'fulfilled' ? protoSet.value.data?.data : undefined,
          auto_summon: autoSummonSet.status === 'fulfilled' ? autoSummonSet.value.data?.data : undefined,
        });
        setActiveTimezone(nextSettings.general.timezone);
        savePersistedAliases(nextAliases);
        const nextUsers =
          usersRes.status === 'fulfilled' && Array.isArray(usersRes.value.data?.items)
            ? (usersRes.value.data.items as PlatformUser[])
            : s.users;
        const nextRoles =
          rolesRes.status === 'fulfilled' && Array.isArray(rolesRes.value.data?.items)
            ? (rolesRes.value.data.items as RoleDefinition[])
            : s.roles;
        const nextProvisioning =
          provRes.status === 'fulfilled' && Array.isArray(provRes.value.data?.items)
            ? (provRes.value.data.items as ProvisioningProfile[])
            : s.provisioningProfiles;
        const nextRolePerms = { ...s.rolePermissions };
        for (const r of nextRoles) {
          if (r.name && Array.isArray(r.permissions)) {
            nextRolePerms[r.name] = r.permissions;
          }
        }
        return {
          aliases: nextAliases,
          devices: nextDevices,
          overviewStats:
            overviewRes.status === 'fulfilled' && overviewRes.value.data?.data
              ? (overviewRes.value.data.data as OverviewStats)
              : s.overviewStats,
          tasks: nextTasks,
          ...nextQueueTracker,
          faults: nextFaults,
          firmwareImages: nextFw,
          firmwareJobs: nextFwJobs,
          provisioningProfiles: nextProvisioning,
          auditLogs: nextAudit,
          settings: nextSettings,
          users: nextUsers,
          roles: nextRoles,
          rolePermissions: nextRolePerms,
          lastDataUpdate: nowIso,
          backendRefreshing: false,
        };
      });
    } catch {
      set({ backendRefreshing: false, lastDataUpdate: nowIso });
    }
  },

  fetchDevicesPage: async (query: DeviceListPageQuery) => {
    if (get().apiMode !== 'backend') return;
    set({ devicePageLoading: true });
    try {
      const params: Record<string, string | number> = {
        page: Math.max(1, query.page),
        limit: Math.max(1, query.limit),
      };
      const q = query.search?.trim();
      if (q) params.search = q;
      if (query.sortBy) params.sortBy = query.sortBy;
      if (query.sortDir) params.sortDir = query.sortDir;
      const f = query.filter;
      if (f?.manufacturer) params.manufacturer = f.manufacturer;
      if (f?.model) params.model = f.model;
      if (f?.productClass) params.productClass = f.productClass;
      if (f?.technology) params.technology = f.technology;
      if (f?.protocol) params.protocol = f.protocol;
      if (f?.deviceGroup) params.deviceGroup = f.deviceGroup;
      if (f?.statusBucket) params.statusBucket = f.statusBucket;
      if (f?.uptimeBucket) params.uptimeBucket = f.uptimeBucket;
      if (f?.tempBucket) params.tempBucket = f.tempBucket;
      if (f?.rxBucket) params.rxBucket = f.rxBucket;

      const res = await apiClient.get('/devices', { params });
      const data = res.data?.data;
      const rawItems = Array.isArray(data?.items) ? (data.items as ApiDeviceRecord[]) : [];
      const total = typeof data?.total === 'number' ? data.total : rawItems.length;

      set((s) => {
        const existingMap = new Map(s.devices.map((d) => [d.id, d]));
        const mapped = rawItems.map((raw) =>
          applyAliasToDevice(mapApiDeviceToFrontend(raw, existingMap.get(raw.id)), s.aliases),
        );
        return {
          devicePageItems: mapped,
          devicePageTotal: total,
          devicePageLoading: false,
        };
      });
    } catch {
      set({ devicePageLoading: false });
    }
  },

  fetchTasks: async (opts) => {
    if (get().apiMode !== 'backend' || get().backendAuthRequired) return;
    set({ tasksLoading: true });
    try {
      const params: Record<string, string | number> = {
        limit: opts?.limit ?? 60,
      };
      if (opts?.taskType) params.taskType = opts.taskType;
      if (opts?.status) params.status = opts.status;
      if (opts?.search?.trim()) params.search = opts.search.trim();

      const res = await apiClient.get('/tasks', { params });
      const rawItems = Array.isArray(res.data?.items) ? res.data.items : null;
      const backendQueue = res.data?.queue as SummonQueueSummary | undefined;
      if (!rawItems) {
        set({ tasksLoading: false });
        return;
      }

      const mapped = rawItems.map(mapApiTaskToFrontend);
      set((s) => {
        // Keep optimistic tsk_ items created in the last 3s if not yet swapped with server UUID
        const serverIds = new Set(mapped.map((t: TaskRecord) => t.id));
        const now = Date.now();
        const pendingOptimistic = s.tasks.filter(
          (t) => t.id.startsWith('tsk_') && !serverIds.has(t.id) && now - new Date(t.createdAt).getTime() < 4000,
        );
        const merged = [...pendingOptimistic, ...mapped];
        return {
          tasks: merged,
          tasksLoading: false,
          ...reconcileSummonTracker(s.summonBatchTrackedIds, merged, backendQueue),
        };
      });
    } catch {
      set({ tasksLoading: false });
    }
  },

  fetchOverviewStats: async (filter) => {
    if (get().apiMode !== 'backend' || get().backendAuthRequired) return;
    set({ overviewLoading: true });
    try {
      const params: Record<string, string> = {};
      if (filter?.manufacturer) params.manufacturer = filter.manufacturer;
      if (filter?.model) params.model = filter.model;
      if (filter?.productClass) params.productClass = filter.productClass;
      if (filter?.technology) params.technology = filter.technology;
      if (filter?.protocol) params.protocol = filter.protocol;
      if (filter?.deviceGroup) params.deviceGroup = filter.deviceGroup;
      const res = await apiClient.get('/dashboard/overview', { params });
      if (res.data?.data) {
        set({ overviewStats: res.data.data as OverviewStats, overviewLoading: false });
      } else {
        set({ overviewLoading: false });
      }
    } catch {
      set({ overviewLoading: false });
    }
  },

  runPingDiagnostics: async (deviceId, host, count = 4) => {
    const cleanHost = host.trim() || '8.8.8.8';
    if (get().apiMode === 'backend') {
      try {
        await apiClient.post(`/devices/${deviceId}/diagnostics/ping`, { host: cleanHost, count });
        void get().fetchTasks({ limit: 60 });
        window.setTimeout(() => {
          void get().loadDeviceDetailFromBackend(deviceId);
          void get().fetchTasks({ limit: 60 });
        }, 7000);
        window.setTimeout(() => {
          void get().loadDeviceDetailFromBackend(deviceId);
          void get().fetchTasks({ limit: 60 });
        }, 14000);
        return { ok: true };
      } catch (err: unknown) {
        return { ok: false, error: extractApiErrorMessage(err) };
      }
    }
    return { ok: true };
  },

  triggerBatchSummon: async (deviceIds, groups) => {
    const uniqueIds = Array.from(new Set(deviceIds.filter(Boolean)));
    if (uniqueIds.length === 0) return [];
    const state = get();
    if (state.apiMode === 'backend') {
      try {
        const res = await apiClient.post<{ data?: { task_ids?: string[] } }>('/devices/summon-batch', {
          device_ids: uniqueIds,
          groups,
        });
        const taskIds = Array.isArray(res.data?.data?.task_ids) ? res.data.data.task_ids : [];
        if (taskIds.length > 0) {
          set((s) => ({
            summonBatchTrackedIds: Array.from(new Set([...taskIds, ...s.summonBatchTrackedIds])).slice(0, 200),
          }));
        }
        await get().fetchTasks({ limit: 150 });
        return taskIds;
      } catch {
        return [];
      }
    }
    return uniqueIds.map((id) => get().triggerSummon(id, groups).taskId);
  },

  triggerSummon: (deviceId, groups) => {
    const state = get();
    const dev = state.devices.find((d) => d.id === deviceId) ?? state.devicePageItems.find((d) => d.id === deviceId);
    const taskId = uid('tsk');
    const summonJobId = uid('sum');
    const corrId = uid('corr');
    const createdAt = new Date().toISOString();

    if (!dev) return { taskId, status: 'failed' };

    const newTask: TaskRecord = {
      id: taskId,
      deviceId: dev.id,
      deviceSerial: dev.serialNumber,
      summonJobId,
      requestedBy: state.currentUser.username,
      protocol: dev.protocol,
      taskType: 'summon',
      status: 'queued',
      correlationId: corrId,
      requestedGroups: groups,
      summary: `Summon queued (${groups.join(', ')})`,
      durationMs: null,
      logs: [`[${createdAt}] Summon job ${summonJobId} queued by ${state.currentUser.username}`],
      createdAt,
      startedAt: null,
      completedAt: null,
    };

    set((s) => {
      const nextTasks = [newTask, ...s.tasks];
      return {
        tasks: nextTasks,
        ...reconcileSummonTracker(s.summonBatchTrackedIds, nextTasks),
        auditLogs: [
          {
            id: uid('aud'),
            actorUsername: s.currentUser.username,
            actorEmail: s.currentUser.username,
            actorRole: s.currentUser.role,
            action: 'device.summon',
            targetType: 'device',
            targetId: dev.serialNumber,
            metadata: { task_id: taskId, groups: groups.join(',') },
            createdAt,
          },
          ...s.auditLogs,
        ],
        realtimeEvents: [
          {
            id: uid('rt'),
            type: 'summon.started',
            deviceId: dev.id,
            message: `Summon queued for ${dev.serialNumber} (${groups.length} groups)`,
            timestamp: createdAt,
          },
          ...s.realtimeEvents.slice(0, 29),
        ],
      };
    });

    // In live backend mode, dispatch real API task & poll only lightweight endpoints (avoid 15-call full refresh storm)
    if (state.apiMode === 'backend') {
      void apiClient
        .post<{ data?: { task_id?: string } }>(`/devices/${deviceId}/summon`, { groups })
        .then((res) => {
          const realTaskId = res.data?.data?.task_id;
          if (realTaskId) {
            set((s) => ({
              taskAliasMap: { ...s.taskAliasMap, [taskId]: realTaskId },
              tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, id: realTaskId, correlationId: realTaskId } : t)),
              summonBatchTrackedIds: s.summonBatchTrackedIds.map((id) => (id === taskId ? realTaskId : id)),
            }));
          }
          void get().fetchTasks({ limit: 60 });
          window.setTimeout(() => {
            void get().loadDeviceDetailFromBackend(deviceId);
            void get().fetchTasks({ limit: 60 });
          }, 2500);
        })
        .catch((err) => markTaskBackendFailed(set, taskId, err));
      return { taskId, status: 'queued' };
    }

    // Step 1: transition to executing
    setTimeout(() => {
      const startIso = new Date().toISOString();
      set((s) => ({
        tasks: s.tasks.map((t) =>
          t.id === taskId
            ? {
              ...t,
              status: 'executing',
              startedAt: startIso,
              summary: `Dispatching ${dev.protocol} request to ${dev.trSourceIp ?? 'CPE session'}...`,
              logs: [...t.logs, `[${startIso}] Sending Connection Request / ${dev.protocol} session fetch`],
            }
            : t,
        ),
        realtimeEvents: [
          {
            id: uid('rt'),
            type: 'summon.progress',
            deviceId: dev.id,
            message: `Summon executing on ${dev.serialNumber}`,
            timestamp: startIso,
          },
          ...s.realtimeEvents.slice(0, 29),
        ],
      }));
    }, 600);

    // Step 2: complete or fail depending on device reachability
    setTimeout(() => {
      const endIso = new Date().toISOString();
      const target = get().devices.find((d) => d.id === deviceId);
      const willFail = !target || !target.lastInformAt || target.simulatedUnreachable;

      if (willFail) {
        const faultId = `FLT-${Math.floor(1000 + Math.random() * 9000)}`;
        const reason = !target?.lastInformAt
          ? 'Device has never connected (no ConnectionRequestURL registered)'
          : 'Connection Request timed out after 10s (device unreachable)';
        const newFault: FaultRecord = {
          id: faultId,
          deviceId,
          deviceSerial: dev.serialNumber,
          manufacturerModel: `${dev.manufacturerCanonical} / ${dev.modelName}`,
          ipAddress: dev.trSourceIp,
          taskId,
          summonJobId,
          operation: 'Summon',
          protocol: dev.protocol,
          category: !target?.lastInformAt ? 'device_not_reachable' : 'connection_request_failed',
          correlationId: corrId,
          failedParameters: [`${dev.dataModelRoot}DeviceInfo.`, `${dev.dataModelRoot}WANDevice.`],
          errorCode: !target?.lastInformAt ? 'NO_SESSION' : 'CR_TIMEOUT',
          errorMessage: reason,
          sanitizedLogs: `Summon ${summonJobId} failed during ${dev.protocol} dispatch (${reason})`,
          status: 'open',
          retryCount: 0,
          lastAttemptAt: endIso,
          createdAt: endIso,
          resolvedAt: null,
        };

        set((s) => {
          const nextTasks = s.tasks.map((t) =>
            t.id === taskId
              ? {
                ...t,
                status: 'failed' as const,
                completedAt: endIso,
                durationMs: 1400,
                summary: reason,
                logs: [...t.logs, `[${endIso}] ERROR: ${reason}`, `[${endIso}] Fault ${faultId} created`],
              }
              : t,
          );
          return {
            tasks: nextTasks,
            ...reconcileSummonTracker(s.summonBatchTrackedIds, nextTasks),
            faults: [newFault, ...s.faults],
            realtimeEvents: [
              {
                id: uid('rt'),
                type: 'summon.failed',
                deviceId,
                message: `Summon failed on ${dev.serialNumber}: ${faultId}`,
                timestamp: endIso,
              },
              ...s.realtimeEvents.slice(0, 29),
            ],
          };
        });
        return;
      }

      // Success: populate WAN/WiFi/Hosts/Parameters if they were previously not_fetched!
      set((s) => {
        const nextTasks = s.tasks.map((t) =>
          t.id === taskId
            ? {
              ...t,
              status: 'completed' as const,
              completedAt: endIso,
              durationMs: 1180,
              summary: `Summon succeeded across ${groups.length} group(s)`,
              logs: [...t.logs, `[${endIso}] CPE responded with parameter tree`, `[${endIso}] Database updated`],
            }
            : t,
        );
        return {
          devices: s.devices.map((d) => {
            if (d.id !== deviceId) return d;
            const nextWan =
              groups.includes('wan') && !d.wanConnections
                ? [
                  {
                    instanceIndex: 1,
                    name: '1_INTERNET_R_VID_100',
                    connectionType: 'PPPoE' as const,
                    enabled: true,
                    status: 'Connected' as const,
                    uptimeSeconds: d.uptimeSeconds ?? 3600,
                    wanIp: d.wanIp ?? '103.241.19.120',
                    gateway: '103.241.19.1',
                    dns: '1.1.1.1, 8.8.8.8',
                    pppoeUsername: d.pppoeUsername ?? 'cust-auto@nexanet.id',
                    pppoePassword: `Ppp@${d.serialNumber.slice(-4)}`,
                    vlanId: 100,
                    serviceList: 'INTERNET',
                    natEnabled: true,
                    portBindings: { l1: true, l2: true, l3: false, l4: false, s1: true, s2: false, s3: false, s4: false },
                  },
                ]
                : d.wanConnections;

            const nextWifi =
              groups.includes('wifi') && !d.wifiRadios
                ? [
                  {
                    index: 1,
                    ssid: `Nexa-${d.serialNumber.slice(-4)}`,
                    enabled: true,
                    band: '2.4 GHz' as const,
                    securityMode: 'WPA2-PSK',
                    channel: '6',
                    channelWidth: '20MHz',
                    maxRate: '300 Mbps',
                    broadcastSsid: true,
                    associatedCount: 2,
                    passphrase: `Key${d.serialNumber.slice(-4)}!2026`,
                  },
                ]
                : d.wifiRadios;

            const nextHosts =
              groups.includes('connected_hosts') && !d.connectedHosts
                ? [
                  {
                    hostname: 'Android-Customer',
                    macAddress: '52:33:1A:00:91:BC',
                    ipAddress: '192.168.1.24',
                    interfaceName: `Nexa-${d.serialNumber.slice(-4)}`,
                    connectionType: 'WiFi' as const,
                    active: true,
                    lastSeenAt: endIso,
                  },
                ]
                : d.connectedHosts;

            let syncedParams: DeviceParameter[] = d.parameters.map((p) =>
              p.readState === 'not_fetched' && p.canonicalKey === 'wan.external_ip' && nextWan?.[0]?.wanIp
                ? { ...p, value: nextWan[0].wanIp, readState: 'available' as const, lastAttemptAt: endIso, lastSuccessAt: endIso }
                : { ...p, lastAttemptAt: endIso },
            );
            const matched = findAliasForDevice(d, s.aliases);
            if (groups.includes('wan') && nextWan) {
              for (const w of nextWan) {
                syncedParams = syncWanConnectionParams(syncedParams, w, matched, d.protocol, endIso);
              }
            }
            if (groups.includes('wifi') && nextWifi) {
              for (const r of nextWifi) {
                syncedParams = syncWifiRadioParams(syncedParams, r, matched, d.protocol, endIso);
              }
            }
            if (groups.includes('connected_hosts') && nextHosts && matched) {
              nextHosts.forEach((h, idx) => {
                syncedParams = upsertVirtualParamInList(
                  syncedParams,
                  matched.virtualParameters.hostName,
                  'hosts.hostname',
                  h.hostname,
                  d.protocol,
                  idx + 1,
                  endIso,
                  { isWritable: false },
                );
                syncedParams = upsertVirtualParamInList(
                  syncedParams,
                  matched.virtualParameters.hostMac,
                  'hosts.mac_address',
                  h.macAddress,
                  d.protocol,
                  idx + 1,
                  endIso,
                  { isWritable: false },
                );
                syncedParams = upsertVirtualParamInList(
                  syncedParams,
                  matched.virtualParameters.hostIp,
                  'hosts.ip_address',
                  h.ipAddress,
                  d.protocol,
                  idx + 1,
                  endIso,
                  { isWritable: false },
                );
              });
            }

            return applyAliasToDevice(
              {
                ...d,
                lastInformAt: endIso,
                lastSummonAt: endIso,
                lastParamSyncAt: endIso,
                wanIp: nextWan?.[0]?.wanIp ?? d.wanIp,
                wanConnections: nextWan,
                wifiRadios: nextWifi,
                connectedHosts: nextHosts,
                uptimeFetchedAt: groups.includes('device_health') ? endIso : d.uptimeFetchedAt,
                rxPowerFetchedAt: groups.includes('device_health') && d.rxPowerDbm !== null ? endIso : d.rxPowerFetchedAt,
                temperatureFetchedAt: groups.includes('device_health') && d.temperatureCelsius !== null ? endIso : d.temperatureFetchedAt,
                parameters: syncedParams,
              },
              s.aliases,
            );
          }),
          tasks: nextTasks,
          ...reconcileSummonTracker(s.summonBatchTrackedIds, nextTasks),
          lastDataUpdate: endIso,
          realtimeEvents: [
            {
              id: uid('rt'),
              type: 'summon.completed',
              deviceId,
              message: `Summon completed for ${dev.serialNumber}`,
              timestamp: endIso,
            },
            ...s.realtimeEvents.slice(0, 29),
          ],
        };
      });
    }, 1500);

    return { taskId, status: 'queued' };
  },

  triggerParamRefresh: (deviceId) => {
    return get().triggerSummon(deviceId, ['device_info', 'device_health']);
  },

  triggerReboot: (deviceId) => {
    if (!get().hasPermission('devices.reboot')) {
      return { ok: false, error: 'Permission denied: devices.reboot required' };
    }
    const dev = get().devices.find((d) => d.id === deviceId);
    if (!dev) return { ok: false, error: 'Device not found' };

    const taskId = uid('tsk');
    const corrId = uid('corr');
    const nowIso = new Date().toISOString();
    const task: TaskRecord = {
      id: taskId,
      deviceId,
      deviceSerial: dev.serialNumber,
      requestedBy: get().currentUser.username,
      protocol: dev.protocol,
      taskType: 'reboot',
      status: 'queued',
      correlationId: corrId,
      summary: 'Reboot RPC queued',
      durationMs: null,
      logs: [`[${nowIso}] Reboot requested by ${get().currentUser.username}`],
      createdAt: nowIso,
      startedAt: null,
      completedAt: null,
    };

    set((s) => ({
      tasks: [task, ...s.tasks],
      auditLogs: [
        {
          id: uid('aud'),
          actorUsername: s.currentUser.username,
          actorEmail: s.currentUser.username,
          actorRole: s.currentUser.role,
          action: 'device.reboot',
          targetType: 'device',
          targetId: dev.serialNumber,
          metadata: { task_id: taskId },
          createdAt: nowIso,
        },
        ...s.auditLogs,
      ],
      realtimeEvents: [
        {
          id: uid('rt'),
          type: 'task.started',
          deviceId,
          message: `Reboot queued for ${dev.serialNumber}`,
          timestamp: nowIso,
        },
        ...s.realtimeEvents.slice(0, 29),
      ],
    }));

    if (get().apiMode === 'backend') {
      void apiClient
        .post(`/devices/${deviceId}/reboot`)
        .then(() => {
          window.setTimeout(() => void get().loadDeviceDetailFromBackend(deviceId), 1500);
        })
        .catch((err) => markTaskBackendFailed(set, taskId, err));
      return { ok: true, taskId };
    }

    setTimeout(() => {
      const doneIso = new Date().toISOString();
      const unreachable = !dev.lastInformAt || dev.simulatedUnreachable;
      set((s) => ({
        tasks: s.tasks.map((t) =>
          t.id === taskId
            ? {
              ...t,
              status: unreachable ? 'timeout' : 'completed',
              startedAt: nowIso,
              completedAt: doneIso,
              durationMs: 1250,
              summary: unreachable ? 'CPE unreachable during Connection Request' : 'Reboot RPC acknowledged by CPE',
              logs: [
                ...t.logs,
                `[${doneIso}] ${unreachable ? 'Timeout waiting for CPE session' : 'RebootResponse received; device restarting'}`,
              ],
            }
            : t,
        ),
        devices: unreachable
          ? s.devices
          : s.devices.map((d) => {
            if (d.id !== deviceId) return d;
            const matched = findAliasForDevice(d, s.aliases);
            const nextParams = upsertVirtualParamInList(
              d.parameters,
              matched?.virtualParameters.uptime ?? `${d.dataModelRoot}DeviceInfo.UpTime`,
              'device.uptime_seconds',
              '15',
              d.protocol,
              1,
              doneIso,
              { isWritable: false },
            );
            return { ...d, uptimeSeconds: 15, uptimeFetchedAt: doneIso, parameters: nextParams };
          }),
      }));
    }, 1200);

    return { ok: true, taskId };
  },

  triggerFactoryReset: (deviceId) => {
    if (!get().hasPermission('devices.factory_reset')) {
      return { ok: false, error: 'Permission denied: devices.factory_reset required' };
    }
    const dev = get().devices.find((d) => d.id === deviceId);
    if (!dev) return { ok: false, error: 'Device not found' };

    const taskId = uid('tsk');
    const nowIso = new Date().toISOString();
    const task: TaskRecord = {
      id: taskId,
      deviceId,
      deviceSerial: dev.serialNumber,
      requestedBy: get().currentUser.username,
      protocol: dev.protocol,
      taskType: 'factory_reset',
      status: 'queued',
      correlationId: uid('corr'),
      summary: 'FactoryReset RPC queued (auto-retry disabled by safety policy)',
      durationMs: null,
      logs: [`[${nowIso}] FactoryReset authorized by ${get().currentUser.username}`],
      createdAt: nowIso,
      startedAt: null,
      completedAt: null,
    };

    set((s) => ({
      tasks: [task, ...s.tasks],
      auditLogs: [
        {
          id: uid('aud'),
          actorUsername: s.currentUser.username,
          actorEmail: s.currentUser.username,
          actorRole: s.currentUser.role,
          action: 'device.factory_reset',
          targetType: 'device',
          targetId: dev.serialNumber,
          metadata: { task_id: taskId },
          createdAt: nowIso,
        },
        ...s.auditLogs,
      ],
    }));

    if (get().apiMode === 'backend') {
      void apiClient
        .post(`/devices/${deviceId}/factory-reset`)
        .then(() => {
          window.setTimeout(() => void get().loadDeviceDetailFromBackend(deviceId), 1500);
        })
        .catch((err) => markTaskBackendFailed(set, taskId, err));
      return { ok: true, taskId };
    }

    setTimeout(() => {
      const doneIso = new Date().toISOString();
      set((s) => ({
        tasks: s.tasks.map((t) =>
          t.id === taskId
            ? {
              ...t,
              status: 'completed',
              startedAt: nowIso,
              completedAt: doneIso,
              durationMs: 1400,
              summary: 'FactoryResetResponse acknowledged by CPE',
            }
            : t,
        ),
      }));
    }, 1400);

    return { ok: true, taskId };
  },

  softDeleteDevice: (deviceId) => {
    if (!get().hasPermission('devices.delete')) {
      return { ok: false, error: 'Permission denied: devices.delete required' };
    }
    const nowIso = new Date().toISOString();
    const dev = get().devices.find((d) => d.id === deviceId);
    set((s) => ({
      devices: s.devices.map((d) => (d.id === deviceId ? { ...d, deletedAt: nowIso, adminDisabled: true } : d)),
      auditLogs: [
        {
          id: uid('aud'),
          actorUsername: s.currentUser.username,
          actorEmail: s.currentUser.username,
          actorRole: s.currentUser.role,
          action: 'device.soft_delete',
          targetType: 'device',
          targetId: dev?.serialNumber ?? deviceId,
          metadata: { archived_at: nowIso },
          createdAt: nowIso,
        },
        ...s.auditLogs,
      ],
    }));
    if (get().apiMode === 'backend') {
      void apiClient.delete(`/devices/${deviceId}`).catch(() => undefined);
    }
    return { ok: true };
  },

  revealSecret: (deviceId, scope) => {
    if (!get().hasPermission('devices.secrets.view')) {
      return false;
    }
    const dev = get().devices.find((d) => d.id === deviceId);
    const nowIso = new Date().toISOString();
    set((s) => ({
      auditLogs: [
        {
          id: uid('aud'),
          actorUsername: s.currentUser.username,
          actorEmail: s.currentUser.username,
          actorRole: s.currentUser.role,
          action: 'secret.revealed',
          targetType: 'device',
          targetId: dev?.serialNumber ?? deviceId,
          metadata: { credential_scope: scope }, // Never log the secret itself!
          createdAt: nowIso,
        },
        ...s.auditLogs,
      ],
    }));
    if (get().apiMode === 'backend') {
      void apiClient
        .post<{ data?: Record<string, { username?: string; password?: string }> }>(`/devices/${deviceId}/credentials/reveal`)
        .then((res) => {
          const creds = res.data?.data;
          if (!creds) return;
          set((s) => ({
            devices: s.devices.map((d) => {
              if (d.id !== deviceId) return d;
              return {
                ...d,
                credentials: {
                  ...d.credentials,
                  adminUsername: creds.ont_admin?.username || creds.admin_password?.username || creds.admin?.username || d.credentials.adminUsername,
                  adminPassword: creds.ont_admin?.password || creds.admin_password?.password || creds.admin?.password || d.credentials.adminPassword,
                  userUsername: creds.ont_user?.username || creds.user_password?.username || creds.user?.username || d.credentials.userUsername,
                  userPassword: creds.ont_user?.password || creds.user_password?.password || creds.user?.password || d.credentials.userPassword,
                  connectionRequestUsername: creds.connection_request?.username || d.credentials.connectionRequestUsername,
                  connectionRequestPassword: creds.connection_request?.password || d.credentials.connectionRequestPassword,
                },
              };
            }),
          }));
        })
        .catch(() => undefined);
    }
    return true;
  },

  updateDeviceCredentials: (deviceId, next) => {
    if (!get().hasPermission('devices.credentials.edit')) {
      return { ok: false, error: 'Permission denied: devices.credentials.edit required' };
    }
    const nowIso = new Date().toISOString();
    const dev = get().devices.find((d) => d.id === deviceId);
    set((s) => ({
      devices: s.devices.map((d) => {
        if (d.id !== deviceId) return d;
        const matched = findAliasForDevice(d, s.aliases);
        let nextParams = d.parameters;
        if (next.adminPassword !== undefined) {
          nextParams = upsertVirtualParamInList(
            nextParams,
            matched?.virtualParameters.adminPassword,
            'credentials.admin_password',
            next.adminPassword,
            d.protocol,
            1,
            nowIso,
            { isWritable: true, isSecret: true },
          );
        }
        if (next.userPassword !== undefined) {
          nextParams = upsertVirtualParamInList(
            nextParams,
            matched?.virtualParameters.userPassword,
            'credentials.user_password',
            next.userPassword,
            d.protocol,
            1,
            nowIso,
            { isWritable: true, isSecret: true },
          );
        }
        return {
          ...d,
          credentials: { ...d.credentials, ...next, rotatedAt: nowIso },
          parameters: nextParams,
        };
      }),
      auditLogs: [
        {
          id: uid('aud'),
          actorUsername: s.currentUser.username,
          actorEmail: s.currentUser.username,
          actorRole: s.currentUser.role,
          action: 'device.credentials.rotated',
          targetType: 'device',
          targetId: dev?.serialNumber ?? deviceId,
          metadata: { scopes_updated: Object.keys(next).join(',') },
          createdAt: nowIso,
        },
        ...s.auditLogs,
      ],
    }));
    if (get().apiMode === 'backend') {
      const updates: Array<{ scope: string; username: string; password: string }> = [];
      if (next.adminUsername !== undefined || next.adminPassword !== undefined) {
        updates.push({
          scope: 'ont_admin',
          username: next.adminUsername ?? dev?.credentials.adminUsername ?? 'admin',
          password: next.adminPassword ?? dev?.credentials.adminPassword ?? '',
        });
      }
      if (next.userUsername !== undefined || next.userPassword !== undefined) {
        updates.push({
          scope: 'ont_user',
          username: next.userUsername ?? dev?.credentials.userUsername ?? 'user',
          password: next.userPassword ?? dev?.credentials.userPassword ?? '',
        });
      }
      if (next.connectionRequestUsername !== undefined || next.connectionRequestPassword !== undefined) {
        updates.push({
          scope: 'connection_request',
          username: next.connectionRequestUsername ?? dev?.credentials.connectionRequestUsername ?? 'acs',
          password: next.connectionRequestPassword ?? dev?.credentials.connectionRequestPassword ?? '',
        });
      }
      void Promise.all(
        updates.map((u) => apiClient.put(`/devices/${deviceId}/credentials`, u)),
      ).catch(() => undefined);
    }
    return { ok: true };
  },

  updateWanConnection: (deviceId, instanceIndex, patch) => {
    if (!get().hasPermission('devices.parameters.write')) {
      return { ok: false, error: 'Permission denied: devices.parameters.write required' };
    }
    const dev = get().devices.find((d) => d.id === deviceId);
    if (!dev) return { ok: false, error: 'Device not found' };

    const taskId = uid('tsk');
    const nowIso = new Date().toISOString();
    const task: TaskRecord = {
      id: taskId,
      deviceId,
      deviceSerial: dev.serialNumber,
      requestedBy: get().currentUser.username,
      protocol: dev.protocol,
      taskType: 'set_parameter_values',
      status: 'queued',
      correlationId: uid('corr'),
      summary: `Updated WAN ${instanceIndex} (${patch.connectionType})`,
      durationMs: null,
      logs: [`[${nowIso}] Queued SetParameterValues for WAN ${instanceIndex}`],
      createdAt: nowIso,
      startedAt: null,
      completedAt: null,
    };

    set((s) => ({
      tasks: [task, ...s.tasks],
      auditLogs: [
        {
          id: uid('aud'),
          actorUsername: s.currentUser.username,
          actorEmail: s.currentUser.username,
          actorRole: s.currentUser.role,
          action: 'device.wan.updated',
          targetType: 'device',
          targetId: dev.serialNumber,
          metadata: { wan_index: instanceIndex, type: patch.connectionType },
          createdAt: nowIso,
        },
        ...s.auditLogs,
      ],
    }));

    if (get().apiMode === 'backend') {
      const parameters = buildWanSetParams(dev, get().aliases, instanceIndex, {
        connectionType: patch.connectionType,
        addressingMode: patch.addressingMode,
        pppoeUsername: patch.pppoeUsername,
        pppoePassword: patch.pppoePassword,
        vlanEnabled: patch.vlanEnabled,
        vlanType: patch.vlanType,
        vlanId: patch.vlanId ?? undefined,
        wanIp: patch.wanIp,
        subnetMask: patch.subnetMask,
        gateway: patch.gateway,
        dns: patch.dns,
        serviceList: patch.serviceList,
        natEnabled: patch.natEnabled,
      });
      if (parameters.length > 0) {
        dispatchBackendSetParams(set, get, deviceId, taskId, { parameters });
      } else {
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, status: 'completed', completedAt: new Date().toISOString() } : t)),
        }));
      }
      return { ok: true, taskId };
    }

    setTimeout(() => {
      const doneIso = new Date().toISOString();
      const target = get().devices.find((d) => d.id === deviceId);
      const unreachable = !target || !target.lastInformAt || target.simulatedUnreachable;

      if (unreachable) {
        const faultId = `FLT-${Math.floor(1000 + Math.random() * 9000)}`;
        const reason = 'CPE unreachable: WAN SetParameterValues timed out';
        const newFault: FaultRecord = {
          id: faultId,
          deviceId,
          deviceSerial: dev.serialNumber,
          manufacturerModel: `${dev.manufacturerCanonical} / ${dev.modelName}`,
          ipAddress: dev.trSourceIp,
          taskId,
          operation: 'Set Parameter',
          protocol: dev.protocol,
          category: 'parameter_write_failed',
          correlationId: task.correlationId,
          failedParameters: [`${dev.dataModelRoot}WANDevice.1.WANConnectionDevice.${instanceIndex}`],
          errorCode: 'CR_TIMEOUT',
          errorMessage: reason,
          sanitizedLogs: `SetParameterValues failed for WAN ${instanceIndex} (${reason})`,
          status: 'open',
          retryCount: 0,
          lastAttemptAt: doneIso,
          createdAt: doneIso,
          resolvedAt: null,
        };
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? { ...t, status: 'failed', startedAt: nowIso, completedAt: doneIso, durationMs: 900, summary: reason }
              : t,
          ),
          faults: [newFault, ...s.faults],
        }));
        return;
      }

      set((s) => ({
        devices: s.devices.map((d) => {
          if (d.id !== deviceId) return d;
          const matched = findAliasForDevice(d, s.aliases);
          const nextWans = (d.wanConnections ?? []).map((w) =>
            w.instanceIndex === instanceIndex
              ? {
                ...w,
                connectionType: patch.connectionType,
                addressingMode: patch.connectionType === 'IPoE' ? (patch.addressingMode ?? w.addressingMode ?? 'DHCP') : undefined,
                pppoeUsername: patch.connectionType === 'PPPoE' ? patch.pppoeUsername || undefined : undefined,
                pppoePassword: patch.connectionType === 'PPPoE' ? (patch.pppoePassword !== undefined ? patch.pppoePassword || undefined : w.pppoePassword) : undefined,
                wanIp: patch.connectionType === 'IPoE' && patch.addressingMode === 'Static' ? (patch.wanIp || w.wanIp) : w.wanIp,
                subnetMask: patch.connectionType === 'IPoE' && patch.addressingMode === 'Static' ? (patch.subnetMask || '255.255.255.0') : undefined,
                gateway: patch.connectionType === 'IPoE' && patch.addressingMode === 'Static' ? (patch.gateway || w.gateway) : w.gateway,
                dns: patch.connectionType === 'IPoE' && patch.addressingMode === 'Static' ? (patch.dns || w.dns) : w.dns,
                vlanEnabled: (patch.vlanType ? patch.vlanType === 'tag' : patch.vlanEnabled) ?? (patch.vlanId !== null && patch.vlanId > 0),
                vlanType: patch.vlanType ?? (patch.vlanEnabled === false ? 'untag' : 'tag'),
                vlanId: (patch.vlanType ? patch.vlanType !== 'tag' : patch.vlanEnabled === false) ? 0 : (patch.vlanId ?? undefined),
                serviceList: patch.serviceList ?? w.serviceList,
                natEnabled: patch.natEnabled ?? w.natEnabled,
                portBindings: patch.portBindings ?? w.portBindings,
              }
              : w,
          );
          const updatedTarget = nextWans.find((w) => w.instanceIndex === instanceIndex);
          const nextParams = updatedTarget
            ? syncWanConnectionParams(d.parameters, updatedTarget, matched, d.protocol, doneIso)
            : d.parameters;
          return {
            ...d,
            wanIp: instanceIndex === 1 && updatedTarget ? updatedTarget.wanIp : d.wanIp,
            pppoeUsername: instanceIndex === 1 ? (patch.connectionType === 'PPPoE' ? patch.pppoeUsername || null : null) : d.pppoeUsername,
            parameters: nextParams,
            wanConnections: nextWans,
          };
        }),
        tasks: s.tasks.map((t) =>
          t.id === taskId
            ? {
              ...t,
              status: 'completed',
              startedAt: nowIso,
              completedAt: doneIso,
              durationMs: 880,
              logs: [...t.logs, `[${doneIso}] SetParameterValuesResponse Status=0`],
            }
            : t,
        ),
      }));
      get().triggerSummon(deviceId, ['wan']);
    }, 900);

    return { ok: true, taskId };
  },

  addWanConnection: (deviceId, input) => {
    if (!get().hasPermission('devices.parameters.write')) {
      return { ok: false, error: 'Permission denied: devices.parameters.write required' };
    }
    const vlanType: 'untag' | 'transparent' | 'tag' = input.vlanType ?? (input.vlanEnabled === false ? 'untag' : 'tag');
    const vlanEnabled = vlanType === 'tag';
    if (vlanEnabled && input.vlanId !== null && (input.vlanId < 1 || input.vlanId > 4094)) {
      return { ok: false, error: 'VLAN ID must be between 1 and 4094' };
    }
    const dev = get().devices.find((d) => d.id === deviceId);
    if (!dev) return { ok: false, error: 'Device not found' };

    const nextIndex = Math.max(0, ...(dev.wanConnections ?? []).map((w) => w.instanceIndex)) + 1;
    const taskId = uid('tsk');
    const nowIso = new Date().toISOString();
    const task: TaskRecord = {
      id: taskId,
      deviceId,
      deviceSerial: dev.serialNumber,
      requestedBy: get().currentUser.username,
      protocol: dev.protocol,
      taskType: 'set_parameter_values',
      status: 'queued',
      correlationId: uid('corr'),
      summary: `Added WAN ${nextIndex} (${input.connectionType})`,
      durationMs: null,
      logs: [`[${nowIso}] Queued AddObject + SetParameterValues for WAN ${nextIndex}`],
      createdAt: nowIso,
      startedAt: null,
      completedAt: null,
    };

    set((s) => ({
      tasks: [task, ...s.tasks],
      auditLogs: [
        {
          id: uid('aud'),
          actorUsername: s.currentUser.username,
          actorEmail: s.currentUser.username,
          actorRole: s.currentUser.role,
          action: 'device.wan.added',
          targetType: 'device',
          targetId: dev.serialNumber,
          metadata: { wan_index: nextIndex, type: input.connectionType },
          createdAt: nowIso,
        },
        ...s.auditLogs,
      ],
    }));

    if (get().apiMode === 'backend') {
      dispatchBackendSetParams(
        set,
        get,
        deviceId,
        taskId,
        {
          connectionType: input.connectionType,
          addressingMode: input.addressingMode,
          pppoeUsername: input.pppoeUsername,
          pppoePassword: input.pppoePassword,
          vlanEnabled,
          vlanType,
          vlanId: vlanEnabled ? (input.vlanId ?? undefined) : 0,
          wanIp: input.wanIp,
          subnetMask: input.subnetMask,
          gateway: input.gateway,
          dns: input.dns,
          serviceList: input.serviceList,
          natEnabled: input.natEnabled,
        },
        `/devices/${deviceId}/wan`,
      );
      return { ok: true, taskId };
    }

    setTimeout(() => {
      const doneIso = new Date().toISOString();
      const target = get().devices.find((d) => d.id === deviceId);
      const unreachable = !target || !target.lastInformAt || target.simulatedUnreachable;

      if (unreachable) {
        const faultId = `FLT-${Math.floor(1000 + Math.random() * 9000)}`;
        const reason = `CPE unreachable: Add WAN ${nextIndex} timed out`;
        const newFault: FaultRecord = {
          id: faultId,
          deviceId,
          deviceSerial: dev.serialNumber,
          manufacturerModel: `${dev.manufacturerCanonical} / ${dev.modelName}`,
          ipAddress: dev.trSourceIp,
          taskId,
          operation: 'Add WAN Object',
          protocol: dev.protocol,
          category: 'parameter_write_failed',
          correlationId: task.correlationId,
          failedParameters: [`${dev.dataModelRoot}WANDevice.1.WANConnectionDevice.${nextIndex}`],
          errorCode: 'CR_TIMEOUT',
          errorMessage: reason,
          sanitizedLogs: `AddObject failed for WAN ${nextIndex} (${reason})`,
          status: 'open',
          retryCount: 0,
          lastAttemptAt: doneIso,
          createdAt: doneIso,
          resolvedAt: null,
        };
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? { ...t, status: 'failed', startedAt: nowIso, completedAt: doneIso, durationMs: 900, summary: reason }
              : t,
          ),
          faults: [newFault, ...s.faults],
        }));
        return;
      }

      const octet = Math.min(254, 18 + nextIndex);
      const svcTag = input.serviceList.split(',')[0].trim() || 'INTERNET';
      const newWan: WANConnection = {
        instanceIndex: nextIndex,
        name: `${nextIndex}_${svcTag}_${input.connectionType === 'Bridge' ? 'B' : 'R'}_VID_${input.vlanId ?? 0}`,
        connectionType: input.connectionType,
        addressingMode: input.connectionType === 'IPoE' ? (input.addressingMode ?? 'DHCP') : undefined,
        enabled: true,
        status: 'Connected',
        uptimeSeconds: 0,
        wanIp:
          input.connectionType === 'Bridge'
            ? '-'
            : input.connectionType === 'IPoE' && input.addressingMode === 'Static'
              ? (input.wanIp || `103.241.${octet}.10`)
              : `103.241.${octet}.${Math.floor(20 + Math.random() * 200)}`,
        subnetMask:
          input.connectionType === 'IPoE' && input.addressingMode === 'Static'
            ? (input.subnetMask || '255.255.255.0')
            : undefined,
        gateway:
          input.connectionType === 'Bridge'
            ? '-'
            : input.connectionType === 'IPoE' && input.addressingMode === 'Static'
              ? (input.gateway || `103.241.${octet}.1`)
              : `103.241.${octet}.1`,
        dns:
          input.connectionType === 'IPoE' && input.addressingMode === 'Static'
            ? (input.dns || '1.1.1.1, 8.8.8.8')
            : '1.1.1.1, 8.8.8.8',
        pppoeUsername: input.connectionType === 'PPPoE' ? input.pppoeUsername || undefined : undefined,
        pppoePassword: input.connectionType === 'PPPoE' ? input.pppoePassword || undefined : undefined,
        vlanId: input.vlanId ?? undefined,
        serviceList: input.serviceList,
        natEnabled: input.natEnabled,
        portBindings: input.portBindings,
      };

      set((s) => ({
        devices: s.devices.map((d) => {
          if (d.id !== deviceId) return d;
          const matched = findAliasForDevice(d, s.aliases);
          const nextParams = syncWanConnectionParams(d.parameters, newWan, matched, d.protocol, doneIso);
          return {
            ...d,
            wanConnections: [...(d.wanConnections ?? []), newWan],
            parameters: nextParams,
          };
        }),
        tasks: s.tasks.map((t) =>
          t.id === taskId
            ? {
              ...t,
              status: 'completed',
              startedAt: nowIso,
              completedAt: doneIso,
              durationMs: 890,
              logs: [...t.logs, `[${doneIso}] AddObjectInstance=${nextIndex} Status=0`],
            }
            : t,
        ),
      }));
      get().triggerSummon(deviceId, ['wan']);
    }, 900);

    return { ok: true, taskId };
  },

  updateDhcpConfig: (deviceId, input) => {
    if (!get().hasPermission('devices.parameters.write')) {
      return { ok: false, error: 'Permission denied: devices.parameters.write required' };
    }
    const dev = get().devices.find((d) => d.id === deviceId);
    if (!dev) return { ok: false, error: 'Device not found' };

    const taskId = uid('tsk');
    const nowIso = new Date().toISOString();
    const task: TaskRecord = {
      id: taskId,
      deviceId,
      deviceSerial: dev.serialNumber,
      requestedBy: get().currentUser.username,
      protocol: dev.protocol,
      taskType: 'set_parameter_values',
      status: 'queued',
      correlationId: uid('corr'),
      summary: `Set LAN DHCP (${input.lanIp} / ${input.dhcpServerEnable ? 'Enabled' : 'Disabled'})`,
      durationMs: null,
      logs: [`[${nowIso}] Queued SetParameterValues for LANHostConfigManagement`],
      createdAt: nowIso,
      startedAt: null,
      completedAt: null,
    };

    set((s) => ({
      tasks: [task, ...s.tasks],
      auditLogs: [
        {
          id: uid('aud'),
          actorUsername: s.currentUser.username,
          actorEmail: s.currentUser.username,
          actorRole: s.currentUser.role,
          action: 'device.dhcp.updated',
          targetType: 'device',
          targetId: dev.serialNumber,
          metadata: { lan_ip: input.lanIp, dhcp_enabled: input.dhcpServerEnable },
          createdAt: nowIso,
        },
        ...s.auditLogs,
      ],
    }));

    if (get().apiMode === 'backend') {
      const parameters = buildDhcpSetParams(dev, get().aliases, input);
      dispatchBackendSetParams(set, get, deviceId, taskId, { parameters });
      return { ok: true, taskId };
    }

    setTimeout(() => {
      const doneIso = new Date().toISOString();
      const target = get().devices.find((d) => d.id === deviceId);
      const unreachable = !target || !target.lastInformAt || target.simulatedUnreachable;
      if (unreachable) {
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? { ...t, status: 'failed', startedAt: nowIso, completedAt: doneIso, durationMs: 900, summary: 'CPE unreachable: DHCP SetParameterValues timed out' }
              : t,
          ),
        }));
        return;
      }
      set((s) => ({
        devices: s.devices.map((d) => (d.id === deviceId ? { ...d, dhcpServer: { ...input } } : d)),
        tasks: s.tasks.map((t) =>
          t.id === taskId
            ? { ...t, status: 'completed', startedAt: nowIso, completedAt: doneIso, durationMs: 850 }
            : t,
        ),
      }));
    }, 900);

    return { ok: true, taskId };
  },

  updateWifiConfig: (deviceId, radioIndex, ssid, passphrase, channel, opts) => {
    if (!get().hasPermission('devices.parameters.write')) {
      return { ok: false, error: 'Permission denied: devices.parameters.write required' };
    }
    if (ssid.trim().length < 1 || ssid.trim().length > 32) {
      return { ok: false, error: 'SSID must be between 1 and 32 characters' };
    }
    const nextSecurity = opts?.securityMode;
    const isUnencrypted = nextSecurity === 'None' || nextSecurity === 'Open';
    const isUnchangedSecret = passphrase === '' || /^•+$/.test(passphrase);
    if (!isUnencrypted && !isUnchangedSecret && (passphrase.length < 8 || passphrase.length > 63)) {
      return { ok: false, error: 'WiFi passphrase must be 8–63 characters' };
    }
    const dev = get().devices.find((d) => d.id === deviceId);
    if (!dev) return { ok: false, error: 'Device not found' };

    const taskId = uid('tsk');
    const nowIso = new Date().toISOString();
    const task: TaskRecord = {
      id: taskId,
      deviceId,
      deviceSerial: dev.serialNumber,
      requestedBy: get().currentUser.username,
      protocol: dev.protocol,
      taskType: 'set_parameter_values',
      status: 'queued',
      correlationId: uid('corr'),
      summary: `Set WLAN ${radioIndex} SSID="${ssid}"`,
      durationMs: null,
      logs: [`[${nowIso}] Queued SetParameterValues for WLANConfiguration.${radioIndex} [passphrase redacted]`],
      createdAt: nowIso,
      startedAt: null,
      completedAt: null,
    };

    set((s) => ({
      tasks: [task, ...s.tasks],
      auditLogs: [
        {
          id: uid('aud'),
          actorUsername: s.currentUser.username,
          actorEmail: s.currentUser.username,
          actorRole: s.currentUser.role,
          action: 'device.wifi.updated',
          targetType: 'device',
          targetId: dev.serialNumber,
          metadata: { radio_index: radioIndex, ssid },
          createdAt: nowIso,
        },
        ...s.auditLogs,
      ],
    }));

    if (get().apiMode === 'backend') {
      const existingRadio = (dev.wifiRadios ?? []).find((r) => r.index === radioIndex);
      const secChanged =
        opts?.securityMode !== undefined &&
        (!existingRadio || opts.securityMode !== existingRadio.securityMode);
      const parameters = buildWifiSetParams(dev, get().aliases, radioIndex, {
        ssid: ssid.trim(),
        passphrase,
        channel,
        enabled: opts?.enabled,
        securityMode: secChanged ? opts?.securityMode : undefined,
        band: undefined,
      });
      dispatchBackendSetParams(set, get, deviceId, taskId, { parameters });
      return { ok: true, taskId };
    }

    setTimeout(() => {
      const doneIso = new Date().toISOString();
      const target = get().devices.find((d) => d.id === deviceId);
      const unreachable = !target || !target.lastInformAt || target.simulatedUnreachable;

      if (unreachable) {
        const faultId = `FLT-${Math.floor(1000 + Math.random() * 9000)}`;
        const reason = `CPE unreachable: WLAN ${radioIndex} SetParameterValues timed out`;
        const newFault: FaultRecord = {
          id: faultId,
          deviceId,
          deviceSerial: dev.serialNumber,
          manufacturerModel: `${dev.manufacturerCanonical} / ${dev.modelName}`,
          ipAddress: dev.trSourceIp,
          taskId,
          operation: 'Set Parameter',
          protocol: dev.protocol,
          category: 'parameter_write_failed',
          correlationId: task.correlationId,
          failedParameters: [`${dev.dataModelRoot}LANDevice.1.WLANConfiguration.${radioIndex}.SSID`],
          errorCode: 'CR_TIMEOUT',
          errorMessage: reason,
          sanitizedLogs: `SetParameterValues failed for WLAN ${radioIndex} [passphrase redacted]`,
          status: 'open',
          retryCount: 0,
          lastAttemptAt: doneIso,
          createdAt: doneIso,
          resolvedAt: null,
        };
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? { ...t, status: 'failed', startedAt: nowIso, completedAt: doneIso, durationMs: 950, summary: reason }
              : t,
          ),
          faults: [newFault, ...s.faults],
        }));
        return;
      }

      set((s) => ({
        devices: s.devices.map((d) => {
          if (d.id !== deviceId) return d;
          const matched = findAliasForDevice(d, s.aliases);
          let nextParams = upsertVirtualParamInList(
            d.parameters,
            matched?.virtualParameters.wlanSsid,
            'wifi.ssid',
            ssid,
            d.protocol,
            radioIndex,
            doneIso,
            { isWritable: true },
          );
          if (passphrase) {
            nextParams = upsertVirtualParamInList(
              nextParams,
              matched?.virtualParameters.wlanPassphrase,
              'wifi.security_key',
              passphrase,
              d.protocol,
              radioIndex,
              doneIso,
              { isWritable: true, isSecret: true },
            );
          }
          if (opts?.enabled !== undefined) {
            nextParams = upsertVirtualParamInList(
              nextParams,
              matched?.virtualParameters.wlanEnabled,
              'wifi.enabled',
              String(opts.enabled),
              d.protocol,
              radioIndex,
              doneIso,
              { isWritable: true },
            );
          }
          if (channel !== undefined) {
            nextParams = upsertVirtualParamInList(
              nextParams,
              matched?.virtualParameters.wlanChannel,
              'wifi.channel',
              channel,
              d.protocol,
              radioIndex,
              doneIso,
              { isWritable: true },
            );
            nextParams = upsertVirtualParamInList(
              nextParams,
              matched?.virtualParameters.wlanAutoChannel,
              'wifi.auto_channel',
              channel === 'Auto' ? 'true' : 'false',
              d.protocol,
              radioIndex,
              doneIso,
              { isWritable: true },
            );
          }
          if (opts?.securityMode !== undefined) {
            nextParams = upsertVirtualParamInList(
              nextParams,
              matched?.virtualParameters.wlanSecurityMode,
              'wifi.security_mode',
              opts.securityMode,
              d.protocol,
              radioIndex,
              doneIso,
              { isWritable: true },
            );
          }
          if (opts?.band !== undefined) {
            nextParams = upsertVirtualParamInList(
              nextParams,
              matched?.virtualParameters.wlanBand,
              'wifi.band',
              opts.band,
              d.protocol,
              radioIndex,
              doneIso,
              { isWritable: true },
            );
          }
          return {
            ...d,
            parameters: nextParams,
            wifiRadios: (d.wifiRadios ?? []).map((w) =>
              w.index === radioIndex
                ? {
                  ...w,
                  ssid,
                  passphrase,
                  channel: channel ?? w.channel,
                  enabled: opts?.enabled ?? w.enabled,
                  securityMode: opts?.securityMode ?? w.securityMode,
                  band: opts?.band ?? w.band,
                }
                : w,
            ),
          };
        }),
        tasks: s.tasks.map((t) =>
          t.id === taskId
            ? {
              ...t,
              status: 'completed',
              startedAt: nowIso,
              completedAt: doneIso,
              durationMs: 920,
              logs: [...t.logs, `[${doneIso}] SetParameterValuesResponse Status=0`],
            }
            : t,
        ),
      }));
      get().triggerSummon(deviceId, ['wifi']);
    }, 950);

    return { ok: true, taskId };
  },

  addWifiRadio: (deviceId, input) => {
    if (!get().hasPermission('devices.parameters.write')) {
      return { ok: false, error: 'Permission denied: devices.parameters.write required' };
    }
    if (input.ssid.trim().length < 1 || input.ssid.trim().length > 32) {
      return { ok: false, error: 'SSID must be between 1 and 32 characters' };
    }
    const isUnencryptedNew = input.securityMode === 'None' || input.securityMode === 'Open';
    if (!isUnencryptedNew && (input.passphrase.length < 8 || input.passphrase.length > 63)) {
      return { ok: false, error: 'WiFi passphrase must be 8–63 characters' };
    }
    const dev = get().devices.find((d) => d.id === deviceId);
    if (!dev) return { ok: false, error: 'Device not found' };

    const nextIndex = Math.max(0, ...(dev.wifiRadios ?? []).map((w) => w.index)) + 1;
    const taskId = uid('tsk');
    const nowIso = new Date().toISOString();
    const task: TaskRecord = {
      id: taskId,
      deviceId,
      deviceSerial: dev.serialNumber,
      requestedBy: get().currentUser.username,
      protocol: dev.protocol,
      taskType: 'set_parameter_values',
      status: 'queued',
      correlationId: uid('corr'),
      summary: `Added WLAN ${nextIndex} SSID="${input.ssid.trim()}"`,
      durationMs: null,
      logs: [`[${nowIso}] Queued AddObject for WLANConfiguration.${nextIndex} [passphrase redacted]`],
      createdAt: nowIso,
      startedAt: null,
      completedAt: null,
    };

    set((s) => ({
      tasks: [task, ...s.tasks],
      auditLogs: [
        {
          id: uid('aud'),
          actorUsername: s.currentUser.username,
          actorEmail: s.currentUser.username,
          actorRole: s.currentUser.role,
          action: 'device.wifi.added',
          targetType: 'device',
          targetId: dev.serialNumber,
          metadata: { radio_index: nextIndex, ssid: input.ssid.trim() },
          createdAt: nowIso,
        },
        ...s.auditLogs,
      ],
    }));

    if (get().apiMode === 'backend') {
      const parameters = buildWifiSetParams(dev, get().aliases, nextIndex, {
        ssid: input.ssid.trim(),
        passphrase: input.passphrase,
        channel: input.channel,
        enabled: input.enabled,
        securityMode: input.securityMode,
        band: input.band,
      });
      dispatchBackendSetParams(set, get, deviceId, taskId, { parameters });
      return { ok: true, taskId };
    }

    setTimeout(() => {
      const doneIso = new Date().toISOString();
      const target = get().devices.find((d) => d.id === deviceId);
      const unreachable = !target || !target.lastInformAt || target.simulatedUnreachable;

      if (unreachable) {
        const faultId = `FLT-${Math.floor(1000 + Math.random() * 9000)}`;
        const reason = `CPE unreachable: Add WLAN ${nextIndex} timed out`;
        const newFault: FaultRecord = {
          id: faultId,
          deviceId,
          deviceSerial: dev.serialNumber,
          manufacturerModel: `${dev.manufacturerCanonical} / ${dev.modelName}`,
          ipAddress: dev.trSourceIp,
          taskId,
          operation: 'Add WLAN Object',
          protocol: dev.protocol,
          category: 'parameter_write_failed',
          correlationId: task.correlationId,
          failedParameters: [`${dev.dataModelRoot}LANDevice.1.WLANConfiguration.${nextIndex}`],
          errorCode: 'CR_TIMEOUT',
          errorMessage: reason,
          sanitizedLogs: `AddObject failed for WLAN ${nextIndex} [passphrase redacted]`,
          status: 'open',
          retryCount: 0,
          lastAttemptAt: doneIso,
          createdAt: doneIso,
          resolvedAt: null,
        };
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? { ...t, status: 'failed', startedAt: nowIso, completedAt: doneIso, durationMs: 950, summary: reason }
              : t,
          ),
          faults: [newFault, ...s.faults],
        }));
        return;
      }

      const newRadio: WiFiRadio = {
        index: nextIndex,
        ssid: input.ssid.trim(),
        enabled: input.enabled,
        band: input.band,
        securityMode: input.securityMode,
        channel: input.channel.trim() || 'Auto',
        channelWidth: input.band === '5 GHz' ? '80MHz' : '20MHz',
        maxRate: input.band === '5 GHz' ? '867 Mbps' : '300 Mbps',
        broadcastSsid: true,
        associatedCount: 0,
        passphrase: input.passphrase,
      };

      set((s) => ({
        devices: s.devices.map((d) => {
          if (d.id !== deviceId) return d;
          const matched = findAliasForDevice(d, s.aliases);
          const nextParams = syncWifiRadioParams(d.parameters, newRadio, matched, d.protocol, doneIso);
          return {
            ...d,
            wifiRadios: [...(d.wifiRadios ?? []), newRadio],
            parameters: nextParams,
          };
        }),
        tasks: s.tasks.map((t) =>
          t.id === taskId
            ? {
              ...t,
              status: 'completed',
              startedAt: nowIso,
              completedAt: doneIso,
              durationMs: 920,
              logs: [...t.logs, `[${doneIso}] AddObjectInstance=${nextIndex} Status=0`],
            }
            : t,
        ),
      }));
      get().triggerSummon(deviceId, ['wifi']);
    }, 950);

    return { ok: true, taskId };
  },

  setDeviceParameter: (deviceId, path, value) => {
    if (!get().hasPermission('devices.parameters.write')) {
      return { ok: false, error: 'Permission denied: devices.parameters.write required' };
    }
    const dev = get().devices.find((d) => d.id === deviceId);
    if (!dev) return { ok: false, error: 'Device not found' };

    const taskId = uid('tsk');
    const nowIso = new Date().toISOString();
    const task: TaskRecord = {
      id: taskId,
      deviceId,
      deviceSerial: dev.serialNumber,
      requestedBy: get().currentUser.username,
      protocol: dev.protocol,
      taskType: 'set_parameter_values',
      status: 'queued',
      correlationId: uid('corr'),
      summary: `SetParameterValues ${path}`,
      durationMs: null,
      logs: [`[${nowIso}] Queued write on ${path}`],
      createdAt: nowIso,
      startedAt: null,
      completedAt: null,
    };

    set((s) => ({
      tasks: [task, ...s.tasks],
      auditLogs: [
        {
          id: uid('aud'),
          actorUsername: s.currentUser.username,
          actorEmail: s.currentUser.username,
          actorRole: s.currentUser.role,
          action: 'device.parameter.write',
          targetType: 'device',
          targetId: dev.serialNumber,
          metadata: { parameter_path: path },
          createdAt: nowIso,
        },
        ...s.auditLogs,
      ],
    }));

    if (get().apiMode === 'backend') {
      dispatchBackendSetParams(set, get, deviceId, taskId, { path, value, value_type: 'xsd:string' });
      return { ok: true, taskId };
    }

    setTimeout(() => {
      const doneIso = new Date().toISOString();
      const target = get().devices.find((d) => d.id === deviceId);
      const unreachable = !target || !target.lastInformAt || target.simulatedUnreachable;

      if (unreachable) {
        const faultId = `FLT-${Math.floor(1000 + Math.random() * 9000)}`;
        const reason = `CPE unreachable: SetParameterValues ${path} timed out`;
        const newFault: FaultRecord = {
          id: faultId,
          deviceId,
          deviceSerial: dev.serialNumber,
          manufacturerModel: `${dev.manufacturerCanonical} / ${dev.modelName}`,
          ipAddress: dev.trSourceIp,
          taskId,
          operation: 'Set Parameter',
          protocol: dev.protocol,
          category: 'parameter_write_failed',
          correlationId: task.correlationId,
          failedParameters: [path],
          errorCode: 'CR_TIMEOUT',
          errorMessage: reason,
          sanitizedLogs: `SetParameterValues failed for ${path} (${reason})`,
          status: 'open',
          retryCount: 0,
          lastAttemptAt: doneIso,
          createdAt: doneIso,
          resolvedAt: null,
        };
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === taskId
              ? { ...t, status: 'failed', startedAt: nowIso, completedAt: doneIso, durationMs: 800, summary: reason }
              : t,
          ),
          faults: [newFault, ...s.faults],
        }));
        return;
      }

      const matchedForTarget = findAliasForDevice(target, get().aliases);
      const vpKeyForSummon = resolveVirtualParamKeyForPath(path, matchedForTarget);
      const autoGroup: SummonGroup = vpKeyForSummon?.startsWith('wan.')
        ? 'wan'
        : vpKeyForSummon?.startsWith('wifi.')
          ? 'wifi'
          : vpKeyForSummon?.startsWith('hosts.')
            ? 'connected_hosts'
            : 'device_health';

      set((s) => ({
        devices: s.devices.map((d) => {
          if (d.id !== deviceId) return d;
          const matched = findAliasForDevice(d, s.aliases);
          const vpKey = resolveVirtualParamKeyForPath(path, matched);
          const nextParams = d.parameters.map((p) =>
            p.path === path ? { ...p, value, readState: 'available' as const, lastAttemptAt: doneIso, lastSuccessAt: doneIso } : p,
          );
          const targetWanIdx =
            extractInstanceIndexFromPath(
              path,
              vpKey === 'wan.pppoe_username'
                ? matched?.virtualParameters.wanPppoeUsername
                : vpKey === 'wan.pppoe_password'
                  ? matched?.virtualParameters.wanPppoePassword
                  : vpKey === 'wan.vlan_id'
                    ? matched?.virtualParameters.wanVlanId
                    : matched?.virtualParameters.wanExternalIp,
            ) ?? 1;
          const targetWifiIdx =
            extractInstanceIndexFromPath(
              path,
              vpKey === 'wifi.ssid'
                ? matched?.virtualParameters.wlanSsid
                : vpKey === 'wifi.security_key'
                  ? matched?.virtualParameters.wlanPassphrase
                  : vpKey === 'wifi.enabled'
                    ? matched?.virtualParameters.wlanEnabled
                    : matched?.virtualParameters.wlanChannel,
            ) ?? 1;
          return {
            ...d,
            parameters: nextParams,
            wanIp: vpKey === 'wan.external_ip' && targetWanIdx === 1 ? value || null : d.wanIp,
            pppoeUsername: vpKey === 'wan.pppoe_username' && targetWanIdx === 1 ? value || null : d.pppoeUsername,
            wanConnections:
              vpKey === 'wan.pppoe_username' && d.wanConnections
                ? d.wanConnections.map((w) => (w.instanceIndex === targetWanIdx ? { ...w, pppoeUsername: value } : w))
                : vpKey === 'wan.pppoe_password' && d.wanConnections
                  ? d.wanConnections.map((w) => (w.instanceIndex === targetWanIdx ? { ...w, pppoePassword: value } : w))
                  : vpKey === 'wan.vlan_id' && d.wanConnections
                    ? d.wanConnections.map((w) => (w.instanceIndex === targetWanIdx ? { ...w, vlanId: Number(value) || w.vlanId } : w))
                    : vpKey === 'wan.external_ip' && d.wanConnections
                      ? d.wanConnections.map((w) => (w.instanceIndex === targetWanIdx ? { ...w, wanIp: value } : w))
                      : d.wanConnections,
            wifiRadios:
              vpKey === 'wifi.ssid' && d.wifiRadios
                ? d.wifiRadios.map((w) => (w.index === targetWifiIdx ? { ...w, ssid: value } : w))
                : vpKey === 'wifi.security_key' && d.wifiRadios
                  ? d.wifiRadios.map((w) => (w.index === targetWifiIdx ? { ...w, passphrase: value } : w))
                  : vpKey === 'wifi.enabled' && d.wifiRadios
                    ? d.wifiRadios.map((w) => (w.index === targetWifiIdx ? { ...w, enabled: value === 'true' || value === '1' } : w))
                    : vpKey === 'wifi.channel' && d.wifiRadios
                      ? d.wifiRadios.map((w) => (w.index === targetWifiIdx ? { ...w, channel: value } : w))
                      : d.wifiRadios,
            credentials:
              vpKey === 'credentials.admin_password'
                ? { ...d.credentials, adminPassword: value }
                : vpKey === 'credentials.user_password'
                  ? { ...d.credentials, userPassword: value }
                  : d.credentials,
            periodicInformInterval:
              vpKey === 'management.periodic_inform_interval' && Number.isFinite(Number(value))
                ? Number(value)
                : d.periodicInformInterval,
          };
        }),
        tasks: s.tasks.map((t) =>
          t.id === taskId
            ? {
              ...t,
              status: 'completed',
              startedAt: nowIso,
              completedAt: doneIso,
              durationMs: 740,
              logs: [...t.logs, `[${doneIso}] SetParameterValuesResponse Status=0`],
            }
            : t,
        ),
      }));
      get().triggerSummon(deviceId, [autoGroup]);
    }, 800);

    return { ok: true, taskId };
  },

  simulateOntInform: (serial, manufacturer, model, productClass, technology) => {
    const nowIso = new Date().toISOString();
    const existing = get().devices.find((d) => d.serialNumber === serial && !d.deletedAt);
    const rx = Number((-15 - Math.random() * 9).toFixed(2));
    const temp = Number((38 + Math.random() * 14).toFixed(1));
    const ip = `10.120.${Math.floor(10 + Math.random() * 40)}.${Math.floor(10 + Math.random() * 200)}`;

    if (existing) {
      set((s) => ({
        devices: s.devices.map((d) => {
          if (d.id !== existing.id) return d;
          const matched = findAliasForDevice(d, s.aliases);
          let nextParams = upsertVirtualParamInList(
            d.parameters,
            matched?.virtualParameters.rxPower ?? `${d.dataModelRoot}WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RXPower`,
            'optical.rx_power_dbm',
            rx.toFixed(2),
            d.protocol,
            1,
            nowIso,
            { isWritable: false },
          );
          nextParams = upsertVirtualParamInList(
            nextParams,
            matched?.virtualParameters.temperature ?? `${d.dataModelRoot}WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TransceiverTemperature`,
            'device.temperature_celsius',
            temp.toFixed(1),
            d.protocol,
            1,
            nowIso,
            { isWritable: false },
          );
          return {
            ...d,
            lastInformAt: nowIso,
            trSourceIp: ip,
            rxPowerDbm: rx,
            rxPowerFetchedAt: nowIso,
            temperatureCelsius: temp,
            temperatureFetchedAt: nowIso,
            simulatedUnreachable: false,
            parameters: nextParams,
            events: [
              { id: uid('ev'), eventCode: '2 PERIODIC', protocol: d.protocol, createdAt: nowIso, summary: 'Simulated Inform received' },
              ...d.events,
            ],
          };
        }),
        lastDataUpdate: nowIso,
        realtimeEvents: [
          {
            id: uid('rt'),
            type: 'device.inform.received',
            deviceId: existing.id,
            message: `CWMP Inform received from ${serial} (${ip})`,
            timestamp: nowIso,
          },
          ...s.realtimeEvents.slice(0, 29),
        ],
      }));
      return existing.id;
    }

    const newId = uid('dev');
    const newDev: Device = {
      id: newId,
      tenantId: '00000000-0000-0000-0000-000000000001',
      serialNumber: serial.trim().toUpperCase(),
      oui: '00259E',
      manufacturerRaw: manufacturer,
      manufacturerCanonical: manufacturer,
      manufacturerSource: 'alias_map',
      manufacturerConfidence: 'high',
      productClass,
      modelName: model,
      hardwareVersion: 'V1.0',
      softwareVersion: 'V1.0.10-SIM',
      technologyRaw: technology,
      technologyNormalized: technology,
      protocol: 'TR-069',
      dataModelRoot: 'InternetGatewayDevice.',
      trSourceIp: ip,
      wanIp: null,
      pppoeUsername: null,
      connectionRequestUrl: `http://${ip}:7547/cwmp`,
      adminDisabled: false,
      deletedAt: null,
      deviceGroup: 'Live-Lab-ONT',
      lastInformAt: nowIso,
      lastEventCode: '0 BOOTSTRAP',
      lastBootstrapAt: nowIso,
      lastBootAt: null,
      lastSummonAt: null,
      lastParamSyncAt: nowIso,
      periodicInformInterval: 900,
      uptimeSeconds: 120,
      uptimeFetchedAt: nowIso,
      rxPowerDbm: rx,
      rxPowerFetchedAt: nowIso,
      temperatureCelsius: temp,
      temperatureFetchedAt: nowIso,
      rxReadState: 'available',
      tempReadState: 'available',
      uptimeReadState: 'available',
      credentials: {
        adminUsername: 'admin',
        adminPassword: 'admin',
        userUsername: 'user',
        userPassword: 'user1234',
        connectionRequestUsername: 'acs_cr',
        connectionRequestPassword: `Cr#${serial.slice(-4)}`,
        rotatedAt: nowIso,
      },
      wanConnections: null,
      wifiRadios: null,
      connectedHosts: null,
      sessions: [
        { id: uid('sess'), protocol: 'TR-069', protocolVersion: '1.1', sourceIp: ip, status: 'completed', rpcCount: 1, startedAt: nowIso, endedAt: nowIso },
      ],
      events: [
        { id: uid('ev'), eventCode: '0 BOOTSTRAP', protocol: 'TR-069', createdAt: nowIso, summary: 'Auto-enrolled from CWMP Inform' },
      ],
      parameters: [
        {
          path: 'InternetGatewayDevice.DeviceInfo.SerialNumber',
          canonicalKey: 'device.serial_number',
          value: serial.trim().toUpperCase(),
          valueType: 'xsd:string',
          readState: 'available',
          isWritable: false,
          isSecret: false,
          sourceProtocol: 'TR-069',
          lastAttemptAt: nowIso,
          lastSuccessAt: nowIso,
        },
        {
          path: 'InternetGatewayDevice.DeviceInfo.Manufacturer',
          canonicalKey: 'device.manufacturer',
          value: manufacturer,
          valueType: 'xsd:string',
          readState: 'available',
          isWritable: false,
          isSecret: false,
          sourceProtocol: 'TR-069',
          lastAttemptAt: nowIso,
          lastSuccessAt: nowIso,
        },
        {
          path: 'InternetGatewayDevice.DeviceInfo.UpTime',
          canonicalKey: 'device.uptime_seconds',
          value: '120',
          valueType: 'xsd:unsignedInt',
          readState: 'available',
          isWritable: false,
          isSecret: false,
          sourceProtocol: 'TR-069',
          lastAttemptAt: nowIso,
          lastSuccessAt: nowIso,
        },
        {
          path:
            (findAliasForDevice(
              { oui: '00259E', manufacturerRaw: manufacturer, manufacturerCanonical: manufacturer },
              get().aliases,
            )?.virtualParameters.rxPower) ||
            'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RXPower',
          canonicalKey: 'optical.rx_power_dbm',
          value: rx.toFixed(2),
          valueType: 'xsd:string',
          readState: 'available',
          isWritable: false,
          isSecret: false,
          sourceProtocol: 'TR-069',
          lastAttemptAt: nowIso,
          lastSuccessAt: nowIso,
        },
        {
          path:
            (findAliasForDevice(
              { oui: '00259E', manufacturerRaw: manufacturer, manufacturerCanonical: manufacturer },
              get().aliases,
            )?.virtualParameters.temperature) ||
            'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TransceiverTemperature',
          canonicalKey: 'device.temperature_celsius',
          value: temp.toFixed(1),
          valueType: 'xsd:string',
          readState: 'available',
          isWritable: false,
          isSecret: false,
          sourceProtocol: 'TR-069',
          lastAttemptAt: nowIso,
          lastSuccessAt: nowIso,
        },
      ],
    };

    set((s) => ({
      devices: [newDev, ...s.devices],
      lastDataUpdate: nowIso,
      realtimeEvents: [
        {
          id: uid('rt'),
          type: 'device.registered',
          deviceId: newId,
          message: `New ONT enrolled via CWMP Inform: ${newDev.serialNumber} (${manufacturer} ${model})`,
          timestamp: nowIso,
        },
        ...s.realtimeEvents.slice(0, 29),
      ],
    }));

    // Auto-summon all VParam groups on first device detection
    get().triggerSummon(newId, [
      'device_info',
      'device_health',
      'wan',
      'wifi',
      'connected_hosts',
      'credentials',
      'vparams',
      'parameters',
    ]);

    return newId;
  },

  acknowledgeFault: (faultId) => {
    set((s) => ({
      faults: s.faults.map((f) => (f.id === faultId ? { ...f, status: 'acknowledged' } : f)),
      auditLogs: [
        {
          id: uid('aud'),
          actorUsername: s.currentUser.username,
          actorEmail: s.currentUser.username,
          actorRole: s.currentUser.role,
          action: 'fault.acknowledged',
          targetType: 'fault',
          targetId: faultId,
          metadata: {},
          createdAt: new Date().toISOString(),
        },
        ...s.auditLogs,
      ],
    }));
    if (get().apiMode === 'backend') {
      void apiClient.post(`/faults/${faultId}/acknowledge`).catch(() => undefined);
    }
  },

  resolveFault: (faultId, note) => {
    const nowIso = new Date().toISOString();
    set((s) => ({
      faults: s.faults.map((f) =>
        f.id === faultId ? { ...f, status: 'resolved', resolvedAt: nowIso, resolutionNote: note } : f,
      ),
      auditLogs: [
        {
          id: uid('aud'),
          actorUsername: s.currentUser.username,
          actorEmail: s.currentUser.username,
          actorRole: s.currentUser.role,
          action: 'fault.resolved',
          targetType: 'fault',
          targetId: faultId,
          metadata: { note },
          createdAt: nowIso,
        },
        ...s.auditLogs,
      ],
      realtimeEvents: [
        {
          id: uid('rt'),
          type: 'fault.resolved',
          message: `Fault ${faultId} marked resolved`,
          timestamp: nowIso,
        },
        ...s.realtimeEvents.slice(0, 29),
      ],
    }));
    if (get().apiMode === 'backend') {
      void apiClient.post(`/faults/${faultId}/resolve`, { note }).catch(() => undefined);
    }
  },

  deleteFault: (faultId) => {
    const nowIso = new Date().toISOString();
    set((s) => ({
      faults: s.faults.filter((f) => f.id !== faultId),
      auditLogs: [
        {
          id: uid('aud'),
          actorUsername: s.currentUser.username,
          actorEmail: s.currentUser.username,
          actorRole: s.currentUser.role,
          action: 'fault.deleted',
          targetType: 'fault',
          targetId: faultId,
          metadata: {},
          createdAt: nowIso,
        },
        ...s.auditLogs,
      ],
    }));
    if (get().apiMode === 'backend') {
      void apiClient.delete(`/faults/${faultId}`).catch(() => undefined);
    }
  },

  retryFault: (faultId) => {
    if (!get().hasPermission('faults.manage')) {
      return { ok: false, error: 'Permission denied: faults.manage required' };
    }
    const flt = get().faults.find((f) => f.id === faultId);
    if (!flt) return { ok: false, error: 'Fault not found' };
    if (flt.category === 'factory_reset_failed') {
      return { ok: false, error: 'Destructive operations (Factory Reset) cannot be auto-retried from Faults.' };
    }
    const nowIso = new Date().toISOString();
    set((s) => ({
      faults: s.faults.map((f) =>
        f.id === faultId
          ? { ...f, retryCount: f.retryCount + 1, lastAttemptAt: nowIso, status: 'resolved', resolvedAt: nowIso, resolutionNote: 'Succeeded on manual safe retry' }
          : f,
      ),
      devices: s.devices.map((d) => (d.id === flt.deviceId ? { ...d, simulatedUnreachable: false, lastInformAt: nowIso } : d)),
      auditLogs: [
        {
          id: uid('aud'),
          actorUsername: s.currentUser.username,
          actorEmail: s.currentUser.username,
          actorRole: s.currentUser.role,
          action: 'fault.manual_retry',
          targetType: 'fault',
          targetId: faultId,
          metadata: { device_serial: flt.deviceSerial },
          createdAt: nowIso,
        },
        ...s.auditLogs,
      ],
    }));
    if (get().apiMode === 'backend') {
      void apiClient
        .post(`/faults/${faultId}/resolve`, { note: 'Manual safe retry triggered' })
        .then(() => apiClient.post(`/devices/${flt.deviceId}/summon`, { groups: ['basic'] }))
        .catch(() => undefined);
    }
    return { ok: true };
  },

  addFirmwareImage: (img) => {
    const nowIso = new Date().toISOString();
    set((s) => ({
      firmwareImages: [{ ...img, id: uid('fw'), uploadedAt: nowIso }, ...s.firmwareImages],
      auditLogs: [
        {
          id: uid('aud'),
          actorUsername: s.currentUser.username,
          actorEmail: s.currentUser.username,
          actorRole: s.currentUser.role,
          action: 'firmware.upload',
          targetType: 'firmware',
          targetId: img.fileName,
          metadata: { version: img.version, sha256: img.checksumSha256.slice(0, 12) },
          createdAt: nowIso,
        },
        ...s.auditLogs,
      ],
    }));
  },

  deployFirmware: (firmwareId, deviceIds) => {
    if (!get().hasPermission('firmware.deploy')) {
      return { ok: false, deployed: 0, skipped: ['Permission denied: firmware.deploy required'] };
    }
    const fw = get().firmwareImages.find((f) => f.id === firmwareId);
    if (!fw) return { ok: false, deployed: 0, skipped: ['Firmware image not found'] };

    const nowIso = new Date().toISOString();
    const skipped: string[] = [];
    const createdJobs: FirmwareDeploymentJob[] = [];

    for (const id of deviceIds) {
      const dev = get().devices.find((d) => d.id === id);
      if (!dev) continue;
      // Strict compatibility check (Section 7)
      const matchesMfg = dev.manufacturerCanonical.toLowerCase() === fw.manufacturer.toLowerCase();
      const matchesModel = dev.modelName.toLowerCase() === fw.modelName.toLowerCase();
      const matchesPc = !fw.productClass || dev.productClass.toLowerCase() === fw.productClass.toLowerCase();
      const matchesHw = fw.hardwareRevision === '*' || dev.hardwareVersion.toLowerCase() === fw.hardwareRevision.toLowerCase();

      if (!matchesMfg || !matchesModel || !matchesPc || !matchesHw) {
        skipped.push(`${dev.serialNumber} (${dev.manufacturerCanonical} ${dev.modelName} ${dev.hardwareVersion})`);
        continue;
      }

      createdJobs.push({
        id: uid('fwj'),
        firmwareId: fw.id,
        firmwareVersion: fw.version,
        deviceId: dev.id,
        deviceSerial: dev.serialNumber,
        status: 'queued',
        progressPercent: 10,
        scheduledAt: nowIso,
        completedAt: null,
      });
    }

    if (createdJobs.length > 0) {
      set((s) => ({
        firmwareJobs: [...createdJobs, ...s.firmwareJobs],
        auditLogs: [
          {
            id: uid('aud'),
            actorUsername: s.currentUser.username,
            actorEmail: s.currentUser.username,
            actorRole: s.currentUser.role,
            action: 'firmware.deploy',
            targetType: 'firmware',
            targetId: fw.version,
            metadata: { target_count: createdJobs.length },
            createdAt: nowIso,
          },
          ...s.auditLogs,
        ],
      }));

      if (get().apiMode === 'backend') {
        void apiClient
          .post(`/firmware/${firmwareId}/deploy`, {
            deviceIds: createdJobs.map((j) => j.deviceId),
          })
          .then(() => {
            window.setTimeout(() => void get().refreshBackendData(), 1500);
          })
          .catch(() => undefined);
      } else {
        setTimeout(() => {
          const doneIso = new Date().toISOString();
          const jobIds = new Set(createdJobs.map((j) => j.id));
          const targetDevIds = new Set(createdJobs.map((j) => j.deviceId));
          set((s) => ({
            firmwareJobs: s.firmwareJobs.map((j) =>
              jobIds.has(j.id) ? { ...j, status: 'completed', progressPercent: 100, completedAt: doneIso } : j,
            ),
            devices: s.devices.map((d) => (targetDevIds.has(d.id) ? { ...d, softwareVersion: fw.version } : d)),
          }));
        }, 1500);
      }
    }

    return { ok: true, deployed: createdJobs.length, skipped };
  },

  updateSettings: (next) => {
    const nowIso = new Date().toISOString();
    setActiveTimezone(next.general.timezone);
    set((s) => ({
      settings: next,
      lastDataUpdate: nowIso,
      auditLogs: [
        {
          id: uid('aud'),
          actorUsername: s.currentUser.username,
          actorEmail: s.currentUser.username,
          actorRole: s.currentUser.role,
          action: 'settings.updated',
          targetType: 'settings',
          targetId: 'system_settings',
          metadata: { online_threshold_seconds: next.deviceStatus.onlineThresholdSeconds },
          createdAt: nowIso,
        },
        ...s.auditLogs,
      ],
    }));
    if (get().apiMode === 'backend') {
      void Promise.all([
        apiClient.put('/settings/general', next.general),
        apiClient.put('/settings/device_status', next.deviceStatus),
        apiClient.put('/settings/classification', next.classification),
        apiClient.put('/settings/protocol', next.protocol),
        apiClient.put('/settings/auto_summon', next.autoSummon),
      ]).catch(() => undefined);
    }
  },

  addManufacturerAlias: (alias) => {
    const nowIso = new Date().toISOString();
    const tempId = uid('al');
    const created: ManufacturerAlias = { ...alias, id: tempId };
    set((s) => {
      const nextAliases = [created, ...s.aliases];
      savePersistedAliases(nextAliases);
      return {
        aliases: nextAliases,
        devices: s.devices.map((d) => applyAliasToDevice(d, nextAliases)),
        auditLogs: [
          {
            id: uid('aud'),
            actorUsername: s.currentUser.username,
            actorEmail: s.currentUser.username,
            actorRole: s.currentUser.role,
            action: 'alias.created',
            targetType: 'manufacturer_alias',
            targetId: created.id,
            metadata: { canonical: created.canonicalName, oui: created.oui },
            createdAt: nowIso,
          },
          ...s.auditLogs,
        ],
      };
    });
    if (get().apiMode === 'backend') {
      void apiClient
        .post<{ data?: ManufacturerAlias }>('/aliases', alias)
        .then((res) => {
          const saved = res.data?.data;
          if (!saved?.id) return;
          set((s) => {
            const nextAliases = s.aliases.map((a) => (a.id === tempId ? mapApiAliasToFrontend(saved) : a));
            savePersistedAliases(nextAliases);
            return { aliases: nextAliases };
          });
        })
        .catch(() => undefined);
    }
  },

  updateManufacturerAlias: (id, patch) => {
    const nowIso = new Date().toISOString();
    set((s) => {
      const nextAliases = s.aliases.map((a) => (a.id === id ? { ...patch, id } : a));
      savePersistedAliases(nextAliases);
      return {
        aliases: nextAliases,
        devices: s.devices.map((d) => applyAliasToDevice(d, nextAliases)),
        auditLogs: [
          {
            id: uid('aud'),
            actorUsername: s.currentUser.username,
            actorEmail: s.currentUser.username,
            actorRole: s.currentUser.role,
            action: 'alias.updated',
            targetType: 'manufacturer_alias',
            targetId: id,
            metadata: { canonical: patch.canonicalName, oui: patch.oui },
            createdAt: nowIso,
          },
          ...s.auditLogs,
        ],
      };
    });
    if (get().apiMode === 'backend') {
      void apiClient.put(`/aliases/${id}`, { ...patch, id }).catch(() => undefined);
    }
  },

  removeManufacturerAlias: (id) => {
    const nowIso = new Date().toISOString();
    set((s) => {
      const nextAliases = s.aliases.filter((a) => a.id !== id);
      savePersistedAliases(nextAliases);
      return {
        aliases: nextAliases,
        auditLogs: [
          {
            id: uid('aud'),
            actorUsername: s.currentUser.username,
            actorEmail: s.currentUser.username,
            actorRole: s.currentUser.role,
            action: 'alias.deleted',
            targetType: 'manufacturer_alias',
            targetId: id,
            metadata: {},
            createdAt: nowIso,
          },
          ...s.auditLogs,
        ],
      };
    });
    if (get().apiMode === 'backend') {
      void apiClient.delete(`/aliases/${id}`).catch(() => undefined);
    }
  },

  assignVirtualParamFromDevice: (deviceId, field, path) => {
    if (!get().hasPermission('settings.manage')) {
      return { ok: false, error: 'Permission denied: settings.manage required' };
    }
    const dev = get().devices.find((d) => d.id === deviceId);
    if (!dev) return { ok: false, error: 'Device not found' };

    const nowIso = new Date().toISOString();
    const existing = findAliasForDevice(dev, get().aliases);
    const vendorName = existing?.canonicalName || dev.manufacturerCanonical || dev.manufacturerRaw;
    const normalizedPath = normalizeVirtualParamTemplate(field, path);
    const tempId = existing?.id ?? uid('al');
    const targetAlias: ManufacturerAlias = existing
      ? { ...existing, virtualParameters: { ...existing.virtualParameters, [field]: normalizedPath } }
      : {
        id: tempId,
        rawName: dev.manufacturerRaw,
        canonicalName: vendorName,
        oui: dev.oui,
        source: 'manual',
        confidence: 'high',
        virtualParameters: {
          ...(dev.dataModelRoot === 'Device.'
            ? VIRTUAL_PARAM_PRESETS.nokia_tr181
            : VIRTUAL_PARAM_PRESETS.zte_tr098),
          rxPower: '',
          temperature: '',
          wanRoot: '',
          wanExternalIp: '',
          wanPppoeUsername: '',
          wanPppoePassword: '',
          wanVlanId: '',
          wanStatus: '',
          wlanRoot: '',
          wlanSsid: '',
          wlanPassphrase: '',
          wlanEnabled: '',
          wlanChannel: '',
          connectedHostsRoot: '',
          hostName: '',
          hostMac: '',
          hostIp: '',
          adminUsername: '',
          adminPassword: '',
          userUsername: '',
          userPassword: '',
          [field]: normalizedPath,
        },
      };

    set((s) => {
      const nextAliases = existing
        ? s.aliases.map((a) => (a.id === existing.id ? targetAlias : a))
        : [targetAlias, ...s.aliases];
      savePersistedAliases(nextAliases);
      return {
        aliases: nextAliases,
        devices: s.devices.map((d) => applyAliasToDevice(d, nextAliases)),
        auditLogs: [
          {
            id: uid('aud'),
            actorUsername: s.currentUser.username,
            actorEmail: s.currentUser.username,
            actorRole: s.currentUser.role,
            action: 'alias.virtual_param_mapped',
            targetType: 'manufacturer_alias',
            targetId: vendorName,
            metadata: { field, path: normalizedPath },
            createdAt: nowIso,
          },
          ...s.auditLogs,
        ],
      };
    });

    if (get().apiMode === 'backend') {
      if (existing) {
        void apiClient.put(`/aliases/${existing.id}`, targetAlias).catch(() => undefined);
      } else {
        const createPayload = {
          rawName: targetAlias.rawName,
          canonicalName: targetAlias.canonicalName,
          oui: targetAlias.oui,
          source: targetAlias.source,
          confidence: targetAlias.confidence,
          virtualParameters: targetAlias.virtualParameters,
        };
        void apiClient
          .post<{ data?: ManufacturerAlias }>('/aliases', createPayload)
          .then((res) => {
            const saved = res.data?.data;
            if (!saved?.id) return;
            set((s) => {
              const nextAliases = s.aliases.map((a) => (a.id === tempId ? mapApiAliasToFrontend(saved) : a));
              savePersistedAliases(nextAliases);
              return { aliases: nextAliases };
            });
          })
          .catch(() => undefined);
      }
    }

    return { ok: true, vendorName, mappedPath: normalizedPath };
  },

  upsertProvisioningProfile: async (input) => {
    if (!get().hasPermission('devices.parameters.write')) {
      return { ok: false, error: 'Permission denied: devices.parameters.write required' };
    }
    const serial = input.serialNumber.trim().toUpperCase();
    if (!serial) {
      return { ok: false, error: 'Serial number is required' };
    }
    if (get().apiMode === 'backend') {
      try {
        const res = await apiClient.post<{
          data?: { profile?: ProvisioningProfile; executionMode?: string };
        }>('/provisioning', {
          ...input,
          serialNumber: serial,
        });
        const profile = res.data?.data?.profile;
        const executionMode = res.data?.data?.executionMode;
        if (profile) {
          set((s) => {
            const exists = s.provisioningProfiles.some(
              (p) => p.serialNumber.toUpperCase() === profile.serialNumber.toUpperCase(),
            );
            return {
              provisioningProfiles: exists
                ? s.provisioningProfiles.map((p) =>
                  p.serialNumber.toUpperCase() === profile.serialNumber.toUpperCase() ? profile : p,
                )
                : [profile, ...s.provisioningProfiles],
            };
          });
        }
        void get().refreshBackendData();
        return { ok: true, executionMode, profile };
      } catch (err) {
        return { ok: false, error: extractApiErrorMessage(err, 'Failed to save provisioning profile') };
      }
    }

    const nowIso = new Date().toISOString();
    const existing = get().provisioningProfiles.find((p) => p.serialNumber.toUpperCase() === serial);
    const localProfile: ProvisioningProfile = {
      id: existing?.id ?? uid('prov'),
      serialNumber: serial,
      oui: input.oui?.trim() || existing?.oui || '',
      manufacturer: input.manufacturer?.trim() || existing?.manufacturer || '',
      wanIndex: input.wanIndex && input.wanIndex > 0 ? input.wanIndex : (existing?.wanIndex ?? 1),
      vlanId: input.vlanId ?? existing?.vlanId ?? null,
      pppoeUsername: input.pppoeUsername?.trim() || existing?.pppoeUsername || '',
      hasPppoePassword: Boolean(input.pppoePassword) || Boolean(existing?.hasPppoePassword),
      wifiIndex: input.wifiIndex && input.wifiIndex > 0 ? input.wifiIndex : (existing?.wifiIndex ?? 1),
      ssid: input.ssid?.trim() || existing?.ssid || '',
      hasSsidKey: Boolean(input.ssidKey) || Boolean(existing?.hasSsidKey),
      wifiEnabled: input.wifiEnabled ?? existing?.wifiEnabled ?? true,
      periodicInformInterval: input.periodicInformInterval ?? existing?.periodicInformInterval ?? null,
      autoApplyOnBoot: input.autoApplyOnBoot ?? existing?.autoApplyOnBoot ?? true,
      status: 'pending',
      lastError: '',
      lastAppliedAt: existing?.lastAppliedAt ?? null,
      createdAt: existing?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };
    set((s) => ({
      provisioningProfiles: existing
        ? s.provisioningProfiles.map((p) => (p.serialNumber.toUpperCase() === serial ? localProfile : p))
        : [localProfile, ...s.provisioningProfiles],
    }));
    return { ok: true, executionMode: 'waiting_for_bootstrap', profile: localProfile };
  },

  deleteProvisioningProfile: async (serialNumber) => {
    if (!get().hasPermission('devices.parameters.write')) {
      return { ok: false, error: 'Permission denied: devices.parameters.write required' };
    }
    const serial = serialNumber.trim().toUpperCase();
    if (!serial) {
      return { ok: false, error: 'Serial number is required' };
    }
    if (get().apiMode === 'backend') {
      try {
        await apiClient.delete(`/provisioning/${encodeURIComponent(serial)}`);
        set((s) => ({
          provisioningProfiles: s.provisioningProfiles.filter((p) => p.serialNumber.toUpperCase() !== serial),
        }));
        return { ok: true };
      } catch (err) {
        return { ok: false, error: extractApiErrorMessage(err, 'Failed to delete provisioning profile') };
      }
    }
    set((s) => ({
      provisioningProfiles: s.provisioningProfiles.filter((p) => p.serialNumber.toUpperCase() !== serial),
    }));
    return { ok: true };
  },

  provisionDeviceNow: async (deviceId, input) => {
    if (!get().hasPermission('devices.parameters.write')) {
      return { ok: false, error: 'Permission denied: devices.parameters.write required' };
    }
    const dev = get().devices.find((d) => d.id === deviceId);
    if (!dev) {
      return { ok: false, error: 'Device not found' };
    }
    if (get().apiMode === 'backend') {
      try {
        const res = await apiClient.post<{
          data?: { profile?: ProvisioningProfile; executionMode?: string };
        }>(`/devices/${deviceId}/provision`, {
          serialNumber: dev.serialNumber,
          oui: input.oui ?? dev.oui,
          manufacturer: input.manufacturer ?? dev.manufacturerCanonical,
          ...input,
        });
        const profile = res.data?.data?.profile;
        const executionMode = res.data?.data?.executionMode;
        if (profile) {
          set((s) => {
            const exists = s.provisioningProfiles.some(
              (p) => p.serialNumber.toUpperCase() === profile.serialNumber.toUpperCase(),
            );
            return {
              provisioningProfiles: exists
                ? s.provisioningProfiles.map((p) =>
                  p.serialNumber.toUpperCase() === profile.serialNumber.toUpperCase() ? profile : p,
                )
                : [profile, ...s.provisioningProfiles],
            };
          });
        }
        void get().refreshBackendData();
        return { ok: true, executionMode };
      } catch (err) {
        return { ok: false, error: extractApiErrorMessage(err, 'Failed to trigger device provisioning') };
      }
    }
    return get().upsertProvisioningProfile({
      serialNumber: dev.serialNumber,
      oui: dev.oui,
      manufacturer: dev.manufacturerCanonical,
      ...input,
    });
  },
}));
