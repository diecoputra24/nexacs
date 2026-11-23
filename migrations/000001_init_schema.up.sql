-- NexaACS Initial Schema Migration (PostgreSQL)
-- Covers all core entities from Blueprint Section 11.1, 11.2, and 11.3

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Tenants (ISP / Organization)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(120) NOT NULL UNIQUE,
    status VARCHAR(32) NOT NULL DEFAULT 'active', -- active, suspended, archived
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active', -- active, locked, disabled
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, email)
);

-- 3. Roles
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, name)
);

-- 4. Permissions (global catalog)
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(120) NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    is_high_risk BOOLEAN NOT NULL DEFAULT FALSE
);

-- 5. User-Roles mapping
CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id)
);

-- 6. Role-Permissions mapping
CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- 7. API Keys
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    name VARCHAR(160) NOT NULL,
    key_prefix VARCHAR(24) NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Device Models Catalog
CREATE TABLE device_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manufacturer VARCHAR(120) NOT NULL,
    model_name VARCHAR(160) NOT NULL,
    product_class VARCHAR(160) NOT NULL DEFAULT '',
    oui VARCHAR(16) NOT NULL DEFAULT '',
    technology VARCHAR(32) NOT NULL DEFAULT 'N/A', -- GPON, EPON, Router, N/A
    validated BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (manufacturer, model_name, product_class, oui)
);

-- 9. Manufacturer Alias Mapping
CREATE TABLE device_manufacturer_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, -- NULL = global seed
    raw_name VARCHAR(160) NOT NULL,
    canonical_name VARCHAR(120) NOT NULL,
    oui VARCHAR(16) NOT NULL DEFAULT '',
    source VARCHAR(64) NOT NULL DEFAULT 'manual', -- seed, manual, auto_oui
    confidence VARCHAR(32) NOT NULL DEFAULT 'high', -- high, medium, low
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, raw_name, oui)
);

-- 10. Data Models (TR-098, TR-181, Vendor)
CREATE TABLE data_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(64) NOT NULL,
    version VARCHAR(64) NOT NULL,
    root_object VARCHAR(120) NOT NULL, -- InternetGatewayDevice., Device.
    description TEXT NOT NULL DEFAULT '',
    UNIQUE (name, version)
);

-- 11. Parameter Definitions (Canonical catalog)
CREATE TABLE parameter_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_key VARCHAR(160) NOT NULL UNIQUE,
    group_name VARCHAR(64) NOT NULL, -- device_info, device_health, wan, wifi, connected_hosts, management
    value_type VARCHAR(32) NOT NULL DEFAULT 'string',
    unit VARCHAR(32) NOT NULL DEFAULT '',
    is_secret BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT NOT NULL DEFAULT ''
);

-- 12. Model Parameter Mappings
CREATE TABLE model_parameter_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID REFERENCES device_models(id) ON DELETE CASCADE, -- NULL = generic fallback for data model
    data_model_id UUID NOT NULL REFERENCES data_models(id) ON DELETE CASCADE,
    protocol VARCHAR(16) NOT NULL DEFAULT 'TR-069', -- TR-069, TR-369
    canonical_key VARCHAR(160) NOT NULL REFERENCES parameter_definitions(canonical_key) ON DELETE CASCADE,
    parameter_path VARCHAR(512) NOT NULL,
    value_type VARCHAR(32) NOT NULL DEFAULT 'string',
    unit VARCHAR(32) NOT NULL DEFAULT '',
    transform_rule VARCHAR(128) NOT NULL DEFAULT 'identity',
    read_write VARCHAR(16) NOT NULL DEFAULT 'R', -- R, RW, W
    firmware_range VARCHAR(128) NOT NULL DEFAULT '*',
    priority INT NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Devices
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    model_id UUID REFERENCES device_models(id) ON DELETE SET NULL,
    serial_number VARCHAR(128) NOT NULL,
    oui VARCHAR(16) NOT NULL DEFAULT '',
    manufacturer_raw VARCHAR(160) NOT NULL DEFAULT '',
    manufacturer_canonical VARCHAR(120) NOT NULL DEFAULT 'N/A',
    manufacturer_source VARCHAR(64) NOT NULL DEFAULT 'unknown',
    manufacturer_confidence VARCHAR(32) NOT NULL DEFAULT 'low',
    product_class VARCHAR(160) NOT NULL DEFAULT '',
    model_name VARCHAR(160) NOT NULL DEFAULT '',
    hardware_version VARCHAR(128) NOT NULL DEFAULT '',
    software_version VARCHAR(128) NOT NULL DEFAULT '',
    technology_raw VARCHAR(64) NOT NULL DEFAULT '',
    technology_normalized VARCHAR(32) NOT NULL DEFAULT 'N/A', -- EPON, GPON, Router, N/A
    protocol VARCHAR(16) NOT NULL DEFAULT 'TR-069', -- TR-069, TR-369
    data_model_root VARCHAR(64) NOT NULL DEFAULT 'InternetGatewayDevice.',
    tr_source_ip INET,
    wan_ip INET,
    pppoe_username VARCHAR(160) NOT NULL DEFAULT '',
    connection_request_url TEXT NOT NULL DEFAULT '',
    status VARCHAR(32) NOT NULL DEFAULT 'never_connected', -- online, offline, never_connected, unknown, disabled
    admin_disabled BOOLEAN NOT NULL DEFAULT FALSE,
    online_threshold_seconds INT NOT NULL DEFAULT 1800,
    periodic_inform_interval INT,
    last_inform_at TIMESTAMPTZ,
    last_seen_source VARCHAR(32) NOT NULL DEFAULT 'cwmp_inform',
    last_summon_at TIMESTAMPTZ,
    last_param_sync_at TIMESTAMPTZ,
    uptime_seconds BIGINT,
    uptime_fetched_at TIMESTAMPTZ,
    rx_power_dbm NUMERIC(7, 3),
    rx_power_fetched_at TIMESTAMPTZ,
    temperature_celsius NUMERIC(6, 2),
    temperature_fetched_at TIMESTAMPTZ,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Partial unique constraint allowing re-enrollment if soft-deleted or strict unique per active tenant device
