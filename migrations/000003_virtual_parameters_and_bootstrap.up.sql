-- Migration 000003: Virtual Parameters Catalog & Server Bootstrap Readiness

-- 1. Add virtual_parameters JSONB column to manufacturer aliases (matches 31 frontend VParam keys)
ALTER TABLE device_manufacturer_aliases
    ADD COLUMN IF NOT EXISTS virtual_parameters JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. Add missing canonical parameter definitions used across ONT Info, WAN, WLAN, Hosts, Credentials
INSERT INTO parameter_definitions (canonical_key, group_name, value_type, unit, is_secret, description) VALUES
    ('wan.status', 'wan', 'string', '', FALSE, 'WAN connection operational status'),
    ('wan.vlan_id', 'wan', 'unsignedInt', '', FALSE, 'WAN VLAN ID tag'),
    ('wifi.enabled', 'wifi', 'boolean', '', FALSE, 'WLAN SSID enabled state'),
    ('wifi.channel', 'wifi', 'unsignedInt', '', FALSE, 'WLAN radio channel'),
    ('hosts.hostname', 'connected_hosts', 'string', '', FALSE, 'Connected host device hostname'),
    ('hosts.mac_address', 'connected_hosts', 'string', '', FALSE, 'Connected host MAC address'),
    ('hosts.ip_address', 'connected_hosts', 'string', '', FALSE, 'Connected host IPv4 address'),
    ('credentials.admin_username', 'management', 'string', '', FALSE, 'ONT Admin GUI username'),
    ('credentials.admin_password', 'management', 'string', '', TRUE, 'ONT Admin GUI password'),
    ('credentials.user_username', 'management', 'string', '', FALSE, 'ONT User GUI username'),
    ('credentials.user_password', 'management', 'string', '', TRUE, 'ONT User GUI password')
ON CONFLICT (canonical_key) DO NOTHING;

-- 3. Populate Virtual Parameters JSONB for seeded ZTE / TR-098 compatible aliases
UPDATE device_manufacturer_aliases
SET virtual_parameters = '{
  "serialNumber": "InternetGatewayDevice.DeviceInfo.SerialNumber",
  "manufacturer": "InternetGatewayDevice.DeviceInfo.Manufacturer",
  "oui": "InternetGatewayDevice.DeviceInfo.ManufacturerOUI",
  "productClass": "InternetGatewayDevice.DeviceInfo.ProductClass",
  "modelName": "InternetGatewayDevice.DeviceInfo.ModelName",
  "hardwareVersion": "InternetGatewayDevice.DeviceInfo.HardwareVersion",
  "softwareVersion": "InternetGatewayDevice.DeviceInfo.SoftwareVersion",
  "rxPower": "InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RXPower",
  "temperature": "InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.TransceiverTemperature",
  "uptime": "InternetGatewayDevice.DeviceInfo.UpTime",
  "connectionRequestUrl": "InternetGatewayDevice.ManagementServer.ConnectionRequestURL",
  "periodicInformInterval": "InternetGatewayDevice.ManagementServer.PeriodicInformInterval",
  "wanRoot": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}",
  "wanExternalIp": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.ExternalIPAddress",
  "wanPppoeUsername": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.Username",
  "wanPppoePassword": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.Password",
  "wanVlanId": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.X_ZTE-COM_VLANID",
  "wanStatus": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.ConnectionStatus",
  "wlanRoot": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}",
  "wlanSsid": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.SSID",
  "wlanPassphrase": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.PreSharedKey.1.KeyPassphrase",
  "wlanEnabled": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.Enable",
  "wlanChannel": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.Channel",
  "connectedHostsRoot": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}",
  "hostName": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}.HostName",
  "hostMac": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}.MACAddress",
  "hostIp": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}.IPAddress",
  "adminUsername": "InternetGatewayDevice.UserInterface.X_ZTE-COM_UserInfo.AdminName",
  "adminPassword": "InternetGatewayDevice.UserInterface.X_ZTE-COM_UserInfo.AdminPassword",
  "userUsername": "InternetGatewayDevice.UserInterface.X_ZTE-COM_UserInfo.UserName",
  "userPassword": "InternetGatewayDevice.UserInterface.X_ZTE-COM_UserInfo.UserPassword"
}'::jsonb
WHERE canonical_name IN ('ZTE', 'GM', 'Xtetch', 'Bnetfit', 'Dual Band', 'D-Link', 'TP-Link')
  AND virtual_parameters = '{}'::jsonb;

