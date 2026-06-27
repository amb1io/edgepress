import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ThemeManifest, ThemePackageRecord } from "../../core/theme/types.ts";
import { normalizeTemplateKey } from "../../core/theme/resolve-template.ts";

const THEME_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Diretório do tema default no disco (para theme:dev watch). */
export const DEFAULT_THEME_DIR = THEME_DIR;

function collectLiquidTemplates(templatesDir: string): Record<string, string> {
  const templates: Record<string, string> = {};

  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.name.endsWith(".liquid")) continue;
      const relative = path.relative(templatesDir, fullPath).replace(/\\/g, "/");
      const key = normalizeTemplateKey(`templates/${relative}`);
      templates[key] = fs.readFileSync(fullPath, "utf8");
    }
  }

  walk(templatesDir);
  return templates;
}

/** Loads the bundled default theme from disk (Node/tsx — no Vite ?raw). */
export function loadDefaultThemePackage(): ThemePackageRecord {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(THEME_DIR, "theme.json"), "utf8"),
  ) as ThemeManifest;

  const templates = collectLiquidTemplates(path.join(THEME_DIR, "templates"));

  return {
    manifest,
    templates,
    updated_at: Date.now(),
  };
}

export function loadDefaultThemeAssets(): Map<string, ArrayBuffer> {
  const assetsDir = path.join(THEME_DIR, "assets");
  const assets = new Map<string, ArrayBuffer>();
  if (!fs.existsSync(assetsDir)) return assets;

  for (const name of fs.readdirSync(assetsDir)) {
    const filePath = path.join(assetsDir, name);
    if (!fs.statSync(filePath).isFile()) continue;
    const buf = fs.readFileSync(filePath);
    assets.set(
      name,
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    );
  }

  return assets;
}
