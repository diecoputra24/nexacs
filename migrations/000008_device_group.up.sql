ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS device_group VARCHAR(64) NOT NULL DEFAULT 'Default-ACS';

CREATE INDEX IF NOT EXISTS idx_devices_tenant_group
    ON devices (tenant_id, device_group);
