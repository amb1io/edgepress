# Edgepress

**Version:** `0.0.1` · A WordPress-inspired CMS that runs on the **edge** (Cloudflare Workers).

Edgepress provides content management, a full admin panel, public themes, i18n, taxonomies, R2 media storage, KV caching, and REST APIs for reads and writes — all in a single Astro SSR deploy on Cloudflare.

## Stack

| Layer | Technology |
|-------|------------|
| Framework | [Astro 6](https://astro.build) (SSR) + [@astrojs/cloudflare](https://docs.astro.build/en/guides/integrations-guide/cloudflare/) |
| Runtime | Cloudflare Workers (`nodejs_compat`) |
| Database | **D1** (SQLite) + **Drizzle ORM** |
| Cache / sessions | **KV** (`CACHE`) |
| Media | **R2** (`MEDIA_BUCKET`) |
| Auth | [Better Auth](https://www.better-auth.com/) (email/password, roles, KV sessions) |
| Admin UI | **HTMX** + **Alpine.js** + **Tailwind CSS 4** + **DaisyUI** |
| Editor | **BlockNote** (React) + **Uppy** (uploads) |
| Email | **Resend** (password recovery) |
| Tests | **Vitest** |

## Features

### Content and data model

- **Configurable post types** (`post`, `page`, `attachment`, `user`, `themes`, `settings`, etc.) with dynamic `meta_schema` (custom fields, taxonomies, thumbnail, menu).
- **Posts and pages** with status, slug, author, hierarchy (parent), duplication, and cross-locale duplication.
- **Taxonomies** (categories, tags, and custom types) linked to posts via `posts_taxonomies`.
- **Custom fields** stored in `meta_values`, including integrated SEO blocks.
- **SEO:** metadata (`seo_metadata`), canonical URLs, Open Graph via custom fields; **JSON-LD** (Article, WebPage, BreadcrumbList).
- **Sitemap** generated at build time (`@astrojs/sitemap`) with public URLs collected from published posts.

### Internationalization

- **Admin** locales: `pt-br`, `en`, `es` (URLs `/admin/{locale}/...`).
- **Public theme** locales: `pt_BR`, `en_US`, `es_ES` (URLs `/themes/{slug}/{locale}/...`).
- UI translations (KV/DB) and **linked posts** via `translation_key`.
- Language management in the admin (`translations_languages`).

### Admin panel

- Initial setup at `/{locale}/setup` (first admin user + `site_name` / `site_description`).
- Dashboard, DataTables listings, HTMX forms, BlockNote editor, media library (Uppy → R2).
- **Roles:** `0` admin · `1` editor · `2` author · `3` reader (lower number = more privilege).
- User, settings, KV cache, themes, post types, and translation management.

### Public themes

- Themes under `src/pages/themes/{slug}/` with automatic rewrites: friendly URLs (`/about`) map to the active theme (`active_theme` in settings).
- Default fallback theme: `2026`.
- **GitHub theme import:** GitHub Actions dispatch → package in R2 → callback → deploy hydrates the theme before build (workflows in `.github/workflows/`).

### REST API (`/api/*`)

Public reads use KV cache for visitors; authenticated users query D1 directly.

| Area | Main endpoints |
|------|----------------|
| Settings | `GET/POST/PATCH /api/settings`, `GET/PUT/DELETE /api/settings/[id]` |
| Content | `GET /api/content/[tableOrSlug]`, `GET /api/content/[table]/[id]` |
| Posts | `POST /api/posts`, `PUT/DELETE /api/posts/[id]`, duplicate, duplicate translation |
| i18n | `GET /api/i18n/[locale]` |
| Taxonomies | `POST /api/taxonomies` |
| Users | `POST /api/users`, `PUT/DELETE /api/users/[id]` |
| Translations (admin) | `GET/POST /api/translations`, `PUT/DELETE /api/translations/[id]` |
| Media | `POST /api/upload`, `GET /api/media/list` |
| Themes | import callback, active package for CI |
| Auth | Better Auth at `/api/auth/*` |
| Utilities | `GET /api/kv-test`, `GET /api/kv-list` |

### Security

- **CSRF:** origin validation (Better Auth + middleware on sensitive APIs).
- **Configurable rate limiting:** login, registration, upload, and general API (via env).
- **URL validation** on redirects (open-redirect protection).
- Setup, session, and admin route protection middleware.

### Plugins

- `src/plugins/` is reserved for future extensions (no plugin runtime yet).

## Prerequisites

- Node.js 18+
- npm or pnpm
- Cloudflare account (D1, KV, R2) for deployment

## Installation

```bash
git clone https://github.com/amb1io/edgepress.git
cd edgepress
npm install
```

### Environment variables

```bash
cp .env.example .env.local
```

For `wrangler dev`, also use **`.dev.vars`** (not committed):

```env
BETTER_AUTH_SECRET=          # min. 32 characters
BETTER_AUTH_URL=http://localhost:8787
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:8787
RESEND_API_KEY=
RESEND_FROM=Edgepress <noreply@yourdomain.com>
SITE_URL=http://localhost:8787
```

In production, set secrets in the Cloudflare dashboard or via `wrangler secret put`. See `.env.example` for all options (rate limits, theme import, etc.).

### Cloudflare resources (`wrangler.toml`)

| Binding | Purpose |
|---------|---------|
| `DB` (D1) | Primary database, migrations in `./drizzle` |
| `CACHE` (KV) | Read cache and Astro sessions |
| `MEDIA_BUCKET` (R2) | Uploads and attachments |

Update `database_id`, KV `id`, and bucket name for your account.

## Development

```bash
# Build + Wrangler dev (port 8787)
npm run dev
```

| Command | Description |
|---------|-------------|
| `npm run dev:astro` | Astro dev without Wrangler (faster UI iteration) |
| `npm run dev:reset` | Clears `.wrangler`, migrates, seeds, builds, and starts dev |
| `npm run test` | Vitest |
| `npm run db:studio` | Drizzle Studio (local) |

- **Admin:** `http://localhost:8787/pt-br/admin` (after setup).
- **Setup:** automatic redirect to `/pt-br/setup` on first run.

### Database

```bash
npm run db:generate          # generate Drizzle migrations
npm run db:migrate:local     # apply to local D1
npm run db:seed              # local seed
npm run db:migrate:remote    # production
npm run db:seed:remote       # remote seed (generated SQL)
npm run db:seed:remote:dev   # remote seed (dev D1)
```

## Build and deploy

```bash
npm run build
```

Output goes to `./dist/server` with static assets in `./dist/client` (see `wrangler.toml`).

```bash
npm run deploy          # production
npm run deploy:preview  # preview/staging (--env preview)
```

Configure secrets with `wrangler secret put` (e.g. `BETTER_AUTH_SECRET`, `RESEND_API_KEY`). Public vars live in `[vars]` / `[env.preview.vars]`.

For a pipeline with migrations/seed:

```bash
npm run build:seed
```

### CI: themes and deploy

1. **`theme-import-dispatch.yml`** — downloads a public theme from GitHub, packages it, uploads to R2, and calls the callback.
2. **`deploy-app.yml`** — hydrates the active theme from R2, validates checksum, runs `npm run build`, and deploys with `wrangler deploy`.

Required secrets are documented in the workflows and in `.env.example` (`THEME_IMPORT_*`, `THEME_PACKAGE_*`, R2 and Cloudflare credentials).

## Project structure

```
├── src/
│   ├── pages/           # Astro routes, themes, and /api/*
│   ├── admin/           # Admin templates and components
│   ├── api/endpoints/   # REST handlers
│   ├── core/services/   # Domain logic (themes, SEO, sitemap, taxonomies…)
│   ├── db/              # Drizzle schema, seed, migrations
│   ├── i18n/            # Locales and translations
│   ├── middleware.ts    # Setup, auth, CSRF, theme rewrites
│   └── plugins/         # Future extensions
├── drizzle/             # Migration SQL and remote seed
├── scripts/             # Build, seed, sitemap, theme sync
├── .github/workflows/   # Theme import and deploy
├── wrangler.toml
└── .env.example
```

## License

ISC · [Amb1.io](https://amb1.io)
