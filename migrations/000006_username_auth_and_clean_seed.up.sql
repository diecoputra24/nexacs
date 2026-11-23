-- Migration 000006: Switch users from email to username, reset seeded accounts to single admin/admin, enforce 1h idle session & clean NexACS defaults

-- Remove all existing/old user accounts first so only clean admin/admin remains
DELETE FROM users
WHERE tenant_id = '00000000-0000-0000-0000-000000000001';

DELETE FROM audit_logs
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND actor_email = 'admin@nexanet.local';

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'email'
    ) THEN
        ALTER TABLE users RENAME COLUMN email TO username;
    END IF;
END $$;

DROP INDEX IF EXISTS idx_users_tenant_email_lower;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_username_lower
    ON users (tenant_id, LOWER(username));

INSERT INTO users (id, tenant_id, username, full_name, password_hash, status)
VALUES (
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000001',
    'admin',
    'Super Admin',
    crypt('admin', gen_salt('bf')),
    'active'
)
ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    full_name = EXCLUDED.full_name,
    password_hash = EXCLUDED.password_hash,
    status = 'active';

INSERT INTO user_roles (user_id, role_id)
VALUES (
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000101'
)
ON CONFLICT DO NOTHING;

UPDATE system_settings
SET settings = settings || '{"idle_timeout_minutes": 60, "session_ttl_hours": 1}'::jsonb
WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND category = 'security';

UPDATE system_settings
SET settings = jsonb_set(settings, '{system_name}', '"NexACS"', true)
WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND category = 'general';
