/**
 * Preview local de tema Liquid (motor idêntico ao Worker, contexto estático).
 * Hot reload: observa templates/assets/theme.json e recarrega o browser via SSE.
 *
 * Uso: npm run theme:dev
 */
import { watch } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { join } from "node:path";
import {
  DEFAULT_THEME_DIR,
  loadDefaultThemeAssets,
  loadDefaultThemePackage,
} from "../src/themes-default/2026/load-package.ts";
import { renderTheme, resetLiquidForTests } from "../src/core/theme/render.ts";
import { resolvePublicRoute, localeToHtmlLang, publicLocaleHomeUrl, publicLocaleUrlPrefix } from "../src/core/theme/resolve-route.ts";
import type { LocaleSwitcherItem, ResolvedPublicRoute, ThemePackageRecord, ThemeRenderContext } from "../src/core/theme/types.ts";

const PORT = Number(process.env["THEME_DEV_PORT"] ?? 4322);
const RELOAD_PATH = "/__theme_dev/events";
const WATCHABLE = /\.(liquid|json|css|js|svg|png|jpe?g|webp)$/i;

let themePackage = loadDefaultThemePackage();
const reloadClients = new Set<ServerResponse>();

function reloadThemePackage(reason: string): void {
  resetLiquidForTests();
  themePackage = loadDefaultThemePackage();
  console.log(`[theme:dev] reload (${reason})`);
  for (const client of reloadClients) {
    client.write("data: reload\n\n");
  }
}

function startThemeWatcher(): void {
  let debounce: ReturnType<typeof setTimeout> | null = null;

  const scheduleReload = (filename: string) => {
    if (!WATCHABLE.test(filename)) return;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => reloadThemePackage(filename), 120);
  };

  const onWatchEvent = (_event: string, filename: string | null) => {
    if (filename) scheduleReload(filename);
  };

  try {
    watch(DEFAULT_THEME_DIR, { recursive: true }, onWatchEvent);
    console.log(`[theme:dev] watching ${DEFAULT_THEME_DIR}`);
    return;
  } catch {
    // Linux: recursive pode falhar — observa subpastas conhecidas.
  }

  watch(join(DEFAULT_THEME_DIR, "templates"), { recursive: true }, onWatchEvent);
  watch(join(DEFAULT_THEME_DIR, "assets"), onWatchEvent);
  watch(join(DEFAULT_THEME_DIR, "theme.json"), onWatchEvent);
  console.log(`[theme:dev] watching ${DEFAULT_THEME_DIR} (templates, assets, theme.json)`);
}

function buildDevLocaleUrl(
  targetLocale: string,
  route: ResolvedPublicRoute,
  kind: string,
): string {
  const prefix = publicLocaleUrlPrefix(targetLocale);
  if (kind === "archive") return `${prefix}/posts`;
  if (route.slug) {
    if (route.slug === "hello-world" && targetLocale === "en") return "/en/hello-world-en";
    if (route.slug === "hello-world-en" && targetLocale === "pt-br") return "/hello-world";
    if (route.slug === "hello-world-post" && targetLocale === "en") return "/en/hello-world-post-en";
    if (route.slug === "hello-world-post-en" && targetLocale === "pt-br") return "/hello-world-post";
    return `${prefix}/${route.slug}`;
  }
  return publicLocaleHomeUrl(targetLocale);
}

function buildDevLocaleSwitcher(
  route: ResolvedPublicRoute,
  kind: string,
): LocaleSwitcherItem[] {
  return [
    {
      code: "pt-br",
      flag: "🇧🇷",
      label: "PT",
      url: buildDevLocaleUrl("pt-br", route, kind),
      active: route.locale === "pt-br",
    },
    {
      code: "en",
      flag: "🇺🇸",
      label: "EN",
      url: buildDevLocaleUrl("en", route, kind),
      active: route.locale === "en",
    },
  ];
}

