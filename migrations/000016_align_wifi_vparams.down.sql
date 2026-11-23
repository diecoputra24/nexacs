-- Rollback migration 000016
UPDATE device_manufacturer_aliases
SET virtual_parameters = (
  COALESCE(virtual_parameters, '{}'::jsonb) || '{
    "wlanPassphrase": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.PreSharedKey.1.KeyPassphrase",
    "wlanAutoChannel": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}.AutoChannelEnable"
  }'::jsonb
)
WHERE LOWER(canonical_name) = 'china telecom';
