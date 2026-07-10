import { int, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { indexName, tableName } from "../table-prefix.ts";

/**
 * Tabela de configurações (options/settings)
 * Armazena pares name/value com flag autoload
 */
export const settings = sqliteTable(
  tableName("settings"),
  {
    id: int().primaryKey({ autoIncrement: true }),
    name: text().notNull(),
    value: text().notNull(),
    autoload: int("autoload", { mode: "boolean" }).notNull().default(true),
  },
  (table) => ({
    nameIdx: uniqueIndex(indexName("settings_name_idx")).on(table.name),
  })
);
