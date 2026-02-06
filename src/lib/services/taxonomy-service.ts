import { eq, and, like, inArray } from "drizzle-orm";
import { taxonomies, postsTaxonomies } from "../../db/schema.ts";
import type { Database } from "../types/database.ts";
import type { Taxonomy, TaxonomyCreatePayload, TaxonomyUpdatePayload } from "../types/taxonomy.ts";

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
