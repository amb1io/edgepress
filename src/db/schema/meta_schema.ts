import { customType } from "drizzle-orm/sqlite-core";

export type MetaSchemaItem = { key: string; type: string; default?: unknown };

export const defaultMetaSchema: MetaSchemaItem[] = [
  { key: "menu_order", type: "number", default: 0 },
  { key: "parent_id", type: "number" },
  { key: "show_in_menu", type: "boolean", default: false },
  { key: "menu_options", type: "array", default: [] },
  { key: "icon", type: "string", default: "line-md:document" },
  { key: "post_thumbnail", type: "boolean", default: false },
];

/**
 * Constrói um meta_schema herdando do defaultMetaSchema e aplicando extensões.
 * Itens em extensions com a mesma key substituem os do default; novas keys são acrescentadas.
 */
export function buildMetaSchema(extensions: MetaSchemaItem[]): MetaSchemaItem[] {
  const byKey = new Map<string, MetaSchemaItem>();
  for (const item of defaultMetaSchema) {
    byKey.set(item.key, { ...item });
  }
  for (const item of extensions) {
    byKey.set(item.key, { ...item });
  }
  return Array.from(byKey.values());
}

const metaSchemaJson = customType<{
  data: MetaSchemaItem[];
  driverData: string;
}>({
  dataType() {
    return "text";
  },
  toDriver(value: MetaSchemaItem[]): string {
    return JSON.stringify(value);
  },
  fromDriver(value: string): MetaSchemaItem[] {
    return value ? JSON.parse(value) : [];
  },
});

export const metaSchemaColumn = () =>
  metaSchemaJson("meta_schema").default(defaultMetaSchema);
