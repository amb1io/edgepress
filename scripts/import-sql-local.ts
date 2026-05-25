/**
 * Executa um arquivo .sql no banco D1 local (.wrangler).
 * Usa sqlite3 direto — wrangler d1 execute ignora PRAGMA foreign_keys em batch.
 *
 * Uso: tsx scripts/import-sql-local.ts drizzle/seed/import-farramedia-edgepress.sql
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";

const WRANGLER_STATE = join(process.cwd(), ".wrangler", "state", "v3", "d1");

function findLocalD1Sqlite(dir: string): string | null {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = findLocalD1Sqlite(full);
        if (found) return found;
      } else if (entry.isFile() && entry.name.endsWith(".sqlite")) {
        return full;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

const sqlArg = process.argv[2] ?? "drizzle/seed/import-farramedia-edgepress.sql";
const sqlPath = resolve(process.cwd(), sqlArg);

if (!existsSync(sqlPath)) {
  console.error(`Arquivo não encontrado: ${sqlPath}`);
  process.exit(1);
}

const sqlitePath = findLocalD1Sqlite(WRANGLER_STATE);
if (!sqlitePath) {
  console.error(`Banco D1 local não encontrado. Rode: npm run db:migrate:local`);
  process.exit(1);
}

const sql = readFileSync(sqlPath, "utf8");
execSync(`sqlite3 ${JSON.stringify(sqlitePath)}`, { input: sql, stdio: ["pipe", "inherit", "inherit"] });

console.log(`Import concluído: ${sqlPath}`);
