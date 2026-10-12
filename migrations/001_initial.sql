CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS ingredients (id text PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS recipes (id text PRIMARY KEY, slug text NOT NULL UNIQUE, status text NOT NULL CHECK (status IN ('draft','published','archived')), data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS admin_sessions (token_hash text PRIMARY KEY, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS auth_attempts (id text PRIMARY KEY, attempts integer NOT NULL, started_at timestamptz NOT NULL);
INSERT INTO schema_migrations(version) VALUES (1) ON CONFLICT DO NOTHING;
