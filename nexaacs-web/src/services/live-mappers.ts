import type {
  AuditLogEntry,
  ConnectedHost,
  Device,
  DeviceCredentials,
  DeviceEvent,
  DeviceParameter,
  DhcpServerConfig,
  FaultRecord,
  FirmwareDeploymentJob,
  FirmwareImage,
  ManufacturerAlias,
  ProtocolSession,
  SummonGroup,
  SystemSettings,
  TaskRecord,
  WANConnection,
  WanPortBindings,
  WiFiRadio,
} from '../types';
import { DEFAULT_SETTINGS, VIRTUAL_PARAM_PRESETS } from './seed-data';

export interface ApiDeviceRecord {
  id: string;
  tenant_id?: string;
  serial_number: string;
  oui?: string;
  manufacturer_raw?: string;
  manufacturer_canonical?: string;
  manufacturer_source?: Device['manufacturerSource'];
  manufacturer_confidence?: Device['manufacturerConfidence'];
  product_class?: string;
  model_name?: string;
  hardware_version?: string;
  software_version?: string;
  technology_raw?: string;
  technology_normalized?: Device['technologyNormalized'];
  protocol?: Device['protocol'];
  data_model_root?: Device['dataModelRoot'];
  tr_source_ip?: string;
  wan_ip?: string;
  pppoe_username?: string;
  connection_request_url?: string;
  admin_disabled?: boolean;
  periodic_inform_interval?: number | null;
  last_inform_at?: string | null;
  last_event_code?: string | null;
  last_bootstrap_at?: string | null;
  last_boot_at?: string | null;
  last_summon_at?: string | null;
  last_param_sync_at?: string | null;
  uptime_seconds?: number | null;
  uptime_fetched_at?: string | null;
  rx_power_dbm?: number | null;
  rx_power_fetched_at?: string | null;
  temperature_celsius?: number | null;
  temperature_fetched_at?: string | null;
  deleted_at?: string | null;
}

export function mapApiDeviceToFrontend(
  raw: ApiDeviceRecord,
  existing?: Device,
  parameters?: DeviceParameter[],
): Device {
  return {
    id: raw.id,
    tenantId: raw.tenant_id || existing?.tenantId || '00000000-0000-0000-0000-000000000001',
    serialNumber: raw.serial_number,
    oui: raw.oui ?? existing?.oui ?? '',
    manufacturerRaw: raw.manufacturer_raw ?? existing?.manufacturerRaw ?? '',
    manufacturerCanonical: raw.manufacturer_canonical || existing?.manufacturerCanonical || 'N/A',
    manufacturerSource: raw.manufacturer_source ?? existing?.manufacturerSource ?? 'unknown',
    manufacturerConfidence: raw.manufacturer_confidence ?? existing?.manufacturerConfidence ?? 'low',
    productClass: raw.product_class ?? existing?.productClass ?? '',
    modelName: raw.model_name ?? existing?.modelName ?? '',
    hardwareVersion: raw.hardware_version ?? existing?.hardwareVersion ?? '',
    softwareVersion: raw.software_version ?? existing?.softwareVersion ?? '',
    technologyRaw: raw.technology_raw ?? existing?.technologyRaw ?? '',
    technologyNormalized: raw.technology_normalized ?? existing?.technologyNormalized ?? 'N/A',
    protocol: raw.protocol ?? existing?.protocol ?? 'TR-069',
    dataModelRoot: raw.data_model_root ?? existing?.dataModelRoot ?? 'InternetGatewayDevice.',
    trSourceIp: raw.tr_source_ip || null,
    wanIp: raw.wan_ip || null,
    pppoeUsername: raw.pppoe_username || null,
    connectionRequestUrl: raw.connection_request_url || null,
    adminDisabled: Boolean(raw.admin_disabled),
    deletedAt: raw.deleted_at ?? null,
    deviceGroup: (raw as { device_group?: string }).device_group || existing?.deviceGroup || 'Default-ACS',
    lastInformAt: raw.last_inform_at ?? null,
    lastEventCode: raw.last_event_code ?? existing?.lastEventCode ?? null,
    lastBootstrapAt: raw.last_bootstrap_at ?? existing?.lastBootstrapAt ?? null,
    lastBootAt: raw.last_boot_at ?? existing?.lastBootAt ?? null,
    lastSummonAt: raw.last_summon_at ?? null,
    lastParamSyncAt: raw.last_param_sync_at ?? null,
    periodicInformInterval: raw.periodic_inform_interval ?? null,
    uptimeSeconds: raw.uptime_seconds ?? null,
    uptimeFetchedAt: raw.uptime_fetched_at ?? raw.last_param_sync_at ?? null,
    rxPowerDbm: raw.rx_power_dbm ?? null,
    rxPowerFetchedAt: raw.rx_power_fetched_at ?? raw.last_param_sync_at ?? null,
    temperatureCelsius: raw.temperature_celsius ?? null,
    temperatureFetchedAt: raw.temperature_fetched_at ?? raw.last_param_sync_at ?? null,
    rxReadState: raw.rx_power_dbm !== undefined && raw.rx_power_dbm !== null ? 'available' : 'not_fetched',
    tempReadState:
      raw.temperature_celsius !== undefined && raw.temperature_celsius !== null ? 'available' : 'not_fetched',
    uptimeReadState: raw.uptime_seconds !== undefined && raw.uptime_seconds !== null ? 'available' : 'not_fetched',
    credentials: extractLiveCredentials(parameters, existing?.credentials, raw.last_inform_at),
    wanConnections: extractLiveWanConnections(parameters) ?? existing?.wanConnections ?? null,
    wifiRadios: extractLiveWifiRadios(parameters) ?? existing?.wifiRadios ?? null,
    connectedHosts: extractLiveConnectedHosts(parameters) ?? existing?.connectedHosts ?? null,
    dhcpServer: extractLiveDhcpConfig(parameters) ?? existing?.dhcpServer ?? null,
    sessions: existing?.sessions ?? [],
    events: existing?.events ?? [],
    parameters: parameters ?? existing?.parameters ?? [],
  };
}

