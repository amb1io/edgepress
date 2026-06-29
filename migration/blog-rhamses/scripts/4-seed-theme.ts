/**
 * Grava o tema blog-rhamses no KV e assets no R2 (local).
 */
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  themeAssetR2Key,
  themePackageKvKey,
} from "../../../src/core/theme/theme-package.ts";
import {
  loadBlogRhamsesThemeAssets,
  loadBlogRhamsesThemePackage,
} from "../../../src/themes-default/blog-rhamses/load-package.ts";

const R2_BUCKET = "edgepress-media";
const isRemote = process.argv.includes("--remote");
const persistFlag = isRemote ? "--remote" : "--local";

function guessContentType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function wrangler(cmd: string): void {
  execSync(`npx wrangler ${cmd} -c wrangler.toml`, {
    stdio: "inherit",
    cwd: process.cwd(),
  });
}

function main(): void {
  const pkg = loadBlogRhamsesThemePackage();
  const assets = loadBlogRhamsesThemeAssets();
  const slug = pkg.manifest.slug;
  const kvKey = themePackageKvKey(slug);
  const tmpDir = mkdtempSync(join(tmpdir(), "edgepress-blog-theme-"));

  try {
    const pkgPath = join(tmpDir, "package.json");
    writeFileSync(pkgPath, JSON.stringify(pkg));

    console.log(`[seed-theme] Writing ${kvKey} to KV (${isRemote ? "remote" : "local"})...`);
    wrangler(
      `kv key put ${JSON.stringify(kvKey)} --path=${JSON.stringify(pkgPath)} --binding=CACHE ${persistFlag}`,
    );

    for (const [relativePath, data] of assets.entries()) {
      const assetPath = join(tmpDir, relativePath);
      writeFileSync(assetPath, Buffer.from(data));
      const r2Key = themeAssetR2Key(slug, relativePath);
      const contentType = guessContentType(relativePath);

      console.log(`[seed-theme] Uploading ${r2Key}...`);
      wrangler(
        `r2 object put ${JSON.stringify(`${R2_BUCKET}/${r2Key}`)} --file=${JSON.stringify(assetPath)} --content-type=${JSON.stringify(contentType)} ${persistFlag}`,
      );
    }

    console.log(`[seed-theme] Theme ${slug} saved to KV + R2.`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();
