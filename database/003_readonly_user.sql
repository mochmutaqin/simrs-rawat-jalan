-- User read-only untuk services-node (instalasi tanpa Docker).
-- Author: Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
-- Jalankan setelah skema terpasang:  psql -U postgres -d simrs -f database/003_readonly_user.sql
-- Ganti password di bawah bila perlu, lalu samakan dengan DB_PASSWORD di services-node/.env
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_readonly') THEN
        CREATE ROLE app_readonly LOGIN PASSWORD 'readonly';
    END IF;
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_readonly', current_database());
END $$;

GRANT USAGE ON SCHEMA public TO app_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO app_readonly;
