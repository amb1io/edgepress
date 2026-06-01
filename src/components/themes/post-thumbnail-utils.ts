export type PostMediaItem = {
  id?: number;
  meta_values?: Record<string, unknown>;
};

export function resolvePostThumbnailSrc(
  metaValues: Record<string, unknown> | undefined,
  media: PostMediaItem[] | undefined,
  origin: string,
): string {
  const meta = metaValues ?? {};
  const thumbIdRaw = meta["post_thumbnail_id"];
  const thumbId =
    typeof thumbIdRaw === "number"
      ? thumbIdRaw
      : typeof thumbIdRaw === "string"
        ? parseInt(thumbIdRaw, 10)
        : NaN;

  if (!media?.length) return "";

  for (const item of media) {
    const id = item.id;
    if (thumbId && !Number.isNaN(thumbId) && id !== thumbId) continue;

    const itemMeta = item.meta_values ?? {};
    const path =
      (typeof itemMeta["attachment_path"] === "string" && itemMeta["attachment_path"]) ||
      (typeof itemMeta["attachment_file"] === "string" && itemMeta["attachment_file"]) ||
      "";

    if (!path) continue;

    if (/^https?:\/\//i.test(path)) return path;

    const normalized =
      path.startsWith("/uploads/") || path.startsWith("/")
        ? path.startsWith("/") ? path : `/${path}`
        : `/uploads/${path.replace(/^uploads\//, "")}`;

    return new URL(`/api/media${normalized}`, origin).href;
  }

  return "";
}
