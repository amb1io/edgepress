/**
 * Regra de identificação de fonte de listagem/edição:
 * - Parâmetro type/post_type da URL é verificado no banco.
 * - Se existir uma tabela com esse nome → fonte é "table" (ex.: user, settings).
 * - Caso contrário → fonte é "posts" (registros da tabela posts com post_type = type).
 *
 * Usado em list.astro (listagem) e content.astro (edição por id).
 */
import { and, eq } from "drizzle-orm";
import { getTableNames } from "./db-utils.ts";
import type { Database } from "./types/database.ts";
import { user as userTable, settings as settingsTable, postTypes, posts } from "../db/schema.ts";

export type SourceKind = "table" | "posts";

/**
 * Define se o tipo vem de uma tabela com esse nome ou da tabela posts (post_type).
 */
export async function getSourceKind(db: Database, type: string): Promise<SourceKind> {
  const tableNames = await getTableNames(db);
  return tableNames.includes(type) ? "table" : "posts";
}

export type ContentRecordResult = {
  kind: SourceKind;
  record: Record<string, unknown> | null;
};

/**
 * Busca um registro por tipo e id para a página de conteúdo (edit).
 * - Se type é nome de tabela: retorna a linha da tabela com esse id (user id string, settings id number).
 * - Se type é post_type: retorna o post da tabela posts com esse id e post_type = type.
 */
export async function getRecordById(
  db: Database,
  type: string,
  id: string | null
): Promise<ContentRecordResult> {
  const kind = await getSourceKind(db, type);

  if (kind === "table") {
    if (!id || id.trim() === "") {
      return { kind: "table", record: null };
    }
    if (type === "user") {
      const [row] = await db
        .select()
        .from(userTable)
        .where(eq(userTable.id, id))
        .limit(1);
      return { kind: "table", record: row ? (row as Record<string, unknown>) : null };
    }
    if (type === "settings") {
      const numId = parseInt(id, 10);
      if (Number.isNaN(numId)) return { kind: "table", record: null };
      const [row] = await db
        .select()
        .from(settingsTable)
        .where(eq(settingsTable.id, numId))
        .limit(1);
      return { kind: "table", record: row ? (row as Record<string, unknown>) : null };
    }
    return { kind: "table", record: null };
  }

  // posts: buscar post onde id = id e post_type.slug = type
  if (!id || !/^\d+$/.test(id)) {
    return { kind: "posts", record: null };
  }
  const postId = parseInt(id, 10);
  const [typeRow] = await db
    .select({ id: postTypes.id })
    .from(postTypes)
    .where(eq(postTypes.slug, type))
    .limit(1);
  if (!typeRow) {
    return { kind: "posts", record: null };
  }
  const [row] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.post_type_id, typeRow.id)))
    .limit(1);
  return { kind: "posts", record: row ? (row as Record<string, unknown>) : null };
}
