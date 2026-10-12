CREATE TABLE IF NOT EXISTS collections (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  status text NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations(version) VALUES (3) ON CONFLICT DO NOTHING;
