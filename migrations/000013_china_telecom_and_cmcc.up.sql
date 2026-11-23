-- Migration 000013: Classify CT-COM VParam ONTs under 'China Telecom' and CMCC VParam ONTs under 'China Mobile',
-- while preserving GM, Xtetch, Huawei, ZTE, and ensuring GM219-S stays GM.

-- Remove misleading CMDC -> China Mobile alias because live CMDC devices use X_CT-COM_ VParams.
DELETE FROM device_manufacturer_aliases
WHERE LOWER(raw_name) = 'cmdc' AND LOWER(canonical_name) = 'china mobile';

-- Seed / update China Telecom (CT-COM) alias + Virtual Parameters profile.
INSERT INTO device_manufacturer_aliases (tenant_id, raw_name, canonical_name, oui, source, confidence, virtual_parameters)
SELECT NULL, v.raw_name, 'China Telecom', '', 'manual', 'high', '{
  "serialNumber": "InternetGatewayDevice.DeviceInfo.SerialNumber",
  "manufacturer": "InternetGatewayDevice.DeviceInfo.Manufacturer",
  "oui": "InternetGatewayDevice.DeviceInfo.ManufacturerOUI",
  "productClass": "InternetGatewayDevice.DeviceInfo.ProductClass",
  "modelName": "InternetGatewayDevice.DeviceInfo.ModelName",
  "hardwareVersion": "InternetGatewayDevice.DeviceInfo.HardwareVersion",
  "softwareVersion": "InternetGatewayDevice.DeviceInfo.SoftwareVersion",
  "rxPower": "InternetGatewayDevice.WANDevice.1.X_CT-COM_GponInterfaceConfig.RXPower",
  "temperature": "InternetGatewayDevice.WANDevice.1.X_CT-COM_GponInterfaceConfig.TransceiverTemperature",
  "uptime": "InternetGatewayDevice.DeviceInfo.UpTime",
  "connectionRequestUrl": "InternetGatewayDevice.ManagementServer.ConnectionRequestURL",
  "periodicInformInterval": "InternetGatewayDevice.ManagementServer.PeriodicInformInterval",
  "wanRoot": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}",
  "wanExternalIp": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.ExternalIPAddress",
  "wanPppoeUsername": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.Username",
  "wanPppoePassword": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.Password",
  "wanVlanId": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.X_CT-COM_WANGponLinkConfig.VLANIDMark",
  "wanStatus": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.ConnectionStatus",
  "wanAddressingType": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANIPConnection.1.AddressingType",
  "wanSubnetMask": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANIPConnection.1.SubnetMask",
  "wanGateway": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANIPConnection.1.DefaultGateway",
  "wanDnsServers": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANIPConnection.1.DNSServers",
  "wanConnectionType": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.ConnectionType",
  "wanServiceList": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.X_CT-COM_ServiceList",
  "wanNatEnabled": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.NATEnabled",
  "wanPortBindings": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.X_CT-COM_LanInterface",
  "wlanRoot": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}",
  "wlanSsid": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.SSID",
  "wlanPassphrase": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.PreSharedKey.1.KeyPassphrase",
  "wlanEnabled": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.Enable",
  "wlanChannel": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.Channel",
  "wlanSecurityMode": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.BeaconType",
  "wlanBand": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.Standard",
  "wlanAutoChannel": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.AutoChannelEnable",
  "connectedHostsRoot": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}",
  "hostName": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}.HostName",
  "hostMac": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}.MACAddress",
  "hostIp": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}.IPAddress",
  "adminUsername": "InternetGatewayDevice.DeviceInfo.X_CT-COM_TeleComAccount.UserName",
  "adminPassword": "InternetGatewayDevice.DeviceInfo.X_CT-COM_TeleComAccount.Password",
  "userUsername": "InternetGatewayDevice.X_CT-COM_UserInfo.UserName",
  "userPassword": "InternetGatewayDevice.X_CT-COM_UserInfo.UserPassword"
}'::jsonb
FROM (VALUES ('China Telecom'), ('CT-COM')) AS v(raw_name)
WHERE NOT EXISTS (
  SELECT 1 FROM device_manufacturer_aliases existing
  WHERE LOWER(existing.raw_name) = LOWER(v.raw_name) AND LOWER(existing.canonical_name) = 'china telecom'
);

