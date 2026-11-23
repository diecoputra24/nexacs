DROP INDEX IF EXISTS idx_devices_tenant_group;
ALTER TABLE devices DROP COLUMN IF EXISTS device_group;
