import type { Liquid, Tag, TagToken } from "liquidjs";
import type { ThemeRenderContext, ThemePostView, ThemeTaxonomyView, ThemeTaxonomiesLocaleResult, ThemeAuthorView, MenuItem, CustomFieldItem } from "./types.ts";
import { normalizeRelatedPostsLimit } from "../../utils/related-posts-cache.ts";

export type TaxonomyItemLike = {
  name?: string | null;
  slug?: string | null;
};

export function mapTaxonomyItems(items: TaxonomyItemLike[]): ThemeTaxonomyView[] {
  return items.map((item) => ({
    name: String(item.name ?? ""),
    slug: String(item.slug ?? ""),
  }));
}

export function filterLeafTaxonomyItems<T extends { id?: number | null; parent_id?: number | null }>(
  items: T[],
): T[] {
  const parentIds = new Set(
    items.map((item) => item.parent_id).filter((id): id is number => id != null),
  );
  return items.filter((item) => item.id == null || !parentIds.has(item.id));
}

export function getAllowedTaxonomyTypesFromMetaSchema(metaSchema: unknown): string[] {
  const raw =
    typeof metaSchema === "string"
      ? (JSON.parse(metaSchema) as unknown)
      : metaSchema;
  const schema = Array.isArray(raw) ? raw : [];
  const taxonomyEntry = schema.find(
    (entry: unknown) => (entry as Record<string, unknown>)?.key === "taxonomy",
  ) as Record<string, unknown> | undefined;
  return Array.isArray(taxonomyEntry?.default) ? (taxonomyEntry.default as string[]) : [];
}

export function isTaxonomyAllowedForPostType(
  metaSchema: unknown,
  taxonomyType: string,
): boolean {
  return getAllowedTaxonomyTypesFromMetaSchema(metaSchema).includes(taxonomyType.trim());
}

export type GetTaxonomiesHandler = (
  postType: string,
  taxonomyType: string,
) => Promise<ThemeTaxonomyView[]>;

export function createGetTaxonomiesHandler(
  fetchTaxonomies: (postType: string, taxonomyType: string) => Promise<TaxonomyItemLike[]>,
): GetTaxonomiesHandler {
  return async (postType, taxonomyType) => {
    const items = await fetchTaxonomies(postType.trim(), taxonomyType.trim());
    return mapTaxonomyItems(items);
  };
}

export type ParsedGetTaxonomiesArgs = {
  postType: string;
  taxonomyType: string;
  varName: string;
};

