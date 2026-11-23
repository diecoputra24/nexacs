-- Migration 000015: Add default LAN & DHCP Server Virtual Parameters to all manufacturer aliases.
UPDATE device_manufacturer_aliases
SET virtual_parameters = COALESCE(virtual_parameters, '{}'::jsonb) || '{
  "lanIp": "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceIPAddress",
  "lanSubnetMask": "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceSubnetMask",
  "lanDhcpEnable": "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPServerEnable",
  "lanDhcpOption125Enable": "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.X_CT-COM_Option125Enable",
  "lanDhcpLeaseTime": "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPLeaseTime",
  "lanDhcpStartIp": "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MinAddress",
  "lanDhcpEndIp": "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MaxAddress",
  "lanDhcpAssignIspDns": "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.UseAllocatedWAN",
  "lanDhcpDnsServers": "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DNSServers"
}'::jsonb;

UPDATE device_manufacturer_aliases
SET virtual_parameters = virtual_parameters || '{
  "lanDhcpOption125Enable": "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.X_HW_Option125Enable",
  "lanDhcpAssignIspDns": "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.X_HW_DNSRelayEnable"
}'::jsonb
WHERE LOWER(canonical_name) = 'huawei';
