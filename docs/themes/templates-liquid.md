# Templates Liquid no Edgepress

Guia de referência para criar e manter templates de temas públicos. O motor é [LiquidJS](https://liquidjs.com/) com extensões do core Edgepress (tags e filtros próprios).
 
Para estrutura do pacote, instalação e deploy, veja também [criar-um-tema.md](./criar-um-tema.md).

## Estrutura de arquivos

```text
meu-tema/
  theme.json
  templates/
    layouts/
      base.liquid          # layout principal
    parts/
      header.liquid        # partials reutilizáveis
      footer.liquid
    home.liquid            # rota /
    single.liquid          # post (tipo post)
    page.liquid            # página estática
    archive.liquid         # listagem /posts ou /{cpt}
    404.liquid
  assets/
    theme.css
    theme.js
    …                      # imagens, fontes, etc.
```

Arquivos em `templates/` são referenciados **sem** o prefixo `templates/` e **sem** `.liquid` no `theme.json` (ex.: `"home": "home"`, layout `"layouts/base"`).

## `theme.json` — mapeamento de rotas

```json
{
  "name": "Meu Tema",
  "slug": "meu-tema",
  "version": "1.0.0",
  "engine": "liquid",
  "supports": ["home", "single", "page", "archive"],
  "layout": "layouts/base",
  "home_content_key": "hello-world",
  "home_list_posts": false,
  "templates": {
    "home": "home",
    "single": "single",
    "page": "page",
    "archive": "archive",
    "404": "404"
  },
  "assets_dir": "assets"
}
```

| Campo | Descrição |
|-------|-----------|
| `supports` | Tipos de rota que o tema declara suportar |
| `layout` | Layout padrão quando o template não usa `{% layout %}` na primeira linha |
| `home_content_key` | Slug ou `translation_key` do post exibido na home quando `home_list_posts` é `false` ou ausente |
| `home_list_posts` | Se `true`, a home lista posts (`posts` preenchido, `post` opcional); se `false`/ausente, a home carrega `home_content_key` como página singular |
| `templates` | Mapa opcional de aliases; o resolver usa **auto-discovery** nos arquivos do pacote |

### Hierarquia de templates (estilo WordPress)

O core escolhe o template verificando quais arquivos existem em `templates/` do pacote, na ordem de especificidade abaixo. Não é obrigatório declarar cada arquivo em `theme.json` — basta criar o `.liquid` com o nome correto.

| Rota (`route.kind`) | Candidatos (primeiro encontrado vence) |
|---------------------|----------------------------------------|
| `home` | `front-page` → `home` → `index` |
| `single` | `single-{type}-{slug}` → `single-{type}` → `single` → `singular` → `index` |
| `page` | `page-{slug}` → `page` → `singular` → `index` |
| `archive` | `archive-{type}` → `archive` → `index` |
| `taxonomy` | `taxonomy-{type}-{slug}` → `taxonomy-{type}` → `taxonomy` → `archive-{type}` → `archive` → `index` |
| `search` | `search` → `archive` → `index` |
| `404` | `404` → `index` |

Exemplos de nomes de arquivo:

- `single-post.liquid` — todos os posts do tipo `post`
- `single-post-hello-world.liquid` — post específico com slug `hello-world`
- `page-about.liquid` — página com slug `about`
- `front-page.liquid` — home com prioridade sobre `home.liquid`

## Rotas públicas e URLs

O roteamento público segue três camadas:

1. **`resolvePublicRoute`** — interpreta locale, aliases e slug na URL
2. **`buildThemeRenderContext`** — consulta post types arquiváveis no banco; se o segmento bater com um CPT, a rota vira `archive` (**prioridade sobre conteúdo singular** com o mesmo slug)
3. **`resolveTemplateKey`** — escolhe o template Liquid (`archive-produtos.liquid`, etc.)

| URL | `route.kind` | Template típico |
|-----|--------------|-----------------|
| `/` | `home` | `home.liquid` ou `front-page.liquid` |
| `/posts` | `archive` (tipo `post`) | `archive.liquid` ou `archive-post.liquid` |
| `/category/{term-slug}` | `taxonomy` (type `category`) | `taxonomy-category-{slug}.liquid` → `taxonomy.liquid` → `archive.liquid` |
| `/tag/{term-slug}` | `taxonomy` (type `tag`) | `taxonomy-tag-{slug}.liquid` → `taxonomy.liquid` → `archive.liquid` |
| `/search?q={termo}` | `search` | `search.liquid` → `archive.liquid` → `index.liquid` |
| `/{post-type-slug}` | `archive` (CPT arquivável) | `archive-{type}.liquid` → `archive.liquid` |
| `/{post-type-slug}?page=2` | `archive` paginado | `archive.liquid` |
| `/meu-slug` | `single` ou `page` | `single.liquid` / `page.liquid` |
| slug inexistente / tipo não arquivável | `404` | `404.liquid` |

**Post types arquiváveis:** todos os tipos cadastrados em `edp_post_types`, exceto tipos internos (`page`, `attachment`, `themes`, `user`, `settings`, etc.). Tipos customizados criados no admin ganham archive em `/{slug}` automaticamente.

**Colisão de slug:** se existir um post publicado com o mesmo slug de um CPT arquivável (ex.: conteúdo e tipo `produtos`), **o archive do post type vence** e a URL lista o tipo, não o post singular.

Exemplo de template específico: `templates/archive-produtos.liquid` para o CPT `produtos`.

**Locales na URL:**

| Locale | Prefixo | Home |
|--------|---------|------|
| `pt-br` (padrão) | `""` | `/` |
| `en` | `/en` | `/en` |
| `es` | `/es` | `/es` |

Exemplos: `/en/posts`, `/en/meu-slug`, `/search?q=termo`, `/en/search?q=termo`.

**Busca:** use o parâmetro `q` (não `s` do WordPress). `/search` sem `q` renderiza a página de busca vazia (HTTP 200). Paginação: `/search?q=foo&page=2`.

Links internos devem usar `{{ site.locale_prefix }}/{{ post.slug }}` para respeitar o idioma ativo.

## Layouts e partials

### `{% layout 'layouts/base' %}`

Coloque na **primeira linha** do template de página. O conteúdo abaixo é renderizado e injetado no layout via `{% page_content %}`.

```liquid
{% layout 'layouts/base' %}
<h1>{{ post.title }}</h1>
{% the_content %}
```

Se `theme.json` define `"layout": "layouts/base"`, o layout padrão é aplicado mesmo sem a diretiva (a diretiva na primeira linha tem prioridade).

### `{% page_content %}`

Usado **apenas no layout**. Recebe o HTML já renderizado do template da rota atual.

### `{% include 'parts/header' %}`

Inclui outro arquivo do pacote (`templates/parts/header.liquid`). Paths relativos a `templates/`, sem extensão.

## Variáveis globais do contexto

Objeto raiz disponível em todos os templates (definido em `ThemeRenderContext`).

### `site`

| Propriedade | Tipo | Descrição |
|-------------|------|-----------|
| `site.title` | string | Nome do site (`settings.site_name`) |
| `site.description` | string | Descrição (`settings.site_description`) |
| `site.locale` | string | Locale ativo: `pt-br`, `en`, `es` |
| `site.locale_prefix` | string | Prefixo de URL: `""` ou `/en` |
| `site.home_url` | string | URL da home no locale: `/` ou `/en` |
| `site.base_url` | string | Origem absoluta: `https://example.com` |
| `site.html_lang` | string | Atributo `lang`: `pt-BR`, `en`, `es` |
| `site.year` | number | Ano atual (rodapé, copyright) |

### `seo`

Preenchido pelo core a partir do post da rota ou fallbacks do site.

| Propriedade | Tipo | Descrição |
|-------------|------|-----------|
| `seo.title` | string | Título da página |
| `seo.description` | string | Meta description |
| `seo.canonical` | string | URL canônica |
| `seo.og_image` | string? | Imagem Open Graph |
| `seo.og_type` | string | Ex.: `website`, `article` |
| `seo.site_name` | string? | Nome do site para OG |
| `seo.json_ld_html` | string? | `<script type="application/ld+json">` (não use direto; prefira `{% seo_head %}`) |

**Regras de `seo.title` (e `<title>` via `{% seo_head %}`):**

| Rota | `seo.title` |
|------|-------------|
| Home com `home_list_posts: true` | `site_name` (`site.title`) |
| Home com `home_content_key` e post encontrado | título do post (ou `seo.title` do post) |
| Home sem post de conteúdo | `site_name` |
| Archive | nome do CPT (`archive.title`) |
| Single / page | título do post atual |

`seo.site_name` e `site.title` vêm sempre do setting `site_name`.

### `theme`

| Propriedade | Tipo | Descrição |
|-------------|------|-----------|
| `theme.slug` | string | Slug do tema ativo |
| `theme.version` | string | Versão do `theme.json` |
| `theme.asset_base_url` | string | Base dos assets: `{origin}/themes-assets/{slug}` |

### `route`

| Propriedade | Tipo | Descrição |
|-------------|------|-----------|
| `route.kind` | string | `home`, `single`, `page`, `archive`, `taxonomy`, `search`, `404` |
| `route.path` | string | Path da requisição (ex.: `/posts`, `/en/sobre`) |
| `route.locale` | string | Locale normalizado da URL |

### `post` (post ou página atual)

Disponível quando há conteúdo singular na rota (slug, ou home via `home_content_key` quando `home_list_posts` não está ativo). Com `home_list_posts: true`, use `posts` na home; `post` pode estar ausente.

| Propriedade | Tipo | Descrição |
|-------------|------|-----------|
| `post.id` | number | ID no banco |
| `post.title` | string | Título |
| `post.slug` | string | Slug público |
| `post.excerpt` | string | Resumo |
| `post.body_html` | string | HTML bruto (prefira `{% the_content %}`) |
| `post.author_name` | string | Nome do autor |
| `post.published_at` | number \| null | Timestamp Unix (ms) |
| `post.post_type_slug` | string | `post`, `page`, etc. |
| `post.cover_image` | string? | URL absoluta da imagem de capa |
| `post.meta` | objeto | Metadados (`translation_key`, campos customizados, etc.) |

### `posts` (listagem)

Sempre disponível em todas as rotas. Cada item tem a mesma forma de `post`. O template escolhe quando iterar (ex.: `home.liquid` pode listar `posts` na `/`).

### `archive`

Sempre disponível. Metadados da listagem atual.

| Propriedade | Tipo | Descrição |
|-------------|------|-----------|
| `archive.title` | string | Título do arquivo (ex.: `Blog`) |
| `archive.type` | string | Post type filtrado (ex.: `post`) ou `search` na rota de busca |

### `search`

Disponível quando `route.kind` é `search` (`is_search` é `true`).

| Propriedade | Tipo | Descrição |
|-------------|------|-----------|
| `search.query` | string | Termo de busca (`?q=`) |
| `search.total` | number | Total de resultados encontrados |

### `pagination`

Sempre disponível (página 1 fora de rotas de arquivo). Em `archive`, reflete a paginação da listagem.

| Propriedade | Tipo | Descrição |
|-------------|------|-----------|
| `pagination.page` | number | Página atual |
| `pagination.total_pages` | number | Total de páginas |
| `pagination.prev_url` | string? | URL da página anterior |
| `pagination.next_url` | string? | URL da próxima página |

Use `{% pagination %}` para renderizar os links automaticamente.

Na rota `search`, `{% pagination %}` preserva `?q=` ao mudar de página (ex.: `/search?q=foo&page=2`).

**Formulário de busca** (`templates/parts/searchform.liquid` ou inline no header):

```liquid
<form action="{{ site.locale_prefix }}/search" method="get" role="search">
  <label for="search-field">Buscar</label>
  <input id="search-field" type="search" name="q" value="{{ search.query }}" />
  <button type="submit">Buscar</button>
</form>
```

**Template de resultados** (`templates/search.liquid`):

```liquid
{% layout 'layouts/base' %}
<h1>{% if search.query != blank %}Resultados para “{{ search.query }}”{% else %}Busca{% endif %}</h1>
<p>{{ search.total }} resultado(s)</p>
{% for item in posts %}
  <article>
    <h2><a href="{{ site.locale_prefix }}/{{ item.slug }}">{{ item.title }}</a></h2>
    {% if item.excerpt %}<p>{{ item.excerpt }}</p>{% endif %}
  </article>
{% else %}
  <p>Nenhum resultado.</p>
{% endfor %}
{% pagination %}
```

### Flags condicionais (estilo WordPress)

Sempre disponíveis. Use em qualquer template para decidir o que renderizar:

| Variável | Quando é `true` |
|----------|-----------------|
| `is_front_page` | Rota `/` (home) |
| `is_single` | Post do tipo `post` |
| `is_page` | Página estática |
| `is_singular` | `is_single` ou `is_page` |
| `is_archive` | Listagem `/posts`, `/{cpt}` arquivável, `/category/{slug}`, `/tag/{slug}`, etc. (`route.kind` pode ser `archive` ou `taxonomy`) |
| `is_search` | Rota `/search` (com ou sem `?q=`) |
| `is_404` | Slug não encontrado |
| `have_posts` | `posts` tem pelo menos um item |

```liquid
{% if is_front_page %}
  <h1>Bem-vindo</h1>
  {% for item in posts %}
    <article>{{ item.title }}</article>
  {% endfor %}
{% elsif is_single %}
  <h1>{{ post.title }}</h1>
  {% the_content %}
{% endif %}
```

### `locale_switcher`

Array de links PT/EN (e extensível no core). As URLs são derivadas da **rota pública atual**, não dos slugs de tradução no banco.

| Rota (`route.kind`) | `item.url` por locale |
|---------------------|------------------------|
| `home` (sem slug) | `/` (pt-br), `/en` (en) |
| `archive` | `/posts` ou `/{cpt}` com prefixo do locale |
| `search` | `/search?q=...` com prefixo do locale (preserva `q`) |
| `single`, `page` ou qualquer rota com `slug` | `/{slug}` com prefixo do locale (mesmo slug em todos os idiomas) |
| `404` sem slug | home do locale (`/` ou `/en`) |

| Propriedade | Tipo | Descrição |
|-------------|------|-----------|
| `item.code` | string | `pt-br`, `en` |
| `item.label` | string | `PT`, `EN` |
| `item.flag` | string | Emoji da bandeira |
| `item.url` | string | URL equivalente no outro idioma |
| `item.active` | boolean | Se é o locale atual |

```liquid
{% for item in locale_switcher %}
  <a href="{{ item.url }}"{% if item.active %} class="is-active"{% endif %}>{{ item.flag }}</a>
{% endfor %}
```

### `menus`

Mapa de menus por localização. O core popula `menus.primary` a partir de posts publicados do tipo `menus` no CMS: cada post pode ter um bloco de custom field **"menu navigation"** com linhas `name` (rótulo) e `value` (URL). A API `/api/content/posts?filter_post_type=menus` retorna os mesmos dados para integrações externas.

Cada item: `label`, `url`, `active` (boolean — `true` quando `url` coincide com `route.path`).

Alternativa: `{% nav_menu 'primary' %}` gera o `<nav>` completo.

### `content`

Apenas **dentro do layout**: HTML renderizado do template da página (`{% page_content %}` imprime este valor).

### `body_class`

String com classes CSS geradas pelo core, ex.: `route-home locale-pt_br type-post slug-hello-world`.

Use `{% body_class %}` no `<body>` para emitir `class="..."`.

---

## Tags do core Edgepress

Tags registradas em `src/core/theme/theme-api.ts`. Equivalentes aproximados ao WordPress entre parênteses.

### `{% seo_head %}`

Equivalente a `wp_head()` (parte SEO). Emite em uma linha:

- `<title>`, charset, viewport
- `<meta name="description">`
- `<link rel="canonical">`
- Open Graph (`og:*`)
- Twitter Card
- JSON-LD (quando disponível no post)

```liquid
<head>
  {% seo_head %}
  {% theme_styles %}
</head>
```

### `{% the_content %}`

Equivalente a `the_content()`. Renderiza `post.body_html` dentro de `<div class="entry-content block-editor-content">` com **HTML sanitizado** (tags seguras para conteúdo editorial).

Só produz saída quando `post` existe.

### `{% blocknote_content %}`

Variante **C3 híbrida** para conteúdo BlockNote:

1. Renderiza o HTML sanitizado imediatamente (fallback SEO / sem JavaScript).
2. Se `post.body_blocks` existir, inclui um nó de hidratação com o JSON dos blocos.
3. Quando o tema declara `"blocknote"` em `theme.json` → `supports`, `{% scripts_footer %}` injeta o bundle público BlockNote (CSS + JS) para montar o editor readonly no cliente.

Use em páginas com layout BlockNote (colunas, blocos custom). Templates que não precisam de hidratação podem continuar com `{% the_content %}`.

Opt-in no manifest:

```json
"supports": ["home", "single", "page", "blocknote"]
```

### `{% nav_menu 'primary' %}`

Equivalente a `wp_nav_menu()`. Argumento: chave do menu (`primary` → `menus.primary`).

Gera:

```html
<nav class="site-nav" aria-label="primary">
  <ul>
    <li class="is-active"><a href="...">...</a></li>
  </ul>
</nav>
```

### `{% pagination %}`

Equivalente a `the_posts_pagination()`. Links Anterior / Próxima e indicador `página / total`. Só aparece se `pagination.total_pages > 1`.

### `{% theme_styles %}`

Equivalente a `wp_enqueue_style`. Inclui:

```html
<link rel="stylesheet" href="{asset_base_url}/theme.css" />
```

### `{% scripts_footer %}`

Equivalente a `wp_footer()` (scripts). Inclui HTMX, Alpine.js e `theme.js` do tema. Quando o tema suporta `"blocknote"` e a página atual tem `body_blocks`, também inclui CSS/JS do BlockNote readonly (`/_astro/blocknote-readonly-mount.*`).

```html
<script src="https://unpkg.com/htmx.org@2.0.8" defer></script>
<script src="https://unpkg.com/alpinejs@3.15.8/dist/cdn.min.js" defer></script>
<script src="{asset_base_url}/theme.js" defer></script>
```

### `{% html_attrs %}`

Equivalente a `language_attributes()`. Emite `lang="pt-BR"` (ou `en`, `es`) para o elemento `<html>`.

```liquid
<html {% html_attrs %}>
```

### `{% body_class %}`

Equivalente a `body_class()`. Emite `class="route-home locale-pt_br ..."` ou string vazia se não houver classes.

```liquid
<body {% body_class %}>
```

### `{% page_content %}`

Placeholder do layout. Insere o HTML da página renderizada. **Não use** em templates de rota — apenas em `layouts/*.liquid`.

---

## Funções de tema

Funções assíncronas que consultam o CMS em tempo de renderização. Cada uma popula uma variável no template via `as`.

### `{% get_taxonomies %}`

Lista termos de taxonomia associados a um post type. O segundo argumento deve ser o **type exato** cadastrado no banco (`category`, `tag`, `categorias`, etc.), conforme o `meta_schema.taxonomy` do post type.

**Sintaxe:**

```liquid
{% get_taxonomies 'post', 'category' as categories %}
```

| Parâmetro | Descrição |
|-----------|-----------|
| 1º argumento | Slug do post type (`post`, `jobs`, …) |
| 2º argumento | Type da taxonomia no banco (`category`, `tag`, …) |
| `as` | Nome da variável que receberá o array |

**Formato de cada item:**

```json
{ "name": "Tecnologia", "slug": "tecnologia" }
```

Termos que são pais de outros (raízes de hierarquia) são excluídos automaticamente.

**Exemplos:**

```liquid
{% get_taxonomies 'post', 'category' as categories %}
<ul class="categories">
  {% for cat in categories %}
    <li><a href="/category/{{ cat.slug }}">{{ cat.name }}</a></li>
  {% endfor %}
</ul>

{% get_taxonomies 'post', 'tag' as tags %}
<div class="tags">
  {% for tag in tags %}
    <span class="tag">{{ tag.name }}</span>
  {% endfor %}
</div>
```

Se o post type não tiver o taxonomy type no `meta_schema`, a variável recebe `[]`.

### `{% get_related_posts %}`

Lista posts publicados que compartilham **pelo menos uma categoria** (`type: category`) com o post informado. O post atual nunca entra na lista.

**Sintaxe:**

```liquid
{% get_related_posts post.id as related %}
{% get_related_posts post.id, 6 as related %}
{% get_related_posts post.slug as related %}
```

| Parâmetro | Descrição |
|-----------|-----------|
| 1º argumento | ID ou slug do post (expressão Liquid ou literal) |
| 2º argumento (opcional) | Quantidade máxima; padrão **4** |
| `as` | Nome da variável que recebe o array |

**Formato de cada item:** mesmo shape de `post` / itens em `posts` (`ThemePostView`: `id`, `title`, `slug`, `excerpt`, `cover_image`, etc.).

**Exemplo em `single.liquid`:**

```liquid
{% get_related_posts post.id as related %}
{% if related.size > 0 %}
  <aside class="related-posts">
    <h2>Leia também</h2>
    <ul>
      {% for item in related %}
        <li><a href="{{ site.locale_prefix }}/{{ item.slug }}">{{ item.title }}</a></li>
      {% endfor %}
    </ul>
  </aside>
{% endif %}
```

Post inexistente ou sem categorias → `[]`. Em produção, a lista de IDs é cacheada no KV (`related:post:id:...`); cada post relacionado reutiliza o cache individual `post:id:...`.

### `{% get_author %}`

Retorna o autor de um post (via ID ou slug). Se o post não existir ou não tiver `author_id`, a variável recebe **`null`**.

**Sintaxe:**

```liquid
{% get_author post.id as author %}
{% get_author post.slug as author %}
{% get_author 'hello-world' as author %}
```

| Parâmetro | Descrição |
|-----------|-----------|
| 1º argumento | ID ou slug do post (expressão Liquid ou literal) |
| `as` | Nome da variável que recebe o objeto ou `null` |

**Formato quando encontrado:** `{ name, image, description }` — strings vazias quando o campo não está preenchido no banco.

**Exemplo em `single.liquid`:**

```liquid
{% get_author post.id as author %}
{% if author %}
  <aside class="author-box">
    {% if author.image != blank %}
      <img src="{{ author.image }}" alt="{{ author.name }}" />
    {% endif %}
    <h3>{{ author.name }}</h3>
    {% if author.description != blank %}
      <p>{{ author.description }}</p>
    {% endif %}
  </aside>
{% endif %}
```

Em produção, dados do autor são cacheados no KV (`author:user:{userId}`).

---

## Filtros do core Edgepress

### `| asset`

Equivalente a `get_template_directory_uri()` + arquivo.

```liquid
<link rel="stylesheet" href="{{ 'theme.css' | asset }}" />
<img src="{{ 'logo.png' | asset }}" alt="" />
```

Resolve para `{theme.asset_base_url}/{arquivo}` (servido via `/themes-assets/{slug}/...`).

### `| post_date`

Equivalente a `the_date()`. Formata timestamp em **pt-BR** (`dd/mm/aaaa`).

```liquid
<time>{{ post.published_at | post_date }}</time>
```

Aceita `number` (ms Unix) ou string parseável por `Date`. Retorna `""` se inválido.

### `| escape`

Escape HTML (`&`, `<`, `>`). O motor já usa `outputEscape: "escape"` por padrão; use quando precisar escapar explicitamente em atributos ou trechos especiais.

```liquid
<meta name="x" content="{{ valor | escape }}" />
```

---

## Liquid padrão (LiquidJS)

Além das extensões Edgepress, todos os templates podem usar a sintaxe [LiquidJS](https://liquidjs.com/tutorials/intro-to-liquid.html).

### Saída

```liquid
{{ variavel }}
{{ post.title | default: 'Sem título' }}
{{ texto | upcase }}
{{ lista | join: ', ' }}
```

### Controle de fluxo

```liquid
{% if post.excerpt %}
  <p>{{ post.excerpt }}</p>
{% elsif route.locale == 'en' %}
  <p>No excerpt.</p>
{% else %}
  <p>Sem resumo.</p>
{% endif %}

{% unless post.cover_image %}
  <p class="no-thumb">Sem imagem</p>
{% endunless %}

{% case route.kind %}
  {% when 'home' %}…
  {% when 'archive' %}…
  {% else %}…
{% endcase %}
```

### Loops

```liquid
{% for item in posts %}
  <article>
    <h2>{{ item.title }}</h2>
    {% if forloop.first %}<!-- primeiro -->{% endif %}
    {% if forloop.last %}<!-- último -->{% endif %}
  </article>
{% else %}
  <p>Nenhum item.</p>
{% endfor %}
```

Objeto `forloop`: `first`, `last`, `index`, `index0`, `length`, `rindex`, `rindex0`.

### Variáveis e blocos

```liquid
{% assign titulo = post.title | default: site.title %}
{% capture sidebar %}
  <aside>{{ site.description }}</aside>
{% endcapture %}

{% comment %} Comentário Liquid — não aparece no HTML {% endcomment %}

{% raw %}
  {% isto não é processado %}
{% endraw %}
```

### Filtros LiquidJS úteis (built-in)

| Filtro | Exemplo |
|--------|---------|
| `default` | `{{ post.excerpt \| default: site.description }}` |
| `truncate` | `{{ post.excerpt \| truncate: 120 }}` |
| `strip_html` | `{{ post.body_html \| strip_html }}` |
| `date` | `{{ post.published_at \| date: '%Y-%m-%d' }}` |
| `json` | `{{ post.meta \| json }}` |
| `split` / `join` | manipulação de strings |
| `plus`, `minus`, `times`, `divided_by` | números |

Lista completa: [filtros LiquidJS](https://liquidjs.com/filters/overview.html).

---

## Dados por tipo de rota (resumo)

Todas as variáveis de conteúdo estão **sempre disponíveis** em qualquer rota. O template escolhe o que usar com flags condicionais ou `route.kind`.

| Rota | `route.kind` | Template típico | Uso comum |
|------|--------------|-----------------|-----------|
| `/` | `home` | `front-page` ou `home` | `posts` para listagem, ou `post` para página fixa |
| `/posts`, `/blog` | `archive` | `archive` | aliases do tipo `post` |
| `/{cpt-slug}` | `archive` | `archive-{type}` | listagem do CPT (prioridade sobre post com mesmo slug) |
| `/meu-slug` | `single` ou `page` | `single-*` ou `page-*` | `post`, `{% the_content %}` |
| `/search?q=...` | `search` | `search` | `search.query`, `search.total`, loop em `posts` |
| slug inexistente | `404` | `404` | mensagem de erro |

**Temas de referência:**

- `src/themes/2026/` — home com post único (`home_content_key`) e `{% the_content %}`
- `src/themes-default/blog-rhamses/` — home lista `posts` diretamente no template

---

## Assets

- Arquivos em `assets/` são enviados ao R2 em `themes/{slug}/assets/`.
- URLs públicas: `{{ 'arquivo.css' | asset }}` ou `{{ theme.asset_base_url }}/arquivo.css`.
- `theme.css` e `theme.js` são convenções usadas por `{% theme_styles %}` e `{% scripts_footer %}`.

---

## Desenvolvimento local

```bash
npm run theme:dev
```

Preview em `http://localhost:4322` com o mesmo motor Liquid do Worker. Por padrão carrega `src/themes/2026/`; altere o pacote em `scripts/theme-dev.ts` ou use upload/ZIP para testar outro tema no ambiente completo (`npm run dev`).

Hot reload: salvar `.liquid`, `theme.json` ou arquivos em `assets/` recarrega o browser.

---

## Checklist para um template novo

1. Criar arquivo em `templates/` com nome na hierarquia WordPress (ex.: `home.liquid`, `single-post.liquid`).
2. Adicionar `{% layout 'layouts/base' %}` (ou confiar em `layout` no manifest).
3. Usar flags (`is_front_page`, `is_single`, …) e variáveis (`post`, `posts`) conforme a página.
4. Opcional: `home_content_key` para popular `post` na home com uma página fixa.
5. Prefixar links com `{{ site.locale_prefix }}` para i18n.
6. Incluir `{% seo_head %}`, `{% theme_styles %}`, `{% scripts_footer %}` no layout.
7. Testar `/`, `/posts`, `/{cpt-slug}`, um slug de post, uma página e `/en/...` se houver traduções.

---

## Implementação no código

| Recurso | Arquivo |
|---------|---------|
| Tags e filtros | `src/core/theme/theme-api.ts` |
| Variáveis do contexto | `src/core/theme/context.ts` |
| Render e layout | `src/core/theme/render.ts` |
| Hierarquia de templates | `src/core/theme/resolve-template.ts` |
| Rotas e locales | `src/core/theme/resolve-route.ts` |
| Post types arquiváveis | `src/core/theme/post-type-routes.ts` |
| Tipos TypeScript | `src/core/theme/types.ts` |