const GET_TAXONOMIES_ARGS =
  /^(['"])([^'"]+)\1\s*,\s*(['"])([^'"]+)\3\s+as\s+([a-zA-Z_][\w]*)$/;

export function parseGetTaxonomiesArgs(args: string): ParsedGetTaxonomiesArgs | null {
  const trimmed = args.trim();
  const match = trimmed.match(GET_TAXONOMIES_ARGS);
  if (!match) return null;
  return {
    postType: match[2] ?? "",
    taxonomyType: match[4] ?? "",
    varName: match[5] ?? "",
  };
}

type GetTaxonomiesTagState = ParsedGetTaxonomiesArgs;

export function registerGetTaxonomiesTag(liquid: Liquid): void {
  const tag = {
    parse(token: { args?: string }) {
      const parsed = parseGetTaxonomiesArgs(String(token.args ?? ""));
      if (!parsed) {
        throw new Error(
          "Syntax Error in tag 'get_taxonomies' - Valid syntax: {% get_taxonomies 'post', 'category' as categories %}",
        );
      }
      (this as GetTaxonomiesTagState).postType = parsed.postType;
      (this as GetTaxonomiesTagState).taxonomyType = parsed.taxonomyType;
      (this as GetTaxonomiesTagState).varName = parsed.varName;
    },
    async render(ctx: { getAll: () => object; bottom: () => object }) {
      const state = this as GetTaxonomiesTagState;
      const themeCtx = ctx.getAll() as ThemeRenderContext;
      const handler = themeCtx.get_taxonomies;
      const items = handler
        ? await handler(state.postType, state.taxonomyType)
        : [];
      const scope = ctx.bottom() as Record<string, unknown>;
      scope[state.varName] = items;
    },
  } as unknown as Tag;

  liquid.registerTag("get_taxonomies", tag);
}

export type GetTaxonomiesLocaleHandler = (
  postType: string,
  taxonomyType: string,
  locale: string,
) => Promise<ThemeTaxonomiesLocaleResult>;

export function createGetTaxonomiesLocaleHandler(
  fetchFn: (postType: string, taxonomyType: string, locale: string) => Promise<ThemeTaxonomiesLocaleResult>,
): GetTaxonomiesLocaleHandler {
  return async (postType, taxonomyType, locale) => {
    return fetchFn(postType.trim(), taxonomyType.trim(), locale.trim());
  };
}

export type ParsedGetTaxonomiesLocaleArgs = {
  postType: string;
  taxonomyType: string;
  locale: string;
  varName: string;
};

const GET_TAXONOMIES_LOCALE_ARGS =
  /^(['"])([^'"]+)\1\s*,\s*(['"])([^'"]+)\3\s*,\s*(['"])([^'"]+)\5\s+as\s+([a-zA-Z_][\w]*)$/;

export function parseGetTaxonomiesLocaleArgs(args: string): ParsedGetTaxonomiesLocaleArgs | null {
  const trimmed = args.trim();
  const match = trimmed.match(GET_TAXONOMIES_LOCALE_ARGS);
  if (!match) return null;
  return {
    postType: match[2] ?? "",
    taxonomyType: match[4] ?? "",
    locale: match[6] ?? "",
    varName: match[7] ?? "",
  };
}

type GetTaxonomiesLocaleTagState = ParsedGetTaxonomiesLocaleArgs;

export function registerGetTaxonomiesLocaleTag(liquid: Liquid): void {
  const tag = {
    parse(token: { args?: string }) {
      const parsed = parseGetTaxonomiesLocaleArgs(String(token.args ?? ""));
      if (!parsed) {
        throw new Error(
          "Syntax Error in tag 'get_taxonomies_locale' - Valid syntax: {% get_taxonomies_locale 'jobs', 'category', 'pt-br' as terms %}",
        );
      }
      (this as GetTaxonomiesLocaleTagState).postType = parsed.postType;
      (this as GetTaxonomiesLocaleTagState).taxonomyType = parsed.taxonomyType;
      (this as GetTaxonomiesLocaleTagState).locale = parsed.locale;
      (this as GetTaxonomiesLocaleTagState).varName = parsed.varName;
    },
    async render(ctx: { getAll: () => object; bottom: () => object }) {
      const state = this as GetTaxonomiesLocaleTagState;
      const themeCtx = ctx.getAll() as ThemeRenderContext;
      const handler = themeCtx.get_taxonomies_locale;
      const items = handler
        ? await handler(state.postType, state.taxonomyType, state.locale)
        : [];
      const scope = ctx.bottom() as Record<string, unknown>;
      scope[state.varName] = items;
    },
  } as unknown as Tag;

  liquid.registerTag("get_taxonomies_locale", tag);
}

export type GetRelatedPostsHandler = (
  idOrSlug: string | number,
  limit?: number,
) => Promise<ThemePostView[]>;

export function createGetRelatedPostsHandler(
  fetchRelatedPosts: (idOrSlug: string | number, limit: number) => Promise<ThemePostView[]>,
): GetRelatedPostsHandler {
  return async (idOrSlug, limit) => {
    const normalizedLimit = normalizeRelatedPostsLimit(limit);
    const key = String(idOrSlug ?? "").trim();
    if (!key && typeof idOrSlug !== "number") return [];
    return fetchRelatedPosts(idOrSlug, normalizedLimit);
  };
}

export type ParsedGetRelatedPostsArgs = {
  idOrSlugExpr: string;
  limitExpr?: string;
  varName: string;
};

export function parseGetRelatedPostsArgs(args: string): ParsedGetRelatedPostsArgs | null {
  const trimmed = args.trim();
  const asMatch = trimmed.match(/\s+as\s+([a-zA-Z_][\w]*)\s*$/i);
  if (!asMatch || asMatch.index == null) return null;
  const varName = asMatch[1] ?? "";
  if (!varName) return null;
  const left = trimmed.slice(0, asMatch.index).trim();
  if (!left) return null;
  const commaIdx = left.lastIndexOf(",");
  if (commaIdx < 0) {
    return { idOrSlugExpr: left, varName };
  }
  const idOrSlugExpr = left.slice(0, commaIdx).trim();
  const limitExpr = left.slice(commaIdx + 1).trim();
  if (!idOrSlugExpr) return null;
  return { idOrSlugExpr, ...(limitExpr ? { limitExpr } : {}), varName };
}

type GetRelatedPostsTagState = {
  args: string;
  liquid: Liquid;
};

export function registerGetRelatedPostsTag(liquid: Liquid): void {
  const tag = {
    parse(token: TagToken) {
      const parsed = parseGetRelatedPostsArgs(String(token.args ?? ""));
      if (!parsed) {
        throw new Error(
          "Syntax Error in tag 'get_related_posts' - Valid syntax: {% get_related_posts post.id as related %} or {% get_related_posts post.id, 4 as related %}",
        );
      }
      (this as GetRelatedPostsTagState).args = String(token.args ?? "");
      (this as GetRelatedPostsTagState).liquid = liquid;
    },
    async render(ctx: { getAll: () => object; bottom: () => object }) {
      const state = this as GetRelatedPostsTagState;
      const parsed = parseGetRelatedPostsArgs(state.args);
      if (!parsed) return;

      const idOrSlug = await state.liquid.evalValue(parsed.idOrSlugExpr, ctx);
      let limit = 4;
      if (parsed.limitExpr) {
        const rawLimit = await state.liquid.evalValue(parsed.limitExpr, ctx);
        limit = normalizeRelatedPostsLimit(Number(rawLimit));
      }

      const themeCtx = ctx.getAll() as ThemeRenderContext;
      const handler = themeCtx.get_related_posts;
      const items = handler ? await handler(idOrSlug as string | number, limit) : [];
      const scope = ctx.bottom() as Record<string, unknown>;
      scope[parsed.varName] = items;
    },
  } as unknown as Tag;

  liquid.registerTag("get_related_posts", tag);
}

const DEFAULT_TAXONOMY_POSTS_LIMIT = 500;
const MAX_TAXONOMY_POSTS_LIMIT = 1000;

export function normalizeTaxonomyPostsLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit)) return DEFAULT_TAXONOMY_POSTS_LIMIT;
  const n = Math.floor(Number(limit));
  if (n <= 0) return DEFAULT_TAXONOMY_POSTS_LIMIT;
  return Math.min(n, MAX_TAXONOMY_POSTS_LIMIT);
}

