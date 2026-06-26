/**
 * Gera HTML em `body` a partir de `body_blocks` para posts que ainda não têm corpo HTML.
 * Uso: tsx scripts/backfill-post-body-html.ts
 */
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db/index.ts";
import { posts } from "../src/db/schema.ts";

async function main() {
  const rows = await db
    .select({
      id: posts.id,
      body: posts.body,
      body_blocks: posts.body_blocks,
    })
    .from(posts)
    .where(
      sql`(${posts.body} IS NULL OR trim(${posts.body}) = '') AND ${posts.body_blocks} IS NOT NULL AND trim(${posts.body_blocks}) != '' AND trim(${posts.body_blocks}) != '[]'`,
    );

  let updated = 0;
  for (const row of rows) {
    const blocksRaw = String(row.body_blocks ?? "").trim();
    if (!blocksRaw) continue;
    try {
      const blocks = JSON.parse(blocksRaw) as unknown;
      if (!Array.isArray(blocks) || blocks.length === 0) continue;
      // Fallback mínimo: serializa blocos de texto para HTML simples até o admin re-salvar com BlockNote.
      const textParts: string[] = [];
      for (const block of blocks) {
        const content = (block as { content?: Array<{ text?: string }> })?.content;
        if (Array.isArray(content)) {
          const text = content.map((c) => c.text ?? "").join("");
          if (text.trim()) textParts.push(`<p>${escapeHtml(text.trim())}</p>`);
        }
      }
      const html = textParts.join("\n");
      if (!html) continue;
      await db
        .update(posts)
        .set({ body: html, updated_at: Date.now() })
        .where(eq(posts.id, row.id));
      updated += 1;
    } catch {
      // ignora blocos inválidos
    }
  }

  console.log(`[backfill-post-body-html] Updated ${updated} post(s)`);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
