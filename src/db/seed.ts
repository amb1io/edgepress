import { and, eq, inArray, sql } from "drizzle-orm";
import {
  postTypes,
  posts,
  postsMedia,
  postsTaxonomies,
  taxonomies,
  settings,
  roleCapability,
  locales,
  translations,
  translationsLanguages,
} from "./schema.ts";
import { deduplicateLocales } from "./deduplicate-locales.ts";
import {
  ROLE_CAPABILITY_ROWS,
  FULL_LOCALES,
  DEFAULT_POST_TYPES,
  META_ONLY_POST_TYPE_SLUGS,
  MENU_CONFIG,
  TAXONOMY_SEED_ROWS,
  DEFAULT_SETTINGS_ROWS,
  POST_TYPES_WITH_CUSTOM_FIELDS,
  SEO_CUSTOM_FIELD_TEMPLATE,
  SHOWCASE_ATTACHMENT,
  SHOWCASE_PAGE,
  SHOWCASE_PAGE_EN,
  SHOWCASE_POST,
  SHOWCASE_POST_EN,
  buildShowcasePageBodyHtml,
  buildShowcasePageBodyHtmlEn,
} from "./seed-data.ts";
import enTranslations from "../i18n/languages/en.json";
import esTranslations from "../i18n/languages/es.json";
import ptBrTranslations from "../i18n/languages/pt_br.json";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function clearSeedData(db: any): Promise<number> {
  const result = await db
    .delete(posts)
    .where(sql`json_extract(${posts.meta_values}, '$.show_in_menu') = 1`)
    .returning({ id: posts.id });
  const deleted = Array.isArray(result) ? result : [];
  return deleted.length;
}