-- Huawei TR-098 Virtual Parameters
UPDATE device_manufacturer_aliases
SET virtual_parameters = '{
  "serialNumber": "InternetGatewayDevice.DeviceInfo.SerialNumber",
  "manufacturer": "InternetGatewayDevice.DeviceInfo.Manufacturer",
  "oui": "InternetGatewayDevice.DeviceInfo.ManufacturerOUI",
  "productClass": "InternetGatewayDevice.DeviceInfo.ProductClass",
  "modelName": "InternetGatewayDevice.DeviceInfo.ModelName",
  "hardwareVersion": "InternetGatewayDevice.DeviceInfo.HardwareVersion",
  "softwareVersion": "InternetGatewayDevice.DeviceInfo.SoftwareVersion",
  "rxPower": "InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.RXPower",
  "temperature": "InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.TransceiverTemperature",
  "uptime": "InternetGatewayDevice.DeviceInfo.UpTime",
  "connectionRequestUrl": "InternetGatewayDevice.ManagementServer.ConnectionRequestURL",
  "periodicInformInterval": "InternetGatewayDevice.ManagementServer.PeriodicInformInterval",
  "wanRoot": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}",
  "wanExternalIp": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.ExternalIPAddress",
  "wanPppoeUsername": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.Username",
  "wanPppoePassword": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.Password",
  "wanVlanId": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.X_HW_VLAN",
  "wanStatus": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.ConnectionStatus",
  "wlanRoot": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}",
  "wlanSsid": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.SSID",
  "wlanPassphrase": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.PreSharedKey.1.PreSharedKey",
  "wlanEnabled": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.Enable",
  "wlanChannel": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.Channel",
  "connectedHostsRoot": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}",
  "hostName": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}.HostName",
  "hostMac": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}.MACAddress",
  "hostIp": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}.IPAddress",
  "adminUsername": "InternetGatewayDevice.UserInterface.X_HW_WebUserInfo.2.UserName",
  "adminPassword": "InternetGatewayDevice.UserInterface.X_HW_WebUserInfo.2.Password",
  "userUsername": "InternetGatewayDevice.UserInterface.X_HW_WebUserInfo.1.UserName",
  "userPassword": "InternetGatewayDevice.UserInterface.X_HW_WebUserInfo.1.Password"
}'::jsonb
WHERE canonical_name = 'Huawei'
  AND virtual_parameters = '{}'::jsonb;

-- FiberHome / VSOL / Raisecom TR-098 Virtual Parameters
UPDATE device_manufacturer_aliases
SET virtual_parameters = '{
  "serialNumber": "InternetGatewayDevice.DeviceInfo.SerialNumber",
  "manufacturer": "InternetGatewayDevice.DeviceInfo.Manufacturer",
  "oui": "InternetGatewayDevice.DeviceInfo.ManufacturerOUI",
  "productClass": "InternetGatewayDevice.DeviceInfo.ProductClass",
  "modelName": "InternetGatewayDevice.DeviceInfo.ModelName",
  "hardwareVersion": "InternetGatewayDevice.DeviceInfo.HardwareVersion",
  "softwareVersion": "InternetGatewayDevice.DeviceInfo.SoftwareVersion",
  "rxPower": "InternetGatewayDevice.WANDevice.1.X_FH_GponInterfaceConfig.RXPower",
  "temperature": "InternetGatewayDevice.WANDevice.1.X_FH_GponInterfaceConfig.TransceiverTemperature",
  "uptime": "InternetGatewayDevice.DeviceInfo.UpTime",
  "connectionRequestUrl": "InternetGatewayDevice.ManagementServer.ConnectionRequestURL",
  "periodicInformInterval": "InternetGatewayDevice.ManagementServer.PeriodicInformInterval",
  "wanRoot": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}",
  "wanExternalIp": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.ExternalIPAddress",
  "wanPppoeUsername": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.Username",
  "wanPppoePassword": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.Password",
  "wanVlanId": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.X_FH_VLANID",
  "wanStatus": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.ConnectionStatus",
  "wlanRoot": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}",
  "wlanSsid": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.SSID",
  "wlanPassphrase": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.PreSharedKey.1.KeyPassphrase",
  "wlanEnabled": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.Enable",
  "wlanChannel": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.Channel",
  "connectedHostsRoot": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}",
  "hostName": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}.HostName",
  "hostMac": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}.MACAddress",
  "hostIp": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}.IPAddress",
  "adminUsername": "InternetGatewayDevice.DeviceInfo.X_FH_Account.AdminName",
  "adminPassword": "InternetGatewayDevice.DeviceInfo.X_FH_Account.AdminPassword",
  "userUsername": "InternetGatewayDevice.DeviceInfo.X_FH_Account.UserName",
  "userPassword": "InternetGatewayDevice.DeviceInfo.X_FH_Account.UserPassword"
}'::jsonb
WHERE canonical_name IN ('Fiberhome', 'VSOL', 'Raisecom')
  AND virtual_parameters = '{}'::jsonb;

