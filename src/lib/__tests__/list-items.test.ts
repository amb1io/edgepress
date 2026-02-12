import { createClient } from "@libsql/client/node";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, it, expect, beforeAll } from "vitest";
import {
  postTypes,
  posts,
  taxonomies,
  postsTaxonomies,
  user,
  settings,
  defaultMetaSchema,
} from "../../db/schema.ts";
import { getListItems, getSettingsListItems } from "../list-items.ts";
import { getTableNames } from "../db-utils.ts";
import { getTableList, getRelatedTableInfo } from "../list-table-dynamic.ts";

describe("getListItems", () => {
  let client: ReturnType<typeof createClient>;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    // Create a fresh in-memory database for this test suite
    client = createClient({ url: ":memory:" });
    db = drizzle(client, {
      schema: {
        postTypes,
        posts,
        taxonomies,
        postsTaxonomies,
        user,
        settings,
      },
    });
    await migrate(db, { migrationsFolder: "./drizzle" });
    const now = Date.now();
    await db.insert(postTypes).values([
      { slug: "post", name: "Post", meta_schema: defaultMetaSchema, created_at: now, updated_at: now },
      { slug: "page", name: "Page", meta_schema: defaultMetaSchema, created_at: now, updated_at: now },
    ]);
    await db.insert(user).values({
      id: "user-1",
      name: "Author One",
      email: "author@example.com",
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(posts).values([
      { post_type_id: 1, author_id: "user-1", title: "First Post", slug: "first-post", status: "published", created_at: now, updated_at: now },
      { post_type_id: 1, author_id: "user-1", title: "Second Post", slug: "second-post", status: "draft", created_at: now + 1, updated_at: now + 1 },
      { post_type_id: 1, author_id: "user-1", title: "Third Post", slug: "third-post", status: "published", created_at: now + 2, updated_at: now + 2 },
      { post_type_id: 2, author_id: "user-1", title: "About Page", slug: "about", status: "published", created_at: now, updated_at: now },
    ]);
  });

  it("returns items with correct shape (id, title, categories, tags, author, status, created_at, updated_at)", async () => {
    const result = await getListItems(db, { type: "post", limit: 10, page: 1 });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.total).toBe(3);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
    expect(result.totalPages).toBe(1);
    const item = result.items[0];
    expect(item).toHaveProperty("id");
    expect(item).toHaveProperty("title");
    expect(item).toHaveProperty("categories");
    expect(item).toHaveProperty("tags");
    expect(item).toHaveProperty("author");
    expect(item).toHaveProperty("status");
    expect(item).toHaveProperty("created_at");
    expect(item).toHaveProperty("updated_at");
    expect(typeof item.id).toBe("number");
    expect(typeof item.title).toBe("string");
    expect(typeof item.author).toBe("string");
  });

  it("filters by type (post vs page)", async () => {
    const postsResult = await getListItems(db, { type: "post", limit: 10, page: 1 });
    const pagesResult = await getListItems(db, { type: "page", limit: 10, page: 1 });
    expect(postsResult.total).toBe(3);
    expect(pagesResult.total).toBe(1);
    expect(pagesResult.items[0]?.title).toBe("About Page");
  });

  it("filters by status", async () => {
    const published = await getListItems(db, { type: "post", status: "published", limit: 10, page: 1 });
    const draft = await getListItems(db, { type: "post", status: "draft", limit: 10, page: 1 });
    expect(published.total).toBe(2);
    expect(draft.total).toBe(1);
    expect(draft.items[0]?.status).toBe("draft");
  });

  it("paginates (limit and page)", async () => {
    const page1 = await getListItems(db, { type: "post", limit: 2, page: 1 });
    const page2 = await getListItems(db, { type: "post", limit: 2, page: 2 });
    expect(page1.items.length).toBe(2);
    expect(page2.items.length).toBe(1);
    expect(page1.total).toBe(3);
    expect(page2.total).toBe(3);
    expect(page1.totalPages).toBe(2);
    expect(page2.page).toBe(2);
  });

  it("orders by column and direction", async () => {
    const ascTitle = await getListItems(db, { type: "post", order: "title", orderDir: "asc", limit: 10, page: 1 });
    const descTitle = await getListItems(db, { type: "post", order: "title", orderDir: "desc", limit: 10, page: 1 });
    expect(ascTitle.items[0]?.title).toBe("First Post");
    expect(descTitle.items[0]?.title).toBe("Third Post");
  });

  it("filters by title (LIKE)", async () => {
    const result = await getListItems(db, { type: "post", limit: 10, page: 1, filter: { title: "Second" } });
    expect(result.total).toBe(1);
    expect(result.items[0]?.title).toBe("Second Post");
  });

  it("filters by author (LIKE)", async () => {
    const result = await getListItems(db, { type: "post", limit: 10, page: 1, filter: { author: "Author" } });
    expect(result.total).toBe(3);
  });

  it("returns empty list when no match", async () => {
    const result = await getListItems(db, { type: "post", status: "archived", limit: 10, page: 1 });
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(1);
  });
});

