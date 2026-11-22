#!/bin/bash
# Dijalankan otomatis oleh image postgres setelah 001_schema.sql (urut abjad).
# Membuat user read-only untuk service Node.js.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE ROLE app_readonly LOGIN PASSWORD '${READONLY_PASSWORD:-readonly}';
    GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO app_readonly;
    GRANT USAGE ON SCHEMA public TO app_readonly;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO app_readonly;
EOSQL
