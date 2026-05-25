/**
 * Renomeia tabelas legadas (sem prefixo edp_) quando ainda existirem.
 * Migrações 0000–0019 já criam edp_* em instalações novas; 0020 só marca o journal.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createClient, type Client } from "@libsql/client/node";

const WRANGLER_STATE = join(process.cwd(), ".wrangler", "state", "v3", "d1");
const WRANGLER_CONFIG = "wrangler.toml";
const DATABASE = "farramedia";

const TABLE_RENAMES: ReadonlyArray<[string, string]> = [
  ["user", "edp_user"],
  ["session", "edp_session"],
  ["account", "edp_account"],
  ["verification", "edp_verification"],
  ["post_types", "edp_post_types"],
  ["posts", "edp_posts"],
  ["taxonomies", "edp_taxonomies"],
  ["posts_taxonomies", "edp_posts_taxonomies"],
  ["posts_media", "edp_posts_media"],
  ["settings", "edp_settings"],
  ["role_capability", "edp_role_capability"],
  ["locales", "edp_locales"],
  ["translations", "edp_translations"],
  ["translations_languages", "edp_translations_languages"],
];

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

async function tableExists(client: Client, name: string): Promise<boolean> {
  const result = await client.execute({
    sql: "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    args: [name],
  });
  return result.rows.length > 0;
}

async function applyRenames(client: Client): Promise<number> {
  let renamed = 0;
  await client.execute("PRAGMA foreign_keys=OFF");
  for (const [legacy, prefixed] of TABLE_RENAMES) {
    const hasLegacy = await tableExists(client, legacy);
    const hasPrefixed = await tableExists(client, prefixed);
    if (!hasLegacy || hasPrefixed) continue;
    await client.execute(`ALTER TABLE \`${legacy}\` RENAME TO \`${prefixed}\``);
    console.log(`[edp-prefix] ${legacy} -> ${prefixed}`);
    renamed += 1;
  }
  await client.execute("PRAGMA foreign_keys=ON");
  return renamed;
}

function applyRenamesRemote(): number {
  let renamed = 0;
  for (const [legacy, prefixed] of TABLE_RENAMES) {
    const checkLegacy = execFileSync(
      "npx",
      [
        "wrangler",
        "d1",
        "execute",
        DATABASE,
        "--remote",
        "--command",
        `SELECT 1 FROM sqlite_master WHERE type='table' AND name='${legacy}' LIMIT 1`,
        "-c",
        WRANGLER_CONFIG,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    if (!checkLegacy.trim()) continue;

    const checkPrefixed = execFileSync(
      "npx",
      [
        "wrangler",
        "d1",
        "execute",
        DATABASE,
        "--remote",
        "--command",
        `SELECT 1 FROM sqlite_master WHERE type='table' AND name='${prefixed}' LIMIT 1`,
        "-c",
        WRANGLER_CONFIG,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    if (checkPrefixed.trim()) continue;

    execFileSync(
      "npx",
      [
        "wrangler",
        "d1",
        "execute",
        DATABASE,
        "--remote",
        "--command",
        `ALTER TABLE \`${legacy}\` RENAME TO \`${prefixed}\``,
        "-c",
        WRANGLER_CONFIG,
      ],
      { stdio: "inherit" },
    );
    console.log(`[edp-prefix] ${legacy} -> ${prefixed}`);
    renamed += 1;
  }
  return renamed;
}

async function main(): Promise<void> {
  const remote = process.argv.includes("--remote");

  if (remote) {
    const renamed = applyRenamesRemote();
    if (renamed === 0) {
      console.log("[edp-prefix] Nenhuma tabela legada para renomear (remoto).");
    }
    return;
  }

  const sqlitePath = findLocalD1Sqlite(WRANGLER_STATE);
  if (!sqlitePath) {
    console.log("[edp-prefix] Banco local ainda não existe; nada a renomear.");
    return;
  }

  const client = createClient({ url: `file:${sqlitePath}` });
  try {
    const renamed = await applyRenames(client);
    if (renamed === 0) {
      console.log("[edp-prefix] Nenhuma tabela legada para renomear (local).");
    }
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error("[edp-prefix] Erro:", err);
  process.exit(1);
});
