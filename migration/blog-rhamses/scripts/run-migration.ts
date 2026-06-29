/**
 * Orquestrador da migração blog.rhamses.com.br → Edgepress
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { MIGRATION_SQL } from "./paths.ts";

function run(script: string): void {
  console.log(`\n=== ${script} ===\n`);
  execSync(`npx tsx migration/blog-rhamses/scripts/${script}`, {
    stdio: "inherit",
    cwd: process.cwd(),
  });
}

function main(): void {
  run("1-extract-posts.ts");
  run("build-posts-en.ts");
  run("2-generate-sql.ts");
  run("3-upload-images.ts");
  run("4-seed-theme.ts");

  if (!existsSync(MIGRATION_SQL)) {
    console.error(`[migrate] SQL not found: ${MIGRATION_SQL}`);
    process.exit(1);
  }

  console.log("\n=== Applying SQL to local D1 ===\n");
  execSync(
    `npx wrangler d1 execute DB --local --file=${JSON.stringify(MIGRATION_SQL)} -c wrangler.toml`,
    { stdio: "inherit", cwd: process.cwd() },
  );

  console.log("\n[migrate] Blog migration complete. Run: npm run dev");
}

main();