function parseBoolParam(val?: string | null): boolean | undefined {
  if (val === undefined || val === null) return undefined;
  const low = val.trim().toLowerCase();
  if (low === 'true' || low === '1' || low === 'up' || low === 'enabled') return true;
  if (low === 'false' || low === '0' || low === 'down' || low === 'disabled') return false;
  return undefined;
}

function parsePortBindingsFromString(raw: string): WanPortBindings {
  const bindings: WanPortBindings = {};
  const upper = raw.toUpperCase();
  if (upper.includes('LAN1') || upper.includes('ETHERNETINTERFACECONFIG.1')) bindings.l1 = true;
  if (upper.includes('LAN2') || upper.includes('ETHERNETINTERFACECONFIG.2')) bindings.l2 = true;
  if (upper.includes('LAN3') || upper.includes('ETHERNETINTERFACECONFIG.3')) bindings.l3 = true;
  if (upper.includes('LAN4') || upper.includes('ETHERNETINTERFACECONFIG.4')) bindings.l4 = true;
  if (upper.includes('SSID1') || upper.includes('WLANCONFIGURATION.1') || upper.includes('WIFI.SSID.1')) bindings.s1 = true;
  if (upper.includes('SSID2') || upper.includes('WLANCONFIGURATION.2') || upper.includes('WIFI.SSID.2')) bindings.s2 = true;
  if (upper.includes('SSID3') || upper.includes('WLANCONFIGURATION.3') || upper.includes('WIFI.SSID.3')) bindings.s3 = true;
  if (upper.includes('SSID4') || upper.includes('WLANCONFIGURATION.4') || upper.includes('WIFI.SSID.4')) bindings.s4 = true;
  return bindings;
}

function normalizeWanStatus(raw?: string | null): WANConnection['status'] {
  const s = (raw ?? '').trim().toLowerCase();
  if (s === 'connected' || s === 'up') return 'Connected';
  if (s === 'connecting' || s === 'pendingdisconnect') return 'Connecting';
  return 'Disconnected';
}

function extractLiveCredentials(
  parameters: DeviceParameter[] | undefined,
  existing: DeviceCredentials | undefined,
  lastInformAt?: string | null,
): DeviceCredentials {
  const base: DeviceCredentials = existing ?? {
    adminUsername: '',
    adminPassword: '',
    userUsername: '',
    userPassword: '',
    connectionRequestUsername: '',
    connectionRequestPassword: '',
    rotatedAt: lastInformAt ?? new Date().toISOString(),
  };
  if (!parameters || parameters.length === 0) return base;
  const next: DeviceCredentials = { ...base };
  for (const p of parameters) {
    if (p.value === null) continue;
    const lp = p.path.toLowerCase();
    if (lp.endsWith('.managementserver.connectionrequestusername') && p.value) {
      next.connectionRequestUsername = p.value;
    } else if ((p.canonicalKey === 'credentials.admin_username' || lp.endsWith('.x_ct-com_telecomaccount.username') || lp.endsWith('.x_cmcc_telecomaccount.username') || lp.endsWith('.x_zte-com_userinfo.adminname')) && p.value) {
      next.adminUsername = p.value;
    } else if ((p.canonicalKey === 'credentials.admin_password' || lp.endsWith('.x_ct-com_telecomaccount.password') || lp.endsWith('.x_cmcc_telecomaccount.password') || lp.endsWith('.x_zte-com_userinfo.adminpassword')) && p.value) {
      next.adminPassword = p.value;
    } else if ((p.canonicalKey === 'credentials.user_username' || lp.endsWith('.x_ct-com_userinfo.username') || lp.endsWith('.x_cmcc_userinfo.username')) && p.value) {
      next.userUsername = p.value;
    } else if ((p.canonicalKey === 'credentials.user_password' || lp.endsWith('.x_ct-com_userinfo.userpassword') || lp.endsWith('.x_cmcc_userinfo.userpassword')) && p.value) {
      next.userPassword = p.value;
    }
  }
  return next;
}

