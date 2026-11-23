-- Migration 000012: Reclassify GM* models as GM and XST99/XT99 models as Xtetch,
-- and align GM/Xtetch Virtual Parameters with CT-COM optical & credential paths.
UPDATE devices
SET manufacturer_canonical = 'GM',
    manufacturer_source = 'model_map',
    manufacturer_confidence = 'high',
    updated_at = NOW()
WHERE deleted_at IS NULL
  AND (model_name ILIKE 'GM%' OR product_class ILIKE 'GM%')
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

UPDATE device_manufacturer_aliases
SET virtual_parameters = COALESCE(virtual_parameters, '{}'::jsonb) || '{
  "rxPower": "InternetGatewayDevice.WANDevice.1.X_CT-COM_GponInterfaceConfig.RXPower",
  "temperature": "InternetGatewayDevice.WANDevice.1.X_CT-COM_GponInterfaceConfig.TransceiverTemperature",
  "wanVlanId": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.X_CT-COM_VLANID",
  "wanServiceList": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.X_CT-COM_ServiceList",
  "wanPortBindings": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.{i}.WANPPPConnection.1.X_CT-COM_LanInterface",
  "adminUsername": "InternetGatewayDevice.DeviceInfo.X_CT-COM_TeleComAccount.UserName",
  "adminPassword": "InternetGatewayDevice.DeviceInfo.X_CT-COM_TeleComAccount.Password",
  "userUsername": "InternetGatewayDevice.X_CT-COM_UserInfo.UserName",
  "userPassword": "InternetGatewayDevice.X_CT-COM_UserInfo.UserPassword"
}'::jsonb
WHERE canonical_name IN ('GM', 'Xtetch');