-- Nokia TR-181 (TR-069 Device:2 & TR-369 USP) Virtual Parameters
UPDATE device_manufacturer_aliases
SET virtual_parameters = '{
  "serialNumber": "Device.DeviceInfo.SerialNumber",
  "manufacturer": "Device.DeviceInfo.Manufacturer",
  "oui": "Device.DeviceInfo.ManufacturerOUI",
  "productClass": "Device.DeviceInfo.ProductClass",
  "modelName": "Device.DeviceInfo.ModelName",
  "hardwareVersion": "Device.DeviceInfo.HardwareVersion",
  "softwareVersion": "Device.DeviceInfo.SoftwareVersion",
  "rxPower": "Device.Optical.Interface.1.OpticalSignalLevel",
  "temperature": "Device.DeviceInfo.TemperatureStatus.TemperatureSensor.1.Value",
  "uptime": "Device.DeviceInfo.UpTime",
  "connectionRequestUrl": "Device.ManagementServer.ConnectionRequestURL",
  "periodicInformInterval": "Device.ManagementServer.PeriodicInformInterval",
  "wanRoot": "Device.IP.Interface.{i}",
  "wanExternalIp": "Device.IP.Interface.{i}.IPv4Address.1.IPAddress",
  "wanPppoeUsername": "Device.PPP.Interface.{i}.Username",
  "wanPppoePassword": "Device.PPP.Interface.{i}.Password",
  "wanVlanId": "Device.Ethernet.VLANTermination.{i}.VLANID",
  "wanStatus": "Device.IP.Interface.{i}.Status",
  "wlanRoot": "Device.WiFi.SSID.{i}",
  "wlanSsid": "Device.WiFi.SSID.{i}.SSID",
  "wlanPassphrase": "Device.WiFi.AccessPoint.{i}.Security.KeyPassphrase",
  "wlanEnabled": "Device.WiFi.SSID.{i}.Enable",
  "wlanChannel": "Device.WiFi.Radio.{i}.Channel",
  "connectedHostsRoot": "Device.Hosts.Host.{i}",
  "hostName": "Device.Hosts.Host.{i}.HostName",
  "hostMac": "Device.Hosts.Host.{i}.PhysAddress",
  "hostIp": "Device.Hosts.Host.{i}.IPAddress",
  "adminUsername": "Device.Users.User.1.Username",
  "adminPassword": "Device.Users.User.1.Password",
  "userUsername": "Device.Users.User.2.Username",
  "userPassword": "Device.Users.User.2.Password"
}'::jsonb
WHERE canonical_name = 'Nokia'
  AND virtual_parameters = '{}'::jsonb;

-- 4. Bootstrap default Super Admin user on fresh ACS server setup
INSERT INTO users (id, tenant_id, email, full_name, password_hash, status)
VALUES (
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000001',
    'admin@nexanet.local',
    'NOC Super Admin',
    crypt('NexaACS#2026', gen_salt('bf')),
    'active'
)
ON CONFLICT (tenant_id, email) DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000101'
WHERE EXISTS (SELECT 1 FROM users WHERE id = '00000000-0000-0000-0000-000000000301')
ON CONFLICT DO NOTHING;

-- 5. Sync default protocol endpoint port to 7547 and security defaults
INSERT INTO system_settings (tenant_id, category, settings) VALUES
    ('00000000-0000-0000-0000-000000000001', 'security', '{"require_cwmp_auth": false, "block_private_ssrf_targets": false, "session_ttl_hours": 12}'::jsonb)
ON CONFLICT (tenant_id, category) DO NOTHING;
