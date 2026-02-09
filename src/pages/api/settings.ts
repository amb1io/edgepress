/**
 * API de configurações (settings).
 * GET: retorna opções por nome (query: names=site_name,site_description) ou todas autoload. Público para leitura.
 * PATCH: atualiza site_name, site_description, setup_done (body JSON). Requer admin.
 */
import type { APIRoute } from "astro";
import { db } from "../../db/index.ts";
import { settings as settingsTable } from "../../db/schema.ts";
import { eq, inArray } from "drizzle-orm";
import { requireMinRole } from "../../lib/api-auth.ts";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const namesParam = url.searchParams.get("names");
    const names = namesParam
      ? namesParam.split(",").map((n) => n.trim()).filter(Boolean)
      : null;

    let rows: { name: string; value: string }[];
    if (names && names.length > 0) {
      rows = await db
        .select({ name: settingsTable.name, value: settingsTable.value })
        .from(settingsTable)
        .where(inArray(settingsTable.name, names));
    } else {
      rows = await db
        .select({ name: settingsTable.name, value: settingsTable.value })
        .from(settingsTable)
        .where(eq(settingsTable.autoload, true));
    }

    const record = Object.fromEntries(rows.map((r) => [r.name, r.value]));
    return new Response(JSON.stringify(record), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("GET /api/settings", err);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

const ALLOWED_KEYS = ["site_name", "site_description", "setup_done"] as const;

export const PATCH: APIRoute = async ({ request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;

  try {
    const body = await request.json().catch(() => ({})) as Record<string, string>;
    if (typeof body !== "object" || body === null) {
      return new Response(JSON.stringify({ error: "Bad Request" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    for (const key of Object.keys(body)) {
      if (!ALLOWED_KEYS.includes(key as (typeof ALLOWED_KEYS)[number])) continue;
      const value = String(body[key] ?? "").trim();
      await db
        .update(settingsTable)
        .set({ value })
        .where(eq(settingsTable.name, key));
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("PATCH /api/settings", err);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
