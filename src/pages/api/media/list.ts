/**
 * GET /api/media/list — Lista attachments de imagem para a biblioteca de mídia.
 * Retorna id, title e url de cada imagem.
 */
import type { APIRoute } from "astro";
import { db } from "../../../db/index.ts";
import { getImageAttachments } from "../../../lib/services/media-service.ts";
import { parseMetaValues } from "../../../lib/utils/meta-parser.ts";

export const prerender = false;

function attachmentPathToUrl(attachmentPath: string): string {
  if (!attachmentPath) return "";
  if (attachmentPath.startsWith("http")) return attachmentPath;
  if (attachmentPath.startsWith("/uploads/"))
    return `/api/media${attachmentPath}`;
  if (attachmentPath.startsWith("/")) return `/api/media${attachmentPath}`;
  return `/api/media/uploads/${attachmentPath}`;
}

export const GET: APIRoute = async ({ url }) => {
  const limit = 100;
  const search = url.searchParams.get("q") ?? undefined;
  const mediaList = await getImageAttachments(db, limit, search);

  const items = mediaList.map((m) => {
    const meta = parseMetaValues(m.meta_values);
    const path = meta["attachment_path"] ?? meta["file_path"] ?? "";
    return {
      id: m.id,
      title: m.title ?? "",
      url: attachmentPathToUrl(path),
      path: path || "",
    };
  });

  return new Response(JSON.stringify({ items }), {
    headers: { "Content-Type": "application/json" },
  });
};
