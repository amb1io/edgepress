import { and, eq } from "drizzle-orm";
import { postTypes, posts } from "../../db/schema.ts";
import type { Database } from "../types/database.ts";
import { parseMetaValues } from "../utils/meta-parser.ts";
import { isValidSlug } from "../utils/validation.ts";
import type { KVLike } from "../utils/runtime-locals.ts";

type ThemeFieldMap = Record<string, string>;

export const THEME_ACTIVE_KV_KEY = "theme:active";
export const THEME_META_KV_PREFIX = "theme:meta:";
export const THEME_STATUS_KV_PREFIX = "theme:status:";
const THEME_PATH_PREFIX = "src/themes/";

export const THEME_REQUIRED_KEYS = ["theme_slug", "theme_path"] as const;

export type ThemeCanonicalMeta = {
  theme_slug: string;
  theme_path: string;
  version?: string;
  supports: string[];
  preview_image?: string;
  author?: string;
  github_repo_url?: string;
  github_ref?: string;
  theme_subdir?: string;
  r2_key?: string;
  package_version?: string;
  package_checksum?: string;
  manifest_key?: string;
};

export type ThemeValidationResult = {
  valid: boolean;
  errors: string[];
};

export type ThemeActiveConfig = {
  id: number | null;
  title: string;
  slug: string;
  is_active: boolean;
  meta: ThemeCanonicalMeta;
  source: "kv" | "db" | "fallback";
};

export type ThemePostSnapshot = {
  id: number;
  title: string;
  slug: string;
  meta_values: string | null;
  canonical_meta: ThemeCanonicalMeta;
};

export type ThemeImportStatus =
  | "idle"
  | "importing"
  | "packaged"
  | "ready"
  | "failed";

export type ThemeImportState = {
  requested_active: boolean;
  is_active: boolean;
  import_status: ThemeImportStatus;
  import_error?: string;
  import_commit_sha?: string;
};

export function normalizeThemeSlug(value: string): string {
  return value.trim().toLowerCase();
}

export function buildThemePathFromSlug(themeSlug: string): string {
  return `${THEME_PATH_PREFIX}${normalizeThemeSlug(themeSlug)}`;
}

export function isValidPublicGitHubRepoUrl(value: string): boolean {
  const raw = value.trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return false;
    if (parsed.hostname !== "github.com") return false;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return false;
    const owner = parts[0];
    const repo = (parts[1] ?? "").replace(/\.git$/i, "");
    if (!owner || !repo) return false;
    return /^[A-Za-z0-9_.-]+$/.test(owner) && /^[A-Za-z0-9_.-]+$/.test(repo);
  } catch {
    return false;
  }
}

export function normalizeGitHubRef(value: string | undefined): string {
  const ref = (value ?? "").trim();
  return ref || "main";
}

export function normalizeThemeSubdir(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw || raw === ".") return "";
  return raw.replace(/^\/+/, "").replace(/\/+$/, "");
}

function isValidThemeSubdir(value: string): boolean {
  if (value === "") return true;
  if (value.includes("..")) return false;
  if (value.includes("\\")) return false;
  return /^[A-Za-z0-9._/-]+$/.test(value);
}

export function isValidThemePath(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed.startsWith(THEME_PATH_PREFIX)) return false;
  if (trimmed.includes("..")) return false;
  if (trimmed.includes("\\")) return false;
  return /^src\/themes\/[a-z0-9/_-]+$/.test(trimmed);
}

export function normalizeSupports(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .map((v) => String(v).trim().toLowerCase())
      .filter(Boolean);
  }
  if (typeof input !== "string") return [];
  const raw = input.trim();
  if (!raw) return [];
  if (raw.startsWith("[") && raw.endsWith("]")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((v) => String(v).trim().toLowerCase())
          .filter(Boolean);
      }
    } catch {
      // Fallback para CSV abaixo.
    }
  }
  return raw
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

