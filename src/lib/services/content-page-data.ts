/**
 * Service que carrega todos os dados necessários para a página de edição de conteúdo (content.astro).
 * Centraliza tipo de post, taxonomias, usuários, post em edição, thumbnail, custom fields e templates.
 */
import { eq, and, inArray, or, isNull, sql } from "drizzle-orm";
import {
  postTypes,
  posts,
  taxonomies,
  postsTaxonomies,
  postsMedia,
  user as userTable,
} from "../../db/schema.ts";
import type { Database } from "../types/database.ts";
import {
  getMetaSchemaTaxonomyTypes,
  getMetaSchemaPostThumbnail,
  getMetaSchemaHasCustomFields,
} from "../utils/meta-parser.ts";
import { t } from "../../i18n/index.ts";

export type TypeRow = { id: number; name: string; meta_schema: unknown };

export type TaxonomyBlock = {
  id: number;
  name: string;
  slug: string;
  type: string;
  children: { id: number; name: string; slug: string }[];
};

export type ContentPagePost = {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string | null;
  status: string | null;
  author_id: string | null;
  id_locale_code: number | null;
  meta_values: string | null;
};

export type CustomFieldRow = { id: number; name: string; value: string; type?: string };

export type InitialCustomFieldItem = {
  id: number;
  title: string;
  rows: CustomFieldRow[];
  template?: boolean;
};

export type TemplateCustomFieldItem = { id: number; title: string; meta_values: string | null };

export type ContentPageDataResult = {
  typeRow: TypeRow;
  typeId: number;
  typeName: string;
  taxonomyBlocks: TaxonomyBlock[];
  selectedTermIds: number[];
  users: { id: string; name: string }[];
  post: ContentPagePost | null;
  pageTitle: string;
  initialTitle: string;
  initialSlug: string;
  initialExcerpt: string;
  initialStatus: string;
  initialAuthorId: string;
  initialOrder: string;
  initialLocaleId: number | null;
  asideAccordionName: string;
  thumbnailPath: string;
  thumbnailUrl: string;
  thumbnailAttachmentId: number | null;
  hasPostThumbnail: boolean;
  hasCustomFields: boolean;
  customFieldsTypeId: number | null;
  initialCustomFields: InitialCustomFieldItem[];
  templateCustomFieldsList: TemplateCustomFieldItem[];
};

export type ContentPageRedirect = { redirect: true; url: string };

export type ContentPageDataResponse = ContentPageDataResult | ContentPageRedirect;

export function isContentPageRedirect(
  r: ContentPageDataResponse
): r is ContentPageRedirect {
  return "redirect" in r && r.redirect === true;
}

/**
 * Garante que meta_schema seja um array (para uso com getMetaSchema*).
 * No D1 o driver pode retornar meta_schema como string JSON; as funções de meta_schema esperam array.
 */
