import { createClient } from "@libsql/client/node";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, it, expect, beforeAll } from "vitest";
import { postTypes, posts } from "../schema.ts";
import { runSeed, ensurePostTypesFromDefaults } from "../seed.ts";
import {
  deduplicateMenuPosts,
  ensureMenuPostsFromConfig,
  menuParentShowInMenuSql,
  menuPostSlug,
} from "../menu-parent-posts.ts";
import { getMenuItems } from "../../utils/menu.ts";

describe("menu-parent-posts", () => {
  let client: ReturnType<typeof createClient>;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    client = createClient({ url: ":memory:" });
    db = drizzle(client, { schema: { postTypes, posts } });
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  it("menuPostSlug returns stable slug without timestamp", () => {
    expect(menuPostSlug("themes")).toBe("menu-themes");
    expect(menuPostSlug("post_type")).toBe("menu-post_type");
  });

  it("runSeed twice does not duplicate sidebar menu items", async () => {
    await runSeed(db);
    const first = await getMenuItems(db);
    await runSeed(db);
    const second = await getMenuItems(db);

    expect(second.length).toBe(first.length);
    const slugs = second.map((i) => i.postTypeSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("deduplicateMenuPosts removes extra show_in_menu posts per type", async () => {
    const typeIds = await ensurePostTypesFromDefaults(db);
    const themesId = typeIds["themes"];
    expect(themesId).toBeDefined();

    const now = Date.now();
    await db.insert(posts).values({
      post_type_id: themesId,
      title: "themes-dup",
      slug: `menu-themes-${now}`,
      status: "published",
      meta_values: JSON.stringify({ show_in_menu: true, menu_order: 5 }),
      created_at: now,
      updated_at: now,
    });

    const before = await db.select({ id: posts.id }).from(posts).where(menuParentShowInMenuSql);
    expect(before.length).toBeGreaterThan(1);

    const { removed } = await deduplicateMenuPosts(db);
    expect(removed.length).toBeGreaterThan(0);

    const themesMenus = await db
      .select({ id: posts.id, slug: posts.slug })
      .from(posts)
      .where(menuParentShowInMenuSql);
    const themesOnly = themesMenus.filter((r) => r.slug.startsWith("menu-themes"));
    expect(themesOnly.length).toBe(1);
    expect(themesOnly[0]?.slug).toBe(menuPostSlug("themes"));
  });

  it("ensureMenuPostsFromConfig normalizes legacy timestamp slugs", async () => {
    const typeIds = await ensurePostTypesFromDefaults(db);
    const pageId = typeIds["page"];
    expect(pageId).toBeDefined();

    await ensureMenuPostsFromConfig(db, typeIds, Date.now());
    const rows = await db
      .select({ slug: posts.slug })
      .from(posts)
      .where(menuParentShowInMenuSql);
    const pageMenu = rows.find((r) => r.slug === menuPostSlug("page") || r.slug.startsWith("menu-page"));
    expect(pageMenu?.slug).toBe(menuPostSlug("page"));
  });
});
