-- Rollback Seed Defaults
DELETE FROM system_settings WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM model_parameter_mappings WHERE model_id IS NULL;
DELETE FROM parameter_definitions;
DELETE FROM data_models;
DELETE FROM device_manufacturer_aliases WHERE tenant_id IS NULL;
DELETE FROM roles WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM permissions;
DELETE FROM tenants WHERE id = '00000000-0000-0000-0000-000000000001';