export type GetTaxonomyPostsHandler = (
  taxonomyType: string,
  taxonomySlug: string,
  limit?: number,
) => Promise<ThemePostView[]>;

export function createGetTaxonomyPostsHandler(
  fetchTaxonomyPosts: (
    taxonomyType: string,
    taxonomySlug: string,
    limit: number,
  ) => Promise<ThemePostView[]>,
): GetTaxonomyPostsHandler {
  return async (taxonomyType, taxonomySlug, limit) => {
    const type = taxonomyType.trim();
    const slug = taxonomySlug.trim();
    if (!type || !slug) return [];
    return fetchTaxonomyPosts(type, slug, normalizeTaxonomyPostsLimit(limit));
  };
}

export type ParsedGetTaxonomyPostsArgs = {
  taxonomyTypeExpr: string;
  taxonomySlugExpr: string;
  limitExpr?: string;
  varName: string;
};

function splitLiquidTagArgs(source: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ",") {
      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
      current = "";
      continue;
    }
    current += ch;
  }

  const trimmed = current.trim();
  if (trimmed) parts.push(trimmed);
  return parts;
}

export function parseGetTaxonomyPostsArgs(args: string): ParsedGetTaxonomyPostsArgs | null {
  const trimmed = args.trim();
  const asMatch = trimmed.match(/\s+as\s+([a-zA-Z_][\w]*)\s*$/i);
  if (!asMatch || asMatch.index == null) return null;
  const varName = asMatch[1] ?? "";
  if (!varName) return null;

  const left = trimmed.slice(0, asMatch.index).trim();
  if (!left) return null;

  const parts = splitLiquidTagArgs(left);
  if (parts.length < 2 || parts.length > 3) return null;

  const taxonomyTypeExpr = parts[0] ?? "";
  const taxonomySlugExpr = parts[1] ?? "";
  if (!taxonomyTypeExpr || !taxonomySlugExpr) return null;

  return {
    taxonomyTypeExpr,
    taxonomySlugExpr,
    ...(parts[2] ? { limitExpr: parts[2] } : {}),
    varName,
  };
}

