import { describe, it, expect } from "vitest";
import {
  buildPostTypeTaxonomyArray,
  filterTaxonomyTypesForUi,
  TAXONOMY_TYPE_I18N_NAMESPACE,
  taxonomyTypeMenuOptionKey,
  withTaxonomyInMetaSchema,
} from "../taxonomy-type-registry.ts";
import {
  isTaxonomyMenuOption,
  taxonomyTypeToMenuOption,
} from "../../../shared/scripts/post-type-form.ts";

describe("buildPostTypeTaxonomyArray", () => {
  it("includes taxonomia_{slug} when a custom type is selected", () => {
    expect(buildPostTypeTaxonomyArray(["category", "genero"], "teste")).toEqual([
      "category",
      "genero",
      "taxonomia_teste",
    ]);
  });

  it("does not add bucket for builtin-only selection", () => {
    expect(buildPostTypeTaxonomyArray(["category", "tag"], "teste")).toEqual([
      "category",
      "tag",
    ]);
  });

  it("deduplicates entries", () => {
    expect(buildPostTypeTaxonomyArray(["category", "category"], "x")).toEqual(["category"]);
  });
});

describe("filterTaxonomyTypesForUi", () => {
  it("removes taxonomia_ bucket types", () => {
    expect(filterTaxonomyTypesForUi(["category", "taxonomia_teste", "tag"])).toEqual([
      "category",
      "tag",
    ]);
  });
});

describe("taxonomyTypeToMenuOption", () => {
  it("builds taxonomies_type_* menu option", () => {
    expect(taxonomyTypeToMenuOption("category")).toBe("taxonomies_type_category");
    expect(taxonomyTypeMenuOptionKey("category")).toBe("taxonomies_type_category");
    expect(TAXONOMY_TYPE_I18N_NAMESPACE).toBe("taxonomy.type");
    expect(isTaxonomyMenuOption("taxonomies_type_tag")).toBe(true);
    expect(isTaxonomyMenuOption("new")).toBe(false);
  });
});

describe("withTaxonomyInMetaSchema", () => {
  it("replaces taxonomy key in schema array", () => {
    const schema = [{ key: "show_in_menu", type: "boolean", default: true }];
    const next = withTaxonomyInMetaSchema(schema, ["category", "tag"]);
    expect(next.find((s) => s.key === "taxonomy")?.default).toEqual(["category", "tag"]);
  });
});
