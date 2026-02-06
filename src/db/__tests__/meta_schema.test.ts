import { describe, it, expect } from "vitest";
import { defaultMetaSchema, buildMetaSchema } from "../schema.ts";

describe("meta_schema", () => {
  it("defaultMetaSchema should have expected keys", () => {
    expect(defaultMetaSchema).toBeDefined();
    expect(Array.isArray(defaultMetaSchema)).toBe(true);
    const keys = defaultMetaSchema.map((item) => item.key);
    expect(keys).toContain("menu_order");
    expect(keys).toContain("parent_id");
    expect(keys).toContain("show_in_menu");
    expect(keys).toContain("menu_options");
    expect(keys).toContain("icon");
    expect(keys).toContain("post_thumbnail");
  });

  it("buildMetaSchema should merge extensions with default", () => {
    const extensions = [
      { key: "custom_field", type: "string" },
      { key: "menu_order", type: "number", default: 10 },
    ];
    const result = buildMetaSchema(extensions);
    expect(result).toBeDefined();
    const menuOrder = result.find((item) => item.key === "menu_order");
    expect(menuOrder?.default).toBe(10);
    const customField = result.find((item) => item.key === "custom_field");
    expect(customField).toEqual({ key: "custom_field", type: "string" });
  });
});
