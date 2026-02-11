import { and, eq, inArray, sql } from "drizzle-orm";
import {
  postTypes,
  posts,
  taxonomies,
  settings,
  defaultMetaSchema,
  buildMetaSchema,
} from "./schema.ts";

const postMetaSchema = buildMetaSchema([
  { key: "taxonomy", type: "array", default: ["category", "tag"] },
  { key: "post_thumbnail", type: "boolean", default: true },
  { key: "post_types", type: "array", default: [] },
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
