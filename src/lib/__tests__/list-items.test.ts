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
