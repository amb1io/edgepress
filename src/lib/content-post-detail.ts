/**
 * Helpers para montar o payload de detalhe de um post (body_smart, normalização de paths).
 * Usado por GET /api/content/[slug] e GET /api/content/posts/[id].
 */
import { parseMetaValues } from "./utils/meta-parser.ts";

export type MediaForSmartBody = {
  id: number;
  meta_values?: string | null;
};

export function normalizeAttachmentPath(rawPath: string): string {
  if (!rawPath) return "";
  let path = rawPath;
  try {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      path = new URL(path).pathname;
    }
  } catch {
    // ignore invalid URL error
  }
  if (path.startsWith("/api/media")) path = path.slice("/api/media".length);
  if (path.startsWith("/api/")) path = path.slice("/api".length);
  if (!path.startsWith("/")) path = `/${path}`;
  return path;
}

export function buildBodySmart(
  body: string | null | undefined,
  media: MediaForSmartBody[] | null | undefined
): string {
  if (!body) return "";
  const mediaList = Array.isArray(media) ? media : [];
  const pathToId = new Map<string, number>();
  for (const m of mediaList) {
    const meta = parseMetaValues(m.meta_values ?? null);
    const attachmentPath = meta.attachment_path;
    if (attachmentPath) {
      pathToId.set(normalizeAttachmentPath(attachmentPath), m.id);
    }
  }
  let seq = 0;
  return body.replace(/<img\b[^>]*>/gi, (imgTag) => {
    const attrMatch = imgTag.match(/\s(?:data-url|src)=["']([^"']+)["']/i);
    const url = attrMatch?.[1] ?? "";
    let tokenId: number;
    if (url) {
      const foundId = pathToId.get(normalizeAttachmentPath(url));
      tokenId = typeof foundId === "number" ? foundId : ++seq;
    } else {
      tokenId = ++seq;
    }
    return `{media_${tokenId}}`;
  });
}