-- Ensure China Mobile also includes CMHI raw alias + CMCC VLANIDMark/TeleComAccount paths.
INSERT INTO device_manufacturer_aliases (tenant_id, raw_name, canonical_name, oui, source, confidence, virtual_parameters)
SELECT NULL, v.raw_name, 'China Mobile', '', 'manual', 'high', cm.virtual_parameters
FROM (VALUES ('CMHI'), ('CMCC')) AS v(raw_name)
JOIN device_manufacturer_aliases cm ON LOWER(cm.canonical_name) = 'china mobile'
WHERE NOT EXISTS (
  SELECT 1 FROM device_manufacturer_aliases existing
  WHERE LOWER(existing.raw_name) = LOWER(v.raw_name)
)
LIMIT 2;

UPDATE device_manufacturer_aliases
SET virtual_parameters = COALESCE(virtual_parameters, '{}'::jsonb) || '{
  "rxPower": "InternetGatewayDevice.WANDevice.1.X_CMCC_GponInterfaceConfig.RXPower",
  "temperature": "InternetGatewayDevice.WANDevice.1.X_CMCC_GponInterfaceConfig.TransceiverTemperature",
  "wanVlanId": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.X_CMCC_VLANIDMark",
  "wanServiceList": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.X_CMCC_ServiceList",
  "wanPortBindings": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.X_CMCC_LanInterface",
  "adminUsername": "InternetGatewayDevice.DeviceInfo.X_CMCC_TeleComAccount.Username",
  "adminPassword": "InternetGatewayDevice.DeviceInfo.X_CMCC_TeleComAccount.Password",
  "userUsername": "InternetGatewayDevice.X_CMCC_UserInfo.UserName",
  "userPassword": "InternetGatewayDevice.X_CMCC_UserInfo.UserPassword"
}'::jsonb
WHERE LOWER(canonical_name) = 'china mobile';

-- Keep GM and Xtetch model classifications consistent (including GM219-S).
UPDATE devices
SET manufacturer_canonical = 'GM',
    manufacturer_source = 'model_map',
    manufacturer_confidence = 'high',
    updated_at = NOW()
WHERE deleted_at IS NULL
  AND (model_name ILIKE 'GM%' OR product_class ILIKE 'GM%' OR model_name ILIKE '%ZX-F663NV3a%')
  AND manufacturer_canonical <> 'GM';

UPDATE devices
SET manufacturer_canonical = 'Xtetch',
    manufacturer_source = 'model_map',
    manufacturer_confidence = 'high',
    updated_at = NOW()
WHERE deleted_at IS NULL
  AND (
    model_name ILIKE '%XST99%' OR model_name ILIKE '%XT99%' OR
    product_class ILIKE '%XST99%' OR product_class ILIKE '%XT99%'
  )
  AND manufacturer_canonical <> 'Xtetch';

-- Classify generic/auto-detected ONTs by their VParam vendor family: CMCC -> China Mobile, CT-COM -> China Telecom.
UPDATE devices d
SET manufacturer_canonical = 'China Mobile',
    manufacturer_source = 'vparam_detect',
    manufacturer_confidence = 'high',
    updated_at = NOW()
WHERE d.deleted_at IS NULL
  AND d.manufacturer_canonical IN ('Lainnya', 'N/A', 'China Mobile', 'China Telecom')
  AND EXISTS (
    SELECT 1 FROM device_parameters dp
    WHERE dp.device_id = d.id AND dp.parameter_path LIKE '%X_CMCC_%'
  )
  AND d.manufacturer_canonical <> 'China Mobile';

UPDATE devices d
SET manufacturer_canonical = 'China Telecom',
    manufacturer_source = 'vparam_detect',
    manufacturer_confidence = 'high',
    updated_at = NOW()
WHERE d.deleted_at IS NULL
  AND d.manufacturer_canonical IN ('Lainnya', 'N/A', 'China Mobile', 'China Telecom')
  AND NOT EXISTS (
    SELECT 1 FROM device_parameters dp
    WHERE dp.device_id = d.id AND dp.parameter_path LIKE '%X_CMCC_%'
  )
  AND EXISTS (
    SELECT 1 FROM device_parameters dp
    WHERE dp.device_id = d.id AND dp.parameter_path LIKE '%X_CT-COM_%'
  )
  AND d.manufacturer_canonical <> 'China Telecom';
