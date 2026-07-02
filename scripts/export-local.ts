/**
 * Exporta o ambiente local como um arquivo .edgepress (tar.gz).
 * Uso: npm run export:local
 *
 * Requer que o banco local já exista (rode antes: npm run db:migrate:local).
 * Usa as bindings locais do wrangler (D1, R2, KV) via getPlatformProxy.
 */
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { buildExport, buildExportFilename } from "../src/core/services/edgepress-archive.ts";

async function main(): Promise<void> {
  console.log("Iniciando exportação do ambiente local...");

  const proxy = await getPlatformProxy({ configPath: "wrangler.toml" });

  try {
    const env = proxy.env as {
      DB: D1Database;
      MEDIA_BUCKET: R2Bucket;
      CACHE?: KVNamespace;
    };

    if (!env.DB) {
      throw new Error("Binding DB (D1) não encontrado. Verifique wrangler.toml.");
    }
    if (!env.MEDIA_BUCKET) {
      throw new Error("Binding MEDIA_BUCKET (R2) não encontrado. Verifique wrangler.toml.");
    }

    const db = drizzle(env.DB, { schema });

    console.log("Lendo dados do D1...");
    // Testa a conexão com D1 antes de chamar buildExport
    const testResult = await env.DB.prepare("SELECT COUNT(*) as c FROM sqlite_master").first<{ c: number }>();
    console.log(`D1 OK — ${testResult?.c ?? 0} tabelas encontradas.`);

    console.log("Listando objetos R2 (pode demorar com muitos arquivos)...");
    const listed = await env.MEDIA_BUCKET.list({ limit: 5 });
    console.log(`R2 OK — primeiros ${listed.objects.length} objetos listados (truncated: ${listed.truncated}).`);

    console.log("Iniciando buildExport (D1 + R2 + KV)...");
    const archive = await buildExport(db, env.MEDIA_BUCKET, env.CACHE ?? null);

    const filename = buildExportFilename();
    const outPath = join(process.cwd(), filename);

    // writeFileSync has a 2 GB limit; use streaming write for large archives
    await new Promise<void>((resolve, reject) => {
      const stream = createWriteStream(outPath);
      const CHUNK = 64 * 1024 * 1024; // 64 MB chunks
      let offset = 0;
      function writeNext() {
        while (offset < archive.byteLength) {
          const end = Math.min(offset + CHUNK, archive.byteLength);
          const chunk = archive.subarray(offset, end);
          offset = end;
          const canContinue = stream.write(chunk);
          if (!canContinue) {
            stream.once("drain", writeNext);
            return;
          }
        }
        stream.end();
      }
      stream.on("finish", resolve);
      stream.on("error", reject);
      writeNext();
    });

    const sizeMb = (archive.byteLength / 1024 / 1024).toFixed(1);
    console.log(`\nExportação concluída com sucesso!`);
    console.log(`Arquivo: ${outPath}`);
    console.log(`Tamanho: ${sizeMb} MB`);
  } finally {
    await proxy.dispose();
  }
}

main().catch((err) => {
  console.error("Erro ao exportar:", err);
  process.exit(1);
});
