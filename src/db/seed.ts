import { and, eq, inArray, sql } from "drizzle-orm";
import {
  postTypes,
  posts,
  taxonomies,
  settings,
  roleCapability,
  locales,
  translations,
  translationsLanguages,
} from "./schema.ts";
import { ROLE_CAPABILITY_ROWS, FULL_LOCALES, DEFAULT_POST_TYPES, META_ONLY_POST_TYPE_SLUGS, MENU_CONFIG, TAXONOMY_SEED_ROWS } from "./seed-data.ts";
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
export async function runSeed(db: any): Promise<void> {
  const now = Date.now();

  const typeIds = await ensurePostTypesFromDefaults(db);

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
  const settingsRows = [
    { name: "site_name", value: "demo site", autoload: true },
    { name: "site_description", value: "demo_description", autoload: true },
    { name: "setup_done", value: "N", autoload: true },
    { name: "default_posttype", value: "post", autoload: true },
    { name: "default_taxonomies", value: "category,tag", autoload: true },
    { name: "active_theme", value: "2026", autoload: true },
  ];
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

  // Tema padrão (template default 2026): garante que exista um post "themes" com slug 2026 e ativo.
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
        title: "Tema 2026",
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
}
