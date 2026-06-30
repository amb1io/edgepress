import { describe, expect, it } from "vitest";
import { filterPublicThemeListPosts, isPublicThemeListPost } from "../post-filters.ts";

describe("isPublicThemeListPost", () => {
  it("accepts published content posts", () => {
    expect(
      isPublicThemeListPost({
        status: "published",
        post_type_slug: "post",
        meta_values: {},
      }),
    ).toBe(true);
  });

  it("rejects drafts and non-published statuses", () => {
    expect(
      isPublicThemeListPost({
        status: "draft",
        post_type_slug: "post",
        meta_values: {},
      }),
    ).toBe(false);
  });

  it("rejects menus post type", () => {
    expect(
      isPublicThemeListPost({
        status: "published",
        post_type_slug: "menus",
        meta_values: {},
      }),
    ).toBe(false);
  });

  it("rejects post type parent menu posts (show_in_menu)", () => {
    expect(
      isPublicThemeListPost({
        status: "published",
        post_type_slug: "post",
        meta_values: { show_in_menu: true },
      }),
    ).toBe(false);

    expect(
      isPublicThemeListPost({
        status: "published",
        post_type_slug: "page",
        meta_values: { show_in_menu: "1" },
      }),
    ).toBe(false);

    expect(
      isPublicThemeListPost({
        status: "published",
        post_type_slug: "page",
        meta_values: { show_in_menu: "true" },
      }),
    ).toBe(false);
  });
});

describe("filterPublicThemeListPosts", () => {
  it("keeps only public theme list posts", () => {
    const items = [
      { status: "published", post_type_slug: "post", meta_values: {} },
      { status: "published", post_type_slug: "post", meta_values: { show_in_menu: true } },
      { status: "draft", post_type_slug: "post", meta_values: {} },
      { status: "published", post_type_slug: "menus", meta_values: {} },
    ];

    expect(filterPublicThemeListPosts(items)).toHaveLength(1);
    expect(filterPublicThemeListPosts(items)[0]?.post_type_slug).toBe("post");
  });
});
