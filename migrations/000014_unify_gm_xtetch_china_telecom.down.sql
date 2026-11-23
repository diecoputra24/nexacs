-- Rollback migration 000014
UPDATE device_manufacturer_aliases SET canonical_name = 'GM' WHERE LOWER(raw_name) IN ('gm', 'globalmedia');
UPDATE device_manufacturer_aliases SET canonical_name = 'Xtetch' WHERE LOWER(raw_name) = 'xtetch';