/**
 * Garante que os post types padrão existam no banco (insere ou atualiza).
 * Usado pelo seed e pode ser usado pela UI "Carregar padrões".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensurePostTypesFromDefaults(db: any): Promise<Record<string, number>> {
  const now = Date.now();
  const existing = await db
    .select({ id: postTypes.id, slug: postTypes.slug })
    .from(postTypes);
  const bySlug = new Map(
    existing.map((r: { id: number; slug: string }) => [r.slug, r.id]),
  );

  for (const pt of DEFAULT_POST_TYPES) {
    if (!bySlug.has(pt.slug)) {
      const [inserted] = await db
        .insert(postTypes)
        .values({
          slug: pt.slug,
          name: pt.name,
          meta_schema: pt.meta_schema,
          created_at: now,
          updated_at: now,
        })
        .returning();
      if (inserted) bySlug.set(pt.slug, (inserted as { id: number }).id);
    } else {
      await db
        .update(postTypes)
        .set({ name: pt.name, meta_schema: pt.meta_schema, updated_at: now })
        .where(eq(postTypes.slug, pt.slug));
    }
  }

  return Object.fromEntries(bySlug) as Record<string, number>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureShowcaseHelloWorldContent(
  db: any,
  typeIds: Record<string, number>,
  taxBySlug: Map<string, number>,
  localesByCode: Map<string, number>,
  now: number,
): Promise<void> {
  const attachmentTypeId = typeIds["attachment"];
  const pageTypeId = typeIds["page"];
  const postTypeId = typeIds["post"];
  if (!attachmentTypeId || !pageTypeId || !postTypeId) return;

  const [existingAttachment] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.post_type_id, attachmentTypeId), eq(posts.slug, SHOWCASE_ATTACHMENT.slug)))
    .limit(1);

  let attachmentId = existingAttachment?.id as number | undefined;
  if (!attachmentId) {
    const [insertedAttachment] = await db
      .insert(posts)
      .values({
        post_type_id: attachmentTypeId,
        title: SHOWCASE_ATTACHMENT.title,
        slug: SHOWCASE_ATTACHMENT.slug,
        status: "published",
        meta_values: JSON.stringify({
          mime_type: SHOWCASE_ATTACHMENT.mime_type,
          attachment_file: SHOWCASE_ATTACHMENT.file,
          attachment_width: SHOWCASE_ATTACHMENT.width,
          attachment_height: SHOWCASE_ATTACHMENT.height,
          attachment_path: SHOWCASE_ATTACHMENT.path,
          attachment_alt: SHOWCASE_ATTACHMENT.alt,
        }),
        created_at: now,
        updated_at: now,
      })
      .returning({ id: posts.id });
    attachmentId = (insertedAttachment as { id: number } | undefined)?.id;
  }
  if (!attachmentId) return;

  type ShowcasePageRow = {
    slug: string;
    translation_key: string;
    title: string;
    excerpt: string;
    locale_code: string;
    body: string;
  };

  type ShowcasePostRow = {
    slug: string;
    translation_key: string;
    title: string;
    excerpt: string;
    locale_code: string;
    category_slug: string;
    body_html: string;
  };

  const showcasePages: ShowcasePageRow[] = [
    {
      slug: SHOWCASE_PAGE.slug,
      translation_key: SHOWCASE_PAGE.translation_key,
      title: SHOWCASE_PAGE.title,
      excerpt: SHOWCASE_PAGE.excerpt,
      locale_code: SHOWCASE_PAGE.locale_code,
      body: buildShowcasePageBodyHtml(),
    },
    {
      slug: SHOWCASE_PAGE_EN.slug,
      translation_key: SHOWCASE_PAGE_EN.translation_key,
      title: SHOWCASE_PAGE_EN.title,
      excerpt: SHOWCASE_PAGE_EN.excerpt,
      locale_code: SHOWCASE_PAGE_EN.locale_code,
      body: buildShowcasePageBodyHtmlEn(),
    },
  ];

  for (const pageRow of showcasePages) {
    const localeId = localesByCode.get(pageRow.locale_code) ?? null;
    const [existingPage] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.post_type_id, pageTypeId), eq(posts.slug, pageRow.slug)))
      .limit(1);

    let pageId = existingPage?.id as number | undefined;
    if (!pageId) {
      const [insertedPage] = await db
        .insert(posts)
        .values({
          post_type_id: pageTypeId,
          id_locale_code: localeId,
          title: pageRow.title,
          slug: pageRow.slug,
          excerpt: pageRow.excerpt,
          body: pageRow.body,
          status: "published",
          published_at: now,
          meta_values: JSON.stringify({
            translation_key: pageRow.translation_key,
            post_thumbnail_id: String(attachmentId),
          }),
          created_at: now,
          updated_at: now,
        })
        .returning({ id: posts.id });
      pageId = (insertedPage as { id: number } | undefined)?.id;
    }
    if (!pageId) continue;

    const [existingMediaLink] = await db
      .select({ post_id: postsMedia.post_id })
      .from(postsMedia)
      .where(and(eq(postsMedia.post_id, pageId), eq(postsMedia.media_id, attachmentId)))
      .limit(1);
    if (!existingMediaLink) {
      await db.insert(postsMedia).values({ post_id: pageId, media_id: attachmentId });
    }
  }

  const showcasePosts: ShowcasePostRow[] = [
    {
      slug: SHOWCASE_POST.slug,
      translation_key: SHOWCASE_POST.translation_key,
      title: SHOWCASE_POST.title,
      excerpt: SHOWCASE_POST.excerpt,
      locale_code: SHOWCASE_POST.locale_code,
      category_slug: SHOWCASE_POST.category_slug,
      body_html: SHOWCASE_POST.body_html,
    },
    {
      slug: SHOWCASE_POST_EN.slug,
      translation_key: SHOWCASE_POST_EN.translation_key,
      title: SHOWCASE_POST_EN.title,
      excerpt: SHOWCASE_POST_EN.excerpt,
      locale_code: SHOWCASE_POST_EN.locale_code,
      category_slug: SHOWCASE_POST_EN.category_slug,
      body_html: SHOWCASE_POST_EN.body_html,
    },
  ];

  const categoryId = taxBySlug.get(SHOWCASE_POST.category_slug);
  for (const postRow of showcasePosts) {
    const localeId = localesByCode.get(postRow.locale_code) ?? null;
    const [existingPost] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.post_type_id, postTypeId), eq(posts.slug, postRow.slug)))
      .limit(1);

    let postId = existingPost?.id as number | undefined;
    if (!postId) {
      const [insertedPost] = await db
        .insert(posts)
        .values({
          post_type_id: postTypeId,
          id_locale_code: localeId,
          title: postRow.title,
          slug: postRow.slug,
          excerpt: postRow.excerpt,
          body: postRow.body_html,
          status: "published",
          published_at: now,
          meta_values: JSON.stringify({ translation_key: postRow.translation_key }),
          created_at: now,
          updated_at: now,
        })
        .returning({ id: posts.id });
      postId = (insertedPost as { id: number } | undefined)?.id;
    }

    if (postId && categoryId) {
      const [existingTaxLink] = await db
        .select({ post_id: postsTaxonomies.post_id })
        .from(postsTaxonomies)
        .where(and(eq(postsTaxonomies.post_id, postId), eq(postsTaxonomies.term_id, categoryId)))
        .limit(1);
      if (!existingTaxLink) {
        await db.insert(postsTaxonomies).values({ post_id: postId, term_id: categoryId });
      }
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runSeed(db: any): Promise<void> {
  const now = Date.now();

  const typeIds = await ensurePostTypesFromDefaults(db);

  for (const slug of POST_TYPES_WITH_CUSTOM_FIELDS) {
    const pt = DEFAULT_POST_TYPES.find((p) => p.slug === slug);
    if (pt) {
      await db
        .update(postTypes)
        .set({ meta_schema: pt.meta_schema, updated_at: now })
        .where(eq(postTypes.slug, slug));
    }
  }

  const customFieldsTypeIdForTemplate = typeIds["custom_fields"];
  if (customFieldsTypeIdForTemplate) {
    const [existingSeoTemplate] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          eq(posts.post_type_id, customFieldsTypeIdForTemplate),
          eq(posts.slug, SEO_CUSTOM_FIELD_TEMPLATE.slug),
        ),
      )
      .limit(1);

    if (!existingSeoTemplate) {
      await db.insert(posts).values({
        post_type_id: customFieldsTypeIdForTemplate,
        title: SEO_CUSTOM_FIELD_TEMPLATE.title,
        slug: SEO_CUSTOM_FIELD_TEMPLATE.slug,
        status: "published",
        meta_values: JSON.stringify(SEO_CUSTOM_FIELD_TEMPLATE.meta_values),
        created_at: now,
        updated_at: now,
      });
    }
  }

  // Taxonomias: Categoria (raiz), Uncategorized (filha), Tag. Fonte: seed-data.ts
  const nowTax = Date.now();
  const existingTax = await db
    .select({ id: taxonomies.id, slug: taxonomies.slug })
    .from(taxonomies)
    .where(inArray(taxonomies.slug, TAXONOMY_SEED_ROWS.map((r) => r.slug)));
  const taxBySlug = new Map<string, number>(
    (existingTax as { id: number; slug: string }[]).map((r) => [r.slug, r.id]),
  );
  for (const row of TAXONOMY_SEED_ROWS) {
    if (taxBySlug.has(row.slug)) continue;
    const parentId = row.parent_slug ? taxBySlug.get(row.parent_slug) ?? null : null;
    const [inserted] = await db
      .insert(taxonomies)
      .values({
        name: row.name,
        slug: row.slug,
        type: row.type,
        parent_id: parentId,
        created_at: nowTax,
        updated_at: nowTax,
      })
      .returning({ id: taxonomies.id });
    if (inserted) taxBySlug.set(row.slug, (inserted as { id: number }).id);
  }

  // Locales: Popular tabela com idiomas e países
  const existingLocales = await db
    .select({ id: locales.id, locale_code: locales.locale_code })
    .from(locales);
  const localesByCode = new Map<string, number>(
    (existingLocales as { id: number; locale_code: string }[]).map((r) => [
      r.locale_code,
      r.id,
    ]),
  );

  for (const localeData of FULL_LOCALES) {
    if (!localesByCode.has(localeData.locale_code)) {
      await db.insert(locales).values({
        language: localeData.language,
        hello_world: localeData.hello_world,
        locale_code: localeData.locale_code,
        country: localeData.country,
        timezone: localeData.timezone,
      });
    }
  }

  // Re-fetch locales para uso nas traduções (en_US, es_ES, pt_BR estão em FULL_LOCALES)
  const updatedLocales = await db
    .select({ id: locales.id, locale_code: locales.locale_code })
    .from(locales);
  const updatedLocalesByCode = new Map<string, number>(
    (updatedLocales as { id: number; locale_code: string }[]).map((r) => [
      r.locale_code,
      r.id,
    ]),
  );

  // Função auxiliar para extrair namespace e key de uma string
  function extractNamespaceAndKey(keyString: string): { namespace: string; key: string } {
    const parts = keyString.split(".");
    if (parts.length >= 3) {
      return {
        namespace: parts.slice(0, -1).join("."),
        key: parts[parts.length - 1] ?? "",
      };
    } else if (parts.length === 2) {
      return {
        namespace: parts[0] ?? "",
        key: parts[1] ?? "",
      };
    } else {
      return {
        namespace: "default",
        key: parts[0] ?? "",
      };
    }
  }

  // Processar e inserir traduções dos arquivos JSON
  const nowTranslations = Date.now();
  const translationMap = new Map<string, number>(); // Map<"namespace:key", translation_id>

  // Processar en.json -> en_US
  const enLocaleId = updatedLocalesByCode.get("en_US");
  if (enLocaleId) {
    for (const [keyString, value] of Object.entries(enTranslations)) {
      const { namespace, key } = extractNamespaceAndKey(keyString);
      const translationKey = `${namespace}:${key}`;

      // Buscar ou criar registro na tabela translations
      let translationId = translationMap.get(translationKey);
      if (!translationId) {
        const [existing] = await db
          .select({ id: translations.id })
          .from(translations)
          .where(and(eq(translations.namespace, namespace), eq(translations.key, key)))
          .limit(1);

        if (existing) {
          translationId = (existing as { id: number }).id;
        } else {
          const [inserted] = await db
            .insert(translations)
            .values({
              namespace,
              key,
              created_at: nowTranslations,
              updated_at: nowTranslations,
            })
            .returning({ id: translations.id });
          translationId = (inserted as { id: number }).id;
        }
        translationMap.set(translationKey, translationId);
      }

      // Inserir ou atualizar na tabela translations_languages
      const [existingLang] = await db
        .select({ id: translationsLanguages.id })
        .from(translationsLanguages)
        .where(
          and(
            eq(translationsLanguages.id_translations, translationId),
            eq(translationsLanguages.id_locale_code, enLocaleId)
          )
        )
        .limit(1);

      if (existingLang) {
        await db
          .update(translationsLanguages)
          .set({ value: String(value) })
          .where(eq(translationsLanguages.id, (existingLang as { id: number }).id));
      } else {
        await db.insert(translationsLanguages).values({
          id_translations: translationId,
          id_locale_code: enLocaleId,
          value: String(value),
        });
      }
    }
  }

  // Processar es.json -> es_ES
  const esLocaleId = updatedLocalesByCode.get("es_ES");
  if (esLocaleId) {
    for (const [keyString, value] of Object.entries(esTranslations)) {
      const { namespace, key } = extractNamespaceAndKey(keyString);
      const translationKey = `${namespace}:${key}`;

      // Buscar translation_id (já deve existir do processamento do en.json)
      let translationId = translationMap.get(translationKey);
      if (!translationId) {
        const [existing] = await db
          .select({ id: translations.id })
          .from(translations)
          .where(and(eq(translations.namespace, namespace), eq(translations.key, key)))
          .limit(1);

        if (existing) {
          translationId = (existing as { id: number }).id;
          translationMap.set(translationKey, translationId);
        } else {
          const [inserted] = await db
            .insert(translations)
            .values({
              namespace,
              key,
              created_at: nowTranslations,
              updated_at: nowTranslations,
            })
            .returning({ id: translations.id });
          translationId = (inserted as { id: number }).id;
          translationMap.set(translationKey, translationId);
        }
      }

      // Inserir ou atualizar na tabela translations_languages
      const [existingLang] = await db
        .select({ id: translationsLanguages.id })
        .from(translationsLanguages)
        .where(
          and(
            eq(translationsLanguages.id_translations, translationId),
            eq(translationsLanguages.id_locale_code, esLocaleId)
          )
        )
        .limit(1);

      if (existingLang) {
        await db
          .update(translationsLanguages)
          .set({ value: String(value) })
          .where(eq(translationsLanguages.id, (existingLang as { id: number }).id));
      } else {
        await db.insert(translationsLanguages).values({
          id_translations: translationId,
          id_locale_code: esLocaleId,
          value: String(value),
        });
      }
    }
  }

  // Processar pt_br.json -> pt_BR
  const ptBrLocaleId = updatedLocalesByCode.get("pt_BR");
  if (ptBrLocaleId) {
    for (const [keyString, value] of Object.entries(ptBrTranslations)) {
      const { namespace, key } = extractNamespaceAndKey(keyString);
      const translationKey = `${namespace}:${key}`;

      // Buscar translation_id (já deve existir do processamento anterior)
      let translationId = translationMap.get(translationKey);
      if (!translationId) {
        const [existing] = await db
          .select({ id: translations.id })
          .from(translations)
          .where(and(eq(translations.namespace, namespace), eq(translations.key, key)))
          .limit(1);

        if (existing) {
          translationId = (existing as { id: number }).id;
          translationMap.set(translationKey, translationId);
        } else {
          const [inserted] = await db
            .insert(translations)
            .values({
              namespace,
              key,
              created_at: nowTranslations,
              updated_at: nowTranslations,
            })
            .returning({ id: translations.id });
          translationId = (inserted as { id: number }).id;
          translationMap.set(translationKey, translationId);
        }
      }

      // Inserir ou atualizar na tabela translations_languages
      const [existingLang] = await db
        .select({ id: translationsLanguages.id })
        .from(translationsLanguages)
        .where(
          and(
            eq(translationsLanguages.id_translations, translationId),
            eq(translationsLanguages.id_locale_code, ptBrLocaleId)
          )
        )
        .limit(1);

      if (existingLang) {
        await db
          .update(translationsLanguages)
          .set({ value: String(value) })
          .where(eq(translationsLanguages.id, (existingLang as { id: number }).id));
      } else {
        await db.insert(translationsLanguages).values({
          id_translations: translationId,
          id_locale_code: ptBrLocaleId,
          value: String(value),
        });
      }
    }
  }

  // Settings (options)
  const settingsRows = DEFAULT_SETTINGS_ROWS;
  const existingSettings = await db
    .select({ name: settings.name })
    .from(settings);
  const existingNames = new Set(
    (existingSettings as { name: string }[]).map((r) => r.name),
  );
  for (const row of settingsRows) {
    if (!existingNames.has(row.name)) {
      await db.insert(settings).values(row);
      existingNames.add(row.name);
    }
  }

  const envSiteUrl = (process.env.SITE_URL ?? "").trim();
  if (envSiteUrl) {
    const [siteUrlRow] = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.name, "site_url"))
      .limit(1);
    if (!siteUrlRow?.value?.trim()) {
      await db
        .update(settings)
        .set({ value: envSiteUrl })
        .where(eq(settings.name, "site_url"));
    }
  }

  // Tema padrão showcase (slug 2026): post "themes" ativo para o site público.
  const themesTypeId = typeIds["themes"];
  if (themesTypeId) {
    const [existingTheme2026] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.post_type_id, themesTypeId), eq(posts.slug, "2026")))
      .limit(1);

    if (!existingTheme2026) {
      await db.insert(posts).values({
        post_type_id: themesTypeId,
        title: "Edgepress Showcase 2026",
        slug: "2026",
        status: "published",
        meta_values: JSON.stringify({
          is_active: "1",
          requested_active: "1",
          github_ref: "main",
          supports: "single,archive,page",
          version: "1.0.0",
        }),
        created_at: now,
        updated_at: now,
      });
    }
  }

  await ensureShowcaseHelloWorldContent(db, typeIds, taxBySlug, updatedLocalesByCode, now);

  // Permissões por perfil (0=admin, 1=editor, 2=autor, 3=leitor)
  const existingCapabilities = await db
    .select({ roleId: roleCapability.roleId, capability: roleCapability.capability })
    .from(roleCapability);
  const existingCapSet = new Set(
    existingCapabilities.map((r: { roleId: number; capability: string }) => `${r.roleId}:${r.capability}`),
  );
  for (const row of ROLE_CAPABILITY_ROWS) {
    const key = `${row.roleId}:${row.capability}`;
    if (!existingCapSet.has(key)) {
      await db.insert(roleCapability).values(row);
      existingCapSet.add(key);
    }
  }

  // Documentar origem do permissionamento em settings (sistematização)
  if (!existingNames.has("admin_permission_source")) {
    await db.insert(settings).values({
      name: "admin_permission_source",
      value: "role_capability",
      autoload: true,
    });
    existingNames.add("admin_permission_source");
  }

  const menuConfig: {
    typeSlug: string;
    menu_options: string[];
    menu_order: number;
    icon: string;
  }[] = MENU_CONFIG;

  for (const config of menuConfig) {
    if (META_ONLY_POST_TYPE_SLUGS.has(config.typeSlug)) continue;
    const typeId = typeIds[config.typeSlug];
    if (!typeId) continue;

    const existingMenuPost = await db
      .select({ id: posts.id, meta_values: posts.meta_values })
      .from(posts)
      .where(
        and(
          eq(posts.post_type_id, typeId),
          sql`json_extract(${posts.meta_values}, '$.show_in_menu') = 1`,
        ),
      )
      .limit(1);

    const metaValues = {
      show_in_menu: true,
      menu_options: config.menu_options,
      menu_order: config.menu_order,
      icon: config.icon,
      post_types: ["custom_fields"],
    };

    if (existingMenuPost.length > 0) {
      await db
        .update(posts)
        .set({
          meta_values: JSON.stringify(metaValues),
          updated_at: now,
        })
        .where(eq(posts.id, existingMenuPost[0].id));
    } else {
      await db.insert(posts).values({
        post_type_id: typeId,
        title: config.typeSlug,
        slug: `menu-${config.typeSlug}-${now}`,
        status: "published",
        meta_values: JSON.stringify(metaValues),
        created_at: now,
        updated_at: now,
      });
    }
  }

  const { removed } = await deduplicateLocales(db);
  if (removed.length > 0) {
    console.log(`Locales duplicados removidos: ${removed.join(", ")}`);
  }
}