function normalizeMetaSchema(metaSchema: unknown): Array<{ key: string; type?: string; default?: unknown }> {
  if (Array.isArray(metaSchema)) return metaSchema as Array<{ key: string; type?: string; default?: unknown }>;
  if (typeof metaSchema === "string") {
    try {
      const parsed = JSON.parse(metaSchema);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function buildThumbnailUrl(thumbPath: string): string {
  if (thumbPath.startsWith("http")) return thumbPath;
  if (thumbPath.startsWith("/uploads/") || thumbPath.startsWith("/")) return `/api/media${thumbPath}`;
  return `/api/media/uploads/${thumbPath}`;
}

export async function getContentPageData(params: {
  db: Database;
  locale: string;
  postTypeSlug: string;
  action: string;
  idParam: string | null;
  userId: string;
  /** Quando definido (perfil autor), edição só permitida se post.author_id === authorIdRestrict. */
  authorIdRestrict?: string | null;
}): Promise<ContentPageDataResponse> {
  const { db, locale, postTypeSlug, action, idParam, userId, authorIdRestrict } = params;

  const [typeRowResult] = await db
    .select({
      id: postTypes.id,
      name: postTypes.name,
      meta_schema: postTypes.meta_schema,
    })
    .from(postTypes)
    .where(eq(postTypes.slug, postTypeSlug))
    .limit(1);

  if (!typeRowResult) {
    return redirect(`/${locale}/admin`);
  }

  const typeRow: TypeRow = typeRowResult;
  const typeId = typeRow.id;
  const typeName = typeRow.name;

  const metaSchema = normalizeMetaSchema(typeRow.meta_schema);
  const taxonomyTypes = getMetaSchemaTaxonomyTypes(metaSchema);
  const hasPostThumbnail = getMetaSchemaPostThumbnail(metaSchema);
  const hasCustomFields = getMetaSchemaHasCustomFields(metaSchema);

  let customFieldsTypeId: number | null = null;
  if (hasCustomFields) {
    const [cfType] = await db
      .select({ id: postTypes.id })
      .from(postTypes)
      .where(eq(postTypes.slug, "custom_fields"))
      .limit(1);
    customFieldsTypeId = cfType?.id ?? null;
  }

  const taxonomyRoots =
    taxonomyTypes.length > 0
      ? await db
          .select({
            id: taxonomies.id,
            name: taxonomies.name,
            slug: taxonomies.slug,
            type: taxonomies.type,
          })
          .from(taxonomies)
          .where(
            and(
              inArray(taxonomies.type, taxonomyTypes),
              or(isNull(taxonomies.parent_id), eq(taxonomies.parent_id, 0))
            )
          )
          .orderBy(taxonomies.name)
      : [];

  const taxonomyBlocks: TaxonomyBlock[] = await Promise.all(
    taxonomyRoots.map(async (root) => {
      const children = await db
        .select({
          id: taxonomies.id,
          name: taxonomies.name,
          slug: taxonomies.slug,
        })
        .from(taxonomies)
        .where(eq(taxonomies.parent_id, root.id))
        .orderBy(taxonomies.name);
      return { ...root, children };
    })
  );

  const users = await db
    .select({ id: userTable.id, name: userTable.name })
    .from(userTable)
    .orderBy(userTable.name);

  let post: ContentPagePost | null = null;
  let selectedTermIds: number[] = [];
  let thumbnailPath = "";
  let thumbnailUrl = "";
  let thumbnailAttachmentId: number | null = null;
  let initialCustomFields: InitialCustomFieldItem[] = [];
  let initialOrder = "";
  const templateCustomFieldsList: TemplateCustomFieldItem[] = [];

  if (action === "edit" && idParam) {
    const [row] = await db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        excerpt: posts.excerpt,
        body: posts.body,
        status: posts.status,
        author_id: posts.author_id,
        id_locale_code: posts.id_locale_code,
        meta_values: posts.meta_values,
      })
      .from(posts)
      .where(and(eq(posts.id, parseInt(idParam, 10)), eq(posts.post_type_id, typeId)))
      .limit(1);
    post = row ?? null;

    if (!post) {
      return redirect(
        `/${locale}/admin/list?type=${postTypeSlug}&limit=10&page=1`
      );
    }
    if (authorIdRestrict != null && post.author_id !== authorIdRestrict) {
      return redirect(
        `/${locale}/admin/list?type=${postTypeSlug}&limit=10&page=1`
      );
    }

    const links = await db
      .select({ term_id: postsTaxonomies.term_id })
      .from(postsTaxonomies)
      .where(eq(postsTaxonomies.post_id, post.id));
    selectedTermIds = links.map((l) => l.term_id);

    if (post.meta_values) {
      try {
        const meta = JSON.parse(post.meta_values) as Record<string, unknown>;
        const rawOrder = meta["order"];
        if (typeof rawOrder === "number") {
          initialOrder = String(rawOrder);
        } else if (typeof rawOrder === "string") {
          initialOrder = rawOrder;
        }
        const postThumbnailId =
          typeof meta["post_thumbnail_id"] === "string"
            ? parseInt(meta["post_thumbnail_id"], 10)
            : typeof meta["post_thumbnail_id"] === "number"
              ? meta["post_thumbnail_id"]
              : null;

        if (postThumbnailId && Number.isInteger(postThumbnailId) && postThumbnailId > 0) {
          thumbnailAttachmentId = postThumbnailId;
          const [attachmentType] = await db
            .select({ id: postTypes.id })
            .from(postTypes)
            .where(eq(postTypes.slug, "attachment"))
            .limit(1);
          if (attachmentType) {
            const [attachmentPost] = await db
              .select({ meta_values: posts.meta_values })
              .from(posts)
              .where(
                and(
                  eq(posts.id, postThumbnailId),
                  eq(posts.post_type_id, attachmentType.id)
                )
              )
              .limit(1);
            if (attachmentPost?.meta_values) {
              try {
                const attachmentMeta = JSON.parse(
                  attachmentPost.meta_values
                ) as Record<string, unknown>;
                const thumbPath =
                  typeof attachmentMeta["attachment_path"] === "string"
                    ? attachmentMeta["attachment_path"]
                    : null;
                if (thumbPath) {
                  thumbnailPath = thumbPath;
                  thumbnailUrl = buildThumbnailUrl(thumbPath);
                }
              } catch {
                // ignore
              }
            }
          }
        }
      } catch {
        // ignore
      }
    }

    if (!thumbnailAttachmentId) {
      const [mediaRelation] = await db
        .select({ media_id: postsMedia.media_id })
        .from(postsMedia)
        .where(eq(postsMedia.post_id, post.id))
        .limit(1);
      if (mediaRelation) {
        thumbnailAttachmentId = mediaRelation.media_id;
      }
    }

    if (hasCustomFields && customFieldsTypeId) {
      const customFieldsPosts = await db
        .select({
          id: posts.id,
          title: posts.title,
          meta_values: posts.meta_values,
        })
        .from(posts)
        .where(
          and(
            eq(posts.parent_id, post.id),
            eq(posts.post_type_id, customFieldsTypeId)
          )
        )
        .orderBy(posts.created_at);

      let rowIdCounter = Date.now();
      initialCustomFields = customFieldsPosts.map((cfPost) => {
        let rows: CustomFieldRow[] = [];
        let template = false;
        if (cfPost.meta_values) {
          try {
            const meta = JSON.parse(cfPost.meta_values) as {
              fields?: Array<{ name?: string; value?: string; type?: string }>;
              template?: boolean;
              field_type?: string[];
            };
            if (meta.fields && Array.isArray(meta.fields)) {
              const fieldTypeList = Array.isArray(meta.field_type) ? meta.field_type : [];
              rows = meta.fields.map((field, i) => {
                rowIdCounter += 1;
                const rowType =
                  field.type === "file"
                    ? "file"
                    : field.type === "editor"
                      ? "editor"
                      : (fieldTypeList[i] === "upload" ? "file" : "text");
                return {
                  id: rowIdCounter,
                  name: typeof field.name === "string" ? field.name : "",
                  value: typeof field.value === "string" ? field.value : "",
                  type: rowType,
                };
              });
            }
            if (meta.template === true) template = true;
          } catch {
            // ignore
          }
        }
        if (rows.length === 0) {
          rowIdCounter += 1;
          rows = [{ id: rowIdCounter, name: "", value: "", type: "text" }];
        }
        return {
          id: cfPost.id,
          title: cfPost.title || "",
          rows,
          template,
        };
      });
    }
  }

  if (hasCustomFields && customFieldsTypeId) {
    const templatePosts = await db
      .select({
        id: posts.id,
        title: posts.title,
        meta_values: posts.meta_values,
      })
      .from(posts)
      .where(
        and(
          eq(posts.post_type_id, customFieldsTypeId),
          sql`json_extract(${posts.meta_values}, '$.template') = 1`
        )
      )
      .orderBy(posts.title);
    const seenTitles = new Set<string>();
    for (const p of templatePosts) {
      const title = (p.title || "").trim();
      if (title && !seenTitles.has(title)) {
        seenTitles.add(title);
        templateCustomFieldsList.push({
          id: p.id,
          title: p.title,
          meta_values: p.meta_values,
        });
      }
    }
  }

  const pageTitle =
    action === "new"
      ? t(locale, "admin.content.newTitle", { type: typeName })
      : t(locale, "admin.content.editTitle", { type: typeName });

  const initialAuthorId =
    action === "edit" && post?.author_id ? String(post.author_id) : String(userId ?? "");

  return {
    typeRow,
    typeId,
    typeName,
    taxonomyBlocks,
    selectedTermIds,
    users,
    post,
    pageTitle,
    initialTitle: String(post?.title ?? ""),
    initialSlug: String(post?.slug ?? ""),
    initialExcerpt: String(post?.excerpt ?? ""),
    initialStatus: String(post?.status ?? "draft"),
    initialAuthorId,
    initialOrder,
    initialLocaleId: post?.id_locale_code ?? null,
    asideAccordionName: "content-aside",
    thumbnailPath: String(thumbnailPath),
    thumbnailUrl: String(thumbnailUrl),
    thumbnailAttachmentId,
    hasPostThumbnail,
    hasCustomFields,
    customFieldsTypeId,
    initialCustomFields,
    templateCustomFieldsList,
  };
}
