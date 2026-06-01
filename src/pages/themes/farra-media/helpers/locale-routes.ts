export const FARRA_THEME_SLUG = "farra-media";

/** Segmentos após `pt_BR` ou `es_ES` → caminho em `pages/` (PT). */
export function resolvePtBrRewrite(slugSegments: string[]): string {
  return slugSegments.join("/");
}

/** Segmentos após `en_US` → caminho em `pages/en/...`. */
export function resolveEnUsRewrite(slugSegments: string[]): string | null {
  if (slugSegments.length === 0) return "en";

  const [head, ...tail] = slugSegments;
  if (!head) return "en";

  if (head === "jobs") {
    return tail.length > 0 ? `en/jobs/${tail.join("/")}` : "en/jobs";
  }
  if (head === "directors") {
    return tail.length > 0 ? `en/directors/${tail.join("/")}` : "en/directors";
  }
  if (head === "portfolio") {
    return tail.length > 0 ? `en/portfolio/${tail.join("/")}` : null;
  }

  const staticMap: Record<string, string> = {
    about: "en/about",
    "what-we-do": "en/what-we-do",
    jobs: "en/jobs",
    directors: "en/directors",
  };

  if (tail.length === 0 && staticMap[head]) {
    return staticMap[head]!;
  }

  if (tail.length > 0) {
    return `en/${slugSegments.join("/")}`;
  }

  return `en/${head}`;
}

export function themePagesRewrite(internalPath: string): string {
  const trimmed = internalPath.replace(/^\/+/, "");
  return `/themes/${FARRA_THEME_SLUG}/pages/${trimmed}`;
}