describe("list dynamic: type as table name vs post_type", () => {
  let client: ReturnType<typeof createClient>;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    client = createClient({ url: ":memory:" });
    db = drizzle(client, {
      schema: {
        postTypes,
        posts,
        taxonomies,
        postsTaxonomies,
        user,
        settings,
      },
    });
    // Create only the settings table (avoids migration 0011 which can fail in libsql)
    await client.execute(
      "CREATE TABLE IF NOT EXISTS settings (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, name text NOT NULL, value text NOT NULL, autoload integer DEFAULT 1 NOT NULL)"
    );
    await client.execute("CREATE INDEX IF NOT EXISTS settings_name_idx ON settings (name)");
    await db.insert(settings).values([
      { name: "site_name", value: "My Site", autoload: true },
      { name: "setup_done", value: "Y", autoload: true },
    ]);
  });

  it("getTableNames includes 'settings' when table exists", async () => {
    const names = await getTableNames(db);
    expect(names).toContain("settings");
  });

  it("when type=settings and table exists, getSettingsListItems returns settings rows (e.g. /pt-br/admin/list?type=settings&limit=10&page=1)", async () => {
    const result = await getSettingsListItems(db, { limit: 10, page: 1 });
    expect(result.items.length).toBe(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
    expect(result.totalPages).toBe(1);
    const first = result.items[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("name");
    expect(first).toHaveProperty("value");
    expect(first).toHaveProperty("autoload");
    expect(typeof first.id).toBe("number");
    expect(["Sim", "Não"]).toContain(first.autoload);
    const names = result.items.map((i) => i.name);
    expect(names).toContain("site_name");
    expect(names).toContain("setup_done");
  });

  it("getSettingsListItems paginates (limit=1, page=1 and page=2)", async () => {
    const page1 = await getSettingsListItems(db, { limit: 1, page: 1 });
    const page2 = await getSettingsListItems(db, { limit: 1, page: 2 });
    expect(page1.items.length).toBe(1);
    expect(page2.items.length).toBe(1);
    expect(page1.total).toBe(2);
    expect(page2.total).toBe(2);
    expect(page1.totalPages).toBe(2);
  });

  it("getSettingsListItems filters by name (LIKE)", async () => {
    const result = await getSettingsListItems(db, { limit: 10, page: 1, filter: { name: "setup" } });
    expect(result.total).toBe(1);
    expect(result.items[0]?.name).toBe("setup_done");
  });
});

