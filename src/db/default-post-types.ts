/**
 * Fonte única dos post types usados pelo seed e pela tela "Post Types" em Settings.
 * O seed usa ensurePostTypesFromDefaults(); a UI pode listar/editar e opcionalmente
 * "carregar padrões" a partir desta lista.
 */
import type { MetaSchemaItem } from "./schema/meta_schema.ts";
import { buildMetaSchema } from "./schema/meta_schema.ts";

export type DefaultPostTypeRow = {
  slug: string;
  name: string;
  meta_schema: MetaSchemaItem[];
};

const postMetaSchema = buildMetaSchema([
  { key: "taxonomy", type: "array", default: ["category", "tag"] },
  { key: "post_thumbnail", type: "boolean", default: true },
  { key: "post_types", type: "array", default: ["custom_fields"] },
]);

const pageMetaSchema = buildMetaSchema([
  { key: "post_thumbnail", type: "boolean", default: true },
]);

const attachmentMetaSchema = buildMetaSchema([
  { key: "show_in_menu", type: "boolean", default: true },
  { key: "menu_options", type: "array", default: ["new", "list"] },
  { key: "icon", type: "string", default: "line-md:file" },
  { key: "mime_type", type: "string" },
  { key: "attachment_file", type: "string" },
  { key: "attachment_path", type: "string" },
  { key: "attachment_alt", type: "string" },
]);

const translationsMetaSchema = buildMetaSchema([
  { key: "show_in_menu", type: "boolean", default: true },
  { key: "menu_options", type: "array", default: ["new", "list"] },
]);

/** Post types padrão: os mesmos que o seed cria. Usado por runSeed e pela UI Post Types. */
export const DEFAULT_POST_TYPES: DefaultPostTypeRow[] = [
  { slug: "post", name: "Post", meta_schema: postMetaSchema },
  { slug: "page", name: "Página", meta_schema: pageMetaSchema },
  { slug: "dashboard", name: "Dashboard", meta_schema: buildMetaSchema([]) },
  { slug: "settings", name: "Configurações", meta_schema: buildMetaSchema([]) },
  { slug: "user", name: "User", meta_schema: buildMetaSchema([]) },
  { slug: "attachment", name: "Attachment", meta_schema: attachmentMetaSchema },
  { slug: "translations_languages", name: "Translations Languages", meta_schema: translationsMetaSchema },
  { slug: "custom_fields", name: "Custom Fields", meta_schema: buildMetaSchema([]) },
];

/** Slugs que são só referência (ex.: custom_fields em meta_values) e não aparecem no menu. */
export const META_ONLY_POST_TYPE_SLUGS = new Set<string>(["custom_fields"]);
