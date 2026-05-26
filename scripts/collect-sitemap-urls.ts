/**
 * Coleta URLs do sitemap a partir do D1 local e grava src/generated/sitemap-urls.json
 * para @astrojs/sitemap (customPages) no build.
 */
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client/node";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../src/db/schema.ts";
import { getSitemapAbsoluteUrls } from "../src/utils/services/sitemap-service.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WRANGLER_STATE = join(root, ".wrangler", "state", "v3", "d1");
const OUT_DIR = join(root, "src", "generated");
const OUT_FILE = join(OUT_DIR, "sitemap-urls.json");

function findLocalD1Sqlite(dir: string): string | null {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        const found = findLocalD1Sqlite(full);
        if (found) return found;
      } else if (e.isFile() && e.name.endsWith(".sqlite")) {
        return full;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const sqlitePath = findLocalD1Sqlite(WRANGLER_STATE);
  if (!sqlitePath) {
    console.warn(
      "[collect-sitemap-urls] Banco D1 local não encontrado; gravando lista vazia.",
    );
    writeFileSync(OUT_FILE, "[]\n", "utf8");
    return;
  }

  const client = createClient({ url: `file:${sqlitePath}` });
  const db = drizzle(client, { schema });

  try {
    const urls = await getSitemapAbsoluteUrls(db);
    writeFileSync(OUT_FILE, `${JSON.stringify(urls, null, 2)}\n`, "utf8");
    console.log(`[collect-sitemap-urls] ${urls.length} URL(s) → ${OUT_FILE}`);
  } catch (err) {
    console.warn("[collect-sitemap-urls] Erro ao coletar URLs:", err);
    writeFileSync(OUT_FILE, "[]\n", "utf8");
  } finally {
    client.close();
  }
}

main();