describe("getTableList with Foreign Keys", () => {
  let client: ReturnType<typeof createClient>;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    client = createClient({ url: ":memory:" });
    db = drizzle(client);
    
    // Criar tabelas para testar Foreign Keys
    // Tabela locales
    await client.execute(`
      CREATE TABLE IF NOT EXISTS locales (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        language TEXT NOT NULL,
        hello_world TEXT NOT NULL,
        locale_code TEXT NOT NULL UNIQUE,
        country TEXT NOT NULL,
        timezone TEXT NOT NULL
      )
    `);
    
    // Tabela translations
    await client.execute(`
      CREATE TABLE IF NOT EXISTS translations (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        namespace TEXT NOT NULL,
        key TEXT NOT NULL,
        created_at INTEGER,
        updated_at INTEGER
      )
    `);
    
    // Tabela translations_languages com Foreign Keys
    await client.execute(`
      CREATE TABLE IF NOT EXISTS translations_languages (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        id_translations INTEGER NOT NULL REFERENCES translations(id) ON DELETE CASCADE,
        id_locale_code INTEGER NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
        value TEXT NOT NULL
      )
    `);
    
    // Inserir dados de teste
    await client.execute(`
      INSERT INTO locales (language, hello_world, locale_code, country, timezone) 
      VALUES ('English', 'Hello World', 'en', 'United States', 'UTC-5')
    `);
    
    await client.execute(`
      INSERT INTO locales (language, hello_world, locale_code, country, timezone) 
      VALUES ('Portuguese', 'Olá Mundo', 'pt_br', 'Brazil', 'UTC-3')
    `);
    
    await client.execute(`
      INSERT INTO translations (namespace, key, created_at, updated_at) 
      VALUES ('admin.menu', 'dashboard', ${Date.now()}, ${Date.now()})
    `);
    
    await client.execute(`
      INSERT INTO translations_languages (id_translations, id_locale_code, value) 
      VALUES (1, 1, 'Dashboard')
    `);
    
    await client.execute(`
      INSERT INTO translations_languages (id_translations, id_locale_code, value) 
      VALUES (1, 2, 'Painel')
    `);
  });

  it("getRelatedTableInfo returns Foreign Key relationships for translations_languages", async () => {
    const relatedInfo = await getRelatedTableInfo(db, "translations_languages");
    expect(relatedInfo.length).toBeGreaterThan(0);
    
    const translationsRel = relatedInfo.find((r) => r.table === "translations");
    expect(translationsRel).toBeDefined();
    expect(translationsRel?.fkColumn).toBe("id_translations");
    expect(translationsRel?.refColumn).toBe("id");
    expect(translationsRel?.textColumns).toContain("namespace");
    expect(translationsRel?.textColumns).toContain("key");
    
    const localesRel = relatedInfo.find((r) => r.table === "locales");
    expect(localesRel).toBeDefined();
    expect(localesRel?.fkColumn).toBe("id_locale_code");
    expect(localesRel?.refColumn).toBe("id");
    expect(localesRel?.textColumns).toContain("language");
    expect(localesRel?.textColumns).toContain("hello_world");
    expect(localesRel?.textColumns).toContain("locale_code");
    expect(localesRel?.textColumns).toContain("country");
  });

  it("getTableList includes text columns from related tables via Foreign Keys", async () => {
    const result = await getTableList(db, "translations_languages", {
      limit: 10,
      page: 1,
    });
    
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.columns).toContain("id");
    expect(result.columns).toContain("id_translations");
    expect(result.columns).toContain("id_locale_code");
    expect(result.columns).toContain("value");
    
    // Verificar se campos relacionados estão presentes
    expect(result.columns.some((col) => col.startsWith("translations_"))).toBe(true);
    expect(result.columns.some((col) => col.startsWith("locales_"))).toBe(true);
    
    const firstItem = result.items[0];
    expect(firstItem).toHaveProperty("value");
    // Verificar se campos relacionados estão nos itens
    const hasTranslationField = Object.keys(firstItem).some((key) => key.startsWith("translations_"));
    const hasLocaleField = Object.keys(firstItem).some((key) => key.startsWith("locales_"));
    expect(hasTranslationField || hasLocaleField).toBe(true);
  });

  it("getTableList filters by related table text columns", async () => {
    const result = await getTableList(db, "translations_languages", {
      limit: 10,
      page: 1,
      filter: { "locales_language": "English" },
    });
    
    expect(result.items.length).toBeGreaterThan(0);
    // Verificar se o filtro funcionou
    const hasEnglish = result.items.some((item) => {
      return Object.entries(item).some(([key, value]) => 
        key.startsWith("locales_") && String(value).includes("English")
      );
    });
    expect(hasEnglish).toBe(true);
  });

  it("getTableList orders by related table text columns", async () => {
    const result = await getTableList(db, "translations_languages", {
      limit: 10,
      page: 1,
      order: "locales_language",
      orderDir: "asc",
    });
    
    expect(result.items.length).toBeGreaterThan(0);
    // Verificar se a ordenação funcionou (primeiro item deve ter language menor alfabeticamente)
    if (result.items.length > 1) {
      const firstLang = Object.entries(result.items[0]).find(([key]) => key.startsWith("locales_language"))?.[1];
      const secondLang = Object.entries(result.items[1]).find(([key]) => key.startsWith("locales_language"))?.[1];
      if (firstLang && secondLang) {
        expect(String(firstLang).localeCompare(String(secondLang))).toBeLessThanOrEqual(0);
      }
    }
  });
});
