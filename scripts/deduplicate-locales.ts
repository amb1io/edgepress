/**
 * Remove locales duplicados no banco D1 local e remapeia FKs.
 * Uso: npm run db:dedupe-locales
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client/node";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../src/db/schema.ts";
import { deduplicateLocales } from "../src/db/deduplicate-locales.ts";

const WRANGLER_STATE = join(process.cwd(), ".wrangler", "state", "v3", "d1");

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
  const sqlitePath = findLocalD1Sqlite(WRANGLER_STATE);
  if (!sqlitePath) {
    console.error(`Banco D1 local não encontrado em ${WRANGLER_STATE}`);
    process.exit(1);
  }

  const client = createClient({ url: `file:${sqlitePath}` });
  const db = drizzle(client, { schema });

  try {
    const { removed } = await deduplicateLocales(db);
    if (removed.length === 0) {
      console.log("Nenhum locale duplicado encontrado.");
    } else {
      console.log(`Locales removidos (${removed.length}): ${removed.join(", ")}`);
    }
  } finally {
    client.close();
  }
}

main();