function extractLiveWanConnections(parameters?: DeviceParameter[]): WANConnection[] | null {
  if (!parameters || parameters.length === 0) return null;

  type WanDraft = WANConnection & { _sortKey: string; _hasFields: number; _connDevKey?: string };
  const map = new Map<string, WanDraft>();
  const linkVlanByConnDev = new Map<string, number>();
  const linkVlanTypeByConnDev = new Map<string, 'untag' | 'transparent' | 'tag'>();

  const decodeVlanTypeMode = (raw: string): 'untag' | 'transparent' | 'tag' => {
    const clean = raw.trim().toLowerCase();
    if (clean === '1' || clean === 'transparent') return 'transparent';
    if (clean === '2' || clean === 'tag' || parseBoolParam(clean) === true) return 'tag';
    return 'untag';
  };

  for (const p of parameters) {
    const linkMatch = /^InternetGatewayDevice\.WANDevice\.(\d+)\.WANConnectionDevice\.(\d+)\.X_(?:CT-COM|CMCC)_WAN(?:Gpon|Epon)LinkConfig\.(VLANIDMark|Mode)$/.exec(p.path);
    if (linkMatch && p.value !== null && p.value.trim() !== '') {
      const key = `${linkMatch[1]}:${linkMatch[2]}`;
      if (linkMatch[3] === 'VLANIDMark') {
        const n = Number(p.value);
        if (Number.isFinite(n) && n >= 0) {
          linkVlanByConnDev.set(key, n);
        }
      } else if (linkMatch[3] === 'Mode') {
        linkVlanTypeByConnDev.set(key, decodeVlanTypeMode(p.value));
      }
    }
  }

  const ensureEntry = (key: string, idx: number, connType: WANConnection['connectionType'], defaultName: string): WanDraft => {
    const existing = map.get(key);
    if (existing) return existing;
    const draft: WanDraft = {
      _sortKey: key,
      _hasFields: 0,
      instanceIndex: idx,
      name: defaultName,
      connectionType: connType,
      addressingMode: 'DHCP',
      enabled: true,
      status: 'Disconnected',
      wanIp: '',
      gateway: '',
      dns: '',
      natEnabled: true,
    };
    map.set(key, draft);
    return draft;
  };

  for (const p of parameters) {
    const tr098 = /^InternetGatewayDevice\.WANDevice\.(\d+)\.WANConnectionDevice\.(\d+)\.(WANPPPConnection|WANIPConnection)\.(\d+)\.(.+)$/.exec(p.path);
    if (tr098) {
      const wanDevIdx = Number(tr098[1]);
      const connDevIdx = Number(tr098[2]);
      const objType = tr098[3];
      const connIdx = Number(tr098[4]);
      const leaf = tr098[5];
      const key = `tr098:${String(wanDevIdx).padStart(3, '0')}:${String(connDevIdx).padStart(3, '0')}:${objType}:${String(connIdx).padStart(3, '0')}`;
      const draft = ensureEntry(
        key,
        connDevIdx,
        objType === 'WANPPPConnection' ? 'PPPoE' : 'IPoE',
        `${connDevIdx}_${objType === 'WANPPPConnection' ? 'PPP' : 'IP'}_${connIdx}`,
      );
      draft._connDevKey = `${wanDevIdx}:${connDevIdx}`;
      draft._hasFields++;
      const val = p.value ?? '';
      const lowLeaf = leaf.toLowerCase();
      if (leaf === 'Name' && val) draft.name = val;
      else if (leaf === 'Enable') draft.enabled = parseBoolParam(val) ?? draft.enabled;
      else if (leaf === 'ConnectionStatus') draft.status = normalizeWanStatus(val);
      else if (leaf === 'Uptime' && val !== '' && !Number.isNaN(Number(val))) draft.uptimeSeconds = Number(val);
      else if (leaf === 'ExternalIPAddress') draft.wanIp = val;
      else if (leaf === 'SubnetMask') draft.subnetMask = val;
      else if (leaf === 'DefaultGateway') draft.gateway = val;
      else if (leaf === 'DNSServers') draft.dns = val;
      else if (leaf === 'AddressingType') draft.addressingMode = val.toLowerCase() === 'static' ? 'Static' : 'DHCP';
      else if (leaf === 'ConnectionType' && val.toLowerCase().includes('bridge')) draft.connectionType = 'Bridge';
      else if (leaf === 'Username' && objType === 'WANPPPConnection') draft.pppoeUsername = val;
      else if (leaf === 'Password' && objType === 'WANPPPConnection') draft.pppoePassword = val;
      else if (leaf === 'NATEnabled') draft.natEnabled = parseBoolParam(val) ?? draft.natEnabled;
      else if (lowLeaf === 'x_cu_vlanenabled' || (lowLeaf.includes('vlanenable') && !lowLeaf.includes('multicast'))) {
        draft.vlanEnabled = parseBoolParam(val) ?? draft.vlanEnabled;
      } else if (lowLeaf.includes('vlanmode') && !lowLeaf.includes('multicast')) {
        const decoded = decodeVlanTypeMode(val);
        draft.vlanType = decoded;
        draft.vlanSupportsTransparent = true;
        draft.vlanEnabled = decoded === 'tag';
      } else if (
        !lowLeaf.includes('multicast') &&
        (lowLeaf.includes('vlanid') || lowLeaf === 'x_hw_vlan' || lowLeaf === 'x_cu_vlan' || lowLeaf.endsWith('_vlan')) &&
        val !== '' &&
        !Number.isNaN(Number(val))
      ) {
        const parsedVlan = Number(val);
        if (parsedVlan >= 0 && parsedVlan <= 4094) {
          draft.vlanId = parsedVlan;
        }
      }
      else if (lowLeaf.endsWith('servicelist') && val) draft.serviceList = val;
      else if ((lowLeaf.includes('laninterface') || lowLeaf.includes('lanbinding')) && val) {
        draft.portBindings = { ...(draft.portBindings ?? {}), ...parsePortBindingsFromString(val) };
      }
      continue;
    }

    const tr181 = /^Device\.(PPP|IP)\.Interface\.(\d+)\.(.+)$/.exec(p.path);
    if (tr181) {
      const ifaceType = tr181[1];
      const idx = Number(tr181[2]);
      const leaf = tr181[3];
      const key = `tr181:${ifaceType}:${String(idx).padStart(3, '0')}`;
      const draft = ensureEntry(key, idx, ifaceType === 'PPP' ? 'PPPoE' : 'IPoE', `${ifaceType}_${idx}`);
      draft._hasFields++;
      const val = p.value ?? '';
      if (leaf === 'Name' && val) draft.name = val;
      else if (leaf === 'Enable') draft.enabled = parseBoolParam(val) ?? draft.enabled;
      else if (leaf === 'Status') draft.status = normalizeWanStatus(val);
      else if (leaf === 'Username' && ifaceType === 'PPP') draft.pppoeUsername = val;
      else if (leaf === 'Password' && ifaceType === 'PPP') draft.pppoePassword = val;
      else if (/^IPv4Address\.\d+\.IPAddress$/.test(leaf)) draft.wanIp = val;
      else if (/^IPv4Address\.\d+\.SubnetMask$/.test(leaf)) draft.subnetMask = val;
      else if (/^IPv4Address\.\d+\.AddressingType$/.test(leaf)) draft.addressingMode = val.toLowerCase() === 'static' ? 'Static' : 'DHCP';
      else if (leaf.toLowerCase().endsWith('servicelist') && val) draft.serviceList = val;
    }
  }

  const list = Array.from(map.values())
    .filter((item) => item._hasFields >= 2)
    .sort((a, b) => a._sortKey.localeCompare(b._sortKey));
  if (list.length === 0) return null;

  const seenIdx = new Set<number>();
  return list.map((item, i) => {
    const resolvedIdx = !seenIdx.has(item.instanceIndex) ? item.instanceIndex : Math.max(i + 1, ...Array.from(seenIdx)) + 1;
    seenIdx.add(resolvedIdx);
    const resolvedVlanId = item.vlanId ?? (item._connDevKey ? linkVlanByConnDev.get(item._connDevKey) : undefined);
    const linkVlanType = item._connDevKey ? linkVlanTypeByConnDev.get(item._connDevKey) : undefined;
    const supportsTransparent = Boolean(item.vlanSupportsTransparent || linkVlanType !== undefined);
    const resolvedVlanType: 'untag' | 'transparent' | 'tag' =
      item.vlanType ??
      linkVlanType ??
      ((item.vlanEnabled ?? (resolvedVlanId !== undefined ? resolvedVlanId > 0 : false)) ? 'tag' : 'untag');
    const resolvedVlanEnabled = resolvedVlanType === 'tag';
    return {
      instanceIndex: resolvedIdx,
      name: item.name,
      connectionType: item.connectionType,
      addressingMode: item.addressingMode,
      enabled: item.enabled,
      status: item.status,
      uptimeSeconds: item.uptimeSeconds,
      wanIp: item.wanIp,
      subnetMask: item.subnetMask,
      gateway: item.gateway,
      dns: item.dns,
      pppoeUsername: item.pppoeUsername,
      pppoePassword: item.pppoePassword,
      vlanEnabled: resolvedVlanEnabled,
      vlanType: resolvedVlanType,
      vlanSupportsTransparent: supportsTransparent,
      vlanId: resolvedVlanId,
      serviceList: item.serviceList,
      natEnabled: item.natEnabled,
      portBindings: item.portBindings,
    };
  });
}

