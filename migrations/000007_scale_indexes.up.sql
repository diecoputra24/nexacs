-- Migration 000007: Scale Indexes (pg_trgm multi-column search + active task queue partial index)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_devices_serial_trgm
    ON devices USING gin (serial_number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_devices_mfg_canonical_trgm
    ON devices USING gin (manufacturer_canonical gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_devices_model_trgm
    ON devices USING gin (model_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_devices_pppoe_trgm
    ON devices USING gin (pppoe_username gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_devices_product_class_trgm
    ON devices USING gin (product_class gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_devices_oui_trgm
    ON devices USING gin (oui gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_tasks_active_queue
    ON tasks (tenant_id, task_type, status, created_at DESC)
    WHERE status IN ('pending', 'queued', 'waiting_for_device', 'executing');
