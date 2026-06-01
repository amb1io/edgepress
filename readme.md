# Edgepress

CMS inspirado no WordPress que roda na **edge** (Cloudflare). Conteúdo dinâmico, autenticação, i18n, taxonomias, mídia em R2 e cache em KV.

## Stack

- **[Astro](https://astro.build)** (SSR) + **[Cloudflare Workers](https://workers.cloudflare.com/)**
- **D1** (SQLite) + **Drizzle ORM** — banco de dados
- **KV** — cache para leituras (settings, i18n, conteúdo)
- **R2** — armazenamento de mídia (uploads)
- **[Better Auth](https://www.better-auth.com/)** — autenticação (email/senha, roles)
- **HTMX** + **Alpine.js** — interatividade no admin
- **BlockNote** + **Uppy** — editor de conteúdo e upload de imagens
- **Tailwind CSS** + **DaisyUI** — estilos

## Pré-requisitos

- **Node.js** 18+
- **npm** ou **pnpm**
- **Wrangler** (incluído como dependência)

## Instalação

```bash
git clone https://github.com/amb1io/edgepress.git
cd edgepress
npm install
```

### Variáveis de ambiente

1. Copie o exemplo e ajuste:
   ```bash
   cp .env.example .env.local
   ```
2. Para desenvolvimento com Wrangler, use **`.dev.vars`** (não é commitado). Exemplo:
   ```
   BETTER_AUTH_SECRET=seu_secret_min_32_chars
   BETTER_AUTH_URL=http://localhost:8787
   BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:8787
   RESEND_API_KEY=re_xxx
   RESEND_FROM=Edgepress <noreply@seudominio.com>
   ```
3. Em produção, configure os **Secrets** no dashboard do Cloudflare (Workers/Pages) ou via `wrangler secret put`.

Consulte `.env.example` para todas as opções (rate limits, Resend, etc.).

### Cloudflare (D1, KV, R2)

O projeto usa **`wrangler.toml`** com:

- **D1**: bancos `edgepress` (produção) e opcionais `edgepress-dev` / `edgepress-dev-1` (desenvolvimento).
- **KV**: namespace `edgepress_cache`.
- **R2**: bucket `edgepress-media`.

Crie os recursos no [Cloudflare Dashboard](https://dash.cloudflare.com/) (D1, KV, R2) e preencha os `database_id` e `id` no `wrangler.toml` conforme sua conta. O arquivo pode ser versionado; segredos ficam em `.dev.vars` ou em Secrets.

## Desenvolvimento

```bash
# Gera tipos do Wrangler, build e sobe o dev server (porta 8787)
npm run dev
```

- **Admin:** após o primeiro deploy/setup, acesse `/{locale}/admin` (ex.: `http://localhost:8787/pt-br/admin`).
- **Setup inicial:** na primeira vez, você será redirecionado para `/{locale}/setup` para criar o primeiro usuário e concluir a configuração.

Outros scripts úteis:

| Script              | Descrição                                                                  |
| ------------------- | -------------------------------------------------------------------------- |
| `npm run dev:astro` | Apenas Astro dev server (sem Wrangler; útil para UI).                      |
| `npm run dev:reset` | Limpa `.wrangler`, gera migrações, aplica local, seed, build e sobe o dev. |
| `npm run test`      | Roda os testes (Vitest).                                                   |

## Banco de dados

### Migrações (Drizzle + D1)

```bash
# Gera arquivos de migração a partir do schema
npm run db:generate

# Aplica migrações no D1 local (dev)
npm run db:migrate:local

# Aplica migrações no D1 remoto (produção)
npm run db:migrate:remote
```

Para ambientes de desenvolvimento remoto há também `db:migrate:remote:dev`, `db:baseline:remote` e `db:baseline:remote:dev` (veja `package.json`).

### Seed

```bash
# Seed no banco local (SQLite em .wrangler/state)
npm run db:seed
# ou
npm run seed

# Gera o SQL de seed para uso remoto
npm run db:seed:generate-sql

# Aplica seed no D1 remoto (produção)
npm run db:seed:remote

# Aplica seed no D1 remoto de dev
npm run db:seed:remote:dev
```

### Drizzle Studio

```bash
npm run db:studio
```

Abre o Drizzle Studio para inspecionar/editar dados (conexão local).

## Build e deploy

```bash
# Build para Cloudflare Workers
npm run build
```

Para CI ou deploy com migrações e seed no D1 remoto:

```bash
npm run build:seed
```

Deploy manual após o build:

```bash
npm run deploy          # production (vars do top-level do wrangler.toml)
npm run deploy:preview  # preview/staging (--env preview)
```

O Worker usa `dist/server/entry.mjs` com assets estáticos em `dist/client` (ver `wrangler.toml`). Configure secrets com `wrangler secret put` (ex.: `BETTER_AUTH_SECRET`, `RESEND_API_KEY`). Variáveis públicas ficam em `[vars]` / `[env.preview.vars]`.

### Importação de tema via GitHub + R2

O fluxo foi dividido em dois workflows:

- `.github/workflows/theme-import-dispatch.yml`  
  Recebe `repository_dispatch` (`theme_import_requested`), baixa tema público do GitHub, empacota (`theme.zip`), publica no R2 e chama callback.

- `.github/workflows/deploy-app.yml`  
  Em `push main` (ou manual), busca pacote do tema ativo no R2, valida checksum, hidrata em `src/pages/themes/<slug>` e só então roda `npm run build` e deploy.

Secrets esperados para o workflow de importação/pacote (`theme-import-dispatch.yml`):

- `THEME_IMPORT_CALLBACK_URL` (ex.: `https://seu-dominio.com/api/themes/import-callback`)
- `THEME_IMPORT_CALLBACK_SECRET` (deve bater com `THEME_IMPORT_CALLBACK_SECRET` no Edgepress)
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`

Secrets esperados para o workflow de deploy do app (`deploy-app.yml`):

- `THEME_PACKAGE_METADATA_URL` (endpoint seguro, ex.: `/api/themes/active-package`)
- `THEME_PACKAGE_METADATA_SECRET` (deve bater com `THEME_PACKAGE_METADATA_SECRET` no Edgepress)
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `CLOUDFLARE_API_TOKEN` (para deploy)
- `CLOUDFLARE_ACCOUNT_ID` (para deploy)

Variáveis esperadas no runtime do Edgepress:

- `THEME_IMPORT_DISPATCH_REPO` (formato `owner/repo`)
- `THEME_IMPORT_GITHUB_TOKEN`
- `THEME_IMPORT_EVENT_TYPE` (opcional; default `theme_import_requested`)
- `THEME_IMPORT_CALLBACK_SECRET`
- `THEME_PACKAGE_METADATA_SECRET`

## Estrutura do projeto (resumo)

```
├── src/
│   ├── pages/          # Rotas Astro e API (/api/*)
│   ├── components/     # Componentes React (BlockNote, etc.)
│   ├── lib/            # Serviços, auth, utils, validadores
│   ├── db/             # Schema Drizzle, seed, migrations
│   ├── i18n/           # Locales e traduções (en, es, pt-br)
│   ├── middleware.ts   # Setup, auth, CSRF
│   └── scripts/        # Lógica client-side (content form, post-type form)
├── drizzle/            # Migrações D1 e seed SQL
├── docs/
│   └── API_DOC.md      # Documentação das APIs
├── wrangler.toml     # Config Cloudflare (D1, KV, R2)
├── .env.example        # Exemplo de variáveis
└── .dev.vars           # Segredos locais (não versionado)
```

## Documentação da API

Detalhes de autenticação, roles, cache, endpoints de conteúdo, traduções, upload e auth: **[docs/API_DOC.md](docs/API_DOC.md)**.

## Licença

ISC · [Amb1.io](https://amb1.io)