function parsePossibleChannels(raw: string): string[] {
  const s = raw.trim();
  if (!s) return [];
  const out = new Set<string>();
  for (const part of s.split(',').map((x) => x.trim()).filter(Boolean)) {
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start > 0 && end >= start && end - start <= 200) {
        for (let c = start; c <= end; c++) out.add(String(c));
        continue;
      }
    }
    if (/^\d+$/.test(part) && Number(part) > 0) out.add(part);
  }
  return Array.from(out);
}

function decodeWifiSecurityEncryption(info: {
  beaconType?: string;
  basicEnc?: string;
  wpaEnc?: string;
  ieee11iEnc?: string;
  tr181Mode?: string;
}): 'None' | 'TKIP' | 'TKIP+AES' | 'AES' {
  const b = (info.beaconType ?? '').trim();
  const basic = (info.basicEnc ?? '').trim();
  const wpa = (info.wpaEnc ?? '').trim();
  const i11 = (info.ieee11iEnc ?? '').trim();
  const tr181 = (info.tr181Mode ?? '').trim();

  if (tr181) {
    if (/^None$/i.test(tr181)) return 'None';
    if (/WPA2-Personal|WPA3/i.test(tr181) && !/WPA-WPA2/i.test(tr181)) return 'AES';
    if (/WPA-WPA2/i.test(tr181)) return 'TKIP+AES';
  }
  if (/^None$/i.test(b) || (/^Basic$/i.test(b) && (!basic || /^None$/i.test(basic)))) {
    return 'None';
  }
  const combined = `${wpa} ${i11}`.toLowerCase();
  const hasTkip = combined.includes('tkip');
  const hasAes = combined.includes('aes');
  if (combined.includes('tkipandaes') || combined.includes('tkip+aes') || (hasTkip && hasAes)) {
    return 'TKIP+AES';
  }
  if (/wpaand11i|wpa\/wpa2/i.test(b) && !hasTkip && !hasAes) {
    return 'TKIP+AES';
  }
  if (hasAes || /^11i$|^wpa2$/i.test(b)) return 'AES';
  if (hasTkip || /^wpa$/i.test(b)) return 'TKIP';
  return 'TKIP+AES';
}