export function isThemeActiveFlag(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function mapToCanonicalMeta(fields: ThemeFieldMap): ThemeCanonicalMeta {
  const theme_slug = normalizeThemeSlug(fields["theme_slug"] ?? "");
  const theme_path = (fields["theme_path"] ?? "").trim();
  const version = (fields["version"] ?? "").trim() || undefined;
  const preview_image = (fields["preview_image"] ?? "").trim() || undefined;
  const author = (fields["author"] ?? "").trim() || undefined;
  const github_repo_url = (fields["github_repo_url"] ?? "").trim() || undefined;
  const github_ref = normalizeGitHubRef(fields["github_ref"]);
  const theme_subdir = normalizeThemeSubdir(fields["theme_subdir"]);
  const r2_key = (fields["r2_key"] ?? "").trim() || undefined;
  const package_version = (fields["package_version"] ?? "").trim() || undefined;
  const package_checksum = (fields["package_checksum"] ?? "").trim() || undefined;
  const manifest_key = (fields["manifest_key"] ?? "").trim() || undefined;
  const supports = normalizeSupports(fields["supports"] ?? "");

  return {
    theme_slug,
    theme_path,
    ...(version ? { version } : {}),
    supports,
    ...(preview_image ? { preview_image } : {}),
    ...(author ? { author } : {}),
    ...(github_repo_url ? { github_repo_url } : {}),
    ...(github_ref ? { github_ref } : {}),
    ...(theme_subdir ? { theme_subdir } : {}),
    ...(r2_key ? { r2_key } : {}),
    ...(package_version ? { package_version } : {}),
    ...(package_checksum ? { package_checksum } : {}),
    ...(manifest_key ? { manifest_key } : {}),
  };
}

function applyDerivedThemeIdentity(
  base: ThemeCanonicalMeta,
  postSlug: string
): ThemeCanonicalMeta {
  const derivedSlug = normalizeThemeSlug(postSlug);
  return {
    ...base,
    theme_slug: derivedSlug,
    theme_path: buildThemePathFromSlug(derivedSlug),
  };
}

function mergePackageMetaFromPostMeta(
  base: ThemeCanonicalMeta,
  postMetaValuesRaw: string | null
): ThemeCanonicalMeta {
  const postMeta = parseMetaValues(postMetaValuesRaw);
  const github_repo_url =
    typeof postMeta["github_repo_url"] === "string"
      ? postMeta["github_repo_url"].trim()
      : "";
  const github_ref =
    typeof postMeta["github_ref"] === "string"
      ? normalizeGitHubRef(postMeta["github_ref"])
      : "";
  const theme_subdir =
    typeof postMeta["theme_subdir"] === "string"
      ? normalizeThemeSubdir(postMeta["theme_subdir"])
      : "";
  const version =
    typeof postMeta["version"] === "string"
      ? postMeta["version"].trim()
      : "";
  const supports = normalizeSupports(postMeta["supports"] ?? "");
  const author =
    typeof postMeta["author"] === "string"
      ? postMeta["author"].trim()
      : "";
  const preview_image =
    typeof postMeta["preview_image"] === "string"
      ? postMeta["preview_image"].trim()
      : "";
  const r2_key = typeof postMeta["r2_key"] === "string" ? postMeta["r2_key"].trim() : "";
  const package_version =
    typeof postMeta["package_version"] === "string"
      ? postMeta["package_version"].trim()
      : "";
  const package_checksum =
    typeof postMeta["package_checksum"] === "string"
      ? postMeta["package_checksum"].trim()
      : "";
  const manifest_key =
    typeof postMeta["manifest_key"] === "string"
      ? postMeta["manifest_key"].trim()
      : "";

  return {
    ...base,
    ...(github_repo_url ? { github_repo_url } : {}),
    ...(github_ref ? { github_ref } : {}),
    ...(theme_subdir ? { theme_subdir } : {}),
    ...(version ? { version } : {}),
    ...(supports.length > 0 ? { supports } : {}),
    ...(author ? { author } : {}),
    ...(preview_image ? { preview_image } : {}),
    ...(r2_key ? { r2_key } : {}),
    ...(package_version ? { package_version } : {}),
    ...(package_checksum ? { package_checksum } : {}),
    ...(manifest_key ? { manifest_key } : {}),
  };
}

function isValidSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value.trim());
}

export function hasValidThemePackageMeta(meta: ThemeCanonicalMeta): boolean {
  if (!meta.r2_key || !meta.package_version || !meta.package_checksum) return false;
  return isValidSha256Hex(meta.package_checksum);
}

