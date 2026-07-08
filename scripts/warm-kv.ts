/**
 * Pré-popula o cache KV (tema, settings, menus, taxonomias).
 *
 * Uso:
 *   npx tsx scripts/warm-kv.ts          # ambiente local (wrangler state)
 *   npx tsx scripts/warm-kv.ts --remote # ambiente remoto publicado
 */
import { getPlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { warmKvCache } from "../src/core/services/kv-warmup.ts";

async function main(): Promise<void> {
  const remote = process.argv.includes("--remote");
  console.log(`Iniciando KV warm-up (${remote ? "remote" : "local"})...`);

  const proxy = await getPlatformProxy({
    configPath: "wrangler.toml",
    ...(remote ? { remote: true } : {}),
  });

  try {
    const env = proxy.env as {
      DB: D1Database;
      MEDIA_BUCKET?: R2Bucket;
      CACHE?: KVNamespace;
    };

    if (!env.DB) {
      throw new Error("Binding DB (D1) não encontrado.");
    }
    if (!env.CACHE) {
      throw new Error("Binding CACHE (KV) não encontrado.");
    }

    const db = drizzle(env.DB, { schema });
    const kv = env.CACHE as unknown as import("../src/utils/runtime-locals.ts").KVLike;
    const bucket = env.MEDIA_BUCKET ?? null;

    const result = await warmKvCache(db, kv, bucket);
    console.log(JSON.stringify({ ok: true, result }, null, 2));
  } finally {
    await proxy.dispose();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
