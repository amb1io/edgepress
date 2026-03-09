# Documentação da API — Edgepress

Estado atual das APIs (leitura/escrita, autenticação, cache). Todas as rotas estão sob o prefixo `/api`, exceto quando indicado.

---

## Índice

1. [Autenticação e roles](#autenticação-e-roles)
2. [Cache (KV) nos GETs](#cache-kv-nos-gets)
3. [Configurações (Settings)](#configurações-settings)
4. [Conteúdo e posts](#conteúdo-e-posts)
5. [Traduções (i18n)](#traduções-i18n)
6. [Usuários](#usuários)
7. [Taxonomias](#taxonomias)
8. [Traduções (admin)](#traduções-admin)
9. [Upload e mídia](#upload-e-mídia)
10. [Auth (Better Auth)](#auth-better-auth)
11. [Login / Registro / Setup](#login--registro--setup)
12. [Utilitários](#utilitários)

---

## Autenticação e roles

- **Roles numéricos:** `0` = administrador, `1` = editor, `2` = autor, `3` = leitor (menor número = mais privilégio).
- Endpoints que exigem autenticação usam sessão (cookie). O middleware preenche `locals.user` e `locals.session`.
- Quando indicado “Admin”, “Editor”, etc., refere-se ao **role mínimo** exigido.

---

## Cache (KV) nos GETs

Para os GETs que usam cache:

- **Usuário autenticado:** consulta direta ao banco (bypass no KV).
- **Usuário não autenticado:** consulta primeiro o KV; em miss, consulta o banco e pode popular o KV.

Isso vale para: `GET /api/settings`, `GET /api/i18n/[locale]`, `GET /api/content/[tableOrSlug]` (tanto listagem de tabela quanto post por slug).

---

## Configurações (Settings)

### `GET /api/settings`

- **Auth:** não obrigatória.
- **Query:** `names` (opcional) — lista de nomes separados por vírgula, ex: `names=site_name,site_description`. Sem `names`, retorna todas as opções com `autoload=true`.
- **Resposta:** `200` — JSON objeto `{ [name]: value }`.
- **Cache:** não autenticado → KV primeiro; autenticado → DB direto.

### `POST /api/settings`

- **Auth:** Admin (role 0).
- **Body:** JSON ou FormData: `name` (obrigatório), `value`, `autoload` (boolean ou "1"/"on").
- **Resposta:** `201` — `{ ok: true, id }` ou `400` (name required) / `500`.

### `PATCH /api/settings`

- **Auth:** Admin (role 0).
- **Body:** JSON com chaves permitidas: `site_name`, `site_description`, `setup_done`. Valores são strings.
- **Resposta:** `200` — `{ ok: true }` ou `400` / `500`.

### `GET /api/settings/[id]`

- **Auth:** Editor ou superior (role ≤ 1).
- **Params:** `id` — ID numérico do setting.
- **Resposta:** `200` — `{ id, name, value, autoload }` ou `400` / `404`.

### `PUT /api/settings/[id]`

- **Auth:** Admin (role 0).
- **Params:** `id`.
- **Body:** JSON ou FormData: `name`, `value`, `autoload`.
- **Resposta:** `200` — `{ ok: true }` ou `400` / `404` / `500`.

### `DELETE /api/settings/[id]`

- **Auth:** Admin (role 0).
- **Params:** `id`.
- **Resposta:** `200` (vazio, header `HX-Refresh: true`) ou `400` / `404`.

---

## Conteúdo e posts

### `GET /api/content/[tableOrSlug]`

Comportamento por tipo de segmento:

- **Segmento = nome de tabela conhecida** (ex: `posts`, `settings`): listagem dinâmica com paginação, ordenação e filtros.
- **Segmento = slug (não é tabela):** retorna **detalhe de um post** por slug (ex: `/api/content/meu-post`).

**Listagem (ex: `/api/content/posts`):**

- **Auth:** não obrigatória.
- **Query (parâmetros comuns):**
  - `page`, `limit` — paginação (padrão `page=1`, `limit=10`; máximo 100).
  - `order`, `orderDir` — ordenação por coluna (`orderDir`: `asc` ou `desc`; padrão `desc`).
  - `filter_<col>=value` — filtro por coluna (LIKE no valor). Colunas da tabela ou de tabelas relacionadas (ex: `filter_title=foo`, `filter_locales_language=Português`).
- **Query (tabela `posts` — filtros específicos):**
  - **Tipo de post:** `filter_post_type` com **id** (número) ou **slug**: `filter_post_type=post`, `filter_post_type=page`, `filter_post_type=8`.
  - **Idioma:** `locale` (código, ex: `pt-br`, `en`) ou `locale_id` / `id_locale_code` (id numérico da tabela `locales`). Ex.: `locale=pt-br`, `locale_id=1`.
  - **Taxonomia:**  
    - `filter_taxonomy_id` — id do termo em `taxonomies` (ex: `filter_taxonomy_id=5`).  
    - `filter_taxonomy_slug` — slug do termo (ex: `filter_taxonomy_slug=tecnologia`).  
    - `filter_taxonomy_type` — (opcional) tipo do termo para desambiguar por slug (ex: `filter_taxonomy_type=category&filter_taxonomy_slug=tecnologia`).
  - **Ordenação por custom field:** `order=meta_<nome>` — ordena pela chave em `meta_values` (ex: `order=meta_order&orderDir=asc`).
- **Resposta:** `200` — `{ items, total, page, limit, totalPages, columns }`. Itens podem incluir colunas de tabelas relacionadas (ex: `locales_language`, `user_name`). Para tabela `posts`, colunas de self-join usam prefixo `posts_ref_*`. O registro “pai” do menu lateral do admin (post com `show_in_menu = 1`) **não** é incluído na listagem de `posts`.
- **Cache:** não autenticado → KV; autenticado → DB direto.

**Exemplos de listagem de posts:**

```
GET /api/content/posts?locale=pt-br&limit=20
GET /api/content/posts?filter_post_type=post&filter_taxonomy_slug=tecnologia&filter_taxonomy_type=category
GET /api/content/posts?filter_taxonomy_id=5&order=meta_order&orderDir=asc
GET /api/content/posts?locale_id=1&page=2&order=created_at&orderDir=desc
```

**Post por slug (ex: `/api/content/meu-post`):**

- **Auth:** não obrigatória.
- **Query:** `status` (opcional) — valores permitidos: `published`, `draft`, `archived`. Padrão: só `published`.
- **Resposta:** `200` — objeto **hierárquico**: o pai é o post/post_type; dentro dele: **meta_schema** (JSON estruturado do tipo do post), **meta_values** (JSON estruturado), **custom_fields** (JSON estruturado — campos personalizados filhos), **body_smart**, **media**, **taxonomies** (array de termos associados ao post: `id`, `name`, `slug`, `type`, `description`, `parent_id`). Campos do post: `id`, `post_type_id`, `title`, `slug`, `excerpt`, `body`, `status`, `published_at`, `created_at`, `updated_at`, etc.
- **Erros:** `400` (slug inválido), `404` (post não encontrado).
- **Cache:** não autenticado → KV primeiro; autenticado → DB direto.

### `GET /api/content/[table]/[id_or_slug]`

- **Auth:** não obrigatória.
- **Params:** `table` — nome da tabela (ex: `posts`, `settings`); segundo segmento — **id** (numérico) ou **slug** (apenas para `posts`).
- **Comportamento:**
  - **table = "posts":** aceita **id** ou **slug** no segundo segmento. Retorna o mesmo payload hierárquico: post (pai) + **meta_schema**, **meta_values**, **custom_fields**, **body_smart**, **media**, **taxonomies**.
  - **Outras tabelas:** apenas **id** numérico. Retorna uma linha com `WHERE id = ?`. Se tiver coluna `meta_values`, é retornada parseada.
- **Resposta:** `200` — objeto do registro ou `404` (not found) / `400` (id ou slug inválido).
- **Cache (só para posts):** não autenticado → KV primeiro (`post:id:{id}` ou `post:{slug}:status=...`); autenticado → DB direto.

### `POST /api/posts`

- **Auth:** Autor ou superior (role ≤ 2).
- **Body:** FormData.
  - Obrigatórios: `post_type`, `action` ("new" | "edit"), `title`, `slug`. Se `action=edit`, `id` obrigatório.
  - Opcionais: `status`, `body`, `excerpt`, `author_id`, `locale`, `id_locale_code`, `taxonomy_terms[]`, `thumbnail_attachment_id`, `blocknote_attachment_ids[]`, `parent_id`, campos `meta_*`, etc.
- **Resposta:** redirect para a URL de conteúdo/lista ou JSON com `id`, conforme `Accept` e fluxo.
- **Regras:** autor (role 2) só pode definir `author_id` como si mesmo; editor/admin podem definir qualquer autor.

### `DELETE /api/posts/[id]`

- **Auth:** Editor ou superior (role ≤ 1).
- **Params:** `id` — ID numérico do post.
- **Resposta:** `200` — `{ success: true, id }` ou `400` / `500`.

### `POST /api/posts/[id]/duplicate`

- **Auth:** Autor ou superior (role ≤ 2).
- **Params:** `id` — ID do post a duplicar.
- **Resposta:** `200` — `{ success: true, id }` (ID do novo post) ou `400` / `404` / `500`.
- **Comportamento:** duplica post, relações em `posts_taxonomies` e `posts_media`, e posts filhos do tipo `custom_fields` (com `parent_id` apontando para o novo post). Título e slug são incrementados para garantir unicidade.

---

## Traduções (i18n)

### `GET /api/i18n/[locale]`

- **Auth:** não obrigatória.
- **Params:** `locale` — ex: `pt-br`, `en`, `es`, `en_US`, `pt_BR`, etc. (normalizado para `locale_code` do banco).
- **Resposta:** `200` — JSON objeto `{ [namespace.key]: value }` com todas as traduções do locale.
- **Cache:** não autenticado → KV primeiro; autenticado → DB direto.
- **Erros:** `400` (locale obrigatório), `404` (locale não encontrado), `500`.

---

## Usuários

### `POST /api/users`

- **Auth:** Admin (role 0).
- **Body:** FormData: `name`, `email` (obrigatórios), `image`, `emailVerified` ("1"), `role` (0–3).
- **Resposta:** `200` (vazio, `HX-Refresh: true`) ou `400` / `409` (email já existe) / `500`.

### `PUT /api/users/[id]`

- **Auth:** Admin (role 0).
- **Params:** `id` — UUID do usuário.
- **Body:** FormData: `name`, `email`, `image`, `emailVerified`, `role`. Apenas admin pode alterar `role`; não pode atribuir role com mais privilégio que o próprio.
- **Resposta:** `200` (vazio, `HX-Refresh`) ou `400` / `403` / `404` / `409` / `500`.

### `DELETE /api/users/[id]`

- **Auth:** Admin (role 0).
- **Params:** `id` — UUID do usuário.
- **Resposta:** `200` (vazio, `HX-Refresh`) ou `400` / `404` / `500`. Remove também `account` e `session` associados.

---

## Taxonomias

### `POST /api/taxonomies`

- **Auth:** Editor ou superior (role ≤ 1).
- **Body:** FormData: `name`, `type` (obrigatórios), `slug`, `description`, `parent_id`, `id_locale_code`, `locale`.
- **Resposta:** `200` — JSON `{ success: true, taxonomy: { id, name, slug, type, language } }` + header `HX-Trigger` com evento `taxonomy-added`, ou HTML de erro (status 200 com mensagem).

### `PUT /api/taxonomies/[id]` e `POST /api/taxonomies/[id]`

- **Auth:** Editor ou superior (role ≤ 1).
- **Params:** `id` — ID numérico do termo.
- **Body:** FormData: `name`, `type`, `slug`, `description`, `parent_id`, `id_locale_code`.
- **Resposta:** `200` — `{ success: true }` + `HX-Trigger` (`taxonomy-updated`) ou `400` / `409` (slug em uso) / `500`.

### `DELETE /api/taxonomies/[id]`

- **Auth:** Editor ou superior (role ≤ 1).
- **Params:** `id` — ID do termo.
- **Resposta:** `200` (vazio). Remove termo, desvincula filhos (`parent_id`), remove relações em `posts_taxonomies`.

---

## Traduções (admin)

### `POST /api/translations`

- **Auth:** Autor ou superior (role ≤ 2).
- **Body:** FormData: `action` ("new" | "edit"), `id` (para edit), `locale`, `namespace`, `key`, `translation`, `locale_id` (ID do idioma na tabela de locales).
- **Resposta:** redirect para lista de traduções ou JSON `{ id }` se `Accept: application/json`. Erros: redirect ou `400`.

---

## Upload e mídia

### `POST /api/upload`

- **Auth:** Autor ou superior (role ≤ 2).
- **Body:** `multipart/form-data` com campo `file` (ou primeiro arquivo).
- **Limites:** tamanho máximo 20 MB; extensões de código/script bloqueadas; imagens e PDF permitidos (tipos e extensões validados).
- **Resposta:** `200` — `{ key, path, mimeType, filename, cloudflareImageId? }`. Quando Cloudflare Images está configurado e o arquivo é imagem, pode incluir `cloudflareImageId` para salvar em `meta_values` do attachment. Erros: `400` / `413` / `503` (bucket não configurado). Rate limit configurável (ex.: 20 uploads/hora).

### `GET /api/media/[...path]` e `GET /api/media/{id}`

- **Auth:** não obrigatória.
- **Por id:** `GET /api/media/123` — `123` é o id do attachment (post tipo attachment). O servidor busca o registro no banco e:
  - Se existir `cloudflare_image_id` (ou equivalentes) em `meta_values` e as variáveis de ambiente do Cloudflare Images estiverem configuradas, responde com **redirect 302** para a URL otimizada no Cloudflare Images (flexible variants com `width`, `height`, `format=webp`).
  - Caso contrário, lê `attachment_path` (ou `file_path`) em `meta_values` e serve o arquivo do R2; para imagens, aplica Image Resizing do Cloudflare e entrega em **WebP**.
- **Por path:** `GET /api/media/uploads/2024/01/arquivo.jpg` — path do arquivo no R2. Se não começar com `uploads/`, o prefixo é adicionado. Imagens são otimizadas e entregues em WebP (exceto com `raw=1`).
- **Query params (imagens — aplicam a R2 e Cloudflare Images):**
  - **`width`** — número (1–4096), largura em pixels.
  - **`height`** — número (1–4096), altura em pixels.
  - **`size`** — preset: `thumbnail` | `medium` | `large`. Presets: thumbnail 300×300, medium 800×800, large 1920×1920. Se `width`/`height` forem informados, têm prioridade sobre `size`.
  - **`raw=1`** — devolve o binário original (sem redimensionar e sem converter para WebP). Útil para download do arquivo original.
- **Formato de entrega:** sem `raw=1`, imagens são sempre entregues em **WebP** (Content-Type `image/webp`), com redimensionamento conforme `width`, `height` ou `size`. Arquivos não-imagem (PDF, áudio, etc.) são servidos sem alteração.
- **Resposta:** stream do arquivo (ou redirect 302 para Cloudflare Images), com headers `Content-Type` e `Content-Length` quando aplicável.
- **Erros:** `404` (arquivo ou attachment não encontrado), `503` (R2 não configurado).
- **Requisitos opcionais:** para otimização de imagens no R2, Image Resizing deve estar habilitado na zona (Cloudflare). Para redirect ao Cloudflare Images, configurar `CLOUDFLARE_IMAGES_BASE_URL` ou `CLOUDFLARE_IMAGES_ACCOUNT_HASH` (e opcionalmente `CLOUDFLARE_IMAGES_VARIANT`); Flexible variants habilitado no Cloudflare Images para usar parâmetros de tamanho na URL.

---

## Auth (Better Auth)

### `* /api/auth/[...all]`

- Todas as rotas de autenticação do Better Auth (sign-in, sign-out, sign-up, session, etc.) são repassadas para `auth.handler(ctx.request)`.
- Não exigem autenticação prévia; usadas para login, registro e gestão de sessão.

---

## Login / Registro / Setup

### `POST /api/login`

- **Body:** `application/x-www-form-urlencoded`: `email`, `password`, `callbackURL` (opcional), `locale` (opcional). Se não for form, redirect para `/[locale]/login?error=invalid_request`.
- **Fluxo:** chama `/api/auth/sign-in/email` e repassa cookies da sessão; redirect para `callbackURL` (sanitizado) ou `/[locale]/admin`.
- **Erros:** redirect com `?error=missing_fields` | `invalid_credentials`.

### `POST /api/register`

- **Body:** Form (urlencoded ou multipart): `name`, `email`, `password`, `image`, `role`, `callbackURL`, `locale`.
- **Regras:** senha mínima 8 caracteres; apenas admin logado pode definir `role` diferente de leitor (3). Rate limit configurável (ex.: 3 registros/hora).
- **Fluxo:** chama `/api/auth/sign-up/email` e repassa cookies; redirect para `callbackURL` (sanitizado) ou lista de usuários.
- **Erros:** redirect com `?error=...` (ex.: `missing_fields`, `password_too_short`, `rate_limit_exceeded`).

### `POST /api/setup`

- **Auth:** não exigida (uso único na primeira instalação).
- **Body:** Form: `name`, `email`, `password`, `site_name`, `site_description`.
- **Fluxo:** executa migrações se necessário, cria primeiro usuário (admin, role 0), atualiza `site_name`, `site_description` e `setup_done=Y`. O seed do banco deve ser executado apenas via npm (ex.: `npm run db:seed`).
- **Resposta:** redirect para `/[locale]/login?setup=success` com cookie `setup_done=Y`.

---

## Utilitários

### `GET /api/kv-test`

- **Auth:** não verificada.
- **Resposta:** `200` — `{ ok: true, value, message }` se o KV (`edgepress_cache`) estiver configurado e funcionando; `503` (KV não configurado) ou `500` (erro ao escrever/ler).
- **Uso:** diagnóstico do cache KV.

---

## Resumo de autenticação por endpoint

| Endpoint | GET | POST | PUT | PATCH | DELETE |
|----------|-----|------|-----|-------|--------|
| `/api/settings` | Público | Admin | — | Admin | — |
| `/api/settings/[id]` | Editor+ | — | Admin | — | Admin |
| `/api/content/*` | Público (KV/DB) | — | — | — | — |
| `/api/content/[table]/[id]` | Público (KV/DB para posts) | — | — | — | — |
| `/api/posts` | — | Autor+ | — | — | — |
| `/api/posts/[id]` | — | — | — | — | Editor+ |
| `/api/posts/[id]/duplicate` | — | Autor+ | — | — | — |
| `/api/i18n/[locale]` | Público (KV/DB) | — | — | — | — |
| `/api/users` | — | Admin | — | — | — |
| `/api/users/[id]` | — | — | Admin | — | Admin |
| `/api/taxonomies` | — | Editor+ | — | — | — |
| `/api/taxonomies/[id]` | — | Editor+ | Editor+ | — | Editor+ |
| `/api/translations` | — | Autor+ | — | — | — |
| `/api/upload` | — | Autor+ | — | — | — |
| `/api/media/*` | Público | — | — | — | — |
| `/api/login` | — | Público | — | — | — |
| `/api/register` | — | Público (rate limit) | — | — | — |
| `/api/setup` | — | Público (1ª vez) | — | — | — |
| `/api/auth/*` | — | Público (handler) | — | — | — |

---

*Documento gerado com base no código em `src/pages/api/` e `src/lib/list-table-dynamic.ts`. Inclui parâmetros de listagem de conteúdo: locale, taxonomia, ordenação por custom field (meta_*), exclusão do post menu (show_in_menu).*
