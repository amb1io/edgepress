/**
 * O build Astro + @cloudflare/vite-plugin gera dist/server/wrangler.json com merge do
 * wrangler.toml + defaults do adapter (`assets` com ASSETS, `pages_build_output_dir`, etc.).
 *
 * - Cloudflare **Pages**: não declarar `assets` com binding ASSETS (reservado); o ficheiro
 *   em dist não deve misturar `pages_build_output_dir` com o mesmo conteúdo que o Worker.
 * - `wrangler deploy` (CLI): **precisa** de `main` (ex.: entry.mjs) — não pode ser removido.
 *
 * Removemos só o que quebra Pages ou é redundante; mantemos `main` e `images` do merge.
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
const src = JSON.parse(raw);

const allowed = [
  "name",
  "main",
  "compatibility_date",
  "compatibility_flags",
  "vars",
  "d1_databases",
  "kv_namespaces",
  "r2_buckets",
  "triggers",
  "images",
];

const out = {};
for (const key of allowed) {
  if (!(key in src)) continue;
  if (key === "triggers") {
    const crons = Array.isArray(src.triggers?.crons) ? src.triggers.crons : [];
    out.triggers = { crons };
    continue;
  }
  out[key] = src[key];
}

// Nunca declarar assets no merge: Pages reserva ASSETS; o runtime injeta.
// `pages_build_output_dir` fica só no wrangler.toml da raiz.
delete out.assets;
delete out.pages_build_output_dir;

fs.writeFileSync(wranglerPath, JSON.stringify(out));
console.log(
  "[patch-pages-wrangler] dist/server/wrangler.json: sem assets ASSETS; mantém main para wrangler deploy",
);
