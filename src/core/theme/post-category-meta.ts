export type PostTaxonomyForCategoryMeta = {
  type?: string;
  slug?: string;
  name?: string;
};

/**
 * Derives primary category fields from post taxonomies for Liquid themes
 * (e.g. post-box.liquid reading meta.category_slug / meta.category_name).
 * Does not overwrite values already present in meta_values.
 */
export function injectCategoryMeta(
  meta: Record<string, string>,
  taxonomies: PostTaxonomyForCategoryMeta[] | undefined,
): void {
  if (meta.category_slug) return;

  const category = (taxonomies ?? []).find((term) => term.type === "category");
  if (!category?.slug) return;

  meta.category_slug = String(category.slug);
  if (category.name && !meta.category_name) {
    meta.category_name = String(category.name);
  }
}
