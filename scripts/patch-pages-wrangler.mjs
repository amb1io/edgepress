/**
 * O build Astro + @cloudflare/vite-plugin gera dist/server/wrangler.json com campos de
 * Worker (`main`, `rules`, `no_bundle`, etc.) e faz merge do wrangler raiz, onde entra
 * `pages_build_output_dir`. O validador do Cloudflare Pages exige:
 * - não misturar `main` (Worker) com `pages_build_output_dir` (Pages);
 * - não aceitar `main`, `rules`, `no_bundle` neste ficheiro usado no deploy de Pages.
 *
 * O `pages_build_output_dir` continua só no wrangler.jsonc da raiz; aqui ficam bindings
 * e flags compatíveis com Pages Functions.
 *
 * Referência: https://developers.cloudflare.com/pages/functions/wrangler-configuration/
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

/** Chaves permitidas no wrangler usado pelo Pages (além de bindings). */
const allowed = [
  "name",
  "compatibility_date",
  "compatibility_flags",
  "vars",
  "d1_databases",
  "kv_namespaces",
  "r2_buckets",
  "triggers",
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

fs.writeFileSync(wranglerPath, JSON.stringify(out));
console.log(
  "[patch-pages-wrangler] dist/server/wrangler.json reduzido para formato Pages (sem main/rules/no_bundle/pages_build_output_dir)",
);
