/**
 * Copia assets estáticos do tema ativo para ./public (únicos que o Astro expõe na raiz).
 * Fonte padrão: src/pages/themes/farramedia/public (env: EDGEPRESS_THEME_PUBLIC).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const destDir = path.join(root, "public");

const candidates = process.env.EDGEPRESS_THEME_PUBLIC
  ? [path.resolve(root, process.env.EDGEPRESS_THEME_PUBLIC)]
  : [
      path.join(root, "src/pages/themes/farramedia/public"),
      path.join(root, "src/themes/farramedia/public"),
    ];

const srcDir = candidates.find((p) => fs.existsSync(p));

if (!srcDir) {
  console.warn(`[sync-theme-public] Skip: no theme public dir (tried: ${candidates.join(", ")})`);
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });

for (const name of fs.readdirSync(destDir)) {
  if (name === ".assetsignore") continue;
  fs.rmSync(path.join(destDir, name), { recursive: true, force: true });
}

for (const name of fs.readdirSync(srcDir)) {
  fs.cpSync(path.join(srcDir, name), path.join(destDir, name), { recursive: true });
}

console.log(`[sync-theme-public] ${srcDir} → ${destDir}`);
