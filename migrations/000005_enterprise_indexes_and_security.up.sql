-- Migration 000005: Enterprise Performance Indexes
CREATE INDEX IF NOT EXISTS idx_device_parameters_device_path
    ON device_parameters (device_id, parameter_path);

CREATE INDEX IF NOT EXISTS idx_tasks_tenant_created
    ON tasks (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_device_created
    ON tasks (device_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_faults_tenant_status_created
    ON faults (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created
    ON audit_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_device_events_device_created
    ON device_events (device_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_protocol_sessions_device_started
    ON protocol_sessions (device_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_tenant_email_lower
    ON users (tenant_id, LOWER(email));
