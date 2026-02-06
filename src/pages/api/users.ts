import type { APIRoute } from "astro";
import { db } from "../../db/index.ts";
import { user as userTable, USER_ROLE_IDS } from "../../db/schema.ts";
import { eq } from "drizzle-orm";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const name = (formData.get("name") as string)?.trim();
    const email = (formData.get("email") as string)?.trim();
    const image = (formData.get("image") as string)?.trim() || null;
    const emailVerified = formData.get("emailVerified") === "1";
    const roleRaw = (formData.get("role") as string)?.trim();
    const roleNum = roleRaw !== undefined && roleRaw !== "" ? parseInt(roleRaw, 10) : NaN;
    const role =
      Number.isNaN(roleNum) || !USER_ROLE_IDS.includes(roleNum as (typeof USER_ROLE_IDS)[number]) ? 3 : roleNum;

    if (!name || !email) {
      return new Response("Bad Request", { status: 400 });
    }

    const now = Date.now();
    const id = crypto.randomUUID();

    const existing = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, email))
      .limit(1);

    if (existing.length > 0) {
      return new Response("Conflict: email already exists", { status: 409 });
    }

    await db.insert(userTable).values({
      id,
      name,
      email,
      emailVerified: emailVerified ? 1 : 0,
      image,
      role,
      createdAt: now,
      updatedAt: now,
    });

    return new Response("", {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "HX-Refresh": "true",
      },
    });
  } catch (err) {
    console.error("POST /api/users", err);
    return new Response("Internal Server Error", { status: 500 });
  }
};
