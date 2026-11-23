-- Migration 000016: Align China Telecom WiFi VParams with live CT-COM device paths
-- (PreSharedKey.1.PreSharedKey instead of nonexistent PreSharedKey.1.KeyPassphrase,
-- and clear nonexistent AutoChannelEnable since CT-COM uses Channel=0 for Auto).
UPDATE device_manufacturer_aliases
SET virtual_parameters = (
  COALESCE(virtual_parameters, '{}'::jsonb) || '{
    "wlanPassphrase": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.PreSharedKey.1.PreSharedKey",
    "wlanAutoChannel": ""
  }'::jsonb
)
WHERE LOWER(canonical_name) = 'china telecom';
