DELETE FROM device_manufacturer_aliases
WHERE canonical_name IN ('China Mobile', 'Zimlink')
   OR raw_name IN ('China Mobile', 'CMDC', 'Zimlink');
