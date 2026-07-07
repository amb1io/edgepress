/**
 * Astro-style file-based route matching for Liquid theme templates.
 *
 * Routable templates live under `templates/` and use folder segments plus
 * dynamic params: `[name]` (one segment) or `[...name]` (catch-all).
 * `index` as the final segment maps to the parent directory URL.
 * `layouts/**` and `parts/**` are never routable.
 * `404` and `archive` are fallback-only (never matched from a URL).
 */

export type RouteSegment =
  | { type: "static"; value: string }
  | { type: "dynamic"; param: string }
  | { type: "catch-all"; param: string };

export type RouteEntry = {
  templateKey: string;
  segments: RouteSegment[];
  /** Higher = more specific (static beats dynamic). */
  priority: number;
};

export type MatchedRoute = {
  templateKey: string;
  params: Record<string, string>;
  /** Static URL path segments captured by the pattern (excludes dynamic values). */
  staticSegments: string[];
};

const NON_ROUTABLE_PREFIXES = ["layouts/", "parts/"] as const;
const FALLBACK_ONLY_KEYS = new Set(["404", "archive"]);

export function isRoutableTemplateKey(key: string): boolean {
  const normalized = key.trim();
  if (!normalized) return false;
  if (FALLBACK_ONLY_KEYS.has(normalized)) return false;
  return !NON_ROUTABLE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function segmentPriority(segment: RouteSegment): number {
  if (segment.type === "static") return 2;
  if (segment.type === "dynamic") return 1;
  return 0;
}

function parseSegment(part: string): RouteSegment | null {
  const catchAll = part.match(/^\[\.\.\.(.+)\]$/);
  if (catchAll) {
    const param = catchAll[1]?.trim();
    return param ? { type: "catch-all", param } : null;
  }
  const dynamic = part.match(/^\[(.+)\]$/);
  if (dynamic) {
    const param = dynamic[1]?.trim();
    return param ? { type: "dynamic", param } : null;
  }
  if (!part) return null;
  return { type: "static", value: part };
}

export function parseTemplateKeyToRoute(templateKey: string): RouteEntry | null {
  if (!isRoutableTemplateKey(templateKey)) return null;

  const parts = templateKey.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  const isIndexRoute = parts[parts.length - 1] === "index";
  const routeParts = isIndexRoute ? parts.slice(0, -1) : parts;

  const segments: RouteSegment[] = [];
  let priority = 0;

  for (const part of routeParts) {
    const segment = parseSegment(part);
    if (!segment) return null;
    if (segment.type === "catch-all" && routeParts.indexOf(part) !== routeParts.length - 1) {
      return null;
    }
    segments.push(segment);
    priority += segmentPriority(segment);
  }

  if (isIndexRoute) {
    priority += 1;
  }

  return { templateKey, segments, priority };
}

export function buildRouteTable(templateKeys: string[]): RouteEntry[] {
  const entries: RouteEntry[] = [];
  for (const key of templateKeys) {
    const entry = parseTemplateKeyToRoute(key);
    if (entry) entries.push(entry);
  }
  return entries;
}

function tryMatchEntry(
  entry: RouteEntry,
  urlSegments: string[],
): { params: Record<string, string>; staticSegments: string[] } | null {
  const params: Record<string, string> = {};
  const staticSegments: string[] = [];
  let urlIndex = 0;

  for (let i = 0; i < entry.segments.length; i++) {
    const segment = entry.segments[i]!;
    const urlSeg = urlSegments[urlIndex];

    if (segment.type === "static") {
      if (urlSeg !== segment.value) return null;
      staticSegments.push(segment.value);
      urlIndex += 1;
      continue;
    }

    if (segment.type === "dynamic") {
      if (!urlSeg) return null;
      params[segment.param] = urlSeg;
      urlIndex += 1;
      continue;
    }

    if (segment.type === "catch-all") {
      const rest = urlSegments.slice(urlIndex);
      if (rest.length === 0) return null;
      params[segment.param] = rest.join("/");
      urlIndex = urlSegments.length;
      continue;
    }
  }

  if (urlIndex !== urlSegments.length) return null;
  return { params, staticSegments };
}

function matchScore(entry: RouteEntry, staticCount: number): number {
  return entry.priority * 100 + staticCount * 10 + entry.segments.length;
}

export function matchRoute(table: RouteEntry[], urlSegments: string[]): MatchedRoute | null {
  let best: {
    entry: RouteEntry;
    params: Record<string, string>;
    staticSegments: string[];
    score: number;
  } | null = null;

  for (const entry of table) {
    const result = tryMatchEntry(entry, urlSegments);
    if (!result) continue;
    const score = matchScore(entry, result.staticSegments.length);
    if (!best || score > best.score) {
      best = { entry, ...result, score };
    }
  }

  if (!best) return null;
  return {
    templateKey: best.entry.templateKey,
    params: best.params,
    staticSegments: best.staticSegments,
  };
}

export function isSearchTemplateKey(templateKey: string): boolean {
  return templateKey === "search";
}

export function isHomeTemplateKey(templateKey: string): boolean {
  return templateKey === "index";
}
