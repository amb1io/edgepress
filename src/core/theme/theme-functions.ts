import type { Liquid, Tag, TagToken } from "liquidjs";
import type { ThemeRenderContext, ThemePostView, ThemeTaxonomyView, ThemeAuthorView } from "./types.ts";
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
