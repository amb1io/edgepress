/**
 * Envia imagens de migration/blog-rhamses/images/ para R2 local
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { IMAGES_DIR, MEDIA_UPLOAD_PREFIX } from "./paths.ts";

const R2_BUCKET = "edgepress-media";

function guessContentType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function walkFiles(dir: string, base = dir): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(full, base));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function uploadFile(filePath: string): void {
  const relative = filePath.slice(IMAGES_DIR.length + 1).replace(/\\/g, "/");
  const r2Key = `${MEDIA_UPLOAD_PREFIX}/${relative}`;
  const contentType = guessContentType(relative);

  execSync(
    `npx wrangler r2 object put ${JSON.stringify(`${R2_BUCKET}/${r2Key}`)} --file=${JSON.stringify(filePath)} --content-type=${JSON.stringify(contentType)} --local -c wrangler.toml`,
    { stdio: "inherit", cwd: process.cwd() },
  );
}

function main(): void {
  if (!existsSync(IMAGES_DIR)) {
    console.error(`[upload-images] Images dir not found: ${IMAGES_DIR}`);
    process.exit(1);
  }

  const files = walkFiles(IMAGES_DIR).filter((f) => statSync(f).isFile());
  console.log(`[upload-images] Uploading ${files.length} files to R2 local...`);

  for (const file of files) {
    console.log(`  → ${file.replace(IMAGES_DIR + "/", "")}`);
    uploadFile(file);
  }

  console.log("[upload-images] Done.");
}

main();
