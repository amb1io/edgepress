import type { APIRoute } from "astro";
import { db } from "../../../db/index.ts";
import { settings as settingsTable } from "../../../db/schema.ts";
import { eq } from "drizzle-orm";

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
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

export const DELETE: APIRoute = async ({ params }) => {
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
