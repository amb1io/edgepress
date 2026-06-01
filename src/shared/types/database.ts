import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '../../db/schema.ts';

/**
 * Tipo do banco de dados Drizzle
 * Remove a necessidade de usar 'any' em funções que recebem db
 */
export type Database = DrizzleD1Database<typeof schema>;

/**
 * Tipo das tabelas disponíveis no schema
 */
export type TableName = keyof typeof schema;

/**
 * Tipo helper para extrair o tipo de uma tabela
 */
export type TableType<T extends TableName> = typeof schema[T];
