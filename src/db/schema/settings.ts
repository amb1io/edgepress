import { index, int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { prefixedTable } from "../table-prefix.ts";

/**
 * Tabela de configurações (options/settings)
 * Armazena pares name/value com flag autoload
 */
export const settings = sqliteTable(
  prefixedTable("settings"),
  {
    id: int().primaryKey({ autoIncrement: true }),
    name: text().notNull(),
    value: text().notNull(),
    autoload: int("autoload", { mode: "boolean" }).notNull().default(true),
  },
  (table) => ({
    nameIdx: index("settings_name_idx").on(table.name),
  })
);
