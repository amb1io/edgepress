import { describe, it, expect, vi } from "vitest";
import {
  findTaxonomyByCanonicalSlug,
  resolveTaxonomyTermBySlug,
} from "../taxonomy-translation-service.ts";
import { TAXONOMY_SLUG_I18N_NAMESPACE, TAXONOMY_TYPE_I18N_NAMESPACE } from "../taxonomy-type-registry.ts";
import {
  parseTaxonomyNameTranslationRows,
  parseTaxonomySlugTranslationRows,
} from "../../../utils/taxonomy-translation-form.ts";

function mockTaxonomyDb(row: { id: number; name: string; slug: string; type: string } | undefined) {
  return {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(row ? [row] : []),
        }),
      }),
    })),
  };
}

describe("taxonomy-translation-service", () => {
  it("exports taxonomy slug namespace constant", () => {
    expect(TAXONOMY_SLUG_I18N_NAMESPACE).toBe("taxonomy.slug");
    expect(TAXONOMY_TYPE_I18N_NAMESPACE).toBe("taxonomy.type");
  });

  it("resolveTaxonomyTermBySlug returns null for empty slug", async () => {
    const db = mockTaxonomyDb(undefined);
    expect(await resolveTaxonomyTermBySlug(db as never, "category", "", "pt_BR")).toBeNull();
  });

  it("findTaxonomyByCanonicalSlug returns matching term", async () => {
    const db = mockTaxonomyDb({
      id: 5,
      name: "Tech",
      slug: "tech",
      type: "category",
    });

    const term = await findTaxonomyByCanonicalSlug(db as never, "category", "tech");
    expect(term).toEqual({ id: 5, name: "Tech", slug: "tech", type: "category" });
  });
});

describe("taxonomy-translation-form", () => {
  it("parses name fields but not slug fields", async () => {
    const db = {
      select: vi.fn(() => ({
        from: () => ({
          where: () =>
            Promise.resolve([
              { id: 1, locale_code: "pt_BR" },
              { id: 2, locale_code: "en_US" },
            ]),
        }),
      })),
    };

    const formData = new FormData();
    formData.set("translation_pt_BR", "Tecnologia");
    formData.set("translation_slug_pt_BR", "tecnologia");
    formData.set("translation_en_US", "Technology");

    const nameRows = await parseTaxonomyNameTranslationRows(db as never, formData);
    const slugRows = await parseTaxonomySlugTranslationRows(db as never, formData);

    expect(nameRows).toEqual([
      { locale_id: 1, value: "Tecnologia" },
      { locale_id: 2, value: "Technology" },
    ]);
    expect(slugRows).toEqual([{ locale_id: 1, value: "tecnologia" }]);
  });
});
