-- Rollback Migration 000006
DROP INDEX IF EXISTS idx_users_tenant_username_lower;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'username'
    ) THEN
        ALTER TABLE users RENAME COLUMN username TO email;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_tenant_email_lower
    ON users (tenant_id, LOWER(email));
