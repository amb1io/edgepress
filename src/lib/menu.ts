import { eq, sql } from "drizzle-orm";
import { postTypes, posts } from "../db/schema.ts";
import type { Database } from "./types/database.ts";

export type MenuOptionResult = {
  text: string;
  link: string;
  icon: string;
};

export type MenuItem = {
  postTypeName: string;
  postTypeSlug: string;
  menuOptions: string[];
  menuOrder: number;
  /** Icon from meta_values (meta_schema of post_type). Shown only next to parent menu name. */
  icon: string;
};

type TFunction = (locale: string, key: string) => string;

/**
 * Parsea opção no formato tabela_coluna_valor (ex: taxonomies_type_category).
 * Retorna { table, column, value } ou null se não bater o padrão.
 */
function parseTableColumnValue(option: string): { table: string; column: string; value: string } | null {
  if (!option.includes("_")) return null;
  const parts = option.split("_");
  if (parts.length < 3) return null;
  const table = parts[0];
  const column = parts[1];
  const value = parts[parts.length - 1];
  if (table === undefined || column === undefined || value === undefined) return null;
  return { table, column, value };
}

/**
 * Resolves a menu_options value from the DB into a display object (text, link, icon).
 * Hook to extend sidebar menu items.
 * Opções no formato tabela_coluna_valor (ex: taxonomies_type_category) são reconhecidas:
 * primeiro pedaço = tabela, segundo = coluna, último = valor a procurar.
 */
export function resolveMenuOption(
  option: string,
  postTypeSlug: string,
  postTypeName: string,
  locale: string,
  t: TFunction
): MenuOptionResult {
  const basePath = `admin/${postTypeSlug}`;
  const parsed = parseTableColumnValue(option);
  if (parsed) {
    const { table, column, value } = parsed;
    const taxonomyTypeKey = `taxonomy.type.${value}`;
    const taxonomyLabel = t(locale, taxonomyTypeKey);
    const text =
      (taxonomyLabel !== taxonomyTypeKey ? taxonomyLabel : null) ||
      t(locale, `menu.option.${option}`) ||
      value;
    return {
      text,
      link: `${basePath}?domain=${encodeURIComponent(table)}&${column}=${encodeURIComponent(value)}`,
      icon: "line-md:tag",
    };
  }
  switch (option) {
    case "list":
      return {
        text: t(locale, "menu.option.list"),
        link: `admin/list?type=${encodeURIComponent(postTypeSlug)}&limit=10&page=1`,
        icon: "line-md:list",
      };
    case "new":
      return {
        text: t(locale, "menu.option.new"),
        link: `admin/content?post_type=${postTypeSlug}&action=new`,
        icon: "line-md:plus",
      };
    case "dashboard":
      return {
        text: t(locale, `postType.${postTypeSlug}`) || postTypeName,
        link: `${basePath}?page=dashboard`,
        icon: "line-md:home",
      };
    case "general":
      return {
        text: t(locale, `postType.${postTypeSlug}`) || postTypeName,
        link: `${basePath}?page=general`,
        icon: "line-md:cog",
      };
    default:
      return {
        text: t(locale, `menu.option.${option}`) || option,
        link: `${basePath}?page=${option}`,
        icon: "line-md:document",
      };
  }
}

/**
 * Fetches all posts that have show_in_menu = true in meta_values,
 * joined with their post_type (name, slug). Returns items with parsed menu_options.
 * @param db - Instância do banco de dados Drizzle
 * @returns Array de itens de menu ordenados por menu_order
 */
export async function getMenuItems(db: Database): Promise<MenuItem[]> {
  const rows = await db
    .select({
      postTypeName: postTypes.name,
      postTypeSlug: postTypes.slug,
      metaValues: posts.meta_values,
    })
    .from(posts)
    .innerJoin(postTypes, eq(posts.post_type_id, postTypes.id))
    .where(sql`json_extract(${posts.meta_values}, '$.show_in_menu') = 1`);

  const items: MenuItem[] = [];
  for (const row of rows) {
    let menuOptions: string[] = [];
    let menuOrder = 0;
    let icon = "line-md:document";
    if (row.metaValues) {
      try {
        const meta = JSON.parse(row.metaValues) as {
          menu_options?: string[];
          menu_order?: number;
          icon?: string;
        };
        menuOptions = Array.isArray(meta.menu_options) ? meta.menu_options : [];
        menuOrder = typeof meta.menu_order === "number" ? meta.menu_order : 0;
        icon = typeof meta.icon === "string" && meta.icon ? meta.icon : icon;
      } catch {
        // ignore invalid JSON
      }
    }
    items.push({
      postTypeName: row.postTypeName ?? "",
      postTypeSlug: row.postTypeSlug ?? "",
      menuOptions,
      menuOrder,
      icon,
    });
  }
  items.sort((a, b) => a.menuOrder - b.menuOrder);
  return items;
}
