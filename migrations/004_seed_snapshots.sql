CREATE TABLE IF NOT EXISTS seed_snapshots (
  entity_type text NOT NULL CHECK (entity_type IN ('ingredients', 'recipes', 'collections')),
  id text NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY (entity_type, id)
);
INSERT INTO schema_migrations(version) VALUES (4) ON CONFLICT DO NOTHING;