CREATE UNIQUE INDEX idx_devices_tenant_serial_active ON devices (tenant_id, serial_number) WHERE deleted_at IS NULL;

-- 14. Device Credentials (Encrypted secrets)
CREATE TABLE device_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    credential_scope VARCHAR(32) NOT NULL, -- ont_admin, ont_user, connection_request, acs_auth, pppoe
    username VARCHAR(255) NOT NULL DEFAULT '',
    password_ciphertext BYTEA, -- AES-256-GCM encrypted
    key_version INT NOT NULL DEFAULT 1,
    rotated_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (device_id, credential_scope)
);

-- 15. Device Parameters (Current state & value)
CREATE TABLE device_parameters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    parameter_path VARCHAR(512) NOT NULL,
    canonical_key VARCHAR(160),
    value TEXT,
    value_type VARCHAR(32) NOT NULL DEFAULT 'string',
    read_state VARCHAR(32) NOT NULL DEFAULT 'not_fetched', -- available, unsupported, not_fetched, read_failed, stale, redacted
    is_writable BOOLEAN NOT NULL DEFAULT FALSE,
    is_secret BOOLEAN NOT NULL DEFAULT FALSE,
    source_protocol VARCHAR(16) NOT NULL DEFAULT 'TR-069',
    source_session_id UUID,
    last_attempt_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (device_id, parameter_path)
);

-- 16. Parameter History
CREATE TABLE parameter_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    parameter_path VARCHAR(512) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    source VARCHAR(32) NOT NULL DEFAULT 'summon',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. Device Events
CREATE TABLE device_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    protocol VARCHAR(16) NOT NULL DEFAULT 'TR-069',
    event_code VARCHAR(128) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. Protocol Sessions
CREATE TABLE protocol_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    protocol VARCHAR(16) NOT NULL DEFAULT 'TR-069',
    protocol_version VARCHAR(32) NOT NULL DEFAULT '1.1',
    source_ip INET,
    status VARCHAR(32) NOT NULL DEFAULT 'active', -- active, completed, failed, timeout
    rpc_count INT NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

-- 19. USP Endpoints (TR-369)
CREATE TABLE usp_endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    endpoint_id VARCHAR(255) NOT NULL,
    mtp VARCHAR(32) NOT NULL DEFAULT 'mqtt', -- mqtt, websocket, stomp, coap
    controller_endpoint_id VARCHAR(255) NOT NULL DEFAULT 'proto::nexaacs-controller',
    trust_cert_fingerprint VARCHAR(128) NOT NULL DEFAULT '',
    status VARCHAR(32) NOT NULL DEFAULT 'configured',
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, endpoint_id)
);

-- 20. Summon Jobs
CREATE TABLE summon_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    protocol VARCHAR(16) NOT NULL DEFAULT 'TR-069',
    status VARCHAR(32) NOT NULL DEFAULT 'queued', -- pending, queued, waiting_for_device, executing, completed, failed, timeout, cancelled
    requested_groups JSONB NOT NULL DEFAULT '[]'::jsonb,
    progress_percent INT NOT NULL DEFAULT 0,
    summary_message TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 21. Tasks
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    summon_job_id UUID REFERENCES summon_jobs(id) ON DELETE SET NULL,
    requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    protocol VARCHAR(16) NOT NULL DEFAULT 'TR-069',
    task_type VARCHAR(64) NOT NULL, -- summon, refresh_params, get_parameter_values, set_parameter_values, reboot, factory_reset, download_firmware
    status VARCHAR(32) NOT NULL DEFAULT 'queued', -- pending, queued, waiting_for_device, executing, completed, failed, timeout, cancelled
    idempotency_key VARCHAR(160),
    correlation_id VARCHAR(160) NOT NULL DEFAULT '',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    result JSONB NOT NULL DEFAULT '{}'::jsonb,
    retry_count INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 3,
    lease_owner VARCHAR(128),
    lease_expires_at TIMESTAMPTZ,
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, idempotency_key)
);

