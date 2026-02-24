/**
 * Utilities for parsing and manipulating meta_values.
 * Consolidates duplicated logic from attachment.astro, content.astro and posts.ts
 */

/**
 * Parses a JSON string of meta_values into a Record object
 * @param metaValues - JSON string with meta values or null
 * @returns Record<string, string> with parsed values, or empty object if invalid
 */
export function parseMetaValues(metaValues: string | null): Record<string, string> {
  if (!metaValues) {
    return {};
  }
  
  try {
    const parsed = JSON.parse(metaValues);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // Fail silently and return an empty object
  }
  
  return {};
}

/**
 * Merges existing meta_values with new values.
 * New values overwrite existing values.
 * @param existingMetaValues - JSON string with existing values
 * @param newValues - Record with new values to be merged
 * @returns JSON string with merged values, or null if empty
 */
export function mergeMetaValues(
  existingMetaValues: string | null,
  newValues: Record<string, string>
): string | null {
  const existing = parseMetaValues(existingMetaValues);
  const merged = { ...existing, ...newValues };
  
  // If there are no values after the merge, return null
  if (Object.keys(merged).length === 0) {
    return null;
  }
  
  return JSON.stringify(merged);
}

/**
 * Gets a specific value from meta_values
 * @param metaValues - JSON string with meta values
 * @param key - Key of the value to extract
 * @param defaultValue - Default value if the key does not exist
 * @returns Key value or default value
 */
export function getMetaValue(
  metaValues: string | null,
  key: string,
  defaultValue: string | null = null
): string | null {
  const parsed = parseMetaValues(metaValues);
  return parsed[key] ?? defaultValue;
}

/**
 * Removes a specific key from meta_values
 * @param metaValues - JSON string with meta values
 * @param key - Key to be removed
 * @returns Updated JSON string or null if empty
 */
export function removeMetaValue(metaValues: string | null, key: string): string | null {
  const parsed = parseMetaValues(metaValues);
  delete parsed[key];
  
  if (Object.keys(parsed).length === 0) {
    return null;
  }
  
  return JSON.stringify(parsed);
}

/**
 * Sets a specific value in meta_values
 * @param metaValues - JSON string with meta values
 * @param key - Key to be set
 * @param value - Value to be assigned
 * @returns Updated JSON string
 */
export function setMetaValue(
  metaValues: string | null,
  key: string,
  value: string
): string {
  const parsed = parseMetaValues(metaValues);
  parsed[key] = value;
  return JSON.stringify(parsed);
}

/**
 * Checks if a key exists in meta_values
 * @param metaValues - JSON string with meta values
 * @param key - Key to be checked
 * @returns true if the key exists, false otherwise
 */
export function hasMetaValue(metaValues: string | null, key: string): boolean {
  const parsed = parseMetaValues(metaValues);
  return key in parsed;
}

/**
 * Converts a Record to JSON string of meta_values
 * @param values - Record with values to be converted
 * @returns JSON string or null if empty
 */
export function stringifyMetaValues(values: Record<string, string>): string | null {
  if (Object.keys(values).length === 0) {
    return null;
  }
  return JSON.stringify(values);
}

type MetaSchemaItem = { key: string; default?: unknown };

/**
 * Gets an option from a post type's meta_schema (array of { key, default? }).
 * Used for taxonomy, post_thumbnail, post_types, etc.
 * @param metaSchema - Post type meta_schema (array or null/undefined)
 * @param key - Item key (e.g. "taxonomy", "post_thumbnail", "post_types")
 * @param defaultValue - Default value if key does not exist or type is incompatible
 * @returns Option value or defaultValue
 */
export function getMetaSchemaOption<T>(metaSchema: unknown, key: string, defaultValue: T): T {
  const schema = (Array.isArray(metaSchema) ? metaSchema : []) as MetaSchemaItem[];
  const item = schema.find((s) => s.key === key);
  const def = item?.default;
  if (def === undefined) return defaultValue;
  return def as T;
}

/**
 * Returns taxonomy types from meta_schema (array of strings). Default: ["category"].
 */
export function getMetaSchemaTaxonomyTypes(metaSchema: unknown): string[] {
  const def = getMetaSchemaOption<unknown>(metaSchema, "taxonomy", ["category"]);
  return Array.isArray(def) ? (def as string[]) : ["category"];
}

/**
 * Returns whether the post type has post_thumbnail enabled. Default: false.
 */
export function getMetaSchemaPostThumbnail(metaSchema: unknown): boolean {
  const def = getMetaSchemaOption<unknown>(metaSchema, "post_thumbnail", false);
  return typeof def === "boolean" ? def : false;
}

/**
 * Returns whether the post type has custom_fields (post_types includes "custom_fields"). Default: false.
 */
export function getMetaSchemaHasCustomFields(metaSchema: unknown): boolean {
  const def = getMetaSchemaOption<unknown>(metaSchema, "post_types", []);
  return Array.isArray(def) && def.includes("custom_fields");
}