function extractLiveWifiRadios(parameters?: DeviceParameter[]): WiFiRadio[] | null {
  if (!parameters || parameters.length === 0) return null;
  type WifiDraft = WiFiRadio & {
    _hasFields: number;
    _rawChannel?: string;
    _autoChannel?: boolean;
    _channelsInUse?: string;
    _possibleChannels?: string[];
    _beaconType?: string;
    _basicEnc?: string;
    _wpaEnc?: string;
    _ieee11iEnc?: string;
    _tr181Mode?: string;
  };
  const map = new Map<number, WifiDraft>();
  const ensure = (idx: number): WifiDraft => {
    const existing = map.get(idx);
    if (existing) return existing;
    const draft: WifiDraft = {
      _hasFields: 0,
      index: idx,
      ssid: '',
      enabled: false,
      band: idx >= 5 ? '5 GHz' : '2.4 GHz',
      securityMode: 'TKIP+AES',
      channel: 'Auto',
      channelWidth: 'Auto',
      broadcastSsid: true,
      associatedCount: null,
      passphrase: '',
    };
    map.set(idx, draft);
    return draft;
  };

  for (const p of parameters) {
    const tr098 = /^InternetGatewayDevice\.LANDevice\.\d+\.WLANConfiguration\.(\d+)\.(.+)$/.exec(p.path);
    if (tr098) {
      const idx = Number(tr098[1]);
      const leaf = tr098[2];
      const draft = ensure(idx);
      draft._hasFields++;
      const val = p.value ?? '';
      if (leaf === 'SSID') draft.ssid = val;
      else if (leaf === 'Enable') draft.enabled = parseBoolParam(val) ?? draft.enabled;
      else if (leaf === 'BeaconType' && val) draft._beaconType = val;
      else if (leaf === 'BasicEncryptionModes' && val) draft._basicEnc = val;
      else if (leaf === 'WPAEncryptionModes' && val) draft._wpaEnc = val;
      else if (leaf === 'IEEE11iEncryptionModes' && val) draft._ieee11iEnc = val;
      else if (leaf === 'Channel' && val) draft._rawChannel = val;
      else if (leaf === 'ChannelsInUse' && val) draft._channelsInUse = val.split(',')[0].trim();
      else if (leaf === 'PossibleChannels' && val) draft._possibleChannels = parsePossibleChannels(val);
      else if (leaf === 'AutoChannelEnable') draft._autoChannel = parseBoolParam(val);
      else if (leaf === 'Standard' && (/^(a|ac|ax)$/i.test(val.trim()) || /802\.11(a|ac|ax)|5\s*g/i.test(val))) draft.band = '5 GHz';
      else if (leaf === 'SSIDAdvertisementEnabled') draft.broadcastSsid = parseBoolParam(val) ?? draft.broadcastSsid;
      else if (leaf === 'TotalAssociations' && val !== '' && !Number.isNaN(Number(val))) draft.associatedCount = Number(val);
      else if (leaf === 'KeyPassphrase' || /^PreSharedKey\.\d+\.(KeyPassphrase|PreSharedKey)$/.test(leaf)) draft.passphrase = val;
      continue;
    }
    const tr181 = /^Device\.WiFi\.(SSID|Radio|AccessPoint)\.(\d+)\.(.+)$/.exec(p.path);
    if (tr181) {
      const kind = tr181[1];
      const idx = Number(tr181[2]);
      const leaf = tr181[3];
      const draft = ensure(idx);
      draft._hasFields++;
      const val = p.value ?? '';
      if (kind === 'SSID' && leaf === 'SSID') draft.ssid = val;
      else if (kind === 'SSID' && leaf === 'Enable') draft.enabled = parseBoolParam(val) ?? draft.enabled;
      else if (kind === 'Radio' && leaf === 'OperatingFrequencyBand') draft.band = val.includes('5') ? '5 GHz' : '2.4 GHz';
      else if (kind === 'Radio' && leaf === 'Channel' && val) draft._rawChannel = val;
      else if (kind === 'Radio' && leaf === 'ChannelsInUse' && val) draft._channelsInUse = val.split(',')[0].trim();
      else if (kind === 'Radio' && leaf === 'PossibleChannels' && val) draft._possibleChannels = parsePossibleChannels(val);
      else if (kind === 'Radio' && leaf === 'AutoChannelEnable') draft._autoChannel = parseBoolParam(val);
      else if (kind === 'AccessPoint' && leaf === 'Security.ModeEnabled' && val) draft._tr181Mode = val;
      else if (kind === 'AccessPoint' && leaf === 'Security.KeyPassphrase') draft.passphrase = val;
    }
  }

  const list = Array.from(map.values())
    .filter((r) => r._hasFields >= 2)
    .sort((a, b) => a.index - b.index);
  if (list.length === 0) return null;
  return list.map(({
    _hasFields: _,
    _rawChannel,
    _autoChannel,
    _channelsInUse,
    _possibleChannels,
    _beaconType,
    _basicEnc,
    _wpaEnc,
    _ieee11iEnc,
    _tr181Mode,
    ...rest
  }) => {
    const isAuto = Boolean(_autoChannel || _rawChannel === '0' || (!_rawChannel && !_autoChannel));
    const liveActive = _channelsInUse && _channelsInUse !== '0' ? _channelsInUse : (_rawChannel && _rawChannel !== '0' ? _rawChannel : undefined);
    const secMode = decodeWifiSecurityEncryption({
      beaconType: _beaconType,
      basicEnc: _basicEnc,
      wpaEnc: _wpaEnc,
      ieee11iEnc: _ieee11iEnc,
      tr181Mode: _tr181Mode,
    });
    return {
      ...rest,
      band: rest.index >= 5 ? '5 GHz' : rest.band,
      securityMode: secMode,
      channel: isAuto ? 'Auto' : (_rawChannel || 'Auto'),
      activeChannel: liveActive,
      possibleChannels: _possibleChannels && _possibleChannels.length > 0 ? _possibleChannels : undefined,
      passphrase: secMode === 'None' ? '' : rest.passphrase,
    };
  });
}

function extractLiveConnectedHosts(parameters?: DeviceParameter[]): ConnectedHost[] | null {
  if (!parameters || parameters.length === 0) return null;
  type HostDraft = ConnectedHost & { _idx: number };
  const map = new Map<number, HostDraft>();
  const ensure = (idx: number): HostDraft => {
    const existing = map.get(idx);
    if (existing) return existing;
    const draft: HostDraft = {
      _idx: idx,
      hostname: '',
      macAddress: '',
      ipAddress: '',
      interfaceName: '',
      connectionType: 'Unknown',
      active: true,
      lastSeenAt: null,
    };
    map.set(idx, draft);
    return draft;
  };

  for (const p of parameters) {
    const m = /^(?:InternetGatewayDevice\.LANDevice\.\d+\.|Device\.)Hosts\.Host\.(\d+)\.(.+)$/.exec(p.path);
    if (!m) continue;
    const idx = Number(m[1]);
    const leaf = m[2];
    const draft = ensure(idx);
    const val = p.value ?? '';
    if (leaf === 'HostName') draft.hostname = val;
    else if (leaf === 'MACAddress' || leaf === 'PhysAddress') draft.macAddress = val;
    else if (leaf === 'IPAddress') draft.ipAddress = val;
    else if (leaf === 'Layer1Interface' || leaf === 'InterfaceType') {
      draft.interfaceName = val;
      const low = val.toLowerCase();
      if (low.includes('wlan') || low.includes('wifi') || low.includes('802.11')) draft.connectionType = 'WiFi';
      else if (low.includes('eth') || low.includes('lan')) draft.connectionType = 'Ethernet';
    } else if (leaf === 'Active') {
      draft.active = parseBoolParam(val) ?? draft.active;
    }
  }

  const list = Array.from(map.values())
    .filter((h) => h.macAddress || h.ipAddress)
    .sort((a, b) => a._idx - b._idx);
  if (list.length === 0) return null;
  return list.map(({ _idx: _, ...rest }) => rest);
}