export function validateThemeCanonicalMeta(
  meta: ThemeCanonicalMeta,
  options?: { requireGithubRepoUrl?: boolean; requirePackageMeta?: boolean }
): ThemeValidationResult {
  const errors: string[] = [];
  const requireGithubRepoUrl = options?.requireGithubRepoUrl === true;
  const requirePackageMeta = options?.requirePackageMeta === true;
  if (!meta.theme_slug) errors.push("theme_slug is required");
  if (!meta.theme_path) errors.push("theme_path is required");
  if (meta.theme_slug && !isValidSlug(meta.theme_slug)) errors.push("theme_slug must be a valid slug");
  if (meta.theme_path && !isValidThemePath(meta.theme_path)) {
    errors.push("theme_path must start with src/themes/ and use safe characters");
  }
  if (requireGithubRepoUrl && !meta.github_repo_url) {
    errors.push("github_repo_url is required when requesting activation");
  }
  if (meta.github_repo_url && !isValidPublicGitHubRepoUrl(meta.github_repo_url)) {
    errors.push("github_repo_url must be a public GitHub URL");
  }
  if (meta.theme_subdir && !isValidThemeSubdir(meta.theme_subdir)) {
    errors.push("theme_subdir contains invalid characters");
  }
  if (meta.package_checksum && !isValidSha256Hex(meta.package_checksum)) {
    errors.push("package_checksum must be a 64-char sha256 hex");
  }
  if (requirePackageMeta && !hasValidThemePackageMeta(meta)) {
    errors.push("r2_key, package_version and package_checksum are required for ready state");
  }
  return { valid: errors.length === 0, errors };
}

async function getPostTypeIdBySlug(db: Database, slug: string): Promise<number | null> {
  const [row] = await db.select({ id: postTypes.id }).from(postTypes).where(eq(postTypes.slug, slug)).limit(1);
  return row?.id ?? null;
}

export async function getThemeSnapshotById(
  db: Database,
  themePostId: number
): Promise<ThemePostSnapshot | null> {
  const themesPostTypeId = await getPostTypeIdBySlug(db, "themes");
  if (!themesPostTypeId) return null;
  const [row] = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      meta_values: posts.meta_values,
    })
    .from(posts)
    .where(and(eq(posts.id, themePostId), eq(posts.post_type_id, themesPostTypeId)))
    .limit(1);
  if (!row) return null;
  const canonicalBase = mergePackageMetaFromPostMeta(
    mapToCanonicalMeta({}),
    row.meta_values
  );
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    meta_values: row.meta_values,
    canonical_meta: applyDerivedThemeIdentity(canonicalBase, row.slug),
  };
}

export async function getThemeSnapshotBySlug(
  db: Database,
  themeSlug: string
): Promise<ThemePostSnapshot | null> {
  const themesPostTypeId = await getPostTypeIdBySlug(db, "themes");
  if (!themesPostTypeId) return null;
  const [row] = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      meta_values: posts.meta_values,
    })
    .from(posts)
    .where(and(eq(posts.post_type_id, themesPostTypeId), eq(posts.slug, themeSlug)))
    .limit(1);
  if (!row) return null;
  const canonicalBase = mergePackageMetaFromPostMeta(
    mapToCanonicalMeta({}),
    row.meta_values
  );
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    meta_values: row.meta_values,
    canonical_meta: applyDerivedThemeIdentity(canonicalBase, row.slug),
  };
}

function fallbackTheme(): ThemeActiveConfig {
  return {
    id: null,
    title: "Default",
    slug: "default",
    is_active: true,
    meta: {
      theme_slug: "default",
      theme_path: "src/themes/default",
      supports: [],
      github_ref: "main",
    },
    source: "fallback",
  };
}

function toThemeActiveConfig(input: {
  id: number;
  title: string;
  slug: string;
  is_active: boolean;
  meta: ThemeCanonicalMeta;
  source: "db" | "kv";
}): ThemeActiveConfig {
  return {
    id: input.id,
    title: input.title,
    slug: input.slug,
    is_active: input.is_active,
    meta: input.meta,
    source: input.source,
  };
}

