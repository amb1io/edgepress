import { eq, and, like, inArray, or, isNull, ne, sql, desc } from "drizzle-orm";
import { taxonomies, postsTaxonomies, posts, postTypes, locales } from "../../db/schema.ts";
import type { Database } from "../../shared/types/database.ts";
import type { Taxonomy, TaxonomyCreatePayload, TaxonomyUpdatePayload } from "../../shared/types/taxonomy.ts";

/**
 * Cria uma nova taxonomia
 * @param db - Instância do banco de dados
 * @param payload - Dados da taxonomia a ser criada
 * @returns ID da taxonomia criada
 */
export async function createTaxonomy(db: Database, payload: TaxonomyCreatePayload): Promise<number> {
  const [inserted] = await db
    .insert(taxonomies)
    .values(payload)
    .returning({ id: taxonomies.id });
  
  return inserted?.id ?? 0;
}

/**
 * Atualiza uma taxonomia existente
 * @param db - Instância do banco de dados
 * @param taxonomyId - ID da taxonomia
 * @param payload - Dados a serem atualizados
 */
export async function updateTaxonomy(
  db: Database,
  taxonomyId: number,
  payload: TaxonomyUpdatePayload
): Promise<void> {
  await db
    .update(taxonomies)
    .set(payload as Record<string, unknown>)
    .where(eq(taxonomies.id, taxonomyId));
}

/**
 * Deleta uma taxonomia
 * @param db - Instância do banco de dados
 * @param taxonomyId - ID da taxonomia
 */
export async function deleteTaxonomy(db: Database, taxonomyId: number): Promise<void> {
  // Primeiro remover as relações com posts
  await db.delete(postsTaxonomies).where(eq(postsTaxonomies.term_id, taxonomyId));
  
  // Depois deletar a taxonomia
  await db.delete(taxonomies).where(eq(taxonomies.id, taxonomyId));
}

/**
 * Busca uma taxonomia por ID
 * @param db - Instância do banco de dados
 * @param taxonomyId - ID da taxonomia
 * @returns Taxonomia ou null se não encontrada
 */
export async function getTaxonomyById(db: Database, taxonomyId: number): Promise<Taxonomy | null> {
  const [taxonomy] = await db
    .select()
    .from(taxonomies)
    .where(eq(taxonomies.id, taxonomyId))
    .limit(1);
  
  return taxonomy as Taxonomy ?? null;
}

/**
 * Busca uma taxonomia por slug
 * @param db - Instância do banco de dados
 * @param slug - Slug da taxonomia
 * @param type - Tipo da taxonomia (opcional)
 * @returns Taxonomia ou null se não encontrada
 */
export async function getTaxonomyBySlug(
  db: Database,
  slug: string,
  type?: string
): Promise<Taxonomy | null> {
  const conditions = [eq(taxonomies.slug, slug)];
  if (type) {
    conditions.push(eq(taxonomies.type, type));
  }
  
  const [taxonomy] = await db
    .select()
    .from(taxonomies)
    .where(and(...conditions))
    .limit(1);
  
  return taxonomy as Taxonomy ?? null;
}

/**
 * Busca taxonomias por tipo
 * @param db - Instância do banco de dados
 * @param type - Tipo da taxonomia (ex: 'category', 'tag')
 * @returns Array de taxonomias
 */
export async function getTaxonomiesByType(db: Database, type: string): Promise<Taxonomy[]> {
  const results = await db
    .select()
    .from(taxonomies)
    .where(eq(taxonomies.type, type));
  
  return results as Taxonomy[];
}

/**
 * Busca taxonomias vinculadas a um post
 * @param db - Instância do banco de dados
 * @param postId - ID do post
 * @param type - Tipo da taxonomia (opcional)
 * @returns Array de taxonomias
 */
export async function getPostTaxonomies(
  db: Database,
  postId: number,
  type?: string
): Promise<Taxonomy[]> {
  const query = db
    .select({
      id: taxonomies.id,
      name: taxonomies.name,
      slug: taxonomies.slug,
      description: taxonomies.description,
      type: taxonomies.type,
      parent_id: taxonomies.parent_id,
      meta_values: taxonomies.meta_values,
      created_at: taxonomies.created_at,
      updated_at: taxonomies.updated_at,
    })
    .from(postsTaxonomies)
    .innerJoin(taxonomies, eq(postsTaxonomies.term_id, taxonomies.id))
    .where(eq(postsTaxonomies.post_id, postId));
  
  const results = await query;
  
  if (type) {
    return results.filter(t => t.type === type) as Taxonomy[];
  }
  
  return results as Taxonomy[];
}

/**
 * Busca IDs de posts vinculados a uma ou mais taxonomias
 * @param db - Instância do banco de dados
 * @param taxonomyIds - Array de IDs de taxonomias
 * @returns Array de IDs de posts
 */
export async function getPostsByTaxonomies(
  db: Database,
  taxonomyIds: number[]
): Promise<number[]> {
  if (taxonomyIds.length === 0) {
    return [];
  }
  
  const results = await db
    .selectDistinct({ post_id: postsTaxonomies.post_id })
    .from(postsTaxonomies)
    .where(inArray(postsTaxonomies.term_id, taxonomyIds));
  
  return results.map(r => r.post_id);
}

export type GetRelatedPostIdsOptions = {
  limit?: number;
  taxonomyType?: string;
  localeCode?: string;
  postTypeSlug?: string;
};