function extractLiveDhcpConfig(parameters?: DeviceParameter[]): DhcpServerConfig | null {
  if (!parameters || parameters.length === 0) return null;

  let hasAny = false;
  let lanIp = '';
  let lanSubnetMask = '';
  let dhcpServerEnable: boolean | undefined;
  let option125Enable: boolean | undefined;
  let leaseTimeSeconds: number | undefined;
  let startIp = '';
  let endIp = '';
  let assignIspDnsExplicit: boolean | undefined;
  let dnsServersRaw = '';
  let dns1 = '';
  let dns2 = '';
  let dns3 = '';

  for (const p of parameters) {
    if (p.value === null) continue;
    const val = p.value.trim();
    const lp = p.path.toLowerCase();
    const inLanMgmt =
      lp.includes('.lanhostconfigmanagement.') ||
      lp.startsWith('device.dhcpv4.server.') ||
      lp.startsWith('device.ip.interface.1.');
    if (!inLanMgmt) continue;

    if (lp.endsWith('.ipinterfaceipaddress') || lp.endsWith('.ipv4address.1.ipaddress')) {
      hasAny = true;
      lanIp = val;
    } else if (lp.endsWith('.ipinterfacesubnetmask') || lp.endsWith('.subnetmask') || lp.endsWith('.ipv4address.1.subnetmask')) {
      hasAny = true;
      lanSubnetMask = val;
    } else if (lp.endsWith('.dhcpserverenable') || lp === 'device.dhcpv4.server.enable') {
      hasAny = true;
      dhcpServerEnable = parseBoolParam(val) ?? dhcpServerEnable;
    } else if (lp.includes('option125') && (lp.endsWith('enable') || lp.endsWith('enabled'))) {
      hasAny = true;
      option125Enable = parseBoolParam(val) ?? option125Enable;
    } else if (lp.endsWith('.dhcpleasetime') || lp.endsWith('.leasetime')) {
      hasAny = true;
      const n = Number(val);
      if (Number.isFinite(n) && n > 0) leaseTimeSeconds = Math.round(n);
    } else if (lp.endsWith('.minaddress')) {
      hasAny = true;
      startIp = val;
    } else if (lp.endsWith('.maxaddress')) {
      hasAny = true;
      endIp = val;
    } else if (
      lp.endsWith('.useallocatedwan') ||
      lp.endsWith('.dnsrelayenable') ||
      lp.endsWith('.x_hw_dnsrelayenable') ||
      lp.endsWith('.x_ct-com_dnsrelayenable') ||
      lp.endsWith('.assignispdns')
    ) {
      hasAny = true;
      if (val.toLowerCase() === 'normal' || val.toLowerCase() === 'auto') assignIspDnsExplicit = true;
      else if (val.toLowerCase() === 'passthrough' || val.toLowerCase() === 'static') assignIspDnsExplicit = false;
      else assignIspDnsExplicit = parseBoolParam(val) ?? assignIspDnsExplicit;
    } else if (lp.endsWith('.dnsservers')) {
      hasAny = true;
      dnsServersRaw = val;
    } else if (lp.endsWith('.dnsserver1')) {
      hasAny = true;
      dns1 = val;
    } else if (lp.endsWith('.dnsserver2')) {
      hasAny = true;
      dns2 = val;
    } else if (lp.endsWith('.dnsserver3')) {
      hasAny = true;
      dns3 = val;
    }
  }

  if (!hasAny) return null;

  if (dnsServersRaw && !dns1 && !dns2 && !dns3) {
    const parts = dnsServersRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && s !== '0.0.0.0');
    dns1 = parts[0] ?? '';
    dns2 = parts[1] ?? '';
    dns3 = parts[2] ?? '';
  }

  const assignIspDns = assignIspDnsExplicit ?? (!dns1 && !dns2 && !dns3);
  return {
    lanIp: lanIp || '192.168.1.1',
    lanSubnetMask: lanSubnetMask || '255.255.255.0',
    dhcpServerEnable: dhcpServerEnable ?? true,
    option125Enable: option125Enable ?? false,
    leaseTimeSeconds: leaseTimeSeconds ?? 86400,
    startIp: startIp || '192.168.1.2',
    endIp: endIp || '192.168.1.254',
    assignIspDns,
    dns1,
    dns2,
    dns3,
  };
}

export function mapApiAliasToFrontend(raw: Partial<ManufacturerAlias>): ManufacturerAlias {
  const isTr181 = Object.values(raw.virtualParameters ?? {}).some(
    (v) => typeof v === 'string' && v.startsWith('Device.'),
  );
  return {
    id: raw.id || '',
    rawName: raw.rawName || '',
    canonicalName: raw.canonicalName || '',
    oui: raw.oui || '',
    source: raw.source || 'manual',
    confidence: raw.confidence || 'high',
    virtualParameters: {
      ...(isTr181 ? VIRTUAL_PARAM_PRESETS.nokia_tr181 : VIRTUAL_PARAM_PRESETS.zte_tr098),
      ...(raw.virtualParameters ?? {}),
    },
  };
}

export function mapApiTaskToFrontend(raw: {
  id: string;
  deviceId: string;
  deviceSerial: string;
  protocol: TaskRecord['protocol'];
  taskType: TaskRecord['taskType'];
  status: TaskRecord['status'];
  correlationId?: string;
  payload?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  retryCount?: number;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}): TaskRecord {
  const durationMs =
    raw.startedAt && raw.completedAt
      ? Math.max(0, new Date(raw.completedAt).getTime() - new Date(raw.startedAt).getTime())
      : null;

  const payload = raw.payload ?? undefined;
  const result = raw.result ?? undefined;
  const rawGroups = Array.isArray(payload?.groups)
    ? (payload.groups.filter((g): g is SummonGroup => typeof g === 'string') as SummonGroup[])
    : undefined;
  const payloadReason = typeof payload?.reason === 'string' ? payload.reason : '';
  const requestedBy = payloadReason ? payloadReason : 'acs-api';

  const resultError =
    typeof result?.error === 'string'
      ? result.error
      : typeof result?.message === 'string'
        ? result.message
        : '';
  const updatedParams =
    typeof result?.updated_params === 'number'
      ? result.updated_params
      : typeof result?.updatedParams === 'number'
        ? result.updatedParams
        : typeof result?.parameter_count === 'number'
          ? result.parameter_count
          : null;

  let summary = `${raw.taskType} (${raw.status})`;
  if (resultError) {
    summary = resultError;
  } else if (raw.status === 'completed' && updatedParams !== null) {
    summary = `Completed (${updatedParams} params updated)`;
  } else if (raw.status === 'completed') {
    summary = rawGroups && rawGroups.length > 0 ? `Completed (${rawGroups.join(', ')})` : 'Completed successfully';
  } else if (raw.status === 'queued') {
    summary = rawGroups && rawGroups.length > 0 ? `Queued (${rawGroups.join(', ')})` : 'Waiting in queue';
  } else if (raw.status === 'waiting_for_device') {
    summary = 'Connection Request sent, waiting for CPE Inform session';
  } else if (raw.status === 'executing') {
    summary = 'Executing TR-069/TR-369 RPC';
  }

  const logs: string[] = [];
  logs.push(`[${raw.createdAt}] Task ${raw.taskType} queued (${requestedBy})`);
  if (raw.startedAt) logs.push(`[${raw.startedAt}] Task started`);
  if (raw.completedAt) logs.push(`[${raw.completedAt}] ${summary}`);

  return {
    id: raw.id,
    deviceId: raw.deviceId,
    deviceSerial: raw.deviceSerial,
    requestedBy,
    protocol: raw.protocol || 'TR-069',
    taskType: raw.taskType,
    status: raw.status,
    correlationId: raw.correlationId || raw.id,
    requestedGroups: rawGroups,
    summary,
    durationMs,
    logs,
    createdAt: raw.createdAt,
    startedAt: raw.startedAt ?? null,
    completedAt: raw.completedAt ?? null,
  };
}

