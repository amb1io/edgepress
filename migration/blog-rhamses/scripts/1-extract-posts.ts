/**
 * Extrai posts MDX do blog fonte → data/posts-pt.json
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { mdxBodyToHtml } from "./markdown.ts";
import type { MigrationData, MigrationImage, MigrationPost } from "./types.ts";
import {
  BLOG_POSTS_DIR,
  DATA_DIR,
  IMAGES_DIR,
  MEDIA_UPLOAD_PREFIX,
  POSTS_PT_JSON,
} from "./paths.ts";

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    const m = line.match(/^(\w+):\s*"?(.+?)"?\s*$/);
    if (m) meta[m[1]!] = m[2]!.replace(/^"|"$/g, "");
  }
  return { meta, body: match[2]! };
}

function guessMime(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

const IMAGE_SLUG_ALIASES: Record<string, string> = {
  "identificando-idiomas-através-do-javascript": "identificando-idiomas-atraves-do-javascript",
};

function imageDirSlug(slug: string): string {
  return IMAGE_SLUG_ALIASES[slug] ?? slug;
}

function collectImagesForSlug(slug: string): MigrationImage[] {
  const images: MigrationImage[] = [];
  const dirSlug = imageDirSlug(slug);
  const slugDir = join(IMAGES_DIR, dirSlug);
  const rootFiles = readdirSync(IMAGES_DIR, { withFileTypes: true });

  function addFile(filePath: string, relativePath: string): void {
    const filename = basename(filePath);
    const r2Key = `${MEDIA_UPLOAD_PREFIX}/${relativePath}`;
    images.push({
      filename,
      relativePath,
      r2Key,
      mediaUrl: `/api/media/${r2Key}`,
      mimeType: guessMime(filename),
    });
  }

  if (existsSync(slugDir)) {
    for (const entry of readdirSync(slugDir, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name.startsWith(".")) continue;
      addFile(join(slugDir, entry.name), `${dirSlug}/${entry.name}`);
    }
  }

  for (const entry of rootFiles) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (name.startsWith(".")) continue;
    if (name.startsWith(slug) || name.startsWith(dirSlug)) {
      addFile(join(IMAGES_DIR, name), name);
    }
  }

  return images;
}

function pickCover(images: MigrationImage[], slug: string): MigrationImage | undefined {
  const dirSlug = imageDirSlug(slug);
  const inSlug = images.filter((i) => i.relativePath.startsWith(`${dirSlug}/`));
  return (
    inSlug.find((i) => i.filename === "capa.webp") ??
    inSlug.find((i) => i.filename === "capa.jpg") ??
    images.find((i) => i.filename.includes("capa"))
  );
}

function parsePublishDate(value: string): number {
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? Date.now() : ts;
}

function extractPosts(): MigrationData {
  const files = readdirSync(BLOG_POSTS_DIR).filter((f) => extname(f) === ".mdx");
  const posts: MigrationPost[] = [];

  for (const file of files) {
    const slug = basename(file, extname(file));
    const raw = readFileSync(join(BLOG_POSTS_DIR, file), "utf8");
    const { meta, body } = parseFrontmatter(raw);
    const images = collectImagesForSlug(slug);
    const coverImage = pickCover(images, slug);

    posts.push({
      slug,
      title: meta.title ?? slug,
      description: meta.description ?? "",
      publishDate: meta.publishDate ?? "",
      publishedAt: parsePublishDate(meta.publishDate ?? ""),
      body_html: mdxBodyToHtml(body, MEDIA_UPLOAD_PREFIX),
      images,
      coverImage,
      translation_key: slug,
    });
  }

  posts.sort((a, b) => b.publishedAt - a.publishedAt);

  return {
    source: BLOG_POSTS_DIR,
    extractedAt: new Date().toISOString(),
    posts,
  };
}

function main(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  const data = extractPosts();
  writeFileSync(POSTS_PT_JSON, JSON.stringify(data, null, 2), "utf8");
  console.log(`[extract] ${data.posts.length} posts → ${POSTS_PT_JSON}`);
}

main();
