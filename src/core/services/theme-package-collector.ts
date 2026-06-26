import { normalizeTemplateKey } from "../theme/resolve-template.ts";
import { validateThemeManifest } from "../theme/theme-package.ts";
import type { ThemeManifest } from "../theme/types.ts";
import { normalizeThemeSubdir } from "./theme-service.ts";

export type ThemeArchiveEntry = {
  name: string;
  data?: Uint8Array;
};

function stripRootPrefix(path: string, rootPrefix: string): string | null {
  if (!path.startsWith(rootPrefix)) return null;
  return path.slice(rootPrefix.length).replace(/^\/+/, "");
}

function detectRootPrefix(entries: ThemeArchiveEntry[]): string {
  const names = entries.map((entry) => entry.name.replace(/\\/g, "/"));

  if (names.includes("theme.json")) {
    return "";
  }

  for (const name of names) {
    if (name.endsWith("/theme.json")) {
      return name.slice(0, -"theme.json".length);
    }
  }

  for (const name of names) {
    const idx = name.indexOf("/");
    if (idx > 0) {
      const prefix = name.slice(0, idx + 1);
      if (names.some((candidate) => candidate === `${prefix}theme.json`)) {
        return prefix;
      }
    }
  }

  return "";
}

export function collectPackageFromEntries(
  entries: ThemeArchiveEntry[],
  subdir = "",
): { manifest: ThemeManifest; templates: Record<string, string>; assets: Map<string, ArrayBuffer> } {
  const rootPrefix = detectRootPrefix(entries);

  const sub = normalizeThemeSubdir(subdir);
  const basePrefix = sub ? `${rootPrefix}${sub}/` : rootPrefix;

  let manifestRaw: string | null = null;
  const templates: Record<string, string> = {};
  const assets = new Map<string, ArrayBuffer>();

  for (const entry of entries) {
    if (!entry.data || entry.name.endsWith("/")) continue;
    const relative = stripRootPrefix(entry.name.replace(/\\/g, "/"), basePrefix);
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
    throw new Error("theme.json not found in theme package");
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
