/**
 * Cloudflare Pages não aceita a chave `assets` no wrangler raiz nem declaração
 * do binding ASSETS no wrangler gerado — a plataforma injeta `env.ASSETS` sozinha.
 * O adapter Astro adiciona `assets` ao dist/server/wrangler.json; removemos após o build.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const wranglerPath = path.join(root, "dist", "server", "wrangler.json");

if (!fs.existsSync(wranglerPath)) {
  console.warn("[patch-pages-wrangler] dist/server/wrangler.json missing, skip");
  process.exit(0);
}

const raw = fs.readFileSync(wranglerPath, "utf8");
const obj = JSON.parse(raw);
if (!("assets" in obj)) {
  console.log("[patch-pages-wrangler] no assets key, skip");
  process.exit(0);
}

delete obj.assets;
fs.writeFileSync(wranglerPath, JSON.stringify(obj));
console.log("[patch-pages-wrangler] removed assets from dist/server/wrangler.json");
