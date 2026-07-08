import type { ContentPostDetail } from "../services/edgepress-content.ts";
import { getMediaById } from "../services/media-service.ts";
import { parseMetaValues } from "../../utils/meta-parser.ts";
import type { Database } from "../../shared/types/database.ts";
import type { KVLike } from "../../utils/content-cache.ts";

export function parsePostThumbnailId(metaValues: Record<string, unknown>): number | null {
  const raw = metaValues["post_thumbnail_id"];
  const id =
    typeof raw === "number" ? raw : typeof raw === "string" ? parseInt(raw, 10) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function resolveMediaPathToAbsoluteUrl(path: string, baseUrl: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized =
    path.startsWith("/uploads/") || path.startsWith("/")
      ? path.startsWith("/")
        ? path
        : `/${path}`
      : `/uploads/${path.replace(/^uploads\//, "")}`;
  return new URL(`/api/media${normalized}`, baseUrl).href;
}

function attachmentPathFromMeta(meta: Record<string, unknown>): string {
  return (
    (typeof meta["attachment_path"] === "string" && meta["attachment_path"]) ||
    (typeof meta["attachment_file"] === "string" && meta["attachment_file"]) ||
    ""
  );
}

/** Resolves cover from linked `post.media` (posts_media). */
export function resolveCoverImageFromMedia(
  post: Pick<ContentPostDetail, "media" | "meta_values">,
  baseUrl: string,
): string | undefined {
  const media = Array.isArray(post.media) ? post.media : [];
  const thumbId = parsePostThumbnailId((post.meta_values ?? {}) as Record<string, unknown>);

  for (const item of media) {
    const row = item as { id?: number; meta_values?: Record<string, unknown> };
    if (thumbId != null && row.id !== thumbId) continue;
    const path = attachmentPathFromMeta(row.meta_values ?? {});
    if (!path) continue;
    return resolveMediaPathToAbsoluteUrl(path, baseUrl);
  }
  return undefined;
}

function resolveCoverImageFromMetaPath(
  metaValues: Record<string, unknown>,
  baseUrl: string,
): string | undefined {
  const thumbPath = metaValues["post_thumbnail_path"];
  if (typeof thumbPath !== "string" || !thumbPath.trim()) return undefined;
  return resolveMediaPathToAbsoluteUrl(thumbPath.trim(), baseUrl);
}

export type CoverImageAttachmentCache = Map<number, string | undefined>;

/** Resolves theme cover URL: media links, meta path, then attachment by post_thumbnail_id. */
export async function resolveCoverImage(
  post: ContentPostDetail,
  baseUrl: string,
  db: Database,
  attachmentCache: CoverImageAttachmentCache,
  kv?: KVLike | null,
): Promise<string | undefined> {
  const fromMedia = resolveCoverImageFromMedia(post, baseUrl);
  if (fromMedia) return fromMedia;

  const metaValues = (post.meta_values ?? {}) as Record<string, unknown>;
  const fromMetaPath = resolveCoverImageFromMetaPath(metaValues, baseUrl);
  if (fromMetaPath) return fromMetaPath;

  const thumbId = parsePostThumbnailId(metaValues);
  if (thumbId == null) return undefined;

  if (attachmentCache.has(thumbId)) {
    return attachmentCache.get(thumbId);
  }

  const attachment = await getMediaById(db, thumbId, kv);
  if (!attachment) {
    attachmentCache.set(thumbId, undefined);
    return undefined;
  }

  const meta = parseMetaValues(attachment.meta_values) as Record<string, unknown>;
  const path = attachmentPathFromMeta(meta);
  const url = path ? resolveMediaPathToAbsoluteUrl(path, baseUrl) : undefined;
  attachmentCache.set(thumbId, url);
  return url;
}
