/**
 * Grava o tema default (2026) no KV e assets no R2 para desenvolvimento local ou remoto.
 *
 * Uso:
 *   npm run theme:seed-default          # persiste em .wrangler (local)
 *   npm run theme:seed-default -- --remote
 */
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  themeAssetR2Key,
  themePackageKvKey,
} from "../src/core/theme/theme-package.ts";
import {
  loadDefaultThemeAssets,
  loadDefaultThemePackage,
} from "../src/themes/2026/load-package.ts";

const R2_BUCKET = "edgepress-media";
const isRemote = process.argv.includes("--remote");
const persistFlag = isRemote ? "--remote" : "--local";

function guessContentType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function wrangler(cmd: string): void {
  execSync(`npx wrangler ${cmd} -c wrangler.toml`, {
    stdio: "inherit",
    cwd: process.cwd(),
  });
}

async function main(): Promise<void> {
  const defaultThemePackage = loadDefaultThemePackage();
  const assets = loadDefaultThemeAssets();
  const slug = defaultThemePackage.manifest.slug;
  const kvKey = themePackageKvKey(slug);

  const tmpDir = mkdtempSync(join(tmpdir(), "edgepress-theme-seed-"));

  try {
    const pkgPath = join(tmpDir, "package.json");
    writeFileSync(pkgPath, JSON.stringify(defaultThemePackage));

    console.log(
      `[seed-default-theme] Writing ${kvKey} to KV (${isRemote ? "remote" : "local"})...`,
    );
    wrangler(
      `kv key put ${JSON.stringify(kvKey)} --path=${JSON.stringify(pkgPath)} --binding=CACHE ${persistFlag}`,
    );

    for (const [relativePath, data] of assets.entries()) {
      const assetPath = join(tmpDir, relativePath);
      writeFileSync(assetPath, Buffer.from(data));
      const r2Key = themeAssetR2Key(slug, relativePath);
      const contentType = guessContentType(relativePath);

      console.log(`[seed-default-theme] Uploading ${r2Key} to R2...`);
      wrangler(
        `r2 object put ${JSON.stringify(`${R2_BUCKET}/${r2Key}`)} --file=${JSON.stringify(assetPath)} --content-type=${JSON.stringify(contentType)} ${persistFlag}`,
      );
    }

    console.log(
      `[seed-default-theme] Saved theme:${slug} to KV + R2 (${isRemote ? "remote" : "local"})`,
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
