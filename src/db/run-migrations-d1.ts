/**
 * Aplica migrações Drizzle no D1 quando o banco existe mas as tabelas ainda não foram criadas.
 * Usado no setup inicial antes de criar o usuário e rodar o seed.
 *
 * As migrações são importadas em build time (Vite inclui no bundle).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D1Database = any;

import journal from "../../drizzle/meta/_journal.json" with { type: "json" };
import m0 from "../../drizzle/0000_outgoing_blink.sql?raw";
import m1 from "../../drizzle/0001_quiet_dust.sql?raw";
import m2 from "../../drizzle/0002_parallel_leper_queen.sql?raw";
import m3 from "../../drizzle/0003_right_jasper_sitwell.sql?raw";
import m4 from "../../drizzle/0004_red_whirlwind.sql?raw";
import m5 from "../../drizzle/0005_bitter_thaddeus_ross.sql?raw";
import m6 from "../../drizzle/0006_add_taxonomies_description.sql?raw";
import m7 from "../../drizzle/0007_add_user_role.sql?raw";
import m8 from "../../drizzle/0008_typical_hellfire_club.sql?raw";
import m9 from "../../drizzle/0009_user_role_integer.sql?raw";
import m10 from "../../drizzle/0010_rename_type_id_to_post_type_id.sql?raw";
import m11 from "../../drizzle/0011_steep_mockingbird.sql?raw";

const STATEMENT_BREAKPOINT = "--> statement-breakpoint";

const migrationSql: string[] = [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11];

interface JournalEntry {
  tag: string;
  when: number;
}
const entries = (journal as { entries: JournalEntry[] }).entries;

function splitStatements(sql: string): string[] {
  return sql
    .split(STATEMENT_BREAKPOINT)
    .map((s) => s.trim())
    .filter(Boolean);
}

const MIGRATIONS_TABLE = "__drizzle_migrations";

/**
 * Cria a tabela de controle de migrações no D1 (SQLite).
 */
async function ensureMigrationsTable(d1: D1Database): Promise<void> {
  const sql = `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at INTEGER
    )`;
  await d1.prepare(sql).run();
}

/**
 * Retorna o último created_at aplicado ou 0.
 */
async function getLastMigrationTime(d1: D1Database): Promise<number> {
  const r = (await d1
    .prepare(
      `SELECT created_at FROM ${MIGRATIONS_TABLE} ORDER BY created_at DESC LIMIT 1`
    )
    .first()) as { created_at: number } | null;
  return r?.created_at ?? 0;
}

/**
 * Verifica se o schema já foi aplicado (ex.: por wrangler d1 migrations apply).
 * Se tabelas como post_types ou settings existirem, consideramos que as migrações já rodaram.
 */
async function isSchemaAlreadyApplied(d1: D1Database): Promise<boolean> {
  try {
    const r = await d1
      .prepare(
        `SELECT 1 FROM sqlite_master WHERE type='table' AND name IN ('post_types','settings') LIMIT 1`
      )
      .first();
    return r != null;
  } catch {
    return false;
  }
}

/**
 * Marca todas as migrações do journal como aplicadas em __drizzle_migrations.
 * Usado quando o schema já existe (ex.: migrado via wrangler) para evitar reexecução.
 */
async function markAllMigrationsApplied(d1: D1Database): Promise<void> {
  const maxWhen = Math.max(...entries.map((e) => e.when));
  const lastEntry = entries[entries.length - 1];
  const hash = `${lastEntry?.tag ?? "unknown"}-${maxWhen}`;
  await d1
    .prepare(
      `INSERT INTO ${MIGRATIONS_TABLE} (hash, created_at) VALUES (?, ?)`
    )
    .bind(hash, maxWhen)
    .run();
}

/**
 * Aplica as migrações pendentes no D1.
 * Idempotente: só aplica migrações com when > último aplicado.
 * Se o schema já existir (ex.: migrado via wrangler d1 migrations apply), apenas sincroniza
 * a tabela de controle e não tenta recriar tabelas.
 */
export async function runMigrationsIfNeeded(d1: D1Database): Promise<void> {
  await ensureMigrationsTable(d1);
  let lastWhen = await getLastMigrationTime(d1);

  if (lastWhen === 0 && (await isSchemaAlreadyApplied(d1))) {
    await markAllMigrationsApplied(d1);
    return;
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || entry.when <= lastWhen) continue;

    const sql = migrationSql[i];
    if (!sql) continue;

    const statements = splitStatements(sql);
    for (const stmt of statements) {
      if (!stmt) continue;
      await d1.prepare(stmt).run();
    }

    const hash = `${entry.tag}-${entry.when}`;
    await d1
      .prepare(
        `INSERT INTO ${MIGRATIONS_TABLE} (hash, created_at) VALUES (?, ?)`
      )
      .bind(hash, entry.when)
      .run();
  }
}
