/**
 * Fixed media size presets for Free-plan-friendly Image Resizing.
 * Templates and public surfaces only use these presets (not arbitrary width/height)
 * so unique transformations stay bounded.
 */

export type MediaSize = "thumbnail" | "medium" | "large" | "original";

export const MEDIA_SIZE_PRESETS: Record<
  Exclude<MediaSize, "original">,
  { width: number; height: number }
> = {
  thumbnail: { width: 300, height: 300 },
  medium: { width: 800, height: 800 },
  large: { width: 1920, height: 1920 },
};

export const MEDIA_SIZES: readonly MediaSize[] = [
  "thumbnail",
  "medium",
  "large",
  "original",
] as const;

export function isMediaSize(value: unknown): value is MediaSize {
  return (
    typeof value === "string" &&
    (MEDIA_SIZES as readonly string[]).includes(value)
  );
}

function isOurMediaPath(pathname: string): boolean {
  return pathname === "/api/media" || pathname.startsWith("/api/media/");
}

/**
 * Sets or replaces the `size` query param on Edgepress `/api/media/...` URLs.
 * For `original`, strips size/width/height. External URLs are returned unchanged.
 */
export function buildMediaUrl(
  url: string | undefined | null,
  size: MediaSize,
): string | undefined {
  if (url == null) return undefined;
  const trimmed = String(url).trim();
  if (!trimmed) return undefined;

  try {
    const isAbsolute = /^https?:\/\//i.test(trimmed);
    const parsed = isAbsolute
      ? new URL(trimmed)
      : new URL(trimmed, "http://edgepress.local");

    if (!isOurMediaPath(parsed.pathname)) {
      return trimmed;
    }

    if (size === "original") {
      parsed.searchParams.delete("size");
      parsed.searchParams.delete("width");
      parsed.searchParams.delete("height");
    } else {
      parsed.searchParams.delete("width");
      parsed.searchParams.delete("height");
      parsed.searchParams.set("size", size);
    }

    if (isAbsolute) {
      return parsed.toString();
    }

    const path = parsed.pathname + parsed.search + parsed.hash;
    return path;
  } catch {
    return trimmed;
  }
}

export function buildMediaUrlSet(
  url: string | undefined | null,
): Record<MediaSize, string> | undefined {
  const original = buildMediaUrl(url, "original");
  if (!original) return undefined;

  return {
    thumbnail: buildMediaUrl(original, "thumbnail") ?? original,
    medium: buildMediaUrl(original, "medium") ?? original,
    large: buildMediaUrl(original, "large") ?? original,
    original,
  };
}