const SHOW_IN_MENU_SQL = sql`(json_extract(${posts.meta_values}, '$.show_in_menu') IS NULL OR (json_extract(${posts.meta_values}, '$.show_in_menu') != 1 AND json_extract(${posts.meta_values}, '$.show_in_menu') != '1' AND lower(coalesce(json_extract(${posts.meta_values}, '$.show_in_menu'), '')) != 'true'))`;

/**
 * Published posts sharing at least one category (or taxonomy type) with the source post.
 */
export async function getRelatedPostIdsBySharedCategories(
  db: Database,
  sourcePostId: number,
  options: GetRelatedPostIdsOptions = {},
): Promise<number[]> {
  const limit = Math.max(1, options.limit ?? 4);
  const taxonomyType = (options.taxonomyType ?? "category").trim();

  const sourceTerms = await db
    .select({ term_id: postsTaxonomies.term_id })
    .from(postsTaxonomies)
    .innerJoin(taxonomies, eq(postsTaxonomies.term_id, taxonomies.id))
    .where(
      and(eq(postsTaxonomies.post_id, sourcePostId), eq(taxonomies.type, taxonomyType)),
    );

  const termIds = sourceTerms.map((row) => row.term_id);
  if (termIds.length === 0) return [];

  const whereParts = [
    eq(posts.status, "published"),
    ne(posts.id, sourcePostId),
    inArray(postsTaxonomies.term_id, termIds),
    SHOW_IN_MENU_SQL,
  ];

  if (options.postTypeSlug?.trim()) {
    whereParts.push(eq(postTypes.slug, options.postTypeSlug.trim()));
  }

  if (options.localeCode?.trim()) {
    whereParts.push(eq(locales.locale_code, options.localeCode.trim()));
  }

  const rows = await db
    .selectDistinct({ id: posts.id })
    .from(posts)
    .innerJoin(postTypes, eq(posts.post_type_id, postTypes.id))
    .innerJoin(postsTaxonomies, eq(postsTaxonomies.post_id, posts.id))
    .leftJoin(locales, eq(posts.id_locale_code, locales.id))
    .where(and(...whereParts))
    .orderBy(desc(sql`COALESCE(${posts.published_at}, ${posts.created_at})`))
    .limit(limit);

  return rows.map((row) => row.id);
}

/**
 * Busca taxonomias por nome (busca parcial)
 * @param db - Instância do banco de dados
 * @param search - Termo de busca
 * @param type - Tipo da taxonomia (opcional)
 * @returns Array de taxonomias
 */
export async function searchTaxonomies(
  db: Database,
  search: string,
  type?: string
): Promise<Taxonomy[]> {
  const conditions = [like(taxonomies.name, `%${search}%`)];
  if (type) {
    conditions.push(eq(taxonomies.type, type));
  }
  
  const results = await db
    .select()
    .from(taxonomies)
    .where(and(...conditions));
  
  return results as Taxonomy[];
}

/**
 * Verifica se uma taxonomia existe
 * @param db - Instância do banco de dados
 * @param taxonomyId - ID da taxonomia
 * @returns true se existe, false caso contrário
 */
export async function taxonomyExists(db: Database, taxonomyId: number): Promise<boolean> {
  const [result] = await db
    .select({ id: taxonomies.id })
    .from(taxonomies)
    .where(eq(taxonomies.id, taxonomyId))
    .limit(1);
  
  return !!result;
}

/**
 * Verifica se um slug de taxonomia já existe
 * @param db - Instância do banco de dados
 * @param slug - Slug a ser verificado
 * @param type - Tipo da taxonomia
 * @param excludeId - ID a ser excluído da verificação (útil para edição)
 * @returns true se o slug já existe, false caso contrário
 */
export async function taxonomySlugExists(
  db: Database,
  slug: string,
  type: string,
  excludeId?: number
): Promise<boolean> {
  const conditions = [eq(taxonomies.slug, slug), eq(taxonomies.type, type)];
  
  const results = await db
    .select({ id: taxonomies.id })
    .from(taxonomies)
    .where(and(...conditions));
  
  if (excludeId) {
    return results.some(r => r.id !== excludeId);
  }
  
  return results.length > 0;
}

const TAXONOMY_ROOT_SLUG: Record<string, string> = {
  category: "categoria",
  tag: "tag",
};

/**
 * ID do termo raiz do type (parent_id null). Cria o registro raiz se ainda não existir.
 */
export async function getTaxonomyTypeRootId(
  db: Database,
  type: string,
  opts?: { displayName?: string }
): Promise<number | null> {
  if (!type.trim()) return null;

  const [existing] = await db
    .select({ id: taxonomies.id })
    .from(taxonomies)
    .where(
      and(
        eq(taxonomies.type, type),
        or(isNull(taxonomies.parent_id), eq(taxonomies.parent_id, 0)),
      ),
    )
    .limit(1);

  if (existing) return existing.id;

  const now = Date.now();
  const slug = TAXONOMY_ROOT_SLUG[type] ?? type;
  const displayName = opts?.displayName?.trim();
  const name = displayName || slug.charAt(0).toUpperCase() + slug.slice(1);

  const [inserted] = await db
    .insert(taxonomies)
    .values({
      name,
      slug,
      type,
      parent_id: null,
      created_at: now,
      updated_at: now,
    })
    .returning({ id: taxonomies.id });

  return inserted?.id ?? null;
}
