import { createEdgepressContent } from "../../core/services/edgepress-content.ts";
import { stripHtml } from "../../core/services/json-ld-service.ts";

export type BasePropResolveInput = {
  locals: App.Locals;
  url: URL;
  postType: string;
  table?: string;
  idOrSlug: string;
  required?: boolean;
};

export type BasePropResolved = {
  label: string;
  rawValue: string;
  value: string;
  table: string;
};

type PostPayload = {
  title?: string;
  excerpt?: string | null;
  body?: string | null;
  post_type_slug?: string;
};

type SettingsRow = {
  name?: string;
  value?: string;
};

function normalizeLogicalTable(tableRaw: string | undefined): string {
  return String(tableRaw ?? "posts").trim().replace(/^edp_/, "");
}

export async function resolveBaseProp(input: BasePropResolveInput): Promise<BasePropResolved> {
  const table = normalizeLogicalTable(input.table);
  const content = createEdgepressContent(input.locals, { baseUrl: input.url.origin });

  let label = input.postType;
  let rawValue = "";

  try {
    if (table === "posts") {
      const row = (await content.getItem("posts", input.idOrSlug)) as unknown as PostPayload;
      if (row?.post_type_slug && row.post_type_slug !== input.postType) {
        throw new Error(
          `baseProp: post_type_slug inválido (esperado "${input.postType}", veio "${row.post_type_slug}")`,
        );
      }
      label = (row?.title ?? input.postType).toString().trim();
      rawValue = (row?.excerpt ?? row?.body ?? row?.title ?? "").toString();
    } else if (table === "settings") {
      // settings por ID (numérico) ou por name (slug textual)
      if (/^\\d+$/.test(input.idOrSlug)) {
        const row = (await content.getItem("settings", input.idOrSlug)) as unknown as SettingsRow;
        label = (row?.name ?? "settings").toString().trim();
        rawValue = (row?.value ?? "").toString();
      } else {
        const list = await content.getList<SettingsRow>("settings", {
          limit: 1,
          filter: { name: input.idOrSlug },
        });
        const row = list.items?.[0];
        label = (row?.name ?? input.idOrSlug).toString().trim();
        rawValue = (row?.value ?? "").toString();
      }
    } else {
      const row = (await content.getItem(table, input.idOrSlug)) as unknown as Record<string, unknown>;
      const l =
        (typeof row?.["name"] === "string" && row["name"]) ||
        (typeof row?.["title"] === "string" && row["title"]) ||
        table;
      const v =
        (typeof row?.["value"] === "string" && row["value"]) ||
        (typeof row?.["excerpt"] === "string" && row["excerpt"]) ||
        (typeof row?.["body"] === "string" && row["body"]) ||
        (typeof row?.["title"] === "string" && row["title"]) ||
        "";
      label = String(l).trim();
      rawValue = String(v);
    }
  } catch (err) {
    const e = err as { message?: string; stack?: string; status?: number; detail?: unknown };
    console.error("[edgepress][baseProp] Falha ao carregar conteúdo", {
      table,
      postType: table === "posts" ? input.postType : undefined,
      idOrSlug: input.idOrSlug,
      url: input.url.href,
      message: e?.message,
      statusCode: e?.status,
      detail: e?.detail,
      stack: e?.stack,
    });
    if (input.required !== false) throw err;
    label = "";
    rawValue = "";
  }

  const value = stripHtml(rawValue).trim();
  return { table, label, rawValue, value };
}

