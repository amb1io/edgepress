import { parseTarGzip } from "nanotar";
import { env as cfEnv } from "cloudflare:workers";
import { db } from "../../db/index.ts";
import { getPostTypeId, updatePost } from "../services/post-service.ts";
import {
  enforceSingleActiveTheme,
  getThemeSnapshotById,
  isValidPublicGitHubRepoUrl,
  normalizeGitHubRef,
  normalizeThemeSubdir,
  withThemeImportState,
} from "../services/theme-service.ts";
import { syncThemeCache, syncThemeStatusCacheByPostId } from "../../utils/kv-cache-sync.ts";
import { getKvFromLocals } from "../../utils/runtime-locals.ts";
import {
  saveThemePackage,
  validateThemeManifest,
  type ThemePackageRecord,
} from "../theme/theme-package.ts";
import { normalizeTemplateKey } from "../theme/resolve-template.ts";
import type { ThemeManifest } from "../theme/types.ts";

type R2Bucket = {
  put: (
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | ReadableStream | Blob,
    options?: { httpMetadata?: { contentType?: string } },
  ) => Promise<unknown>;
};

export type ThemeImportInput = {
  themePostId: number;
  themeSlug: string;
  repoUrl: string;
  ref?: string;
  subdir?: string;
};

function parseGitHubRepo(url: string): { owner: string; repo: string } {
  const parsed = new URL(url.trim());
  const parts = parsed.pathname.split("/").filter(Boolean);
  const owner = parts[0] ?? "";
  const repo = (parts[1] ?? "").replace(/\.git$/i, "");
  if (!owner || !repo) {
    throw new Error("Invalid GitHub repository URL");
  }
  return { owner, repo };
}

function buildArchiveUrl(owner: string, repo: string, ref: string): string {
  return `https://codeload.github.com/${owner}/${repo}/tar.gz/${encodeURIComponent(ref)}`;
}


function stripRootPrefix(path: string, rootPrefix: string): string | null {
  if (!path.startsWith(rootPrefix)) return null;
  return path.slice(rootPrefix.length).replace(/^\/+/, "");
}

function collectPackageFromTar(
  entries: Array<{ name: string; data?: Uint8Array }>,
  subdir: string,
): { manifest: ThemeManifest; templates: Record<string, string>; assets: Map<string, ArrayBuffer> } {
  let rootPrefix = "";
  for (const entry of entries) {
    const idx = entry.name.indexOf("/");
    if (idx > 0) {
      rootPrefix = entry.name.slice(0, idx + 1);
      break;
    }
  }

  const sub = normalizeThemeSubdir(subdir);
  const basePrefix = sub ? `${rootPrefix}${sub}/` : rootPrefix;

  let manifestRaw: string | null = null;
  const templates: Record<string, string> = {};
  const assets = new Map<string, ArrayBuffer>();

  for (const entry of entries) {
    if (!entry.data) continue;
    const relative = stripRootPrefix(entry.name, basePrefix);
    if (!relative) continue;

    if (relative === "theme.json") {
      manifestRaw = new TextDecoder().decode(entry.data);
      continue;
    }

    if (relative.startsWith("templates/") && relative.endsWith(".liquid")) {
      const key = normalizeTemplateKey(relative);
      templates[key] = new TextDecoder().decode(entry.data);
      continue;
    }

    if (relative.startsWith("assets/")) {
      const assetPath = relative.slice("assets/".length);
      const copy = entry.data.buffer.slice(
        entry.data.byteOffset,
        entry.data.byteOffset + entry.data.byteLength,
      );
      assets.set(assetPath, copy);
    }
  }

  if (!manifestRaw) {
    throw new Error("theme.json not found in repository package");
  }

  let manifest: ThemeManifest;
  try {
    manifest = validateThemeManifest(JSON.parse(manifestRaw));
  } catch (err) {
    throw new Error(
      err instanceof Error ? `Invalid theme.json: ${err.message}` : "Invalid theme.json",
    );
  }

  if (Object.keys(templates).length === 0) {
    throw new Error("No templates/*.liquid files found in theme package");
  }

  return { manifest, templates, assets };
}

export async function importThemeFromGitHub(
  locals: App.Locals,
  input: ThemeImportInput,
): Promise<ThemePackageRecord> {
  if (!isValidPublicGitHubRepoUrl(input.repoUrl)) {
    throw new Error("github_repo_url must be a public GitHub URL");
  }

  const { owner, repo } = parseGitHubRepo(input.repoUrl);
  const ref = normalizeGitHubRef(input.ref);
  const archiveUrl = buildArchiveUrl(owner, repo, ref);

  const response = await fetch(archiveUrl, {
    headers: { "User-Agent": "edgepress-theme-importer" },
  });
  if (!response.ok) {
    throw new Error(`Failed to download theme archive (${response.status})`);
  }

  const gzipped = await response.arrayBuffer();
  const entries = await parseTarGzip(gzipped);
  const { manifest, templates, assets } = collectPackageFromTar(
    entries.map((e) => ({
      name: e.name,
      data: e.data ? new Uint8Array(e.data) : undefined,
    })),
    input.subdir ?? "",
  );

  const pkg: ThemePackageRecord = {
    manifest: {
      ...manifest,
      slug: manifest.slug || input.themeSlug.trim().toLowerCase(),
    },
    templates,
    updated_at: Date.now(),
  };

  const kv = getKvFromLocals(locals);
  if (!kv) {
    throw new Error("KV cache is not available for theme import");
  }

  const bucket = (cfEnv as { MEDIA_BUCKET?: R2Bucket }).MEDIA_BUCKET ?? null;
  await saveThemePackage(kv, bucket, pkg, assets);

  const themesTypeId = await getPostTypeId(db, "themes");
  if (!themesTypeId) {
    throw new Error("Themes post type not found");
  }

  const snapshot = await getThemeSnapshotById(db, input.themePostId);
  const nextMeta = withThemeImportState(snapshot?.meta_values ?? null, {
    requested_active: false,
    is_active: true,
    import_status: "ready",
    import_error: undefined,
  });

  await updatePost(db, input.themePostId, themesTypeId, {
    meta_values: nextMeta,
    updated_at: Date.now(),
  });

  await enforceSingleActiveTheme(db, input.themePostId);
  await syncThemeStatusCacheByPostId(locals, db, input.themePostId);
  await syncThemeCache(locals, db);

  return pkg;
}
