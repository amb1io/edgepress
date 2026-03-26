/**
 * Executa migrações e seed durante o build.
 * - Local (sem CI): migrate local + seed local (Node/tsx).
 * - CI (Cloudflare Pages etc.): migrate remote + seed remote (wrangler d1 execute).
 *
 * Uso: tsx scripts/build-with-seed.ts (chamado pelo npm run build).
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const isCI = process.env.CI === "true" || process.env.CF_PAGES === "1";
const seedRemoteFile = join(process.cwd(), "drizzle", "seed", "seed-remote.sql");

function run(cmd: string, description: string): void {
  console.log(`[build-with-seed] ${description}...`);
  execSync(cmd, { stdio: "inherit", cwd: process.cwd() });
}

try {
  if (isCI) {
    run(
      "npx wrangler d1 migrations apply edgepress --remote -c wrangler.toml",
      "Migrating remote D1"
    );
    run("npm run db:seed:generate-sql", "Generating seed SQL from seed-data");
    if (existsSync(seedRemoteFile)) {
      run(
        "npx wrangler d1 execute edgepress --remote --file=./drizzle/seed/seed-remote.sql -c wrangler.toml",
        "Seeding remote D1"
      );
    }
  } else {
    run(
      "npx wrangler d1 migrations apply edgepress --local -c wrangler.toml",
      "Migrating local D1"
    );
    run("npm run db:seed", "Seeding local D1");
  }
} catch (err) {
  console.error("[build-with-seed] Error:", err);
  process.exit(1);
}
