-- Revert model-based reclassification back to Lainnya only if needed
UPDATE devices
SET manufacturer_canonical = 'Lainnya',
    manufacturer_source = 'unmapped_raw',
    manufacturer_confidence = 'low'
WHERE deleted_at IS NULL AND manufacturer_source = 'model_map' AND manufacturer_canonical IN ('GM', 'Xtetch');
