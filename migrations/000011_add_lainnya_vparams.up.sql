-- Migration 000011: Add fallback Virtual Parameters profile for canonical manufacturer 'Lainnya' (CIOT, ZICG, CMHI, etc.)
INSERT INTO device_manufacturer_aliases (tenant_id, raw_name, canonical_name, oui, source, confidence, virtual_parameters)
SELECT NULL, v.raw_name, v.canonical_name, v.oui, 'manual', 'medium', v.vp::jsonb
FROM (VALUES
  ('Lainnya', 'Lainnya', '', '{
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
    "wanVlanId": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.X_CT-COM_VLANID",
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
  }')
) AS v(raw_name, canonical_name, oui, vp)
WHERE NOT EXISTS (
  SELECT 1 FROM device_manufacturer_aliases existing
  WHERE LOWER(existing.canonical_name) = 'lainnya'
);
