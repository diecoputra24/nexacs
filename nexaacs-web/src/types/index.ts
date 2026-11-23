export type DeviceStatus =
  | 'online'
  | 'offline'
  | 'never_connected'
  | 'unknown'
  | 'disabled';

export type ProtocolType = 'TR-069' | 'TR-369';

export type TechnologyType = 'EPON' | 'GPON' | 'Router' | 'N/A';

export type ParameterReadState =
  | 'available'
  | 'unsupported'
  | 'not_fetched'
  | 'read_failed'
  | 'stale'
  | 'redacted';

export type TaskStatus =
  | 'pending'
  | 'queued'
  | 'waiting_for_device'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'cancelled';

export type TaskType =
  | 'summon'
  | 'refresh_params'
  | 'get_parameter_values'
  | 'set_parameter_values'
  | 'add_object'
  | 'delete_object'
  | 'reboot'
  | 'factory_reset'
  | 'download_firmware';

export type SummonGroup =
  | 'optical_health'
  | 'wan_summary'
  | 'device_info'
  | 'device_health'
  | 'wan'
  | 'wifi'
  | 'connected_hosts'
  | 'credentials'
  | 'vparams'
  | 'parameters';

export type FaultCategory =
  | 'summon_failed'
  | 'inform_session_failure'
  | 'connection_request_failed'
  | 'parameter_read_failed'
  | 'parameter_write_failed'
  | 'reboot_failed'
  | 'factory_reset_failed'
  | 'firmware_failed'
  | 'usp_transport_failure'
  | 'timeout'
  | 'auth_failure'
  | 'device_not_reachable'
  | 'unsupported_parameter_rpc';

export type FaultStatus = 'open' | 'acknowledged' | 'resolved' | 'ignored';

export type RoleName = 'Super Admin' | 'NOC Engineer' | 'Technician' | 'Viewer';

export type PermissionCode =
  | 'overview.view'
  | 'devices.view'
  | 'devices.summon'
  | 'devices.parameters.write'
  | 'devices.secrets.view'
  | 'devices.credentials.edit'
  | 'devices.reboot'
  | 'devices.factory_reset'
  | 'devices.delete'
  | 'faults.view'
  | 'faults.manage'
  | 'firmware.view'
  | 'firmware.deploy'
  | 'security.users.manage'
  | 'security.trust.manage'
  | 'security.audit.view'
  | 'settings.view'
  | 'settings.manage';

export interface DeviceParameter {
  path: string;
  canonicalKey?: string;
  value: string | null;
  valueType: string;
  readState: ParameterReadState;
  isWritable: boolean;
  isSecret: boolean;
  sourceProtocol: ProtocolType;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
}

export interface WanPortBindings {
  l1?: boolean;
  l2?: boolean;
  l3?: boolean;
  l4?: boolean;
  s1?: boolean;
  s2?: boolean;
  s3?: boolean;
  s4?: boolean;
}

export interface WANConnection {
  instanceIndex: number;
  objectPath?: string;
  connectionDevicePath?: string;
  name: string;
  connectionType: 'PPPoE' | 'IPoE' | 'Bridge';
  addressingMode?: 'DHCP' | 'Static';
  enabled: boolean;
  status: 'Connected' | 'Disconnected' | 'Connecting';
  uptimeSeconds?: number;
  wanIp: string;
  subnetMask?: string;
  gateway: string;
  dns: string;
  pppoeUsername?: string;
  pppoePassword?: string;
  vlanEnabled?: boolean;
  vlanType?: 'untag' | 'transparent' | 'tag';
  vlanSupportsTransparent?: boolean;
  vlanId?: number;
  serviceList?: string;
  natEnabled?: boolean;
  portBindings?: WanPortBindings;
}

export interface PlatformUser {
  id: string;
  username: string;
  fullName: string;
  role: RoleName;
  status: 'active' | 'disabled';
  lastLoginAt: string | null;
  createdAt: string;
  password?: string;
}

