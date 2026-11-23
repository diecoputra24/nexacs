-- Rollback migration 000015
UPDATE device_manufacturer_aliases
SET virtual_parameters = virtual_parameters
  - 'lanIp'
  - 'lanSubnetMask'
  - 'lanDhcpEnable'
  - 'lanDhcpOption125Enable'
  - 'lanDhcpLeaseTime'
  - 'lanDhcpStartIp'
  - 'lanDhcpEndIp'
  - 'lanDhcpAssignIspDns'
  - 'lanDhcpDnsServers';
