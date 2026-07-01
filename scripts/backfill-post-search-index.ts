/**
 * Popula o índice FTS5 para todos os posts elegíveis.
 * Uso: npm run db:backfill:search
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client/node";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../src/db/schema.ts";
import { backfillAllSearchIndexes } from "../src/core/services/search-service.ts";
import type { Database } from "../src/shared/types/database.ts";

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
    console.error(`
⚠️  Banco D1 local não encontrado em ${WRANGLER_STATE}

Rode antes:

  npm run db:migrate:local
  npm run db:backfill:search
`);
    process.exit(1);
  }

  const client = createClient({ url: `file:${sqlitePath}` });
  const db = drizzle(client, { schema }) as unknown as Database;

  try {
    console.log("[db:backfill:search] Indexando posts...");
    const count = await backfillAllSearchIndexes(db);
    console.log(`[db:backfill:search] Concluído: ${count} post(s) indexado(s).`);
  } catch (err) {
    console.error("[db:backfill:search] Erro:", err);
    process.exit(1);
  } finally {
    client.close();
  }
}

main();
