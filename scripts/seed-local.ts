/**
 * Executa o seed no banco D1 local.
 * Uso: npm run setup:local
 *
 * Requer que o banco local já exista (rode antes: npm run setup:local).
 * Usa o arquivo SQLite em .wrangler/state/v3/d1/ gerado pelo wrangler.
 */
import { readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { createClient } from "@libsql/client/node";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../src/db/schema.ts";
import { runSeed } from "../src/db/seed.ts";
import { SHOWCASE_ATTACHMENT } from "../src/db/seed-data.ts";

const WRANGLER_STATE = join(process.cwd(), ".wrangler", "state", "v3", "d1");
const SHOWCASE_MEDIA_FILE = join(process.cwd(), "drizzle", "seed", "assets", "hello-world.svg");

function uploadShowcaseMediaLocal(): void {
  const r2Key = SHOWCASE_ATTACHMENT.path.replace(/^\//, "");
  console.log(`[db:seed] Enviando mídia de demonstração para R2 local (${r2Key})...`);
  execSync(
    `npx wrangler r2 object put ${JSON.stringify(`edgepress-media/${r2Key}`)} --file=${JSON.stringify(SHOWCASE_MEDIA_FILE)} --content-type=${JSON.stringify(SHOWCASE_ATTACHMENT.mime_type)} --local -c wrangler.toml`,
    { stdio: "inherit", cwd: process.cwd() },
  );
}

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

Rode antes o setup local:

  npm run setup:local
`);
    process.exit(1);
  }

  const url = `file:${sqlitePath}`;
  const client = createClient({ url });
  const db = drizzle(client, { schema });

  try {
    console.log("Executando seed no banco local...");
    await runSeed(db);
    uploadShowcaseMediaLocal();
    console.log("Seed concluído com sucesso.");
  } catch (err) {
    console.error("Erro ao executar seed:", err);
    process.exit(1);
  } finally {
    client.close();
  }
}

main();
