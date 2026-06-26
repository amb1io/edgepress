import type { ThemeManifest, ThemeRouteKind } from "./types.ts";

const FALLBACK_ORDER: ThemeRouteKind[] = ["page", "single", "home"];

/** WordPress-style template hierarchy for Liquid themes. */
export function resolveTemplateKey(
  kind: ThemeRouteKind,
  manifest: ThemeManifest,
): string | null {
  const templates = manifest.templates ?? {};

  if (kind === "404") {
    return templates["404"] ?? templates.page ?? templates.single ?? null;
  }

  const direct = templates[kind];
  if (direct) return direct;

  if (kind === "page" || kind === "single") {
    for (const fallback of FALLBACK_ORDER) {
      const key = templates[fallback];
      if (key) return key;
    }
  }

  if (kind === "archive") {
    return templates.archive ?? templates.home ?? null;
  }

  return templates.home ?? null;
}

/** Normalizes manifest template paths to KV keys (without `templates/` prefix or `.liquid`). */
export function normalizeTemplateKey(path: string): string {
  let key = path.trim().replace(/^\/+/, "");
  if (key.startsWith("templates/")) {
    key = key.slice("templates/".length);
  }
  if (key.endsWith(".liquid")) {
    key = key.slice(0, -".liquid".length);
  }
  return key;
}