-- 22. Task Attempts
CREATE TABLE task_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    attempt_number INT NOT NULL,
    status VARCHAR(32) NOT NULL,
    error_code VARCHAR(64) NOT NULL DEFAULT '',
    error_message TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

-- 23. Task Logs
CREATE TABLE task_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    level VARCHAR(16) NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 24. Faults
CREATE TABLE faults (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    summon_job_id UUID REFERENCES summon_jobs(id) ON DELETE SET NULL,
    protocol VARCHAR(16) NOT NULL DEFAULT 'TR-069',
    category VARCHAR(64) NOT NULL, -- summon_failed, inform_session_failure, connection_request_failed, parameter_read_failed, parameter_write_failed, reboot_failed, factory_reset_failed, firmware_failed, usp_transport_failure, timeout, auth_failure, device_not_reachable, unsupported_parameter_rpc
    operation VARCHAR(64) NOT NULL,
    correlation_id VARCHAR(160) NOT NULL DEFAULT '',
    failed_parameters JSONB NOT NULL DEFAULT '[]'::jsonb,
    error_code VARCHAR(64) NOT NULL DEFAULT '',
    message TEXT NOT NULL,
    sanitized_logs TEXT NOT NULL DEFAULT '',
    status VARCHAR(32) NOT NULL DEFAULT 'open', -- open, acknowledged, resolved, ignored
    retry_count INT NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    resolution_note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 25. Device Groups
CREATE TABLE device_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(160) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, name)
);

-- 26. Device Group Members
CREATE TABLE device_group_members (
    group_id UUID NOT NULL REFERENCES device_groups(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, device_id)
);

-- 27. Firmware Files
CREATE TABLE firmware_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    manufacturer VARCHAR(120) NOT NULL,
    model_name VARCHAR(160) NOT NULL,
    product_class VARCHAR(160) NOT NULL DEFAULT '',
    hardware_revision VARCHAR(128) NOT NULL DEFAULT '*',
    version VARCHAR(128) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    checksum_sha256 CHAR(64) NOT NULL,
    signature_status VARCHAR(32) NOT NULL DEFAULT 'unsigned', -- verified, unsigned, invalid
    release_notes TEXT NOT NULL DEFAULT '',
    storage_path TEXT NOT NULL,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 28. Firmware Deployment Jobs
CREATE TABLE firmware_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    firmware_id UUID NOT NULL REFERENCES firmware_files(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'queued', -- queued, downloading, applying, completed, failed, cancelled
    batch_id UUID,
    progress_percent INT NOT NULL DEFAULT 0,
    error_message TEXT NOT NULL DEFAULT '',
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 29. Audit Logs
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_email VARCHAR(255) NOT NULL DEFAULT 'system',
    action VARCHAR(128) NOT NULL, -- secret.revealed, device.reboot, device.factory_reset, device.delete, firmware.deploy, etc.
    target_type VARCHAR(64) NOT NULL DEFAULT '',
    target_id VARCHAR(128) NOT NULL DEFAULT '',
    source_ip INET,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb, -- Never store secrets here
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 30. System Settings
CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category VARCHAR(64) NOT NULL, -- general, device_status, classification, protocol, security
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, category)
);

-- Required Indexes from Section 11.3
CREATE INDEX idx_devices_tenant_last_inform ON devices (tenant_id, last_inform_at DESC);
CREATE INDEX idx_devices_tenant_status ON devices (tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_devices_manufacturer_model_pc_tech ON devices (tenant_id, manufacturer_canonical, model_name, product_class, technology_normalized) WHERE deleted_at IS NULL;
CREATE INDEX idx_devices_pppoe ON devices (tenant_id, pppoe_username) WHERE deleted_at IS NULL;

CREATE INDEX idx_parameter_history_lookup ON parameter_history (device_id, parameter_path, created_at DESC);
CREATE INDEX idx_device_events_device ON device_events (device_id, created_at DESC);
CREATE INDEX idx_protocol_sessions_device ON protocol_sessions (device_id, started_at DESC);

CREATE INDEX idx_tasks_tenant_status_sched ON tasks (tenant_id, status, scheduled_at);
CREATE INDEX idx_tasks_device ON tasks (device_id, created_at DESC);
CREATE INDEX idx_faults_tenant_created_status ON faults (tenant_id, created_at DESC, status);
CREATE INDEX idx_faults_device ON faults (device_id, created_at DESC);
CREATE INDEX idx_audit_logs_tenant_created ON audit_logs (tenant_id, created_at DESC);
