import { themeContentGateway } from "../../../../core/services/theme-content-gateway.ts";
import { db } from "../../../../db/index.ts";
import { getMediaById } from "../../../../core/services/media-service.ts";
import { parseMetaValues } from "../../../../utils/meta-parser.ts";

export const slugify = (value: string, separator: string = "-"): string => {
  return value
    .toString()
    .normalize("NFKD")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, separator)
    .replace(/[^\w\-]+/g, "")
    .replace(/\_/g, separator)
    .replace(/\-\-+/g, separator)
    .replace(/\-$/g, "");
};

export const jobLink = (text: string, jobs: any) => {
  const slug = slugify(text);
  const job = jobs.find((job: any) => job.id.includes(slug));
  return job?.id.replace(".md", "");
};

export const TagsFind = (post: any): Record<string, unknown> => {
  const fallback: Record<string, unknown> = {
    language: post?.language,
    posttype: post?.posttype ?? post?.legacy_posttype,
  };

  if (!post?.tags || typeof post.tags !== "string") {
    return fallback;
  }

  try {
    const outer = JSON.parse(post.tags);
    if (!Array.isArray(outer) || outer[0] == null || typeof outer[0] !== "string") {
      return fallback;
    }
    return { ...fallback, ...JSON.parse(outer[0]) };
  } catch {
    return fallback;
  }
};

export const TagsFormat = (post: any) => {
  const tags = TagsFind(post);
  const formatted = { ...post };
  delete formatted.tags;

  if (formatted.images && typeof formatted.images === "string") {
    const trimmed = formatted.images.trim();
    if (trimmed && trimmed !== "undefined") {
      try {
        formatted.images = JSON.parse(trimmed);
      } catch {
        // mantém string original
      }
    }
  }

  return { ...formatted, ...tags };
};

function normalizeLanguage(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[_-]/g, "");
}

function matchesLanguage(post: any, lang: string): boolean {
  if (!lang) return true;

  const candidates = [
    post.language,
    post.meta_values?.language,
    ...(Array.isArray(post.language) ? post.language : []),
  ].filter((value) => value != null);

  for (const candidate of candidates) {
    const normalized = normalizeLanguage(candidate);
    if (lang === "br" && (normalized === "br" || normalized === "ptbr")) return true;
    if (lang === "en" && (normalized === "en" || normalized === "enus")) return true;
    if (normalizeLanguage(lang) === normalized) return true;
  }

  try {
    const tags = TagsFind(post);
    const tagLang = tags.language;
    if (Array.isArray(tagLang) && tagLang.some((item) => normalizeLanguage(item).includes(lang))) {
      return true;
    }
  } catch {
    // ignora tags inválidas
  }

  if (typeof post.tags === "string" && post.tags.toLowerCase().includes(`"${lang}"`)) {
    return true;
  }

  return false;
}

export function matchesLanguageForPost(post: any, lang: string): boolean {
  return matchesLanguage(post, lang);
}

function matchesPostType(post: any, postType: string): boolean {
  if (!postType) return true;
  try {
    const tags = TagsFind(post);
    if (tags.posttype === postType) return true;
  } catch {
    // segue para meta
  }
  return post.posttype === postType || post.legacy_posttype === postType;
}

export const GetJobs = async (params: any) => {
  const slug = params?.slug;
  if (!slug) return [];
  const posts = await themeContentGateway.getJobBySlug(slug, params?.lang);
  return sortByOrderDesc(posts.map((post) => TagsFormat(post)));
};

export const GetPosts = async (params: any) => {
  if (typeof params === "string") {
    return themeContentGateway.getPosts(Object.fromEntries(new URLSearchParams(params)));
  }
  return themeContentGateway.getPosts(params);
};

export const GetPostType = async (slug: string, lang?: string) => {
  const postType = slug.replace(/^\//, "");
  return themeContentGateway.getPostsByType(
    postType,
    lang ? { lang } : undefined,
  );
};

export const GetCategoriesPost = async (params: any) => {
  return themeContentGateway.getCategoriesToPosts(params);
};

export const GetCategories = async (id: any = "", params: any = null) => {
  const numericId = id ? parseInt(String(id), 10) : undefined;
  return themeContentGateway.getCategories(Number.isNaN(numericId) ? undefined : numericId);
};

export type PostCategoryDisplay = { id: number; title: string; name: string; slug: string };

/** Taxonomias vinculadas ao post (para exibição no portfolio, etc.). */
export async function getPostCategoriesForDisplay(
  postId: number,
): Promise<PostCategoryDisplay[]> {
  const links = await GetCategoriesPost({ "filters[postId][$eq]": postId });
  const categories = await Promise.all(
    links.map(async (link) => {
      const rows = await GetCategories(link.categoryId);
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row || typeof row !== "object") return null;
      const name = String((row as { name?: string }).name ?? "");
      const title = String((row as { title?: string }).title ?? name);
      const slug = String((row as { slug?: string }).slug ?? "");
      const id = Number((row as { id?: number }).id ?? link.categoryId);
      return { id, title, name: name || title, slug };
    }),
  );
  return categories.filter((cat): cat is PostCategoryDisplay => cat != null);
}

