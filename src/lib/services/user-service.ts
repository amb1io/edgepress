import { eq, and, ne } from "drizzle-orm";
import { user as userTable, account, session, USER_ROLE_IDS } from "../../db/schema.ts";
import type { Database } from "../types/database.ts";

export type UserCreatePayload = {
  name: string;
  email: string;
  image?: string | null;
  emailVerified?: boolean;
  role?: number;
};

export type UserUpdatePayload = {
  name: string;
  email: string;
  image?: string | null;
  emailVerified?: boolean;
  role?: number;
};

type UserRoleId = (typeof USER_ROLE_IDS)[number];

function normalizeRole(role: number | null | undefined): number {
  if (role === null || role === undefined) return 3;
  return USER_ROLE_IDS.includes(role as UserRoleId) ? (role as UserRoleId) : 3;
}

/**
 * Verifica se já existe um usuário com o email.
 * @param excludeUserId - ID de usuário a excluir da busca (para edição).
 */
export async function emailExists(
  db: Database,
  email: string,
  excludeUserId?: string | null
): Promise<boolean> {
  if (excludeUserId) {
    const [row] = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(and(eq(userTable.email, email), ne(userTable.id, excludeUserId)))
      .limit(1);
    return !!row;
  }
  const [row] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);
  return !!row;
}

/**
 * Busca usuário por ID.
 */
export async function getUserById(
  db: Database,
  id: string
): Promise<{ id: string; name: string; email: string; role: number | null } | null> {
  const [row] = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      role: userTable.role,
    })
    .from(userTable)
    .where(eq(userTable.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Cria um novo usuário. Não verifica email duplicado; use emailExists antes.
 */
export async function createUser(db: Database, payload: UserCreatePayload): Promise<string> {
  const now = Date.now();
  const id = crypto.randomUUID();
  const role = normalizeRole(payload.role);

  await db.insert(userTable).values({
    id,
    name: payload.name,
    email: payload.email,
    emailVerified: payload.emailVerified ? 1 : 0,
    image: payload.image ?? null,
    role,
    createdAt: now,
    updatedAt: now,
  });

  return id;
}

/**
 * Atualiza um usuário existente. Não verifica email duplicado; use emailExists antes.
 */
export async function updateUser(db: Database, userId: string, payload: UserUpdatePayload): Promise<void> {
  const now = Date.now();
  const role = normalizeRole(payload.role);

  await db
    .update(userTable)
    .set({
      name: payload.name,
      email: payload.email,
      image: payload.image ?? null,
      emailVerified: payload.emailVerified ? 1 : 0,
      role,
      updatedAt: now,
    })
    .where(eq(userTable.id, userId));
}

/**
 * Remove usuário e dados relacionados (account, session).
 */
export async function deleteUser(db: Database, userId: string): Promise<void> {
  await db.delete(account).where(eq(account.userId, userId));
  await db.delete(session).where(eq(session.userId, userId));
  await db.delete(userTable).where(eq(userTable.id, userId));
}

/**
 * Verifica se o usuário existe.
 */
export async function userExists(db: Database, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  return !!row;
}
