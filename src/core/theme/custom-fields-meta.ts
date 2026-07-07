import type { CustomFieldItem } from "./types.ts";

/**
 * Flattens custom field blocks into theme meta keys:
 * `{block_slug}_{field_name}` → field value (e.g. `dados-da-equipe_cargo`).
 * Does not overwrite keys already present in meta_values.
 */
export function injectCustomFieldsMeta(
  meta: Record<string, string>,
  customFields: CustomFieldItem[] | undefined,
): void {
  if (!Array.isArray(customFields)) return;

  for (const block of customFields) {
    const blockSlug = String(block.slug ?? "").trim();
    if (!blockSlug) continue;

    for (const field of block.fields ?? []) {
      const name = String(field.name ?? "").trim();
      if (!name) continue;

      const key = `${blockSlug}_${name}`;
      if (meta[key]) continue;

      const value = field.value;
      if (value != null && String(value) !== "") {
        meta[key] = String(value);
      }
    }
  }
}
