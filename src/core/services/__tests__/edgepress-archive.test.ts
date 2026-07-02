import { parseTarGzip } from "nanotar";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  locales,
  postTypes,
  posts,
  settings,
  translations,
  translationsLanguages,
} from "../../../db/schema.ts";
import {
  EDGEPRESS_FORMAT,
  EDGEPRESS_SCHEMA_VERSION,
  FTS_INSERT_BATCH_SIZE,
  MEDIA_PREFIX,
  MEDIA_TAR_PREFIX,
  PRESERVED_TABLES,
  TABLE_ORDER,
  THEME_PKG_TAR_PREFIX,
  buildExport,
  buildExportFilename,
  restoreImport,
  type ArchiveKvLike,
} from "../edgepress-archive.ts";
import { createArchiveTestDb } from "./edgepress-archive-db.setup.ts";
import { createMockR2Bucket } from "./edgepress-archive-r2.mock.ts";
import { resolveMenuOption } from "../../../utils/menu.ts";
import { THEME_PKG_KV_PREFIX } from "../../theme/theme-package.ts";
import { THEME_ACTIVE_KV_KEY } from "../theme-service.ts";
import { sql } from "drizzle-orm";

function createMockKv(initial: Record<string, string> = {}): ArchiveKvLike & { store: Map<string, string> } {
  const store = new Map<string, string>(Object.entries(initial));

  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    list: vi.fn(async (options?: { prefix?: string }) => {
      const prefix = options?.prefix ?? "";
      const keys = [...store.keys()]
        .filter((name) => name.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true };
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  };
}

const t = (_locale: string, key: string) => key;

async function seedArchiveFixtures(db: Awaited<ReturnType<typeof createArchiveTestDb>>["db"]) {
  const now = Date.now();

  await db.insert(locales).values({
    id: 32,
    language: "Portuguese (Brazil)",
    hello_world: "Olá Mundo",
    locale_code: "pt_BR",
    country: "Brazil",
    timezone: "UTC-3",
  });

  const [translation] = await db
    .insert(translations)
    .values({
      id: 9001,
      namespace: "admin.menu",
      key: "seed-only",
      created_at: now,
      updated_at: now,
    })
    .returning();

  await db.insert(translationsLanguages).values({
    id: 9001,
    id_translations: translation!.id,
    id_locale_code: 32,
    value: "Seed translation",
  });

  await db.insert(postTypes).values({
    id: 1,
    slug: "post",
    name: "Post",
    meta_schema: "[]",
    created_at: now,
    updated_at: now,
  });

  await db.insert(settings).values({
    id: 1,
    name: "site_name",
    value: "Edgepress Test",
    autoload: true,
  });

  await db.insert(posts).values({
    id: 10,
    post_type_id: 1,
    title: "Hello Export",
    slug: "hello-export",
    status: "published",
    id_locale_code: 32,
    body: "<p>Export me</p>",
    created_at: now,
    updated_at: now,
  });

  await db.run(sql`
    INSERT INTO edp_posts_fts (
      rowid, post_id, post_type_id, status, id_locale_code,
      title, body, taxonomy, custom_fields
    ) VALUES (
      10, 10, 1, 'published', 32,
      'Hello Export', 'Export me', '', ''
    )
  `);
}

describe("edgepress-archive unit", () => {
  it("TABLE_ORDER excludes seed/system tables", () => {
    expect(TABLE_ORDER).not.toContain("locales");
    expect(TABLE_ORDER).not.toContain("role_capability");
    expect(TABLE_ORDER).not.toContain("translations");
    expect(TABLE_ORDER).not.toContain("translations_languages");
    expect(PRESERVED_TABLES).toContain("locales");
    expect(PRESERVED_TABLES).toContain("translations");
  });

  it("buildExportFilename returns .edgepress suffix", () => {
    expect(buildExportFilename()).toMatch(/^edgepress-export-.*\.edgepress$/);
  });

  it("FTS insert batch size stays within D1 parameter limit", () => {
    const ftsColumnCount = 9;
    expect(FTS_INSERT_BATCH_SIZE * ftsColumnCount).toBeLessThanOrEqual(100);
  });

  it("restoreImport rejects invalid manifest format", async () => {
    const { createTarGzip } = await import("nanotar");
    const archive = await createTarGzip([
      {
        name: "manifest.json",
        data: JSON.stringify({
          format: "invalid",
          schemaVersion: EDGEPRESS_SCHEMA_VERSION,
        }),
      },
      { name: "database.json", data: JSON.stringify({ tables: {} }) },
    ]);

    const mockDb = {
      all: vi.fn().mockResolvedValue([]),
      run: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
    };
    const mockBucket = createMockR2Bucket();

    await expect(
      restoreImport(mockDb as never, mockBucket, archive.buffer),
    ).rejects.toThrow("Arquivo não é um pacote EdgePress válido");
  });

  it("restoreImport rejects unsupported schema version", async () => {
    const { createTarGzip } = await import("nanotar");
    const archive = await createTarGzip([
      {
        name: "manifest.json",
        data: JSON.stringify({
          format: EDGEPRESS_FORMAT,
          schemaVersion: 999,
        }),
      },
      { name: "database.json", data: JSON.stringify({ tables: {} }) },
    ]);

    const mockDb = {
      all: vi.fn().mockResolvedValue([]),
      run: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
    };
    const mockBucket = createMockR2Bucket();

    await expect(
      restoreImport(mockDb as never, mockBucket, archive.buffer),
    ).rejects.toThrow("Versão de schema não suportada");
  });

  it("restoreImport rejects incomplete archive", async () => {
    const { createTarGzip } = await import("nanotar");
    const archive = await createTarGzip([
      { name: "manifest.json", data: JSON.stringify({ format: EDGEPRESS_FORMAT, schemaVersion: 1 }) },
    ]);

    const mockDb = {
      all: vi.fn().mockResolvedValue([]),
      run: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
    };
    const mockBucket = createMockR2Bucket();

    await expect(
      restoreImport(mockDb as never, mockBucket, archive.buffer),
    ).rejects.toThrow("Arquivo .edgepress incompleto");
  });
});

describe("edgepress-archive integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("buildExport produces manifest, database payload, and media files", async () => {
    const { db } = await createArchiveTestDb();
    await seedArchiveFixtures(db);

    const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const bucket = createMockR2Bucket({
      "uploads/demo/photo.png": {
        data: imageBytes,
        contentType: "image/png",
      },
    });

    const archiveBytes = await buildExport(db, bucket);
    const entries = await parseTarGzip(archiveBytes.buffer);
    const byName = new Map(entries.map((entry) => [entry.name, entry]));

    expect(byName.has("manifest.json")).toBe(true);
    expect(byName.has("database.json")).toBe(true);
    expect(byName.has("media/uploads/demo/photo.png")).toBe(true);

    const manifest = JSON.parse(new TextDecoder().decode(byName.get("manifest.json")!.data!));
    expect(manifest.format).toBe(EDGEPRESS_FORMAT);
    expect(manifest.schemaVersion).toBe(EDGEPRESS_SCHEMA_VERSION);
    expect(manifest.includes).toEqual({ database: true, media: true, themes: true });
    expect(manifest.mediaCount).toBe(1);
    expect(manifest.themeCount).toBe(0);
    expect(manifest.themePackages).toEqual([]);
    expect(manifest.counts.posts).toBe(1);
    expect(manifest.ftsCount).toBe(1);
    expect(manifest.tableOrder).toEqual([...TABLE_ORDER]);
    expect(manifest.counts).not.toHaveProperty("locales");
    expect(manifest.counts).not.toHaveProperty("translations");
    expect(manifest.localeMap).toEqual({ "32": "pt_BR" });

    const database = JSON.parse(new TextDecoder().decode(byName.get("database.json")!.data!));
    expect(database.tables.posts).toHaveLength(1);
    expect(database.tables.posts[0].slug).toBe("hello-export");
    expect(database.fts).toHaveLength(1);
    expect(database.fts[0].title).toBe("Hello Export");
    expect(database.tables).not.toHaveProperty("locales");
    expect(database.tables).not.toHaveProperty("translations");
  });

  it("restoreImport remaps id_locale_code when target locale ids differ", async () => {
    const { db } = await createArchiveTestDb();
    await seedArchiveFixtures(db);

    const bucket = createMockR2Bucket();
    const archiveBytes = await buildExport(db, bucket);

    await db.delete(locales).where(eq(locales.id, 32));
    await db.insert(locales).values({
      id: 5,
      language: "Portuguese (Brazil)",
      hello_world: "Olá Mundo",
      locale_code: "pt_BR",
      country: "Brazil",
      timezone: "UTC-3",
    });

    await restoreImport(db, bucket, archiveBytes.buffer);

    const restored = await db
      .select({ id_locale_code: posts.id_locale_code })
      .from(posts)
      .where(eq(posts.slug, "hello-export"));
    expect(restored[0]?.id_locale_code).toBe(5);
  });

  it("restoreImport wipes user content, preserves seed tables, and restores R2 media", async () => {
    const { db } = await createArchiveTestDb();
    await seedArchiveFixtures(db);

    const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const bucket = createMockR2Bucket({
      "uploads/demo/photo.png": {
        data: imageBytes,
        contentType: "image/png",
      },
    });

    const archiveBytes = await buildExport(db, bucket);

    await db.insert(posts).values({
      id: 99,
      post_type_id: 1,
      title: "Temporary",
      slug: "temporary-post",
      status: "draft",
      created_at: Date.now(),
      updated_at: Date.now(),
    });
    bucket.store.set("uploads/old/file.png", {
      data: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
    });

    const seedTranslationBefore = await db
      .select({ value: translationsLanguages.value })
      .from(translationsLanguages)
      .where(eq(translationsLanguages.id, 9001));
    expect(seedTranslationBefore[0]?.value).toBe("Seed translation");

    const result = await restoreImport(db, bucket, archiveBytes.buffer);

    expect(result.counts.posts).toBe(1);
    expect(result.mediaCount).toBe(1);
    expect(result.themeCount).toBe(0);
    expect(result.ftsRestored).toBe(true);
    expect(result.includes).toEqual({ database: true, media: true, themes: true });

    const restoredPosts = await db.select({ id: posts.id, slug: posts.slug }).from(posts);
    expect(restoredPosts).toEqual([{ id: 10, slug: "hello-export" }]);
    expect(restoredPosts.some((row) => row.slug === "temporary-post")).toBe(false);

    const seedTranslationAfter = await db
      .select({ value: translationsLanguages.value })
      .from(translationsLanguages)
      .where(eq(translationsLanguages.id, 9001));
    expect(seedTranslationAfter[0]?.value).toBe("Seed translation");

    expect(bucket.store.has("uploads/old/file.png")).toBe(false);
    expect(bucket.store.has("uploads/demo/photo.png")).toBe(true);
    expect([...bucket.store.keys()].every((key) => key.startsWith(MEDIA_PREFIX))).toBe(true);
  });

  it("restoreImport replaces conflicting slugs after wipe (no upsert on slug)", async () => {
    const { db } = await createArchiveTestDb();
    await seedArchiveFixtures(db);

    const bucket = createMockR2Bucket();
    const archiveBytes = await buildExport(db, bucket);

    await db
      .update(posts)
      .set({ slug: "conflicting-slug", title: "Changed title" })
      .where(eq(posts.id, 10));

    await restoreImport(db, bucket, archiveBytes.buffer);

    const [restored] = await db
      .select({ slug: posts.slug, title: posts.title })
      .from(posts)
      .where(eq(posts.id, 10));
    expect(restored?.slug).toBe("hello-export");
    expect(restored?.title).toBe("Hello Export");
  });

  it("restoreImport skips seed tables from legacy archives", async () => {
    const { createTarGzip } = await import("nanotar");
    const { db } = await createArchiveTestDb();
    await seedArchiveFixtures(db);

    const archive = await createTarGzip([
      {
        name: "manifest.json",
        data: JSON.stringify({
          format: EDGEPRESS_FORMAT,
          schemaVersion: EDGEPRESS_SCHEMA_VERSION,
          tableOrder: ["locales", "translations", "post_types", "posts"],
          mediaFiles: [],
        }),
      },
      {
        name: "database.json",
        data: JSON.stringify({
          tables: {
            locales: [{ id: 1, language: "X", hello_world: "Y", locale_code: "xx", country: "Z", timezone: "UTC" }],
            translations: [{ id: 1, namespace: "admin", key: "x", created_at: 1, updated_at: 1 }],
            post_types: [],
            posts: [],
          },
        }),
      },
    ]);

    const bucket = createMockR2Bucket();
    await restoreImport(db, bucket, archive.buffer);

    const localeRows = await db.select({ id: locales.id }).from(locales);
    expect(localeRows.some((row) => row.id === 32)).toBe(true);
    expect(localeRows.some((row) => row.id === 1)).toBe(false);

    const translationRows = await db
      .select({ id: translations.id })
      .from(translations)
      .where(eq(translations.id, 9001));
    expect(translationRows).toHaveLength(1);

    const postRows = await db.select({ id: posts.id }).from(posts);
    expect(postRows).toHaveLength(0);
  });

  it("restoreImport handles many posts with HTML bodies (D1 param limit)", async () => {
    const { db } = await createArchiveTestDb();
    const now = Date.now();

    await db.insert(locales).values({
      id: 32,
      language: "Portuguese (Brazil)",
      hello_world: "Olá Mundo",
      locale_code: "pt_BR",
      country: "Brazil",
      timezone: "UTC-3",
    });

    for (let typeId = 1; typeId <= 10; typeId++) {
      await db.insert(postTypes).values({
        id: typeId,
        slug: `type-${typeId}`,
        name: `Type ${typeId}`,
        meta_schema: "[]",
        created_at: now,
        updated_at: now,
      });
    }

    const htmlBody =
      '<p>Demo</p> <figure class="wp-block-image"><img src="/api/media/uploads/seed/hello-world.svg" alt="Hello World" width="800" height="400" loading="lazy" /></figure> <p>More content</p>';

    for (let postId = 1; postId <= 16; postId++) {
      await db.insert(posts).values({
        id: postId,
        post_type_id: ((postId - 1) % 10) + 1,
        title: `Post ${postId}`,
        slug: `post-${postId}`,
        body: htmlBody,
        status: "published",
        id_locale_code: 32,
        created_at: now,
        updated_at: now,
      });
    }

    const bucket = createMockR2Bucket();
    const archiveBytes = await buildExport(db, bucket);

    await db.insert(posts).values({
      id: 999,
      post_type_id: 1,
      title: "Stale",
      slug: "stale-post",
      status: "draft",
      created_at: now,
      updated_at: now,
    });

    await restoreImport(db, bucket, archiveBytes.buffer);

    const restored = await db.select({ id: posts.id, slug: posts.slug }).from(posts).orderBy(posts.id);
    expect(restored).toHaveLength(16);
    expect(restored[0]?.id).toBe(1);
    expect(restored[15]?.id).toBe(16);
    expect(restored.some((row) => row.slug === "stale-post")).toBe(false);
  });

  it("round-trip export then import preserves IDs and media path mapping", async () => {
    const { db } = await createArchiveTestDb();
    await seedArchiveFixtures(db);

    const svg = new TextEncoder().encode("<svg></svg>");
    const bucket = createMockR2Bucket({
      [`${MEDIA_PREFIX}seed/hello-world.svg`]: {
        data: svg,
        contentType: "image/svg+xml",
      },
    });

    const archiveBytes = await buildExport(db, bucket);
    bucket.store.clear();

    await restoreImport(db, bucket, archiveBytes.buffer);

    const tarPath = `${MEDIA_TAR_PREFIX}seed/hello-world.svg`;
    const entries = await parseTarGzip(archiveBytes.buffer);
    const mediaEntry = entries.find((entry) => entry.name === tarPath);
    expect(mediaEntry?.data).toBeDefined();

    const stored = bucket.store.get(`${MEDIA_PREFIX}seed/hello-world.svg`);
    expect(stored?.contentType).toBe("image/svg+xml");
    expect(stored?.data).toEqual(svg);
  });

  it("round-trip export then import preserves theme packages and assets", async () => {
    const { db } = await createArchiveTestDb();
    await seedArchiveFixtures(db);

    const themePackage = JSON.stringify({
      manifest: {
        name: "Test Theme",
        slug: "2026",
        version: "1.0.0",
        engine: "liquid",
        supports: ["home", "single"],
        templates: { home: "home" },
      },
      templates: { home: "<h1>Home</h1>" },
      updated_at: Date.now(),
    });

    const kv = createMockKv({
      [`${THEME_PKG_KV_PREFIX}2026`]: themePackage,
    });

    const cssBytes = new TextEncoder().encode("body { margin: 0; }");
    const bucket = createMockR2Bucket({
      "themes/2026/assets/theme.css": {
        data: cssBytes,
        contentType: "text/css",
      },
    });

    const archiveBytes = await buildExport(db, bucket, kv);
    const entries = await parseTarGzip(archiveBytes.buffer);
    const byName = new Map(entries.map((entry) => [entry.name, entry]));

    expect(byName.has(`${THEME_PKG_TAR_PREFIX}2026/package.json`)).toBe(true);
    expect(byName.has("themes/2026/assets/theme.css")).toBe(true);

    const manifest = JSON.parse(new TextDecoder().decode(byName.get("manifest.json")!.data!));
    expect(manifest.themeCount).toBe(1);
    expect(manifest.themePackages).toEqual([{ slug: "2026" }]);

    kv.store.clear();
    bucket.store.clear();
    bucket.store.set("themes/old/assets/old.css", {
      data: new Uint8Array([1]),
      contentType: "text/css",
    });

    const result = await restoreImport(db, bucket, archiveBytes.buffer, kv);

    expect(result.themeCount).toBe(1);
    expect(kv.store.get(`${THEME_PKG_KV_PREFIX}2026`)).toBe(themePackage);
    expect(bucket.store.has("themes/2026/assets/theme.css")).toBe(true);
    expect(bucket.store.has("themes/old/assets/old.css")).toBe(false);
    expect(kv.store.has(THEME_ACTIVE_KV_KEY)).toBe(true);
  });

  it("database-only export includes FTS rows and omits media files", async () => {
    const { db } = await createArchiveTestDb();
    await seedArchiveFixtures(db);

    const bucket = createMockR2Bucket({
      "uploads/demo/photo.png": {
        data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        contentType: "image/png",
      },
    });

    const archiveBytes = await buildExport(db, bucket, null, {
      database: true,
      media: false,
      themes: false,
    });
    const entries = await parseTarGzip(archiveBytes.buffer);
    const byName = new Map(entries.map((entry) => [entry.name, entry]));

    expect(byName.has("database.json")).toBe(true);
    expect([...byName.keys()].some((name) => name.startsWith("media/"))).toBe(false);

    const manifest = JSON.parse(new TextDecoder().decode(byName.get("manifest.json")!.data!));
    expect(manifest.includes).toEqual({ database: true, media: false, themes: false });
    expect(manifest.ftsCount).toBe(1);

    const database = JSON.parse(new TextDecoder().decode(byName.get("database.json")!.data!));
    expect(database.fts).toHaveLength(1);
  });

  it("media-only export omits database.json", async () => {
    const { db } = await createArchiveTestDb();
    await seedArchiveFixtures(db);

    const bucket = createMockR2Bucket({
      "uploads/demo/photo.png": {
        data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        contentType: "image/png",
      },
    });

    const archiveBytes = await buildExport(db, bucket, null, {
      database: false,
      media: true,
      themes: false,
    });
    const entries = await parseTarGzip(archiveBytes.buffer);
    const byName = new Map(entries.map((entry) => [entry.name, entry]));

    expect(byName.has("database.json")).toBe(false);
    expect(byName.has("media/uploads/demo/photo.png")).toBe(true);

    const manifest = JSON.parse(new TextDecoder().decode(byName.get("manifest.json")!.data!));
    expect(manifest.includes).toEqual({ database: false, media: true, themes: false });
  });

  it("round-trip database export restores FTS rows for search", async () => {
    const { db } = await createArchiveTestDb();
    await seedArchiveFixtures(db);

    const bucket = createMockR2Bucket();
    const archiveBytes = await buildExport(db, bucket, null, {
      database: true,
      media: false,
      themes: false,
    });

    await db.delete(posts).where(eq(posts.id, 10));
    await db.run(sql`DELETE FROM edp_posts_fts WHERE rowid = 10`);

    const result = await restoreImport(db, bucket, archiveBytes.buffer);
    expect(result.ftsRestored).toBe(true);

    const ftsRows = (await db.all(sql`
      SELECT post_id, title
      FROM edp_posts_fts
      WHERE edp_posts_fts MATCH '"Hello"'
    `)) as Array<{ post_id: number; title: string }>;

    expect(ftsRows).toHaveLength(1);
    expect(Number(ftsRows[0]?.post_id)).toBe(10);
    expect(ftsRows[0]?.title).toBe("Hello Export");
  });

  it("restores many FTS rows across the multi-row batch boundary", async () => {
    const { db } = await createArchiveTestDb();
    const now = Date.now();

    await db.insert(locales).values({
      id: 32,
      language: "Portuguese (Brazil)",
      hello_world: "Olá Mundo",
      locale_code: "pt_BR",
      country: "Brazil",
      timezone: "UTC-3",
    });
    await db.insert(postTypes).values({
      id: 1,
      slug: "post",
      name: "Post",
      meta_schema: "[]",
      created_at: now,
      updated_at: now,
    });

    const total = 21; // > FTS_INSERT_BATCH_SIZE (8) to cross batch boundaries
    for (let postId = 1; postId <= total; postId++) {
      await db.insert(posts).values({
        id: postId,
        post_type_id: 1,
        title: `Episode ${postId}`,
        slug: `episode-${postId}`,
        status: "published",
        id_locale_code: 32,
        body: `Body content ${postId}`,
        created_at: now,
        updated_at: now,
      });
      await db.run(sql`
        INSERT INTO edp_posts_fts (
          rowid, post_id, post_type_id, status, id_locale_code,
          title, body, taxonomy, custom_fields
        ) VALUES (
          ${postId}, ${postId}, 1, 'published', 32,
          ${`Episode ${postId}`}, ${`Body content ${postId}`}, '', ''
        )
      `);
    }

    const bucket = createMockR2Bucket();
    const archiveBytes = await buildExport(db, bucket, null, {
      database: true,
      media: false,
      themes: false,
    });

    await db.run(sql`DELETE FROM edp_posts_fts`);
    await db.delete(posts);

    const result = await restoreImport(db, bucket, archiveBytes.buffer);
    expect(result.ftsRestored).toBe(true);

    const [{ total: ftsTotal }] = (await db.all(sql`
      SELECT COUNT(*) AS total FROM edp_posts_fts
    `)) as Array<{ total: number }>;
    expect(Number(ftsTotal)).toBe(total);

    const hits = (await db.all(sql`
      SELECT post_id FROM edp_posts_fts WHERE edp_posts_fts MATCH '"Episode"'
    `)) as Array<{ post_id: number }>;
    expect(hits).toHaveLength(total);
  });

  it("media-only import does not wipe database rows", async () => {
    const { db } = await createArchiveTestDb();
    await seedArchiveFixtures(db);

    const bucket = createMockR2Bucket({
      "uploads/demo/photo.png": {
        data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        contentType: "image/png",
      },
    });

    const archiveBytes = await buildExport(db, bucket, null, {
      database: false,
      media: true,
      themes: false,
    });

    await db.insert(posts).values({
      id: 99,
      post_type_id: 1,
      title: "Keep me",
      slug: "keep-me",
      status: "draft",
      created_at: Date.now(),
      updated_at: Date.now(),
    });
    bucket.store.clear();

    await restoreImport(db, bucket, archiveBytes.buffer);

    const postRows = await db.select({ id: posts.id, slug: posts.slug }).from(posts);
    expect(postRows.some((row) => row.slug === "keep-me")).toBe(true);
    expect(bucket.store.has("uploads/demo/photo.png")).toBe(true);
  });

  it("database-only import does not wipe R2 uploads", async () => {
    const { db } = await createArchiveTestDb();
    await seedArchiveFixtures(db);

    const bucket = createMockR2Bucket({
      "uploads/existing/file.png": {
        data: new Uint8Array([1, 2, 3]),
        contentType: "image/png",
      },
    });

    const archiveBytes = await buildExport(db, bucket, null, {
      database: true,
      media: false,
      themes: false,
    });

    await db.insert(posts).values({
      id: 99,
      post_type_id: 1,
      title: "Temporary",
      slug: "temporary-post",
      status: "draft",
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    await restoreImport(db, bucket, archiveBytes.buffer);

    const restoredPosts = await db.select({ id: posts.id, slug: posts.slug }).from(posts);
    expect(restoredPosts).toEqual([{ id: 10, slug: "hello-export" }]);
    expect(bucket.store.has("uploads/existing/file.png")).toBe(true);
  });
});

describe("resolveMenuOption import_export", () => {
  it("returns settings import/export route", () => {
    const result = resolveMenuOption(
      "import_export",
      "settings",
      "Configurações",
      "pt-br",
      t,
    );
    expect(result.link).toBe("admin/settings?domain=import_export");
    expect(result.icon).toBe("line-md:downloading-loop");
  });
});
