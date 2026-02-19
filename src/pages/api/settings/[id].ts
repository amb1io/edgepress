import type { APIRoute } from "astro";
import { db } from "../../../db/index.ts";
import { settings as settingsTable } from "../../../db/schema.ts";
import { eq } from "drizzle-orm";
import { requireMinRole } from "../../../lib/api-auth.ts";

export const prerender = false;

export const GET: APIRoute = async ({ params, request, locals }) => {
  const authResult = await requireMinRole(request, 1, locals);
  if (authResult instanceof Response) return authResult;

  const idRaw = params?.id;
  const id = idRaw ? parseInt(idRaw, 10) : NaN;
  if (Number.isNaN(id)) {
    return new Response(JSON.stringify({ error: "Bad Request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const [row] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.id, id))
    .limit(1);

  if (!row) {
    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      id: row.id,
      name: row.name,
      value: row.value,
      autoload: Boolean(row.autoload),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
};

export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;

  const idRaw = params?.id;
  const id = idRaw ? parseInt(idRaw, 10) : NaN;
  if (Number.isNaN(id)) {
    return new Response("Bad Request", { status: 400 });
  }

  const [existing] = await db
    .select({ id: settingsTable.id })
    .from(settingsTable)
    .where(eq(settingsTable.id, id))
    .limit(1);

  if (!existing) {
    return new Response("Not Found", { status: 404 });
  }

  await db.delete(settingsTable).where(eq(settingsTable.id, id));

  return new Response("", {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "HX-Refresh": "true",
    },
  });
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;

  const idRaw = params?.id;
  const id = idRaw ? parseInt(idRaw, 10) : NaN;
  if (Number.isNaN(id)) {
    return new Response(JSON.stringify({ error: "Bad Request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const [existing] = await db
    .select({ id: settingsTable.id })
    .from(settingsTable)
    .where(eq(settingsTable.id, id))
    .limit(1);

  if (!existing) {
    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

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

    await db
      .update(settingsTable)
      .set({ name, value, autoload })
      .where(eq(settingsTable.id, id));

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("PUT /api/settings/[id]", err);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
