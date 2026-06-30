/**
 * Executa migrações e seed durante o build.
 * - Local (sem CI): setup:local (migrate + seed).
 * - CI (GitHub Actions etc.): setup:remote (migrate + seed).
 *
 * Uso: tsx scripts/build-with-seed.ts (chamado pelo npm run build:seed).
 */
import { execSync } from "node:child_process";

const isCI = process.env.CI === "true";

function run(cmd: string, description: string): void {
  console.log(`[build-with-seed] ${description}...`);
  execSync(cmd, { stdio: "inherit", cwd: process.cwd() });
}

try {
  if (isCI) {
    run("npm run setup:remote", "Remote setup (migrate + seed)");
  } else {
    run("npm run setup:local", "Local setup (migrate + seed)");
  }
} catch (err) {
  console.error("[build-with-seed] Error:", err);
  process.exit(1);
}