export interface RoleDefinition {
  id: string;
  name: RoleName;
  description: string;
  isSystem: boolean;
  permissions: PermissionCode[];
}

export interface WiFiRadio {
  index: number;
  ssid: string;
  enabled: boolean;
  band: '2.4 GHz' | '5 GHz';
  securityMode: string;
  channel: string;
  activeChannel?: string;
  possibleChannels?: string[];
  channelWidth: string;
  maxRate?: string;
  broadcastSsid: boolean;
  associatedCount: number | null;
  passphrase: string; // Stored internally in simulator; masked unless revealed with permission
}

export interface ConnectedHost {
  hostname: string;
  macAddress: string;
  ipAddress: string;
  interfaceName: string;
  connectionType: 'Ethernet' | 'WiFi' | 'Unknown';
  active: boolean;
  lastSeenAt: string | null;
}

export interface DeviceCredentials {
  adminUsername: string;
  adminPassword: string;
  userUsername: string;
  userPassword: string;
  connectionRequestUsername: string;
  connectionRequestPassword: string;
  rotatedAt: string;
}

export interface ProtocolSession {
  id: string;
  protocol: ProtocolType;
  protocolVersion: string;
  sourceIp: string;
  status: 'active' | 'completed' | 'failed';
  rpcCount: number;
  startedAt: string;
  endedAt: string | null;
}

export interface DeviceEvent {
  id: string;
  eventCode: string;
  protocol: ProtocolType;
  createdAt: string;
  summary: string;
}

export interface TelemetrySample {
  metric: string;
  value: string;
  recordedAt: string;
}

export interface BucketCount {
  name: string;
  value: number;
}

export interface OverviewStats {
  total: number;
  online: number;
  offline: number;
  neverConnected: number;
  disabled: number;
  availabilityPct: number;
  statusBuckets: BucketCount[];
  uptimeBuckets: BucketCount[];
  tempBuckets: BucketCount[];
  rxBuckets: BucketCount[];
  techBuckets: BucketCount[];
  protocolBuckets: BucketCount[];
  manufacturers: BucketCount[];
  productClasses: BucketCount[];
  models: BucketCount[];
  filterManufacturers: string[];
  filterModels: string[];
  filterProductClasses: string[];
  filterDeviceGroups?: string[];
}

export interface Device {
  id: string;
  tenantId: string;
  serialNumber: string;
  oui: string;
  manufacturerRaw: string;
  manufacturerCanonical: string;
  manufacturerSource: string;
  manufacturerConfidence: 'high' | 'medium' | 'low';
  productClass: string;
  modelName: string;
  hardwareVersion: string;
  softwareVersion: string;
  technologyRaw: string;
  technologyNormalized: TechnologyType;
  protocol: ProtocolType;
  dataModelRoot: 'InternetGatewayDevice.' | 'Device.';
  trSourceIp: string | null;
  wanIp: string | null;
  pppoeUsername: string | null;
  connectionRequestUrl: string | null;
  adminDisabled: boolean;
  deletedAt: string | null;
  deviceGroup: string;
  lastInformAt: string | null;
  lastEventCode?: string | null;
  lastBootstrapAt?: string | null;
  lastBootAt?: string | null;
  lastSummonAt: string | null;
  lastParamSyncAt: string | null;
  periodicInformInterval: number | null;
  uptimeSeconds: number | null;
  uptimeFetchedAt: string | null;
  rxPowerDbm: number | null;
  rxPowerFetchedAt: string | null;
  temperatureCelsius: number | null;
  temperatureFetchedAt: string | null;
  rxReadState: ParameterReadState;
  tempReadState: ParameterReadState;
  uptimeReadState: ParameterReadState;
  credentials: DeviceCredentials;
  wanConnections: WANConnection[] | null;
  wifiRadios: WiFiRadio[] | null;
  connectedHosts: ConnectedHost[] | null;
  dhcpServer?: DhcpServerConfig | null;
  parameters: DeviceParameter[];
  sessions: ProtocolSession[];
  events: DeviceEvent[];
  telemetryHistory?: TelemetrySample[];
  simulatedUnreachable?: boolean;
}

