-- Migration 000014: Unify CT-COM OEMs (GM, Xtetch, GlobalMedia) into China Telecom,
-- and CMCC ONTs into China Mobile.

UPDATE device_manufacturer_aliases
SET canonical_name = 'China Telecom',
    virtual_parameters = COALESCE(
      (SELECT virtual_parameters FROM device_manufacturer_aliases WHERE LOWER(canonical_name) = 'china telecom' LIMIT 1),
      virtual_parameters
    )
WHERE LOWER(canonical_name) IN ('gm', 'xtetch');

UPDATE devices
SET manufacturer_canonical = 'China Telecom',
    manufacturer_source = 'vparam_detect',
    manufacturer_confidence = 'high',
    updated_at = NOW()
WHERE deleted_at IS NULL
  AND LOWER(manufacturer_canonical) IN ('gm', 'xtetch');

UPDATE devices d
SET manufacturer_canonical = 'China Mobile',
    manufacturer_source = 'vparam_detect',
    manufacturer_confidence = 'high',
    updated_at = NOW()
WHERE d.deleted_at IS NULL
  AND d.manufacturer_canonical IN ('Lainnya', 'N/A', 'China Telecom', 'China Mobile')
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
  AND d.manufacturer_canonical IN ('Lainnya', 'N/A', 'China Telecom', 'China Mobile')
  AND NOT EXISTS (
    SELECT 1 FROM device_parameters dp
    WHERE dp.device_id = d.id AND dp.parameter_path LIKE '%X_CMCC_%'
  )
  AND EXISTS (
    SELECT 1 FROM device_parameters dp
    WHERE dp.device_id = d.id AND dp.parameter_path LIKE '%X_CT-COM_%'
  )
  AND d.manufacturer_canonical <> 'China Telecom';

