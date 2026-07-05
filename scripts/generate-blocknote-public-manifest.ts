/**
 * After `astro build`, locate BlockNote public hydration chunks in dist/client/_astro
 * and write src/generated/blocknote-public-assets.json for Liquid theme footer injection.
 */
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const astroDir = join(root, "dist/client/_astro");
const outFile = join(root, "src/generated/blocknote-public-assets.json");

function pickAsset(files: string[], ext: string, needle: string): string {
  const matches = files.filter(
    (name) => name.includes(needle) && name.endsWith(ext),
  );
  if (matches.length === 0) return "";
  matches.sort((a, b) => b.length - a.length);
  return `/_astro/${matches[0]}`;
}

try {
  const files = readdirSync(astroDir);
  const js = pickAsset(files, ".js", "blocknote-readonly-mount");
  const css =
    pickAsset(files, ".css", "blocknote-readonly-mount") ||
    pickAsset(files, ".css", "BlockNoteReadonly") ||
    pickAsset(files, ".css", "blocknote");

  if (!js) {
    console.warn(
      "[generate-blocknote-public-manifest] No blocknote-readonly-mount JS chunk found; manifest left empty.",
    );
  }

  writeFileSync(
    outFile,
    `${JSON.stringify({ js, css }, null, 2)}\n`,
    "utf8",
  );
  console.log(`[generate-blocknote-public-manifest] Wrote ${outFile}`);
  console.log(`  js:  ${js || "(empty)"}`);
  console.log(`  css: ${css || "(empty)"}`);
} catch (err) {
  console.warn(
    `[generate-blocknote-public-manifest] Skipped: ${err instanceof Error ? err.message : String(err)}`,
  );
}