export function mapApiEventToFrontend(raw: {
  id: string;
  protocol?: DeviceEvent['protocol'];
  eventCode: string;
  payload?: { CommandKey?: string; commandKey?: string } | null;
  createdAt: string;
}): DeviceEvent {
  const cmdKey = raw.payload?.CommandKey || raw.payload?.commandKey || '';
  const code = raw.eventCode || 'Inform';
  let summary = 'CWMP / USP Inform received';
  if (code.startsWith('0 BOOTSTRAP')) {
    summary = 'First registration or factory reset bootstrap';
  } else if (code.startsWith('1 BOOT')) {
    summary = 'Device reboot / power cycle inform';
  } else if (code.startsWith('2 PERIODIC')) {
    summary = 'Scheduled periodic inform';
  } else if (code.startsWith('4 VALUE CHANGE')) {
    summary = 'Parameter value change notification';
  }
  if (cmdKey) {
    summary = `${summary} (CommandKey: ${cmdKey})`;
  }
  return {
    id: raw.id,
    protocol: raw.protocol || 'TR-069',
    eventCode: code,
    createdAt: raw.createdAt,
    summary,
  };
}

export function mapApiSessionToFrontend(raw: {
  id: string;
  protocol?: ProtocolSession['protocol'];
  protocolVersion?: string;
  sourceIp?: string;
  status?: ProtocolSession['status'];
  rpcCount?: number;
  startedAt: string;
  endedAt?: string | null;
}): ProtocolSession {
  return {
    id: raw.id,
    protocol: raw.protocol || 'TR-069',
    protocolVersion: raw.protocolVersion || '1.1',
    sourceIp: raw.sourceIp || '-',
    status: raw.status || 'completed',
    rpcCount: raw.rpcCount ?? 0,
    startedAt: raw.startedAt,
    endedAt: raw.endedAt ?? null,
  };
}

export function mapApiFaultToFrontend(raw: {
  id: string;
  deviceId: string;
  deviceSerial: string;
  taskId?: string;
  protocol: FaultRecord['protocol'];
  category: FaultRecord['category'];
  operation: string;
  errorCode: string;
  errorMessage: string;
  sanitizedLogs: string;
  status: FaultRecord['status'];
  retryCount: number;
  lastAttemptAt?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
}): FaultRecord {
  return {
    id: raw.id,
    deviceId: raw.deviceId,
    deviceSerial: raw.deviceSerial,
    manufacturerModel: '-',
    ipAddress: null,
    taskId: raw.taskId,
    operation: raw.operation,
    protocol: raw.protocol || 'TR-069',
    category: raw.category,
    correlationId: raw.id,
    failedParameters: [],
    errorCode: raw.errorCode,
    errorMessage: raw.errorMessage,
    sanitizedLogs: raw.sanitizedLogs,
    status: raw.status,
    retryCount: raw.retryCount,
    lastAttemptAt: raw.lastAttemptAt ?? raw.createdAt,
    createdAt: raw.createdAt,
    resolvedAt: raw.resolvedAt ?? null,
  };
}

export function mapApiFirmwareToFrontend(raw: {
  id: string;
  manufacturer: string;
  modelName: string;
  productClass: string;
  hardwareRevision: string;
  version: string;
  fileName: string;
  fileSize: number;
  checksumSha256: string;
  signatureStatus: FirmwareImage['signatureStatus'];
  releaseNotes: string;
  createdAt: string;
}): FirmwareImage {
  return {
    id: raw.id,
    manufacturer: raw.manufacturer,
    modelName: raw.modelName,
    productClass: raw.productClass,
    hardwareRevision: raw.hardwareRevision,
    version: raw.version,
    fileName: raw.fileName,
    fileSizeBytes: raw.fileSize,
    checksumSha256: raw.checksumSha256,
    signatureStatus: raw.signatureStatus || 'unsigned',
    releaseNotes: raw.releaseNotes,
    uploadedAt: raw.createdAt,
  };
}

export function mapApiFirmwareJobToFrontend(raw: {
  id: string;
  firmwareId: string;
  deviceId: string;
  status: FirmwareDeploymentJob['status'];
  progressPercent: number;
  errorMessage?: string;
  createdAt: string;
}): FirmwareDeploymentJob {
  return {
    id: raw.id,
    firmwareId: raw.firmwareId,
    firmwareVersion: '-',
    deviceId: raw.deviceId,
    deviceSerial: raw.deviceId,
    status: raw.status,
    progressPercent: raw.progressPercent,
    scheduledAt: raw.createdAt,
    completedAt: null,
    errorMessage: raw.errorMessage,
  };
}

export function mapApiAuditLogToFrontend(raw: {
  id: string;
  actorUsername?: string;
  actorEmail?: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, string | number | boolean>;
  createdAt: string;
}): AuditLogEntry {
  const actor = raw.actorUsername || raw.actorEmail || 'system';
  return {
    id: raw.id,
    actorUsername: actor,
    actorEmail: actor,
    actorRole: 'Super Admin',
    action: raw.action,
    targetType: raw.targetType,
    targetId: raw.targetId,
    metadata: raw.metadata ?? {},
    createdAt: raw.createdAt,
  };
}