type GetTaxonomyPostsTagState = {
  args: string;
  liquid: Liquid;
};

export function registerGetTaxonomyPostsTag(liquid: Liquid): void {
  const tag = {
    parse(token: TagToken) {
      const parsed = parseGetTaxonomyPostsArgs(String(token.args ?? ""));
      if (!parsed) {
        throw new Error(
          "Syntax Error in tag 'get_taxonomy_posts' - Valid syntax: {% get_taxonomy_posts 'category', 'cliente' as clients %}, {% get_taxonomy_posts taxonomy_slug, taxonomy_value as jobs %}, or {% get_taxonomy_posts 'categorias', route.params.categorias, 500 as jobs %}",
        );
      }
      (this as GetTaxonomyPostsTagState).args = String(token.args ?? "");
      (this as GetTaxonomyPostsTagState).liquid = liquid;
    },
    async render(ctx: { getAll: () => object; bottom: () => object }) {
      const state = this as GetTaxonomyPostsTagState;
      const parsed = parseGetTaxonomyPostsArgs(state.args);
      if (!parsed) return;

      const taxonomyType = String(
        await state.liquid.evalValue(parsed.taxonomyTypeExpr, ctx) ?? "",
      ).trim();
      const taxonomySlug = String(
        await state.liquid.evalValue(parsed.taxonomySlugExpr, ctx) ?? "",
      ).trim();
      let limit: number | undefined;
      if (parsed.limitExpr) {
        const rawLimit = await state.liquid.evalValue(parsed.limitExpr, ctx);
        limit = normalizeTaxonomyPostsLimit(Number(rawLimit));
      }

      const themeCtx = ctx.getAll() as ThemeRenderContext;
      const handler = themeCtx.get_taxonomy_posts;
      const items = handler ? await handler(taxonomyType, taxonomySlug, limit) : [];
      const scope = ctx.bottom() as Record<string, unknown>;
      scope[parsed.varName] = items;
    },
  } as unknown as Tag;

  liquid.registerTag("get_taxonomy_posts", tag);
}

export type GetPostsHandler = (postTypeSlug: string, limit?: number) => Promise<ThemePostView[]>;

export function createGetPostsHandler(
  fetchPosts: (postTypeSlug: string, limit: number) => Promise<ThemePostView[]>,
): GetPostsHandler {
  return async (postTypeSlug, limit) => {
    const slug = String(postTypeSlug ?? "").trim();
    if (!slug) return [];
    return fetchPosts(slug, normalizeTaxonomyPostsLimit(limit));
  };
}

export type ParsedGetPostsArgs = {
  postTypeSlug: string;
  limit?: number;
  varName: string;
};

