-- Baseline: marca migrações como já aplicadas no D1 remoto
-- Use quando o banco já tem as tabelas mas d1_migrations está vazio/desatualizado
-- Executar: wrangler d1 execute edgepress --remote --file=./drizzle/baseline.sql

CREATE TABLE IF NOT EXISTS d1_migrations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Marca a migração 0000 como aplicada (tabelas já existem no remoto)
INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0000_outgoing_blink.sql');
