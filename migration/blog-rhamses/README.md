# Migração blog.rhamses.com.br → Edgepress

Migração pontual do blog Astro (Charca) para o Edgepress: posts MDX, imagens, tema LiquidJS e versões em inglês.

## Pré-requisitos

```bash
npm run db:migrate:local
npm run db:seed   # seed base do Edgepress (locales, post types, etc.)
```

## Executar migração

```bash
npm run migrate:blog:local
```

Isso executa em sequência:

1. **1-extract-posts.ts** — lê MDX de `blog.rhamses.com.br` → `data/posts-pt.json`
2. **2-generate-sql.ts** — gera `output/migration.sql` (posts PT/EN, attachments, taxonomia Blog, tema)
3. **3-upload-images.ts** — envia imagens para R2 local (`uploads/blog/...`)
4. **4-seed-theme.ts** — grava tema `blog-rhamses` no KV + assets no R2
5. Aplica SQL via `wrangler d1 execute DB --local`

## Dados

| Arquivo | Origem |
|---------|--------|
| `data/posts-pt.json` | Gerado pelo script 1 |
| `data/posts-en.json` | Traduções estáticas (PT → EN) criadas na migração |
| `images/` | Cópia de `blog.rhamses.com.br/public/assets/blog/` |

## Dev

```bash
npm run dev
```

O tema ativo será `blog-rhamses` (definido no SQL de migração).
