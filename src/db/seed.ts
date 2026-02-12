import { and, eq, inArray, sql } from "drizzle-orm";
import {
  postTypes,
  posts,
  taxonomies,
  settings,
  locales,
  translations,
  translationsLanguages,
  defaultMetaSchema,
  buildMetaSchema,
} from "./schema.ts";
import enTranslations from "../i18n/languages/en.json";
import esTranslations from "../i18n/languages/es.json";
import ptBrTranslations from "../i18n/languages/pt_br.json";

const postMetaSchema = buildMetaSchema([
  { key: "taxonomy", type: "array", default: ["category", "tag"] },
  { key: "post_thumbnail", type: "boolean", default: true },
  { key: "post_types", type: "array", default: ["custom_fields"] },
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

/** Post types que existem só para referência em meta_values (ex.: post_types no post). Não aparecem no menu. */
const META_ONLY_POST_TYPES = new Set(["custom_fields"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function clearSeedData(db: any): Promise<number> {
  const result = await db
    .delete(posts)
    .where(sql`json_extract(${posts.meta_values}, '$.show_in_menu') = 1`)
    .returning({ id: posts.id });
  const deleted = Array.isArray(result) ? result : [];
  return deleted.length;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runSeed(db: any): Promise<void> {
  const now = Date.now();

  const types = [
    { slug: "post", name: "Post" },
    { slug: "page", name: "Página" },
    { slug: "dashboard", name: "Dashboard" },
    { slug: "settings", name: "Configurações" },
    { slug: "user", name: "User" },
    { slug: "attachment", name: "Attachment" },
    { slug: "translations_languages", name: "Translations Languages" },
    { slug: "custom_fields", name: "Custom Fields" }, // meta-only: referenciado em meta_values (ex.: post_types), não aparece no menu
  ];

  const existing = await db
    .select({ id: postTypes.id, slug: postTypes.slug })
    .from(postTypes);
  const bySlug = new Map(
    existing.map((r: { id: number; slug: string }) => [r.slug, r.id]),
  );

  const pageMetaSchema = buildMetaSchema([
    { key: "post_thumbnail", type: "boolean", default: true },
  ]);

  for (const pt of types) {
    const metaSchema =
      pt.slug === "post"
        ? postMetaSchema
        : pt.slug === "page"
          ? pageMetaSchema
          : pt.slug === "attachment"
            ? attachmentMetaSchema
            : pt.slug === "translations_languages"
              ? translationsMetaSchema
              : defaultMetaSchema;
    if (!bySlug.has(pt.slug)) {
      const [inserted] = await db
        .insert(postTypes)
        .values({
          slug: pt.slug,
          name: pt.name,
          meta_schema: metaSchema,
          created_at: now,
          updated_at: now,
        })
        .returning();
      if (inserted) bySlug.set(pt.slug, inserted.id);
    } else if (pt.slug === "post") {
      await db
        .update(postTypes)
        .set({ meta_schema: postMetaSchema, updated_at: now })
        .where(eq(postTypes.slug, "post"));
    } else if (pt.slug === "page") {
      const pageMetaSchema = buildMetaSchema([
        { key: "post_thumbnail", type: "boolean", default: true },
      ]);
      await db
        .update(postTypes)
        .set({ meta_schema: pageMetaSchema, updated_at: now })
        .where(eq(postTypes.slug, "page"));
    } else if (pt.slug === "attachment") {
      await db
        .update(postTypes)
        .set({ meta_schema: attachmentMetaSchema, updated_at: now })
        .where(eq(postTypes.slug, "attachment"));
    } else if (pt.slug === "translations_languages") {
      await db
        .update(postTypes)
        .set({ meta_schema: translationsMetaSchema, updated_at: now })
        .where(eq(postTypes.slug, "translations_languages"));
    }
  }

  const typeIds = Object.fromEntries(bySlug) as Record<string, number>;

  // Taxonomias: Categoria (raiz) e Uncategorized (filha)
  const nowTax = Date.now();
  const existingTax = await db
    .select({ id: taxonomies.id, slug: taxonomies.slug })
    .from(taxonomies)
    .where(inArray(taxonomies.slug, ["categoria", "uncategorized", "tag"]));
  const taxBySlug = new Map<string, number>(
    (existingTax as { id: number; slug: string }[]).map((r) => [r.slug, r.id]),
  );
  let categoriaId: number | undefined = taxBySlug.get("categoria");
  if (categoriaId == null) {
    const [inserted] = await db
      .insert(taxonomies)
      .values({
        name: "Categoria",
        slug: "categoria",
        type: "category",
        parent_id: null,
        created_at: nowTax,
        updated_at: nowTax,
      })
      .returning({ id: taxonomies.id });
    if (inserted) {
      categoriaId = (inserted as { id: number }).id;
      taxBySlug.set("categoria", categoriaId);
    }
  }
  if (categoriaId != null && taxBySlug.get("uncategorized") == null) {
    await db.insert(taxonomies).values({
      name: "Uncategorized",
      slug: "uncategorized",
      type: "category",
      parent_id: categoriaId,
      created_at: nowTax,
      updated_at: nowTax,
    });
  }
  if (taxBySlug.get("tag") == null) {
    const [inserted] = await db
      .insert(taxonomies)
      .values({
        name: "Tag",
        slug: "tag",
        type: "tag",
        parent_id: null,
        created_at: nowTax,
        updated_at: nowTax,
      })
      .returning({ id: taxonomies.id });
    if (inserted) taxBySlug.set("tag", (inserted as { id: number }).id);
  }

  // Locales: Popular tabela com idiomas e países
  const nowLocales = Date.now();
  const existingLocales = await db
    .select({ id: locales.id, locale_code: locales.locale_code })
    .from(locales);
  const localesByCode = new Map<string, number>(
    (existingLocales as { id: number; locale_code: string }[]).map((r) => [
      r.locale_code,
      r.id,
    ]),
  );

  const localesData = [
    { language: "English", hello_world: "Hello World", locale_code: "en", country: "United States", timezone: "UTC-5" },
    { language: "English", hello_world: "Hello World", locale_code: "en-GB", country: "United Kingdom", timezone: "UTC+0" },
    { language: "Portuguese", hello_world: "Olá Mundo", locale_code: "pt-BR", country: "Brazil", timezone: "UTC-3" },
    { language: "Portuguese", hello_world: "Olá Mundo", locale_code: "pt-PT", country: "Portugal", timezone: "UTC+0" },
    { language: "Spanish", hello_world: "Hola Mundo", locale_code: "es", country: "Spain", timezone: "UTC+1" },
    { language: "Spanish", hello_world: "Hola Mundo", locale_code: "es-MX", country: "Mexico", timezone: "UTC-6" },
    { language: "French", hello_world: "Bonjour le monde", locale_code: "fr", country: "France", timezone: "UTC+1" },
    { language: "French", hello_world: "Bonjour le monde", locale_code: "fr-CA", country: "Canada", timezone: "UTC-5" },
    { language: "German", hello_world: "Hallo Welt", locale_code: "de", country: "Germany", timezone: "UTC+1" },
    { language: "Italian", hello_world: "Ciao mondo", locale_code: "it", country: "Italy", timezone: "UTC+1" },
    { language: "Japanese", hello_world: "こんにちは世界", locale_code: "ja", country: "Japan", timezone: "UTC+9" },
    { language: "Chinese (Simplified)", hello_world: "你好世界", locale_code: "zh-CN", country: "China", timezone: "UTC+8" },
    { language: "Chinese (Traditional)", hello_world: "你好世界", locale_code: "zh-TW", country: "Taiwan", timezone: "UTC+8" },
    { language: "Russian", hello_world: "Привет мир", locale_code: "ru", country: "Russia", timezone: "UTC+3" },
    { language: "Korean", hello_world: "안녕하세요 세계", locale_code: "ko", country: "South Korea", timezone: "UTC+9" },
    { language: "Arabic", hello_world: "مرحبا بالعالم", locale_code: "ar", country: "Saudi Arabia", timezone: "UTC+3" },
    { language: "Dutch", hello_world: "Hallo wereld", locale_code: "nl", country: "Netherlands", timezone: "UTC+1" },
    { language: "Polish", hello_world: "Witaj świecie", locale_code: "pl", country: "Poland", timezone: "UTC+1" },
    { language: "Turkish", hello_world: "Merhaba Dünya", locale_code: "tr", country: "Turkey", timezone: "UTC+3" },
    { language: "Vietnamese", hello_world: "Xin chào thế giới", locale_code: "vi", country: "Vietnam", timezone: "UTC+7" },
    { language: "Hindi", hello_world: "नमस्ते दुनिया", locale_code: "hi", country: "India", timezone: "UTC+5:30" },
    { language: "Thai", hello_world: "สวัสดีชาวโลก", locale_code: "th", country: "Thailand", timezone: "UTC+7" },
    { language: "Indonesian", hello_world: "Halo Dunia", locale_code: "id", country: "Indonesia", timezone: "UTC+7" },
    { language: "Hebrew", hello_world: "שלום עולם", locale_code: "he", country: "Israel", timezone: "UTC+2" },
    { language: "Greek", hello_world: "Γεια σου κόσμε", locale_code: "el", country: "Greece", timezone: "UTC+2" },
    { language: "Swedish", hello_world: "Hej världen", locale_code: "sv", country: "Sweden", timezone: "UTC+1" },
    { language: "Norwegian", hello_world: "Hei verden", locale_code: "no", country: "Norway", timezone: "UTC+1" },
    { language: "Danish", hello_world: "Hej verden", locale_code: "da", country: "Denmark", timezone: "UTC+1" },
    { language: "Finnish", hello_world: "Hei maailma", locale_code: "fi", country: "Finland", timezone: "UTC+2" },
    { language: "Czech", hello_world: "Ahoj světe", locale_code: "cs", country: "Czech Republic", timezone: "UTC+1" },
    { language: "Romanian", hello_world: "Salut Lume", locale_code: "ro", country: "Romania", timezone: "UTC+2" },
    { language: "Hungarian", hello_world: "Helló Világ", locale_code: "hu", country: "Hungary", timezone: "UTC+1" },
    { language: "Ukrainian", hello_world: "Привіт Світ", locale_code: "uk", country: "Ukraine", timezone: "UTC+2" },
    { language: "Bulgarian", hello_world: "Здравей свят", locale_code: "bg", country: "Bulgaria", timezone: "UTC+2" },
    { language: "Croatian", hello_world: "Pozdrav svijete", locale_code: "hr", country: "Croatia", timezone: "UTC+1" },
    { language: "Serbian", hello_world: "Здраво свете", locale_code: "sr", country: "Serbia", timezone: "UTC+1" },
    { language: "Slovak", hello_world: "Ahoj svet", locale_code: "sk", country: "Slovakia", timezone: "UTC+1" },
    { language: "Slovenian", hello_world: "Pozdravljen svet", locale_code: "sl", country: "Slovenia", timezone: "UTC+1" },
  ];

  for (const localeData of localesData) {
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

  // Garantir que os locales necessários existam (en_US, es_ES, pt_BR)
  const requiredLocales = [
    { locale_code: "en_US", language: "English (US)", hello_world: "Hello World", country: "United States", timezone: "UTC-5" },
    { locale_code: "es_ES", language: "Spanish (Spain)", hello_world: "Hola Mundo", country: "Spain", timezone: "UTC+1" },
    { locale_code: "pt_BR", language: "Portuguese (Brazil)", hello_world: "Olá Mundo", country: "Brazil", timezone: "UTC-3" },
  ];

  // Atualizar o mapa de locales após inserções
  const updatedLocales = await db
    .select({ id: locales.id, locale_code: locales.locale_code })
    .from(locales);
  const updatedLocalesByCode = new Map<string, number>(
    (updatedLocales as { id: number; locale_code: string }[]).map((r) => [
      r.locale_code,
      r.id,
    ]),
  );

  for (const reqLocale of requiredLocales) {
    if (!updatedLocalesByCode.has(reqLocale.locale_code)) {
      const [inserted] = await db
        .insert(locales)
        .values({
          language: reqLocale.language,
          hello_world: reqLocale.hello_world,
          locale_code: reqLocale.locale_code,
          country: reqLocale.country,
          timezone: reqLocale.timezone,
        })
        .returning({ id: locales.id });
      if (inserted) {
        updatedLocalesByCode.set(reqLocale.locale_code, (inserted as { id: number }).id);
      }
    }
  }

  // Função auxiliar para extrair namespace e key de uma string
  function extractNamespaceAndKey(keyString: string): { namespace: string; key: string } {
    const parts = keyString.split(".");
    if (parts.length >= 3) {
      // Se length >= 3, namespace são todos os blocos exceto o último
      return {
        namespace: parts.slice(0, -1).join("."),
        key: parts[parts.length - 1],
      };
    } else if (parts.length === 2) {
      // Se length = 2, namespace é o primeiro bloco, key é o segundo
      return {
        namespace: parts[0],
        key: parts[1],
      };
    } else {
      // Se length = 1, usar "default" como namespace
      return {
        namespace: "default",
        key: parts[0],
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

  const menuConfig: {
    typeSlug: string;
    menu_options: string[];
    menu_order: number;
    icon: string;
  }[] = [
    {
      typeSlug: "dashboard",
      menu_options: ["dashboard"],
      menu_order: 1,
      icon: "line-md:home",
    },
    {
      typeSlug: "post",
      menu_options: [
        "list",
        "new",
        "taxonomies_type_category",
        "taxonomies_type_tag",
      ],
      menu_order: 2,
      icon: "line-md:document",
    },
    {
      typeSlug: "page",
      menu_options: ["list", "new"],
      menu_order: 3,
      icon: "line-md:list",
    },
    {
      typeSlug: "settings",
      menu_options: ["list", "new"],
      menu_order: 4,
      icon: "line-md:cog",
    },
    {
      typeSlug: "user",
      menu_options: ["list", "new"],
      menu_order: 5,
      icon: "line-md:account",
    },
    {
      typeSlug: "attachment",
      menu_options: ["list", "new"],
      menu_order: 6,
      icon: "line-md:cloud-alt-upload-loop",
    },
    {
      typeSlug: "translations_languages",
      menu_options: ["list", "new"],
      menu_order: 7,
      icon: "line-md:chat-round-dots",
    },
  ];

  for (const config of menuConfig) {
    if (META_ONLY_POST_TYPES.has(config.typeSlug)) continue;
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
