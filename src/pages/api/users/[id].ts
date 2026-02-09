import type { APIRoute } from "astro";
import { db } from "../../../db/index.ts";
import { user as userTable, account, session, USER_ROLE_IDS } from "../../../db/schema.ts";
import { eq, and, ne } from "drizzle-orm";
import { requireMinRole, assertCanSetUserRole } from "../../../lib/api-auth.ts";

export const prerender = false;

export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;

  const id = params?.id;
  if (!id || id.trim().length === 0) {
    return new Response("Bad Request", { status: 400 });
  }

  try {
    const [existing] = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.id, id))
      .limit(1);

    if (!existing) {
      return new Response("Not Found", { status: 404 });
    }

    await db.delete(account).where(eq(account.userId, id));
    await db.delete(session).where(eq(session.userId, id));
    await db.delete(userTable).where(eq(userTable.id, id));

    return new Response("", {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "HX-Refresh": "true",
      },
    });
  } catch (err) {
    console.error("DELETE /api/users/[id]", err);
    return new Response("Internal Server Error", { status: 500 });
  }
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;
  const { user: currentUser } = authResult;

  const id = params?.id;
  if (!id || id.trim().length === 0) {
    return new Response("Bad Request", { status: 400 });
  }

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

    // Prevenir escalação de privilégios: apenas admin pode alterar roles; não pode atribuir role superior ao próprio
    const privilegeError = assertCanSetUserRole(
      currentUser.role ?? 3,
      currentUser.id,
      id,
      role
    );
    if (privilegeError) {
      return new Response(
        JSON.stringify({ error: "Forbidden", message: privilegeError }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!name || !email) {
      return new Response("Bad Request", { status: 400 });
    }

    const existingUser = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.id, id))
      .limit(1);

    if (existingUser.length === 0) {
      return new Response("Not Found", { status: 404 });
    }

    const duplicateEmail = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(and(eq(userTable.email, email), ne(userTable.id, id)))
      .limit(1);

    if (duplicateEmail.length > 0) {
      return new Response("Conflict: email already exists", { status: 409 });
    }

    const now = Date.now();
    await db
      .update(userTable)
      .set({
        name,
        email,
        image,
        emailVerified: emailVerified ? 1 : 0,
        role,
        updatedAt: now,
      })
      .where(eq(userTable.id, id));

    return new Response("", {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "HX-Refresh": "true",
      },
    });
  } catch (err) {
    console.error("PUT /api/users/[id]", err);
    return new Response("Internal Server Error", { status: 500 });
  }
};
