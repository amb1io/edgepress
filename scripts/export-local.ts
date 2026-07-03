/**
 * Exporta o ambiente local como um arquivo .edgepress (tar.gz) ou bundle .zip multi-parte.
 * Uso: npx tsx scripts/export-local.ts
 *
 * Requer que o banco local já exista (rode antes: npm run db:migrate:local).
 * Usa as bindings locais do wrangler (D1, R2, KV) via getPlatformProxy.
 */
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import {
  buildExportBundleZip,
  buildExportParts,
  buildExportBundleFilename,
} from "../src/core/services/edgepress-archive.ts";

async function writeBufferStreaming(outPath: string, data: Uint8Array): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(outPath);
    const CHUNK = 64 * 1024 * 1024;
    let offset = 0;
    function writeNext() {
      while (offset < data.byteLength) {
        const end = Math.min(offset + CHUNK, data.byteLength);
        const chunk = data.subarray(offset, end);
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
}

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
    const testResult = await env.DB.prepare("SELECT COUNT(*) as c FROM sqlite_master").first<{ c: number }>();
    console.log(`D1 OK — ${testResult?.c ?? 0} tabelas encontradas.`);

    console.log("Listando objetos R2 (pode demorar com muitos arquivos)...");
    const listed = await env.MEDIA_BUCKET.list({ limit: 5 });
    console.log(`R2 OK — primeiros ${listed.objects.length} objetos listados (truncated: ${listed.truncated}).`);

    console.log("Iniciando buildExportParts (D1 + R2 + KV)...");
    const parts = await buildExportParts(db, env.MEDIA_BUCKET, env.CACHE ?? null);
    const cwd = process.cwd();

    if (parts.length === 1) {
      const part = parts[0]!;
      const outPath = join(cwd, part.filename);
      await writeBufferStreaming(outPath, part.data);
      const sizeMb = (part.data.byteLength / 1024 / 1024).toFixed(1);
      console.log(`\nExportação concluída com sucesso!`);
      console.log(`Arquivo: ${outPath}`);
      console.log(`Tamanho: ${sizeMb} MB`);
      return;
    }

    for (const part of parts) {
      const partPath = join(cwd, part.filename);
      await writeBufferStreaming(partPath, part.data);
      const sizeMb = (part.data.byteLength / 1024 / 1024).toFixed(1);
      console.log(`Parte gravada: ${partPath} (${sizeMb} MB)`);
    }

    const zipData = buildExportBundleZip(parts);
    const zipPath = join(cwd, buildExportBundleFilename());
    await writeBufferStreaming(zipPath, zipData);
    const zipMb = (zipData.byteLength / 1024 / 1024).toFixed(1);

    console.log(`\nExportação multi-parte concluída!`);
    console.log(`Zip: ${zipPath} (${zipMb} MB, ${parts.length} partes)`);
  } finally {
    await proxy.dispose();
  }
}

main().catch((err) => {
  console.error("Erro ao exportar:", err);
  process.exit(1);
});