export const GetPage = async (
  lang: string,
  postType: string,
  params: any = "",
) => {
  let posts = postType ? await GetPostType("/" + postType) : await GetPosts(params);
  if (!Array.isArray(posts)) {
    posts = [posts];
  }

  posts = posts
    .map((post: any) => {
      const tags = TagsFormat(post);
      if (matchesLanguage(tags, lang) && matchesPostType(tags, postType)) {
        return tags;
      }
    })
    .filter((post: any) => post);

  if (Array.isArray(posts)) {
    posts = posts[0];
  }
  return posts;
};

type CategoryPostsOptions = {
  meta?: Record<string, string>;
  postTypeSlug?: string;
  requireBody?: boolean;
};

function postOrderValue(post: { order?: unknown }): number {
  const parsed = Number.parseInt(String(post.order ?? 0), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function createdAtValue(post: { created_at?: unknown; createdOn?: unknown }): number {
  const raw = post.created_at ?? post.createdOn ?? 0;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Ordena posts pelo meta `order` (maior → menor). */
export function sortByOrderDesc<
  T extends { order?: unknown; title?: unknown; created_at?: unknown; createdOn?: unknown },
>(posts: T[]): T[] {
  return [...posts].sort((a, b) => {
    const orderA = postOrderValue(a);
    const orderB = postOrderValue(b);
    if (orderA !== orderB) return orderB - orderA;

    const createdA = createdAtValue(a);
    const createdB = createdAtValue(b);
    if (createdA !== createdB) return createdB - createdA;

    return String(a.title ?? "").localeCompare(String(b.title ?? ""));
  });
}

/** Ordena posts pela data de criação (mais recente → mais antigo). */
export function sortByCreatedDesc<
  T extends { created_at?: unknown; createdOn?: unknown; title?: unknown },
>(posts: T[]): T[] {
  return [...posts].sort((a, b) => {
    const createdA = createdAtValue(a);
    const createdB = createdAtValue(b);
    if (createdA !== createdB) return createdB - createdA;
    return String(a.title ?? "").localeCompare(String(b.title ?? ""));
  });
}

/** Posts publicados de uma categoria (taxonomy type `category`) via EdgePress. */
export const GetCategoryPosts = async (
  lang: string,
  categorySlug: string,
  options?: CategoryPostsOptions,
) => {
  const posts = await themeContentGateway.getPostsByCategorySlug(categorySlug, lang, options);
  return sortByOrderDesc(
    posts
      .map((post) => TagsFormat(post))
      .filter((post) => matchesLanguage(post, lang)),
  );
};

/** Posts da categoria `diretores` (independente do meta posttype). */
export const GetDiretores = async (lang: string) => {
  return GetCategoryPosts(lang, "diretores");
};

export const directorSlug = (post: { slug?: unknown; legacy_id?: unknown }): string => {
  const raw = String(post.slug ?? post.legacy_id ?? "").trim();
  return raw.replace(/-(pt-br|en-us)$/i, "") || raw;
};

/** Thumbnail do post (admin) com fallback para meta `image` legado. */
export function postThumbnailUrl(post: {
  thumbnail?: unknown;
  thumbnail_url?: unknown;
  image?: unknown;
}): string {
  for (const candidate of [post.thumbnail, post.thumbnail_url, post.image]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}

export function parsePostThumbnailId(post: {
  post_thumbnail_id?: unknown;
}): number | null {
  const raw = post.post_thumbnail_id;
  const id =
    typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function resolveLegacyImagePath(path: string, origin: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/api/media")) {
    return origin ? new URL(trimmed, origin).href : trimmed;
  }
  const normalized =
    trimmed.startsWith("/uploads/") || trimmed.startsWith("/")
      ? trimmed.startsWith("/")
        ? trimmed
        : `/${trimmed}`
      : `/uploads/${trimmed.replace(/^uploads\//, "")}`;
  const apiPath = `/api/media${normalized}`;
  return origin ? new URL(apiPath, origin).href : apiPath;
}

/** URL da mídia via GET /api/media/{attachmentId} (mesmo contrato do admin). */
export async function resolveAttachmentMediaUrl(
  attachmentId: number,
  origin = "",
): Promise<string> {
  const media = await getMediaById(db, attachmentId);
  if (!media) {
    return origin ? new URL(`/api/media/${attachmentId}`, origin).href : `/api/media/${attachmentId}`;
  }

  const meta = parseMetaValues(media.meta_values) as Record<string, unknown>;
  const path =
    (typeof meta.attachment_path === "string" && meta.attachment_path) ||
    (typeof meta.attachment_file === "string" && meta.attachment_file) ||
    "";

  if (path) {
    return resolveLegacyImagePath(path, origin);
  }

  return origin ? new URL(`/api/media/${attachmentId}`, origin).href : `/api/media/${attachmentId}`;
}

/**
 * Imagem da grade de trabalhos: `post_thumbnail_id` (API de mídia) ou meta `image` legado.
 */
export async function jobListingImageUrl(
  post: {
    post_thumbnail_id?: unknown;
    thumbnail?: unknown;
    thumbnail_url?: unknown;
    image?: unknown;
  },
  origin = "",
): Promise<string> {
  const thumbId = parsePostThumbnailId(post);
  if (thumbId) {
    const fromAttachment = await resolveAttachmentMediaUrl(thumbId, origin);
    if (fromAttachment) return fromAttachment;
  }
  return postThumbnailUrl(post);
}

/** Preenche `image` em cada job para listagens (trabalhos / jobs). */
export async function enrichJobListingImages<T extends Record<string, unknown>>(
  jobs: T[],
  origin = "",
): Promise<T[]> {
  return Promise.all(
    jobs.map(async (job) => {
      const image = await jobListingImageUrl(job, origin);
      return image ? { ...job, image } : job;
    }),
  );
}

/** Conteúdo inline seguro para dentro de `<p class="edgtf-team-position">`. */
export function toTeamPositionHtml(value: unknown): string {
  const text = value == null ? "" : String(value).trim();
  if (!text) return "";

  const paragraphs = [...text.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);

  if (paragraphs.length > 0) {
    return paragraphs.join("<br />");
  }

  return text.replace(/<\/?p[^>]*>/gi, "").trim();
}

function firstParagraphText(value: unknown): string {
  const text = value == null ? "" : String(value).trim();
  if (!text) return "";

  const match = text.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (match?.[1]?.trim()) return match[1].trim();

  return toTeamPositionHtml(text);
}

export function memberJobText(
  member: { cargo?: unknown; excerpt?: unknown; body?: unknown },
  options?: { founder?: boolean },
): string {
  if (typeof member.cargo === "string" && member.cargo.trim()) {
    return toTeamPositionHtml(member.cargo);
  }

  if (options?.founder) {
    const excerpt = typeof member.excerpt === "string" ? member.excerpt.trim() : "";
    if (excerpt && excerpt.length <= 120) {
      return toTeamPositionHtml(excerpt);
    }

    const firstParagraph = firstParagraphText(member.body);
    if (firstParagraph && firstParagraph.length <= 80) {
      return firstParagraph;
    }

    return "";
  }

  if (typeof member.body === "string" && member.body.trim()) {
    return toTeamPositionHtml(member.body);
  }

  if (typeof member.excerpt === "string" && member.excerpt.trim()) {
    return toTeamPositionHtml(member.excerpt);
  }

  return member.body != null ? toTeamPositionHtml(member.body) : "";
}

/** Sócios (equipe) com meta `dono = sim`. */
export const GetEquipeOwners = async (lang: string) => {
  return GetCategoryPosts(lang, "equipe", {
    postTypeSlug: "equipe",
    meta: { dono: "sim" },
  });
};

/** Ícones “O que fazemos” na página About — PT via categoria; EN via posttype legado `oquefazemos`. */
export const GetAboutOQueFazemosItems = async (lang: string) => {
  if (lang === "en") {
    const items = await GetContent(lang, "oquefazemos");
    return sortByOrderDesc(items.filter((item) => postOrderValue(item) > 0));
  }
  return GetCategoryPosts(lang, "o-que-fazemos");
};

/** Slug da página admin About por idioma. */
export const getAboutAdminPageSlug = (lang: string): string =>
  lang === "en" ? "about-us" : "a-farra";

/** Página do admin (post type `page`) por slug, com thumbnail e custom fields resolvidos. */
export const GetAdminPage = async (lang: string, slug: string) => {
  const pages = await themeContentGateway.getPageBySlug(slug);
  if (!Array.isArray(pages) || pages.length === 0) return null;

  let fallback: ReturnType<typeof TagsFormat> | null = null;

  for (const post of pages) {
    const formatted = TagsFormat(post);
    if (!fallback) fallback = formatted;
    if (matchesLanguage(formatted, lang)) return formatted;
  }

  return fallback;
};

export const GetContent = async (
  lang: string,
  postType: string,
  params: object,
) => {
  let posts;
  if (postType) {
    posts = await GetPostType("/" + postType, lang || undefined);
  } else {
    posts = await GetPosts(params);
  }

  // Jobs: idioma só via id_locale_code no SQL (admin). Demais tipos: filtro legado em memória.
  if (lang && postType !== "jobs") {
    posts = posts.filter((post: any) => matchesLanguage(post, lang));
  }

  if (postType) {
    posts = posts.filter((post: any) => matchesPostType(post, postType));
  }

  const formatted = posts.map((post: any) => TagsFormat(post));
  return sortByOrderDesc(formatted);
};

export const FilterPost = async (post: any, lang: any, postType: any) => {
  const formatted = TagsFormat(post);
  if (matchesLanguage(formatted, lang) && matchesPostType(formatted, postType)) {
    return formatted;
  }
  return null;
};
