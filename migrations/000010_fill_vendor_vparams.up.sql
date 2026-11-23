-- Migration 000010: Populate all 31 Virtual Parameters (including Modem Credentials & WAN/WLAN fields) for China Mobile, Zimlink, and existing TR-098 aliases
UPDATE device_manufacturer_aliases
SET virtual_parameters = virtual_parameters || '{
  "wanAddressingType": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANIPConnection.1.AddressingType",
  "wanSubnetMask": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANIPConnection.1.SubnetMask",
  "wanGateway": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANIPConnection.1.DefaultGateway",
  "wanDnsServers": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANIPConnection.1.DNSServers",
  "wanConnectionType": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.ConnectionType",
  "wanNatEnabled": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.NATEnabled",
  "wlanSecurityMode": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.BeaconType",
  "wlanBand": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.Standard",
  "wlanAutoChannel": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.AutoChannelEnable",
  "adminUsername": "InternetGatewayDevice.DeviceInfo.X_CMCC_TELECOM_Account.AdminName",
  "adminPassword": "InternetGatewayDevice.DeviceInfo.X_CMCC_TELECOM_Account.AdminPassword",
  "userUsername": "InternetGatewayDevice.DeviceInfo.X_CMCC_TELECOM_Account.UserName",
  "userPassword": "InternetGatewayDevice.DeviceInfo.X_CMCC_TELECOM_Account.UserPassword"
}'::jsonb
WHERE canonical_name = 'China Mobile';

UPDATE device_manufacturer_aliases
SET virtual_parameters = virtual_parameters || '{
  "wanVlanId": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.X_CT-COM_VLANID",
  "wanAddressingType": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANIPConnection.1.AddressingType",
  "wanSubnetMask": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANIPConnection.1.SubnetMask",
  "wanGateway": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANIPConnection.1.DefaultGateway",
  "wanDnsServers": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANIPConnection.1.DNSServers",
  "wanConnectionType": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.ConnectionType",
  "wanServiceList": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.X_CT-COM_ServiceList",
  "wanNatEnabled": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.NATEnabled",
  "wanPortBindings": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.X_CT-COM_LanInterface",
  "wlanSecurityMode": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.BeaconType",
  "wlanBand": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.Standard",
  "wlanAutoChannel": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.AutoChannelEnable",
  "adminUsername": "InternetGatewayDevice.DeviceInfo.X_CT-COM_TeleComAccount.UserName",
  "adminPassword": "InternetGatewayDevice.DeviceInfo.X_CT-COM_TeleComAccount.Password",
  "userUsername": "InternetGatewayDevice.UserInterface.X_CT-COM_UserInfo.UserName",
  "userPassword": "InternetGatewayDevice.UserInterface.X_CT-COM_UserInfo.UserPassword"
}'::jsonb
WHERE canonical_name = 'Zimlink';