const GET_POSTS_ARGS =
  /^(['"])([^'"]+)\1(?:\s*,\s*(\d+))?\s+as\s+([a-zA-Z_][\w]*)$/;

export function parseGetPostsArgs(args: string): ParsedGetPostsArgs | null {
  const trimmed = args.trim();
  const match = trimmed.match(GET_POSTS_ARGS);
  if (!match) return null;
  const limitRaw = match[3];
  return {
    postTypeSlug: match[2] ?? "",
    ...(limitRaw ? { limit: Number(limitRaw) } : {}),
    varName: match[4] ?? "",
  };
}

type GetPostsTagState = ParsedGetPostsArgs;

export function registerGetPostsTag(liquid: Liquid): void {
  const tag = {
    parse(token: { args?: string }) {
      const parsed = parseGetPostsArgs(String(token.args ?? ""));
      if (!parsed) {
        throw new Error(
          "Syntax Error in tag 'get_posts' - Valid syntax: {% get_posts 'equipe' as team %} or {% get_posts 'equipe', 200 as team %}",
        );
      }
      (this as GetPostsTagState).postTypeSlug = parsed.postTypeSlug;
      (this as GetPostsTagState).varName = parsed.varName;
      if (parsed.limit != null) {
        (this as GetPostsTagState).limit = parsed.limit;
      }
    },
    async render(ctx: { getAll: () => object; bottom: () => object }) {
      const state = this as GetPostsTagState;
      const themeCtx = ctx.getAll() as ThemeRenderContext;
      const handler = themeCtx.get_posts;
      const items = handler ? await handler(state.postTypeSlug, state.limit) : [];
      const scope = ctx.bottom() as Record<string, unknown>;
      scope[state.varName] = items;
    },
  } as unknown as Tag;

  liquid.registerTag("get_posts", tag);
}

type GetPostsDetailsTagState = ParsedGetPostsArgs;

export function registerGetPostsDetailsTag(liquid: Liquid): void {
  const tag = {
    parse(token: { args?: string }) {
      const parsed = parseGetPostsArgs(String(token.args ?? ""));
      if (!parsed) {
        throw new Error(
          "Syntax Error in tag 'get_posts_details' - Valid syntax: {% get_posts_details 'equipe' as team %} or {% get_posts_details 'equipe', 200 as team %}",
        );
      }
      (this as GetPostsDetailsTagState).postTypeSlug = parsed.postTypeSlug;
      (this as GetPostsDetailsTagState).varName = parsed.varName;
      if (parsed.limit != null) {
        (this as GetPostsDetailsTagState).limit = parsed.limit;
      }
    },
    async render(ctx: { getAll: () => object; bottom: () => object }) {
      const state = this as GetPostsDetailsTagState;
      const themeCtx = ctx.getAll() as ThemeRenderContext;
      const handler = themeCtx.get_posts_details;
      const items = handler ? await handler(state.postTypeSlug, state.limit) : [];
      const scope = ctx.bottom() as Record<string, unknown>;
      scope[state.varName] = items;
    },
  } as unknown as Tag;

  liquid.registerTag("get_posts_details", tag);
}

export type GetAuthorHandler = (idOrSlug: string | number) => Promise<ThemeAuthorView | null>;

export function createGetAuthorHandler(
  fetchAuthor: (idOrSlug: string | number) => Promise<ThemeAuthorView | null>,
): GetAuthorHandler {
  return async (idOrSlug) => {
    const key = String(idOrSlug ?? "").trim();
    if (!key && typeof idOrSlug !== "number") return null;
    return fetchAuthor(idOrSlug);
  };
}

export type ParsedGetAuthorArgs = {
  idOrSlugExpr: string;
  varName: string;
};

export function parseGetAuthorArgs(args: string): ParsedGetAuthorArgs | null {
  const trimmed = args.trim();
  const asMatch = trimmed.match(/\s+as\s+([a-zA-Z_][\w]*)\s*$/i);
  if (!asMatch || asMatch.index == null) return null;
  const varName = asMatch[1] ?? "";
  if (!varName) return null;
  const idOrSlugExpr = trimmed.slice(0, asMatch.index).trim();
  if (!idOrSlugExpr) return null;
  return { idOrSlugExpr, varName };
}

type GetAuthorTagState = {
  args: string;
  liquid: Liquid;
};

export function registerGetAuthorTag(liquid: Liquid): void {
  const tag = {
    parse(token: TagToken) {
      const parsed = parseGetAuthorArgs(String(token.args ?? ""));
      if (!parsed) {
        throw new Error(
          "Syntax Error in tag 'get_author' - Valid syntax: {% get_author post.id as author %} or {% get_author 'hello-world' as author %}",
        );
      }
      (this as GetAuthorTagState).args = String(token.args ?? "");
      (this as GetAuthorTagState).liquid = liquid;
    },
    async render(ctx: { getAll: () => object; bottom: () => object }) {
      const state = this as GetAuthorTagState;
      const parsed = parseGetAuthorArgs(state.args);
      if (!parsed) return;

      const idOrSlug = await state.liquid.evalValue(parsed.idOrSlugExpr, ctx);
      const themeCtx = ctx.getAll() as ThemeRenderContext;
      const handler = themeCtx.get_author;
      const author = handler ? await handler(idOrSlug as string | number) : null;
      const scope = ctx.bottom() as Record<string, unknown>;
      scope[parsed.varName] = author;
    },
  } as unknown as Tag;

  liquid.registerTag("get_author", tag);
}

/** Top-level menu items (no parent in tree — roots only). */
export function filterMenuParents(items: MenuItem[] | null | undefined): MenuItem[] {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => (item.children?.length ?? 0) > 0);
}

/** Flat list of all submenu items from a menu tree. */
export function filterMenuChildren(items: MenuItem[] | null | undefined): MenuItem[] {
  if (!Array.isArray(items)) return [];
  const result: MenuItem[] = [];
  function walk(nodes: MenuItem[]) {
    for (const node of nodes) {
      if (node.children?.length) {
        for (const child of node.children) {
          result.push({ ...child, children: [] });
        }
        walk(node.children);
      }
    }
  }
  walk(items);
  return result;
}

/** Flat list of every menu item (roots and nested). */
export function filterMenuItemsFlat(items: MenuItem[] | null | undefined): MenuItem[] {
  if (!Array.isArray(items)) return [];
  const result: MenuItem[] = [];
  function walk(nodes: MenuItem[]) {
    for (const node of nodes) {
      result.push({ ...node, children: [] });
      if (node.children?.length) walk(node.children);
    }
  }
  walk(items);
  return result;
}

export function registerMenuFilters(liquid: Liquid): void {
  liquid.registerFilter("menu_parents", (items: MenuItem[] | null | undefined) =>
    filterMenuParents(items),
  );
  liquid.registerFilter("menu_children", (items: MenuItem[] | null | undefined) =>
    filterMenuChildren(items),
  );
  liquid.registerFilter("menu_items", (items: MenuItem[] | null | undefined) =>
    filterMenuItemsFlat(items),
  );
}

export function pickCustomFieldValue(
  post: { custom_fields?: CustomFieldItem[] } | null | undefined,
  blockTitle: string,
  fieldName: string,
): string {
  const customFields = post?.custom_fields;
  if (!Array.isArray(customFields)) return "";

  const blockTitleNorm = blockTitle.trim().toLowerCase();
  const block = customFields.find((cf) => cf.title.trim().toLowerCase() === blockTitleNorm);
  if (!block) return "";

  const fieldNameNorm = fieldName.trim().toLowerCase();
  const field = block.fields.find((item) => item.name.trim().toLowerCase() === fieldNameNorm);
  return field?.value?.trim() ?? "";
}

export type ParsedCustomFieldArgs = {
  postExpr: string;
  blockTitle: string;
  fieldName: string;
  varName: string;
};

export function parseCustomFieldArgs(args: string): ParsedCustomFieldArgs | null {
  const trimmed = args.trim();
  const asMatch = trimmed.match(/\s+as\s+([a-zA-Z_][\w]*)\s*$/i);
  if (!asMatch || asMatch.index == null) return null;
  const varName = asMatch[1] ?? "";
  if (!varName) return null;

  const left = trimmed.slice(0, asMatch.index).trim();
  const quotesMatch = left.match(/^(.*)\s*,\s*(['"])([^'"]+)\2\s*,\s*(['"])([^'"]+)\4\s*$/);
  if (!quotesMatch) return null;

  const postExpr = quotesMatch[1]?.trim() ?? "";
  if (!postExpr) return null;

  return {
    postExpr,
    blockTitle: quotesMatch[3] ?? "",
    fieldName: quotesMatch[5] ?? "",
    varName,
  };
}

type CustomFieldTagState = {
  args: string;
  liquid: Liquid;
};

export function registerCustomFieldTag(liquid: Liquid): void {
  const tag = {
    parse(token: TagToken) {
      const parsed = parseCustomFieldArgs(String(token.args ?? ""));
      if (!parsed) {
        throw new Error(
          "Syntax Error in tag 'custom_field' - Valid syntax: {% custom_field member, 'Dados da Equipe', 'cargo' as job_title %}",
        );
      }
      (this as CustomFieldTagState).args = String(token.args ?? "");
      (this as CustomFieldTagState).liquid = liquid;
    },
    async render(ctx: { getAll: () => object; bottom: () => object }) {
      const state = this as CustomFieldTagState;
      const parsed = parseCustomFieldArgs(state.args);
      if (!parsed) return;

      const post = await state.liquid.evalValue(parsed.postExpr, ctx);
      const value = pickCustomFieldValue(
        post as { custom_fields?: CustomFieldItem[] },
        parsed.blockTitle,
        parsed.fieldName,
      );
      const scope = ctx.bottom() as Record<string, unknown>;
      scope[parsed.varName] = value;
    },
  } as unknown as Tag;

  liquid.registerTag("custom_field", tag);
}