export function mergeBackendSettings(rawCategories: {
  general?: Record<string, unknown>;
  device_status?: Record<string, unknown>;
  classification?: Record<string, unknown>;
  protocol?: Record<string, unknown>;
  auto_summon?: Record<string, unknown>;
}): SystemSettings {
  const g = rawCategories.general ?? {};
  const ds = rawCategories.device_status ?? {};
  const c = rawCategories.classification ?? {};
  const p = rawCategories.protocol ?? {};
  const asCfg = rawCategories.auto_summon ?? {};
  return {
    general: {
      systemName: ((g.systemName ?? g.system_name) as string) ?? DEFAULT_SETTINGS.general.systemName,
      timezone: (g.timezone as string) ?? DEFAULT_SETTINGS.general.timezone,
      dateFormat: ((g.dateFormat ?? g.date_format) as string) ?? DEFAULT_SETTINGS.general.dateFormat,
      defaultPageSize:
        ((g.defaultPageSize ?? g.default_page_size) as number) ?? DEFAULT_SETTINGS.general.defaultPageSize,
      retentionDays: ((g.retentionDays ?? g.retention_days) as number) ?? DEFAULT_SETTINGS.general.retentionDays,
    },
    deviceStatus: {
      onlineThresholdSeconds:
        ((ds.onlineThresholdSeconds ?? ds.online_threshold_seconds) as number) ??
        DEFAULT_SETTINGS.deviceStatus.onlineThresholdSeconds,
      periodicInformExpectationSeconds:
        ((ds.periodicInformExpectationSeconds ?? ds.periodic_inform_expectation_seconds) as number) ??
        DEFAULT_SETTINGS.deviceStatus.periodicInformExpectationSeconds,
      neverConnectedPolicy:
        ((ds.neverConnectedPolicy ??
          ds.never_connected_policy) as SystemSettings['deviceStatus']['neverConnectedPolicy']) ??
        DEFAULT_SETTINGS.deviceStatus.neverConnectedPolicy,
      recalculationIntervalSeconds:
        ((ds.recalculationIntervalSeconds ?? ds.recalculation_interval_seconds) as number) ??
        DEFAULT_SETTINGS.deviceStatus.recalculationIntervalSeconds,
    },
    classification: {
      tempWarningC: ((c.tempWarningC ?? c.temp_warning_c) as number) ?? DEFAULT_SETTINGS.classification.tempWarningC,
      tempCriticalC: ((c.tempCriticalC ?? c.temp_critical_c) as number) ?? DEFAULT_SETTINGS.classification.tempCriticalC,
      rxStrongMinDbm:
        ((c.rxStrongMinDbm ?? c.rx_strong_min_dbm) as number) ?? DEFAULT_SETTINGS.classification.rxStrongMinDbm,
      rxGoodMinDbm: ((c.rxGoodMinDbm ?? c.rx_good_min_dbm) as number) ?? DEFAULT_SETTINGS.classification.rxGoodMinDbm,
      rxAttentionMinDbm:
        ((c.rxAttentionMinDbm ?? c.rx_attention_min_dbm) as number) ??
        DEFAULT_SETTINGS.classification.rxAttentionMinDbm,
      rxWeakMinDbm: ((c.rxWeakMinDbm ?? c.rx_weak_min_dbm) as number) ?? DEFAULT_SETTINGS.classification.rxWeakMinDbm,
    },
    protocol: {
      cwmpEndpoint: ((p.cwmpEndpoint ?? p.cwmp_endpoint) as string) ?? DEFAULT_SETTINGS.protocol.cwmpEndpoint,
      cwmpVersions: ((p.cwmpVersions ?? p.cwmp_versions) as string[]) ?? DEFAULT_SETTINGS.protocol.cwmpVersions,
      sessionTimeoutSeconds:
        ((p.sessionTimeoutSeconds ?? p.session_timeout_seconds) as number) ??
        DEFAULT_SETTINGS.protocol.sessionTimeoutSeconds,
      connectionRequestTimeoutSeconds:
        ((p.connectionRequestTimeoutSeconds ?? p.connection_request_timeout_seconds) as number) ??
        DEFAULT_SETTINGS.protocol.connectionRequestTimeoutSeconds,
      uspControllerId:
        ((p.uspControllerId ?? p.usp_controller_id) as string) ?? DEFAULT_SETTINGS.protocol.uspControllerId,
      uspMtp: ((p.uspMtp ?? p.usp_mtp) as SystemSettings['protocol']['uspMtp']) ?? DEFAULT_SETTINGS.protocol.uspMtp,
      allowAutoEnrollment:
        ((p.allowAutoEnrollment ?? p.allow_auto_enrollment) as boolean) ?? DEFAULT_SETTINGS.protocol.allowAutoEnrollment,
    },
    autoSummon: {
      groups: Array.isArray(asCfg.groups)
        ? (asCfg.groups as SystemSettings['autoSummon']['groups'])
        : DEFAULT_SETTINGS.autoSummon.groups,
      events: Array.isArray(asCfg.events)
        ? (asCfg.events as SystemSettings['autoSummon']['events'])
        : DEFAULT_SETTINGS.autoSummon.events,
      periodicCooldownSeconds:
        ((asCfg.periodicCooldownSeconds ?? asCfg.periodic_cooldown_seconds) as number) ??
        DEFAULT_SETTINGS.autoSummon.periodicCooldownSeconds,
      workerSyncMode:
        ((asCfg.workerSyncMode ??
          asCfg.worker_sync_mode) as SystemSettings['autoSummon']['workerSyncMode']) ??
        DEFAULT_SETTINGS.autoSummon.workerSyncMode,
      workerCooldownSeconds:
        ((asCfg.workerCooldownSeconds ?? asCfg.worker_cooldown_seconds) as number) ??
        DEFAULT_SETTINGS.autoSummon.workerCooldownSeconds,
    },
  };
}
