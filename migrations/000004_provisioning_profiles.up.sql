-- Migration 000004: Zero-Touch Auto-Provisioning Profiles

CREATE TABLE IF NOT EXISTS provisioning_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    serial_number VARCHAR(128) NOT NULL,
    oui VARCHAR(16) NOT NULL DEFAULT '',
    manufacturer VARCHAR(120) NOT NULL DEFAULT '',
    wan_index INT NOT NULL DEFAULT 1,
    vlan_id INT,
    pppoe_username VARCHAR(160) NOT NULL DEFAULT '',
    pppoe_password_ciphertext BYTEA,
    wifi_index INT NOT NULL DEFAULT 1,
    ssid VARCHAR(128) NOT NULL DEFAULT '',
    ssid_key_ciphertext BYTEA,
    wifi_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    periodic_inform_interval INT,
    auto_apply_on_boot BOOLEAN NOT NULL DEFAULT TRUE,
    status VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending, queued, applied, failed
    last_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    last_error TEXT NOT NULL DEFAULT '',
    last_applied_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, serial_number)
);

CREATE INDEX IF NOT EXISTS idx_provisioning_profiles_tenant_status
    ON provisioning_profiles (tenant_id, status, updated_at DESC);