export interface TaskRecord {
  id: string;
  deviceId: string;
  deviceSerial: string;
  summonJobId?: string;
  requestedBy: string;
  protocol: ProtocolType;
  taskType: TaskType;
  status: TaskStatus;
  correlationId: string;
  requestedGroups?: SummonGroup[];
  summary: string;
  durationMs: number | null;
  logs: string[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface SummonQueueSummary {
  activeCount: number;
  queuedCount: number;
  waitingCount: number;
  executingCount: number;
}

export interface FaultRecord {
  id: string;
  deviceId: string;
  deviceSerial: string;
  manufacturerModel: string;
  ipAddress: string | null;
  taskId?: string;
  summonJobId?: string;
  operation: string;
  protocol: ProtocolType;
  category: FaultCategory;
  correlationId: string;
  failedParameters: string[];
  errorCode: string;
  errorMessage: string;
  sanitizedLogs: string;
  status: FaultStatus;
  retryCount: number;
  lastAttemptAt: string;
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote?: string;
}

export interface FirmwareImage {
  id: string;
  manufacturer: string;
  modelName: string;
  productClass: string;
  hardwareRevision: string;
  version: string;
  fileName: string;
  fileSizeBytes: number;
  checksumSha256: string;
  signatureStatus: 'verified' | 'unsigned' | 'invalid';
  releaseNotes: string;
  uploadedAt: string;
}

export interface FirmwareDeploymentJob {
  id: string;
  firmwareId: string;
  firmwareVersion: string;
  deviceId: string;
  deviceSerial: string;
  status: 'queued' | 'downloading' | 'applying' | 'completed' | 'failed';
  progressPercent: number;
  scheduledAt: string;
  completedAt: string | null;
  errorMessage?: string;
}

export interface AuditLogEntry {
  id: string;
  actorUsername: string;
  actorEmail?: string;
  actorRole: RoleName;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, string | number | boolean>;
  createdAt: string;
}

export interface VirtualParameterMapping {
  // Device Info & Identity
  serialNumber: string;
  manufacturer: string;
  oui: string;
  productClass: string;
  modelName: string;
  hardwareVersion: string;
  softwareVersion: string;
  // Health Telemetry & Management
  rxPower: string;
  temperature: string;
  uptime: string;
  connectionRequestUrl: string;
  periodicInformInterval: string;
  // WAN Connections
  wanRoot: string;
  wanExternalIp: string;
  wanPppoeUsername: string;
  wanPppoePassword: string;
  wanVlanId: string;
  wanStatus: string;
  wanAddressingType?: string;
  wanSubnetMask?: string;
  wanGateway?: string;
  wanDnsServers?: string;
  wanConnectionType?: string;
  wanServiceList?: string;
  wanNatEnabled?: string;
  wanPortBindings?: string;
  // WiFi Configuration
  wlanRoot: string;
  wlanSsid: string;
  wlanPassphrase: string;
  wlanEnabled: string;
  wlanChannel: string;
  wlanSecurityMode?: string;
  wlanBand?: string;
  wlanAutoChannel?: string;
  // Connected Hosts
  connectedHostsRoot: string;
  hostName: string;
  hostMac: string;
  hostIp: string;
  // LAN & DHCP Server
  lanIp?: string;
  lanSubnetMask?: string;
  lanDhcpEnable?: string;
  lanDhcpOption125Enable?: string;
  lanDhcpLeaseTime?: string;
  lanDhcpStartIp?: string;
  lanDhcpEndIp?: string;
  lanDhcpAssignIspDns?: string;
  lanDhcpDnsServers?: string;
  // Modem Credentials
  adminUsername: string;
  adminPassword: string;
  userUsername: string;
  userPassword: string;
}

export interface DhcpServerConfig {
  lanIp: string;
  lanSubnetMask: string;
  dhcpServerEnable: boolean;
  option125Enable: boolean;
  leaseTimeSeconds: number;
  startIp: string;
  endIp: string;
  assignIspDns: boolean;
  dns1: string;
  dns2: string;
  dns3: string;
}

export interface ManufacturerAlias {
  id: string;
  rawName: string;
  canonicalName: string;
  oui: string;
  source: 'seed' | 'manual' | 'auto_oui';
  confidence: 'high' | 'medium' | 'low';
  virtualParameters: VirtualParameterMapping;
}

export interface SystemSettings {
  general: {
    systemName: string;
    timezone: string;
    dateFormat: string;
    defaultPageSize: number;
    retentionDays: number;
  };
  deviceStatus: {
    onlineThresholdSeconds: number;
    periodicInformExpectationSeconds: number;
    neverConnectedPolicy: 'separate_bucket' | 'treat_unknown';
    recalculationIntervalSeconds: number;
  };
  classification: {
    tempWarningC: number;
    tempCriticalC: number;
    rxStrongMinDbm: number;
    rxGoodMinDbm: number;
    rxAttentionMinDbm: number;
    rxWeakMinDbm: number;
  };
  protocol: {
    cwmpEndpoint: string;
    cwmpVersions: string[];
    sessionTimeoutSeconds: number;
    connectionRequestTimeoutSeconds: number;
    uspControllerId: string;
    uspMtp: 'mqtt' | 'websocket' | 'stomp' | 'coap';
    allowAutoEnrollment: boolean;
  };
  autoSummon: {
    groups: SummonGroup[];
    events: Array<'0 BOOTSTRAP' | '1 BOOT' | '4 VALUE CHANGE' | '2 PERIODIC'>;
    periodicCooldownSeconds: number;
    workerSyncMode: 'first_detect_only' | 'realtime_loop' | 'off';
    workerCooldownSeconds: number;
  };
}

export interface DeviceListPageQuery {
  page: number;
  limit: number;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  filter?: DashboardFilter;
}

export interface RealtimeEvent {
  id: string;
  type:
    | 'device.registered'
    | 'device.status.changed'
    | 'device.inform.received'
    | 'summon.started'
    | 'summon.progress'
    | 'summon.completed'
    | 'summon.failed'
    | 'task.started'
    | 'task.completed'
    | 'task.failed'
    | 'fault.created'
    | 'fault.resolved'
    | 'firmware.progress';
  deviceId?: string;
  message: string;
  timestamp: string;
}

export interface DashboardFilter {
  manufacturer?: string;
  model?: string;
  productClass?: string;
  technology?: string;
  statusBucket?: string;
  uptimeBucket?: string;
  tempBucket?: string;
  rxBucket?: string;
  protocol?: string;
  deviceGroup?: string;
}

export type ProvisioningStatus = 'pending' | 'queued' | 'applied' | 'failed';

export interface ProvisioningProfile {
  id: string;
  serialNumber: string;
  oui: string;
  manufacturer: string;
  wanIndex: number;
  vlanId: number | null;
  pppoeUsername: string;
  hasPppoePassword: boolean;
  wifiIndex: number;
  ssid: string;
  hasSsidKey: boolean;
  wifiEnabled: boolean;
  periodicInformInterval: number | null;
  autoApplyOnBoot: boolean;
  status: ProvisioningStatus;
  lastTaskId?: string | null;
  lastError: string;
  lastAppliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProvisioningInput {
  serialNumber: string;
  oui?: string;
  manufacturer?: string;
  wanIndex?: number;
  vlanId?: number | null;
  pppoeUsername?: string;
  pppoePassword?: string;
  wifiIndex?: number;
  ssid?: string;
  ssidKey?: string;
  wifiEnabled?: boolean;
  periodicInformInterval?: number | null;
  autoApplyOnBoot?: boolean;
}

