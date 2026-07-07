import { describe, expect, it } from "vitest";
import { Liquid } from "liquidjs";
import { buildMenuItemTree } from "../../services/menu-items-service.ts";
import {
  filterMenuChildren,
  filterMenuItemsFlat,
  filterMenuParents,
  registerMenuFilters,
} from "../theme-functions.ts";
import { registerThemeApi } from "../theme-api.ts";
import type { MenuItem, ThemeRenderContext } from "../types.ts";

function sampleMenuTree(): MenuItem[] {
  return [
    {
      id: 1,
      label: "Home",
      url: "/",
      slug: "home-1",
      active: true,
      children: [],
    },
    {
      id: 2,
      label: "Services",
      url: "/services",
      slug: "services-1",
      target_post_id: 10,
      active: false,
      submenu_sort: "alphabetical",
      submenu_display: ["title", "thumbnail"],
      children: [
        {
          id: 3,
          label: "Design",
          url: "/design",
          slug: "design-1",
          target_post_id: 11,
          active: false,
          children: [],
        },
      ],
    },
  ];
}

describe("buildMenuItemTree integration", () => {
  it("builds nested public menu from flat rows", () => {
    const tree = buildMenuItemTree([
      {
        id: 1,
        label: "Home",
        url: "/",
        slug: "home-1",
        order: 1,
        parent_menu_item_id: null,
      },
      {
        id: 2,
        label: "Services",
        url: "/services",
        slug: "services-1",
        target_post_id: 10,
        order: 2,
        parent_menu_item_id: null,
        submenu_sort: "creation",
        submenu_display: ["title"],
      },
      {
        id: 3,
        label: "Design",
        url: "/design",
        slug: "design-1",
        target_post_id: 11,
        order: 1,
        parent_menu_item_id: 2,
      },
    ]);

    expect(tree[1]?.children).toHaveLength(1);
    expect(tree[1]?.children[0]?.slug).toBe("design-1");
    expect(tree[1]?.children[0]?.target_post_id).toBe(11);
  });
});

describe("menu liquid filters", () => {
  it("menu_parents returns only items with children", () => {
    const parents = filterMenuParents(sampleMenuTree());
    expect(parents).toHaveLength(1);
    expect(parents[0]?.label).toBe("Services");
  });

  it("menu_children returns flat submenu items", () => {
    const children = filterMenuChildren(sampleMenuTree());
    expect(children).toHaveLength(1);
    expect(children[0]?.label).toBe("Design");
    expect(children[0]?.children).toEqual([]);
  });

  it("menu_items returns all items flat", () => {
    const items = filterMenuItemsFlat(sampleMenuTree());
    expect(items.map((i) => i.label)).toEqual(["Home", "Services", "Design"]);
  });
});

describe("nav_menu nested output", () => {
  it("renders submenu ul for items with children", async () => {
    const liquid = new Liquid();
    registerThemeApi(liquid);
    registerMenuFilters(liquid);

    const ctx: ThemeRenderContext = {
      site: {
        title: "Demo",
        description: "",
        locale: "pt-br",
        locale_prefix: "",
        home_url: "/",
        base_url: "http://localhost",
        html_lang: "pt-BR",
        year: 2026,
      },
      seo: {
        title: "Demo",
        description: "",
        canonical: "http://localhost/",
        og_type: "website",
      },
      menus: { primary: sampleMenuTree() },
      theme: {
        slug: "2026",
        version: "1.0.0",
        asset_base_url: "http://localhost/themes-assets/2026",
        supports: [],
      },
      route: { kind: "home", path: "/", locale: "pt-br" },
      body_class: "route-home",
      locale_switcher: [],
      posts: [],
      archive: { title: "Blog", type: "post" },
      pagination: { page: 1, total_pages: 1 },
      is_front_page: true,
      is_single: false,
      is_page: false,
      is_singular: false,
      is_archive: false,
      is_search: false,
      is_404: false,
      have_posts: false,
    };

    const html = await liquid.parseAndRender(
      `{% nav_menu 'primary' %}`,
      ctx as unknown as Record<string, unknown>,
    );

    expect(html).toContain('class="has-submenu"');
    expect(html).toContain('<ul class="submenu">');
    expect(html).toContain("Design");
  });
});
