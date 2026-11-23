UPDATE device_manufacturer_aliases
SET virtual_parameters = virtual_parameters - 'adminUsername' - 'adminPassword' - 'userUsername' - 'userPassword'
WHERE canonical_name IN ('China Mobile', 'Zimlink');
