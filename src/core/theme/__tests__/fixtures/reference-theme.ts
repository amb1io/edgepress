import type { ThemePackageRecord } from "../types.ts";

const baseLayout = `<!doctype html>
<html {% html_attrs %}>
  <head>
    {% seo_head %}
    {% theme_styles %}
  </head>
  <body {% body_class %}>
    {% include 'parts/header' %}
    <main class="site-main">
      {% page_content %}
    </main>
    {% include 'parts/footer' %}
    {% scripts_footer %}
  </body>
</html>`;

const headerPartial = `<header class="site-header">
  <div class="site-header-inner">
    <a href="{{ site.home_url }}" class="site-brand">{{ site.title }}</a>
    <div class="site-header-actions">
      {% nav_menu 'primary' %}
      <nav class="site-lang-switcher" aria-label="Language">
        {% for item in locale_switcher %}
          <a
            href="{{ item.url }}"
            class="site-lang-link{% if item.active %} is-active{% endif %}"
            hreflang="{{ item.code }}"
            aria-label="{{ item.label }}"
          >{{ item.flag }}</a>
        {% endfor %}
      </nav>
    </div>
  </div>
</header>`;

const footerPartial = `<footer class="site-footer">
  <div class="site-footer-inner">
    <p>&copy; {{ site.year }} {{ site.title }}. Todos os direitos reservados.</p>
  </div>
</footer>`;

const homeTemplate = `{% layout 'layouts/base' %}
<section class="hero">
  <h1>{{ post.title | default: site.title }}</h1>
  {% if post.excerpt %}
    <p class="lead">{{ post.excerpt }}</p>
  {% endif %}
</section>
<section class="entry">
  {% the_content %}
</section>
<aside class="theme-api-demo">
  <h2>Theme API (tutorial)</h2>
</aside>`;

const notFoundTemplate = `{% layout 'layouts/base' %}
<section class="error-404">
  <h1>Página não encontrada</h1>
  <p>O conteúdo <code>{{ route.path }}</code> não existe.</p>
</section>`;

export const referenceThemePackage: ThemePackageRecord = {
  manifest: {
    name: "Reference",
    slug: "reference",
    version: "1.0.0",
    engine: "liquid",
    supports: ["home", "single", "page", "archive"],
    templates: {},
    layout: "layouts/base",
  },
  templates: {
    "layouts/base": baseLayout,
    "parts/header": headerPartial,
    "parts/footer": footerPartial,
    index: homeTemplate,
    "404": notFoundTemplate,
  },
  updated_at: Date.now(),
};