function buildDevContext(
  url: URL,
  route: ResolvedPublicRoute,
  pkg: ThemePackageRecord,
): ThemeRenderContext {
  const baseUrl = url.origin;
  const locale = route.locale;
  const localePrefix = publicLocaleUrlPrefix(locale);
  const homeUrl = publicLocaleHomeUrl(locale);

  let kind = route.kind;
  if (route.slug && kind === "page") {
    kind = route.slug.includes("post") ? "single" : "page";
  }

  const post = {
    id: 1,
    title: kind === "home" ? "Bem-vindo ao Edgepress" : `Preview: ${route.slug ?? "home"}`,
    slug: route.slug ?? "hello-world",
    excerpt: "Texto de exemplo para preview local do tema.",
    body_html:
      "<p>Este é o preview do tema via <code>npm run theme:dev</code>. Use <code>npm run dev</code> para conteúdo real do CMS.</p>",
    author_name: "Edgepress",
    published_at: Date.now(),
    post_type_slug: kind === "single" ? "post" : "page",
    meta: {},
  };

  const is_front_page = kind === "home";
  const is_single = kind === "single";
  const is_page = kind === "page";
  const is_singular = is_single || is_page;
  const is_archive = kind === "archive";
  const is_404 = kind === "404";
  const posts = [post];
  const have_posts = posts.length > 0;

  return {
    site: {
      title: "Edgepress Theme Dev",
      description: "Preview local do tema Liquid",
      locale,
      locale_prefix: localePrefix,
      home_url: homeUrl,
      base_url: baseUrl,
      html_lang: localeToHtmlLang(locale),
      year: new Date().getFullYear(),
    },
    seo: {
      title: post.title,
      description: post.excerpt,
      canonical: `${baseUrl}${route.path || "/"}`,
      og_type: kind === "single" ? "article" : "website",
      site_name: "Edgepress Theme Dev",
    },
    menus: {
      primary: [
        { label: "Home", url: "/", active: route.path === "/" },
        { label: "Blog", url: "/posts", active: route.path.startsWith("/posts") },
      ],
    },
    theme: {
      slug: pkg.manifest.slug,
      version: pkg.manifest.version,
      asset_base_url: `${baseUrl}/themes-assets/${pkg.manifest.slug}`,
    },
    route: { kind, path: route.path, locale },
    body_class: `route-${kind} locale-${locale.replace(/-/g, "_")}`,
    locale_switcher: buildDevLocaleSwitcher(route, kind),
    post,
    posts,
    archive: { title: "Blog", type: "post" },
    pagination: { page: 1, total_pages: 1 },
    is_front_page,
    is_single,
    is_page,
    is_singular,
    is_archive,
    is_404,
    have_posts,
  };
}

function injectLiveReload(html: string): string {
  const script = `<script>
(function () {
  var es = new EventSource(${JSON.stringify(RELOAD_PATH)});
  es.onmessage = function () { location.reload(); };
  es.onerror = function () { es.close(); setTimeout(function () { location.reload(); }, 1500); };
})();
</script>`;
  if (html.includes("</body>")) {
    return html.replace("</body>", `${script}</body>`);
  }
  return `${html}${script}`;
}

function serveSse(res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(": connected\n\n");
  reloadClients.add(res);
  res.on("close", () => reloadClients.delete(res));
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const pathname = url.pathname;

    if (pathname === RELOAD_PATH) {
      serveSse(res);
      return;
    }

    if (pathname.startsWith("/themes-assets/")) {
      const assetPath = pathname.replace(/^\/themes-assets\/[^/]+\//, "");
      const assets = loadDefaultThemeAssets();
      const file = assets.get(assetPath);
      if (!file) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const contentType = assetPath.endsWith(".css")
        ? "text/css; charset=utf-8"
        : assetPath.endsWith(".js")
          ? "application/javascript; charset=utf-8"
          : "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      });
      res.end(Buffer.from(file));
      return;
    }

    const route = resolvePublicRoute(pathname, url.searchParams);
    const ctx = buildDevContext(url, route, themePackage);
    const html = injectLiveReload(await renderTheme(themePackage, ctx));

    res.writeHead(ctx.route.kind === "404" ? 404 : 200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(html);
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(err instanceof Error ? err.message : "Theme dev error");
  }
});

server.listen(PORT, () => {
  startThemeWatcher();
  console.log(`[theme:dev] http://localhost:${PORT}`);
  console.log("[theme:dev] Hot reload ativo — edite templates/assets em src/themes-default/2026/");
  console.log("[theme:dev] Static preview — use npm run dev for CMS content");
});
