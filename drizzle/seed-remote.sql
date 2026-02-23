-- Seed mínimo para D1 remoto (idempotente).
-- Usado por: npm run db:seed:remote (wrangler d1 execute edgepress --remote --file=./drizzle/seed-remote.sql)
-- Locales necessários para traduções (en_US, es_ES, pt_BR)
INSERT OR IGNORE INTO locales (language, hello_world, locale_code, country, timezone) VALUES
  ('English (US)', 'Hello World', 'en_US', 'United States', 'UTC-5'),
  ('Spanish (Spain)', 'Hola Mundo', 'es_ES', 'Spain', 'UTC+1'),
  ('Portuguese (Brazil)', 'Olá Mundo', 'pt_BR', 'Brazil', 'UTC-3');

-- Permissões por perfil (0=admin, 1=editor, 2=autor, 3=leitor)
INSERT OR IGNORE INTO role_capability (role_id, capability) VALUES
  (0, '*'),
  (1, 'admin.dashboard'),
  (1, 'admin.content'),
  (1, 'admin.list'),
  (1, 'admin.media'),
  (1, 'action.delete'),
  (1, 'menu.full'),
  (2, 'admin.dashboard'),
  (2, 'admin.content'),
  (2, 'admin.list'),
  (2, 'admin.media'),
  (2, 'menu.full'),
  (3, 'admin.dashboard');
