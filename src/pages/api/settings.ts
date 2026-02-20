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

type KVLike = { get(key: string, type?: "json"): Promise<unknown>; put(key: string, value: string): Promise<void> };

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const isAuthenticated = Boolean((locals as { user?: unknown })?.user);
    const kv = !isAuthenticated
      ? ((locals as { runtime?: { env?: { edgepress_cache?: KVLike | null } } }).runtime?.env?.edgepress_cache ?? null)
      : null;

    const namesParam = url.searchParams.get("names");
    const names = namesParam
      ? namesParam.split(",").map((n) => n.trim()).filter(Boolean)
      : null;
    const cacheKey = `settings:${namesParam ?? "autoload"}`;

    if (!isAuthenticated && kv) {
      try {
        const cached = (await kv.get(cacheKey, "json")) as Record<string, string> | null;
        if (cached != null && typeof cached === "object") {
          return new Response(JSON.stringify(cached), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      } catch {
        // Ignora erro de KV e segue para o banco
      }
    }

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

    if (!isAuthenticated && kv && Object.keys(record).length > 0) {
      try {
        await kv.put(cacheKey, JSON.stringify(record));
      } catch {
        // Não falha a resposta se o KV não aceitar o put
      }
    }

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

export const POST: APIRoute = async ({ request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;

  try {
    const contentType = request.headers.get("Content-Type") ?? "";
    let name: string;
    let value: string;
    let autoload: boolean;

    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      name = String(body?.name ?? "").trim();
      value = String(body?.value ?? "").trim();
      autoload = body?.autoload === true || body?.autoload === "1";
    } else {
      const formData = await request.formData();
      name = (formData.get("name") as string)?.trim() ?? "";
      value = (formData.get("value") as string)?.trim() ?? "";
      autoload = formData.get("autoload") === "1" || formData.get("autoload") === "on";
    }

    if (!name) {
      return new Response(JSON.stringify({ error: "Name is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const [inserted] = await db
      .insert(settingsTable)
      .values({ name, value, autoload: autoload ?? true })
      .returning({ id: settingsTable.id });

    const id = inserted?.id;
    return new Response(
      JSON.stringify({ ok: true, id }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("POST /api/settings", err);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

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
