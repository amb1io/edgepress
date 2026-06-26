# Criar um tema para o Edgepress

Temas no Edgepress são pacotes **Liquid** renderizados em runtime no Worker — sem build e sem redeploy ao instalar.

## Estrutura do repositório

```text
meu-tema/
  theme.json
  templates/
    layouts/base.liquid
    parts/header.liquid
    parts/footer.liquid
    home.liquid
    single.liquid
    page.liquid
    archive.liquid
    404.liquid
  assets/
    theme.css
    theme.js
```

## `theme.json`

```json
{
  "name": "Meu Tema",
  "slug": "meu-tema",
  "version": "1.0.0",
  "engine": "liquid",
  "supports": ["home", "single", "page", "archive"],
  "home_content_key": "hello-world",
  "layout": "layouts/base",
  "templates": {
    "home": "home",
    "single": "single",
    "page": "page",
    "archive": "archive",
    "404": "404"
  }
}
```

## Theme API (tags do core)

| Tag / filtro | Equivalente WordPress | Descrição |
|--------------|----------------------|-----------|
| `{% seo_head %}` | `wp_head()` (SEO) | Title, meta, OG, Twitter, JSON-LD |
| `{% the_content %}` | `the_content()` | HTML do post sanitizado |
| `{% nav_menu 'primary' %}` | `wp_nav_menu()` | Menu do CMS |
| `{% pagination %}` | `the_posts_pagination()` | Links de paginação |
| `{% theme_styles %}` | `wp_enqueue_style` | CSS do tema |
| `{% scripts_footer %}` | `wp_footer()` | htmx, Alpine, theme.js |
| `{% html_attrs %}` | `language_attributes()` | `lang="..."` |
| `{% body_class %}` | `body_class()` | Classes da rota |
| `{{ 'file.css' \| asset }}` | `get_template_directory_uri()` | URL do asset |
| `{{ post.published_at \| post_date }}` | `the_date()` | Data formatada |

## Layout com `{% layout %}`

```liquid
{% layout 'layouts/base' %}
<h1>{{ post.title }}</h1>
{% the_content %}
```

O layout recebe `{{ content }}` com o HTML da página.

## Variáveis globais

- `site` — title, description, locale, base_url, html_lang
- `seo` — dados de SEO da rota atual
- `menus` — mapa de menus (`menus.primary`, etc.)
- `theme` — slug, version, asset_base_url
- `route` — kind, path, locale
- `post` — post/página atual (home, single, page)
- `posts` — listagem (archive)
- `archive`, `pagination` — arquivo e paginação

## Instalação

1. Publique o repositório no GitHub (público).
2. No admin: **Conteúdo → Temas → Novo**.
3. Preencha a URL do GitHub, marque **Ativar este tema**, clique em **Criar**.
4. O Worker baixa o tarball, valida `theme.json`, grava templates no KV e assets no R2.

## Desenvolvimento local

```bash
npm run theme:dev
```

Abre um preview do tema default em `http://localhost:4322` usando o mesmo motor Liquid do Worker.

## Tema de referência

Veja `src/themes-default/2026/` — migração do tema 2026 com comentários e demonstração de todas as tags.
