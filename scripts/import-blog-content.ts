import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { createClient } from "@libsql/client/node";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { marked } from "marked";
import * as schema from "../src/db/schema.ts";
import { ensurePostTypesFromDefaults } from "../src/db/seed.ts";

const WRANGLER_STATE = join(process.cwd(), ".wrangler", "state", "v3", "d1");
const SOURCE_CONTENT_DIR = "/Users/rhamses/Sites/rhams.es/blog/src/data/blog-posts";

type Frontmatter = {
  title: string;
  publishDate: string;
  description: string;
};

function findLocalD1Sqlite(dir: string): string | null {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        const found = findLocalD1Sqlite(full);
        if (found) return found;
      } else if (e.isFile() && e.name.endsWith(".sqlite")) {
        return full;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function parseFrontmatterDocument(content: string): { frontmatter: Frontmatter; body: string } | null {
  if (!content.startsWith("---\n")) return null;
  const end = content.indexOf("\n---\n", 4);
  if (end === -1) return null;

  const rawFrontmatter = content.slice(4, end).trim();
  const body = content.slice(end + 5).trim();
  const values: Record<string, string> = {};

  for (const line of rawFrontmatter.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    values[key] = value;
  }

  const title = values["title"] ?? "";
  const publishDate = values["publishDate"] ?? "";
  const description = values["description"] ?? "";

  if (!title) return null;

  return {
    frontmatter: { title, publishDate, description },
    body,
  };
}

async function main(): Promise<void> {
  const sqlitePath = findLocalD1Sqlite(WRANGLER_STATE);
  if (!sqlitePath) {
    throw new Error(`Banco D1 local não encontrado em ${WRANGLER_STATE}`);
  }

  const files = readdirSync(SOURCE_CONTENT_DIR).filter((name) => {
    const ext = extname(name).toLowerCase();
    return ext === ".md" || ext === ".mdx";
  });

  if (files.length === 0) {
    console.log("Nenhum arquivo .md/.mdx encontrado para import.");
    return;
  }

  const client = createClient({ url: `file:${sqlitePath}` });
  const db = drizzle(client, { schema });

  try {
    const typeIds = await ensurePostTypesFromDefaults(db);
    const postTypeId = typeIds["post"];
    if (!postTypeId) throw new Error("Post type 'post' não encontrado.");

    const [ptBrLocale] = await db
      .select({ id: schema.locales.id })
      .from(schema.locales)
      .where(eq(schema.locales.locale_code, "pt_BR"))
      .limit(1);

    const localeId = ptBrLocale?.id ?? null;
    let importedCount = 0;
    let updatedCount = 0;

    for (const filename of files) {
      const slug = filename.replace(/\.(md|mdx)$/i, "");
      const fullPath = join(SOURCE_CONTENT_DIR, filename);
      const raw = readFileSync(fullPath, "utf-8");
      const parsed = parseFrontmatterDocument(raw);
      if (!parsed) {
        console.warn(`Pulando '${filename}': frontmatter inválido.`);
        continue;
      }

      const bodyHtml = await marked.parse(parsed.body);
      const publishedAt = Number.isNaN(Date.parse(parsed.frontmatter.publishDate))
        ? Date.now()
        : Date.parse(parsed.frontmatter.publishDate);
      const now = Date.now();

      const metaValues = JSON.stringify({
        import_source: "rhams.es/blog/src/data/blog-posts",
        import_publish_date: parsed.frontmatter.publishDate,
      });

      const [existing] = await db
        .select({ id: schema.posts.id })
        .from(schema.posts)
        .where(and(eq(schema.posts.post_type_id, postTypeId), eq(schema.posts.slug, slug)))
        .limit(1);

      if (existing) {
        await db
          .update(schema.posts)
          .set({
            title: parsed.frontmatter.title,
            excerpt: parsed.frontmatter.description,
            body: bodyHtml,
            status: "published",
            meta_values: metaValues,
            id_locale_code: localeId,
            published_at: publishedAt,
            updated_at: now,
          })
          .where(eq(schema.posts.id, existing.id));
        updatedCount += 1;
      } else {
        await db.insert(schema.posts).values({
          post_type_id: postTypeId,
          title: parsed.frontmatter.title,
          slug,
          excerpt: parsed.frontmatter.description,
          body: bodyHtml,
          status: "published",
          meta_values: metaValues,
          id_locale_code: localeId,
          published_at: publishedAt,
          created_at: now,
          updated_at: now,
        });
        importedCount += 1;
      }
    }

    console.log(`Importação concluída. Inseridos: ${importedCount}. Atualizados: ${updatedCount}.`);
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error("Erro ao importar conteúdo do blog:", err);
  process.exit(1);
});
