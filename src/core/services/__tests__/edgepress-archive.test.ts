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
  MEDIA_PREFIX,
  MEDIA_TAR_PREFIX,
  PRESERVED_TABLES,
  TABLE_ORDER,
  buildExport,
  buildExportFilename,
  restoreImport,
} from "../edgepress-archive.ts";
import { createArchiveTestDb } from "./edgepress-archive-db.setup.ts";
import { createMockR2Bucket } from "./edgepress-archive-r2.mock.ts";
import { resolveMenuOption } from "../../../utils/menu.ts";

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
    expect(manifest.mediaCount).toBe(1);
    expect(manifest.counts.posts).toBe(1);
    expect(manifest.tableOrder).toEqual([...TABLE_ORDER]);
    expect(manifest.counts).not.toHaveProperty("locales");
    expect(manifest.counts).not.toHaveProperty("translations");

    const database = JSON.parse(new TextDecoder().decode(byName.get("database.json")!.data!));
    expect(database.tables.posts).toHaveLength(1);
    expect(database.tables.posts[0].slug).toBe("hello-export");
    expect(database.tables).not.toHaveProperty("locales");
    expect(database.tables).not.toHaveProperty("translations");
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
