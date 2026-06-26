/**
 * Gera data/posts-en.json a partir de posts-pt.json + en-translations.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { polishBodyHtml } from "./markdown.ts";
import { EN_TRANSLATIONS } from "../data/en-translations.ts";
import type { MigrationData, MigrationPost } from "./types.ts";
import { DATA_DIR, POSTS_EN_JSON, POSTS_PT_JSON } from "./paths.ts";

function main(): void {
  const pt: MigrationData = JSON.parse(readFileSync(POSTS_PT_JSON, "utf8"));
  const enPosts: MigrationPost[] = [];

  for (const post of pt.posts) {
    const tr = EN_TRANSLATIONS[post.slug];
    if (!tr) {
      throw new Error(`Missing EN translation for slug: ${post.slug}`);
    }
    enPosts.push({
      ...post,
      slug: `${post.slug}-en`,
      title: tr.title,
      description: tr.description,
      body_html: polishBodyHtml(tr.body_html),
      translation_key: post.translation_key,
    });
  }

  const en: MigrationData = {
    source: "en-translations.ts",
    extractedAt: new Date().toISOString(),
    posts: enPosts,
  };

  writeFileSync(POSTS_EN_JSON, JSON.stringify(en, null, 2), "utf8");
  console.log(`[build-posts-en] ${enPosts.length} posts → ${POSTS_EN_JSON}`);
}

main();
