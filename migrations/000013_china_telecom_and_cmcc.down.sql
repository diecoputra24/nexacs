-- Rollback migration 000013
DELETE FROM device_manufacturer_aliases WHERE LOWER(canonical_name) = 'china telecom';
DELETE FROM device_manufacturer_aliases WHERE LOWER(raw_name) IN ('cmhi', 'cmcc') AND LOWER(canonical_name) = 'china mobile';
