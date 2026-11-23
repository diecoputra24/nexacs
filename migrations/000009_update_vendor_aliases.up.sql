-- Migration 000009: Remove Nokia, Raisecom, VSOL aliases and add China Mobile & Zimlink
DELETE FROM device_manufacturer_aliases
WHERE canonical_name IN ('Nokia', 'Raisecom', 'VSOL')
   OR raw_name IN ('Nokia', 'ALCL', 'Raisecom', 'Raisecom Technology', 'VSOL', 'V-SOLUTION');

INSERT INTO device_manufacturer_aliases (tenant_id, raw_name, canonical_name, oui, source, confidence, virtual_parameters)
SELECT NULL, v.raw_name, v.canonical_name, v.oui, 'seed', 'high', v.vp::jsonb
FROM (VALUES
  ('China Mobile', 'China Mobile', '', '{
    "serialNumber": "InternetGatewayDevice.DeviceInfo.SerialNumber",
    "manufacturer": "InternetGatewayDevice.DeviceInfo.Manufacturer",
    "oui": "InternetGatewayDevice.DeviceInfo.ManufacturerOUI",
    "productClass": "InternetGatewayDevice.DeviceInfo.ProductClass",
    "modelName": "InternetGatewayDevice.DeviceInfo.ModelName",
    "hardwareVersion": "InternetGatewayDevice.DeviceInfo.HardwareVersion",
    "softwareVersion": "InternetGatewayDevice.DeviceInfo.SoftwareVersion",
    "rxPower": "InternetGatewayDevice.WANDevice.1.X_CMCC_GponInterfaceConfig.RXPower",
    "temperature": "InternetGatewayDevice.WANDevice.1.X_CMCC_GponInterfaceConfig.TransceiverTemperature",
    "uptime": "InternetGatewayDevice.DeviceInfo.UpTime",
    "connectionRequestUrl": "InternetGatewayDevice.ManagementServer.ConnectionRequestURL",
    "periodicInformInterval": "InternetGatewayDevice.ManagementServer.PeriodicInformInterval",
    "wanRoot": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}",
    "wanExternalIp": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.ExternalIPAddress",
    "wanPppoeUsername": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.Username",
    "wanPppoePassword": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.Password",
    "wanVlanId": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.X_CMCC_VLANID",
    "wanStatus": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.ConnectionStatus",
    "wlanRoot": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}",
    "wlanSsid": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.SSID",
    "wlanPassphrase": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.PreSharedKey.1.KeyPassphrase",
    "wlanEnabled": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.Enable",
    "wlanChannel": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.Channel",
    "connectedHostsRoot": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}",
    "hostName": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}.HostName",
    "hostMac": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}.MACAddress",
    "hostIp": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}.IPAddress"
  }'),
  ('CMDC', 'China Mobile', '', '{
    "serialNumber": "InternetGatewayDevice.DeviceInfo.SerialNumber",
    "manufacturer": "InternetGatewayDevice.DeviceInfo.Manufacturer",
    "oui": "InternetGatewayDevice.DeviceInfo.ManufacturerOUI",
    "productClass": "InternetGatewayDevice.DeviceInfo.ProductClass",
    "modelName": "InternetGatewayDevice.DeviceInfo.ModelName",
    "hardwareVersion": "InternetGatewayDevice.DeviceInfo.HardwareVersion",
    "softwareVersion": "InternetGatewayDevice.DeviceInfo.SoftwareVersion",
    "rxPower": "InternetGatewayDevice.WANDevice.1.X_CMCC_GponInterfaceConfig.RXPower",
    "temperature": "InternetGatewayDevice.WANDevice.1.X_CMCC_GponInterfaceConfig.TransceiverTemperature",
    "uptime": "InternetGatewayDevice.DeviceInfo.UpTime",
    "connectionRequestUrl": "InternetGatewayDevice.ManagementServer.ConnectionRequestURL",
    "periodicInformInterval": "InternetGatewayDevice.ManagementServer.PeriodicInformInterval",
    "wanRoot": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}",
    "wanExternalIp": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.ExternalIPAddress",
    "wanPppoeUsername": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.Username",
    "wanPppoePassword": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.Password",
    "wanVlanId": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.X_CMCC_VLANID",
    "wanStatus": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.ConnectionStatus",
    "wlanRoot": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}",
    "wlanSsid": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.SSID",
    "wlanPassphrase": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.PreSharedKey.1.KeyPassphrase",
    "wlanEnabled": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.Enable",
    "wlanChannel": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.Channel",
    "connectedHostsRoot": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}",
    "hostName": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}.HostName",
    "hostMac": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}.MACAddress",
    "hostIp": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}.IPAddress"
  }'),
  ('Zimlink', 'Zimlink', '', '{
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
    "wanStatus": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.ConnectionStatus",
    "wlanRoot": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}",
    "wlanSsid": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.SSID",
    "wlanPassphrase": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.PreSharedKey.1.KeyPassphrase",
    "wlanEnabled": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.Enable",
    "wlanChannel": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.Channel",
    "connectedHostsRoot": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}",
    "hostName": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}.HostName",
    "hostMac": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}.MACAddress",
    "hostIp": "InternetGatewayDevice.LANDevice.1.Hosts.Host.{i}.IPAddress"
  }')
) AS v(raw_name, canonical_name, oui, vp)
WHERE NOT EXISTS (
  SELECT 1 FROM device_manufacturer_aliases existing
  WHERE LOWER(existing.raw_name) = LOWER(v.raw_name)
);
