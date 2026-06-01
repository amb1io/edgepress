import { createClient } from "@libsql/client/node";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, it, expect, beforeAll } from "vitest";
import { postTypes, posts, defaultMetaSchema } from "../../db/schema.ts";
import { runSeed } from "../../db/seed.ts";
import { getMenuItems, resolveMenuOption } from "../menu.ts";

const t = (locale: string, key: string) => {
  const dict: Record<string, string> = {
    "menu.option.list": "Listar",
    "menu.option.new": "Novo",
    "postType.post": "Post",
    "postType.page": "Página",
    "postType.dashboard": "Dashboard",
    "postType.settings": "Configurações",
    "postType.post_type": "Post Type",
    "menu.option.post_types": "Tipos de post",
    "menu.option.post_type_taxonomies": "Taxonomias",
  };
  return dict[key] ?? key;
};

describe("menu", () => {
  let client: ReturnType<typeof createClient>;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    // Create a fresh in-memory database for this test suite
    client = createClient({ url: ":memory:" });
    db = drizzle(client, {
      schema: { postTypes, posts },
    });
    await migrate(db, { migrationsFolder: "./drizzle" });
    await runSeed(db);
  });

  describe("defaultMetaSchema", () => {
    it("includes menu_order with type number and default 0", () => {
      const menuOrder = defaultMetaSchema.find((s) => s.key === "menu_order");
      expect(menuOrder).toBeDefined();
      expect(menuOrder?.type).toBe("number");
      expect(menuOrder?.default).toBe(0);
    });

    it("includes icon with type string and default line-md:document", () => {
      const icon = defaultMetaSchema.find((s) => s.key === "icon");
      expect(icon).toBeDefined();
      expect(icon?.type).toBe("string");
      expect(icon?.default).toBe("line-md:document");
    });

    it("includes show_in_menu with default false and menu_options with default empty array", () => {
      const showInMenu = defaultMetaSchema.find((s) => s.key === "show_in_menu");
      const menuOptions = defaultMetaSchema.find((s) => s.key === "menu_options");
      expect(showInMenu).toBeDefined();
      expect(showInMenu?.type).toBe("boolean");
      expect(showInMenu?.default).toBe(false);
      expect(menuOptions).toBeDefined();
      expect(menuOptions?.type).toBe("array");
      expect(menuOptions?.default).toEqual([]);
    });
  });

  describe("runSeed", () => {
    it("creates post_types Post, Página, Dashboard, Configurações", async () => {
      const types = await db.select({ slug: postTypes.slug, name: postTypes.name }).from(postTypes);
      const slugs = types.map((r) => r.slug).sort();
      expect(slugs).toContain("post");
      expect(slugs).toContain("page");
      expect(slugs).toContain("dashboard");
      expect(slugs).toContain("settings");
    });

    it("creates posts with show_in_menu true, menu_options, menu_order and icon for each type", async () => {
      const rows = await db.select({ meta_values: posts.meta_values }).from(posts);
      const withShowInMenu = rows.filter((r) => {
        if (!r.meta_values) return false;
        const meta = JSON.parse(r.meta_values) as { show_in_menu?: boolean; menu_options?: string[]; menu_order?: number; icon?: string };
        return meta.show_in_menu === true;
      });
      expect(withShowInMenu.length).toBeGreaterThanOrEqual(4);
      const postMenu = withShowInMenu.find((r) => {
        const meta = JSON.parse(r.meta_values!) as { menu_options?: string[] };
        return meta.menu_options?.includes("list") && meta.menu_options?.includes("new");
      });
      expect(postMenu).toBeDefined();

      const byOrder = withShowInMenu
        .map((r) => {
          const meta = JSON.parse(r.meta_values!) as { menu_order?: number };
          return meta.menu_order;
        })
        .filter((n): n is number => typeof n === "number");
      expect(byOrder).toContain(1);
      expect(byOrder).toContain(2);
      expect(byOrder).toContain(3);
      expect(byOrder).toContain(4);

      const icons = withShowInMenu.map((r) => {
        const meta = JSON.parse(r.meta_values!) as { icon?: string; menu_order?: number };
        return { icon: meta.icon, menu_order: meta.menu_order };
      });
      expect(icons.find((x) => x.menu_order === 1)?.icon).toBe("line-md:home");
      expect(icons.find((x) => x.menu_order === 2)?.icon).toBe("line-md:document");
      expect(icons.find((x) => x.menu_order === 3)?.icon).toBe("line-md:list");
      expect(icons.find((x) => x.menu_order === 4)?.icon).toBe("line-md:cloud-alt-upload-loop");
      expect(icons.find((x) => x.menu_order === 8)?.icon).toBe("line-md:document-list");
      expect(icons.find((x) => x.menu_order === 9)?.icon).toBe("line-md:cog");
    });
  });

  describe("getMenuItems", () => {
    it("returns only posts with show_in_menu true", async () => {
      const items = await getMenuItems(db);
      expect(items.length).toBeGreaterThanOrEqual(4);
    });

    it("returns postTypeName, postTypeSlug, menu_options, menuOrder and icon for each item", async () => {
      const items = await getMenuItems(db);
      const postItem = items.find((i) => i.postTypeSlug === "post");
      expect(postItem).toBeDefined();
      expect(postItem?.postTypeName).toBe("Post");
      expect(postItem?.menuOptions).toEqual(["list", "new", "taxonomies_type_category", "taxonomies_type_tag"]);
      expect(postItem?.menuOrder).toBe(2);
      expect(postItem?.icon).toBe("line-md:document");

      const dashboardItem = items.find((i) => i.postTypeSlug === "dashboard");
      expect(dashboardItem?.menuOptions).toEqual(["dashboard"]);
      expect(dashboardItem?.menuOrder).toBe(1);
      expect(dashboardItem?.icon).toBe("line-md:home");

      const postTypeItem = items.find((i) => i.postTypeSlug === "post_type");
      expect(postTypeItem?.menuOptions).toEqual(["post_types", "post_type_taxonomies"]);
      expect(postTypeItem?.menuOrder).toBe(8);
      expect(postTypeItem?.icon).toBe("line-md:document-list");

      const settingsItem = items.find((i) => i.postTypeSlug === "settings");
      expect(settingsItem?.menuOptions).toEqual(["list", "new", "cache"]);
      expect(settingsItem?.menuOrder).toBe(9);
      expect(settingsItem?.icon).toBe("line-md:cog");
    });

    it("returns items ordered by menu_order (Dashboard=1, …, Post Type=8, Settings=9)", async () => {
      const items = await getMenuItems(db);
      const slugs = items.map((i) => i.postTypeSlug);
      const dashboardIdx = slugs.indexOf("dashboard");
      const postIdx = slugs.indexOf("post");
      const pageIdx = slugs.indexOf("page");
      const attachmentIdx = slugs.indexOf("attachment");
      const themesIdx = slugs.indexOf("themes");
      const userIdx = slugs.indexOf("user");
      const translationsIdx = slugs.indexOf("translations_languages");
      const postTypeIdx = slugs.indexOf("post_type");
      const settingsIdx = slugs.indexOf("settings");
      expect(dashboardIdx).toBeGreaterThanOrEqual(0);
      expect(postIdx).toBeGreaterThanOrEqual(0);
      expect(pageIdx).toBeGreaterThanOrEqual(0);
      expect(attachmentIdx).toBeGreaterThanOrEqual(0);
      expect(themesIdx).toBeGreaterThanOrEqual(0);
      expect(userIdx).toBeGreaterThanOrEqual(0);
      expect(translationsIdx).toBeGreaterThanOrEqual(0);
      expect(postTypeIdx).toBeGreaterThanOrEqual(0);
      expect(settingsIdx).toBeGreaterThanOrEqual(0);
      expect(dashboardIdx).toBeLessThan(postIdx);
      expect(postIdx).toBeLessThan(pageIdx);
      expect(pageIdx).toBeLessThan(attachmentIdx);
      expect(attachmentIdx).toBeLessThan(themesIdx);
      expect(themesIdx).toBeLessThan(userIdx);
      expect(userIdx).toBeLessThan(translationsIdx);
      expect(translationsIdx).toBeLessThan(postTypeIdx);
      expect(postTypeIdx).toBeLessThan(settingsIdx);
    });
  });

  describe("resolveMenuOption", () => {
    it('returns Listar, link admin/list?type={slug}&limit=10&page=1, icon line-md:list for "list"', () => {
      const r = resolveMenuOption("list", "post", "Post", "pt-br", t);
      expect(r.text).toBe("Listar");
      expect(r.link).toBe("admin/list?type=post&limit=10&page=1");
      expect(r.icon).toBe("line-md:list");
    });

    it('returns Novo, link admin/content?post_type={slug}&action=new, icon line-md:plus for "new"', () => {
      const r = resolveMenuOption("new", "post", "Post", "pt-br", t);
      expect(r.text).toBe("Novo");
      expect(r.link).toBe("admin/content?post_type=post&action=new");
      expect(r.icon).toBe("line-md:plus");
    });

    it('returns post type name, link with ?page=dashboard, icon for "dashboard"', () => {
      const r = resolveMenuOption("dashboard", "dashboard", "Dashboard", "pt-br", t);
      expect(r.text).toBe("Dashboard");
      expect(r.link).toBe("admin/dashboard?page=dashboard");
      expect(r.icon).toBe("line-md:home");
    });

    it('returns Tipos de post, link admin/settings?page=post_types for "post_types"', () => {
      const r = resolveMenuOption("post_types", "post_type", "Post Type", "pt-br", t);
      expect(r.text).toBe("Tipos de post");
      expect(r.link).toBe("admin/settings?page=post_types");
      expect(r.icon).toBe("line-md:document-list");
    });

    it('returns Taxonomias, link admin/post_type?domain=taxonomies&scope=all for "post_type_taxonomies"', () => {
      const r = resolveMenuOption("post_type_taxonomies", "post_type", "Post Type", "pt-br", t);
      expect(r.text).toBe("Taxonomias");
      expect(r.link).toBe("admin/post_type?domain=taxonomies&scope=all");
      expect(r.icon).toBe("line-md:tag");
    });
  });
});