export async function getActiveThemeFromDb(db: Database): Promise<ThemeActiveConfig> {
  const themesPostTypeId = await getPostTypeIdBySlug(db, "themes");
  if (!themesPostTypeId) return fallbackTheme();

  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      meta_values: posts.meta_values,
    })
    .from(posts)
    .where(eq(posts.post_type_id, themesPostTypeId))
    .orderBy(posts.updated_at, posts.created_at);

  let firstValid: ThemeActiveConfig | null = null;

  for (const row of rows) {
    const metaValues = parseMetaValues(row.meta_values);
    const isActive = isThemeActiveFlag(metaValues["is_active"]);
    const canonicalBase = mergePackageMetaFromPostMeta(
      mapToCanonicalMeta({}),
      row.meta_values
    );
    const meta = applyDerivedThemeIdentity(canonicalBase, row.slug);
    const validation = validateThemeCanonicalMeta(meta);
    if (!validation.valid) continue;

    const config = toThemeActiveConfig({
      id: row.id,
      title: row.title,
      slug: row.slug,
      is_active: isActive,
      meta,
      source: "db",
    });

    if (!firstValid) firstValid = config;
    if (isActive) return config;
  }

  return firstValid ?? fallbackTheme();
}

export async function getActiveTheme(
  db: Database,
  kv?: KVLike | null
): Promise<ThemeActiveConfig> {
  if (kv) {
    try {
      const cached = (await kv.get(THEME_ACTIVE_KV_KEY, "json")) as ThemeActiveConfig | null;
      if (cached && cached.meta) {
        const validation = validateThemeCanonicalMeta(cached.meta);
        if (validation.valid) {
          return { ...cached, source: "kv" };
        }
      }
    } catch {
      // Ignore KV read issues and fallback to DB.
    }
  }

  const fromDb = await getActiveThemeFromDb(db);
  if (kv) {
    try {
      await kv.put(THEME_ACTIVE_KV_KEY, JSON.stringify(fromDb));
    } catch {
      // Ignore KV write failure.
    }
  }
  return fromDb;
}

export async function enforceSingleActiveTheme(
  db: Database,
  activePostId: number
): Promise<void> {
  const themesPostTypeId = await getPostTypeIdBySlug(db, "themes");
  if (!themesPostTypeId) return;

  const rows = await db
    .select({
      id: posts.id,
      meta_values: posts.meta_values,
    })
    .from(posts)
    .where(eq(posts.post_type_id, themesPostTypeId));

  for (const row of rows) {
    if (row.id === activePostId) continue;
    const currentMeta = parseMetaValues(row.meta_values);
    if (!isThemeActiveFlag(currentMeta["is_active"])) continue;
    currentMeta["is_active"] = "0";
    await db
      .update(posts)
      .set({ meta_values: JSON.stringify(currentMeta), updated_at: Date.now() })
      .where(eq(posts.id, row.id));
  }
}

export function parseThemeImportState(metaValuesRaw: string | null): ThemeImportState {
  const metaValues = parseMetaValues(metaValuesRaw);
  const importStatusRaw = String(metaValues["import_status"] ?? "idle").trim().toLowerCase();
  const import_status: ThemeImportStatus =
    importStatusRaw === "importing" ||
    importStatusRaw === "packaged" ||
    importStatusRaw === "ready" ||
    importStatusRaw === "failed"
      ? importStatusRaw
      : "idle";

  return {
    requested_active: isThemeActiveFlag(metaValues["requested_active"]),
    is_active: isThemeActiveFlag(metaValues["is_active"]),
    import_status,
    ...(metaValues["import_error"] ? { import_error: String(metaValues["import_error"]) } : {}),
    ...(metaValues["import_commit_sha"] ? { import_commit_sha: String(metaValues["import_commit_sha"]) } : {}),
  };
}

export function withThemeImportState(
  metaValuesRaw: string | null,
  patch: Partial<ThemeImportState>
): string {
  const meta = parseMetaValues(metaValuesRaw);
  const next: ThemeImportState = {
    ...parseThemeImportState(metaValuesRaw),
    ...patch,
  };
  meta["requested_active"] = next.requested_active ? "1" : "0";
  meta["is_active"] = next.is_active ? "1" : "0";
  meta["import_status"] = next.import_status;
  if (next.import_error && next.import_error.trim()) {
    meta["import_error"] = next.import_error.trim();
  } else {
    delete meta["import_error"];
  }
  if (next.import_commit_sha && next.import_commit_sha.trim()) {
    meta["import_commit_sha"] = next.import_commit_sha.trim();
  } else {
    delete meta["import_commit_sha"];
  }
  return JSON.stringify(meta);
}
