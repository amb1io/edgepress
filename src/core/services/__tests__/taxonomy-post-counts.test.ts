import { createClient } from "@libsql/client/node";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, it, expect, beforeAll } from "vitest";
import {
  postTypes,
  posts,
  taxonomies,
  postsTaxonomies,
  user,
  defaultMetaSchema,
} from "../../../db/schema.ts";
import {
  getPostCountsByTermIds,
  resolveListPostTypeForTaxonomy,
} from "../taxonomy-service.ts";
import { withTaxonomyInMetaSchema } from "../taxonomy-type-registry.ts";

describe("taxonomy post counts", () => {
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    const client = createClient({ url: ":memory:" });
    db = drizzle(client, {
      schema: { postTypes, posts, taxonomies, postsTaxonomies, user },
    });
    await migrate(db, { migrationsFolder: "./drizzle" });
    const now = Date.now();

    const jobsMetaSchema = withTaxonomyInMetaSchema(
      Array.isArray(defaultMetaSchema) ? defaultMetaSchema : [],
      ["category", "genero"],
    );

    await db.insert(postTypes).values([
      {
        slug: "post",
        name: "Post",
        meta_schema: defaultMetaSchema,
        created_at: now,
        updated_at: now,
      },
      {
        slug: "jobs",
        name: "Jobs",
        meta_schema: jobsMetaSchema,
        created_at: now,
        updated_at: now,
      },
    ]);

    await db.insert(user).values({
      id: "user-1",
      name: "Author",
      email: "author@example.com",
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(taxonomies).values([
      {
        id: 10,
        name: "Root",
        slug: "root",
        type: "category",
        parent_id: null,
        created_at: now,
        updated_at: now,
      },
      {
        id: 11,
        name: "Drama",
        slug: "drama",
        type: "category",
        parent_id: 10,
        created_at: now,
        updated_at: now,
      },
      {
        id: 12,
        name: "Genero Root",
        slug: "genero-root",
        type: "genero",
        parent_id: null,
        created_at: now,
        updated_at: now,
      },
      {
        id: 13,
        name: "Ação",
        slug: "acao",
        type: "genero",
        parent_id: 12,
        created_at: now,
        updated_at: now,
      },
    ]);

    await db.insert(posts).values([
      {
        id: 1,
        post_type_id: 1,
        author_id: "user-1",
        title: "Linked 1",
        slug: "linked-1",
        status: "published",
        created_at: now,
        updated_at: now,
      },
      {
        id: 2,
        post_type_id: 1,
        author_id: "user-1",
        title: "Linked 2",
        slug: "linked-2",
        status: "published",
        created_at: now,
        updated_at: now,
      },
      {
        id: 3,
        post_type_id: 1,
        author_id: "user-1",
        title: "Trash",
        slug: "trash",
        status: "trash",
        created_at: now,
        updated_at: now,
      },
      {
        id: 4,
        post_type_id: 1,
        author_id: "user-1",
        title: "Unlinked",
        slug: "unlinked",
        status: "published",
        created_at: now,
        updated_at: now,
      },
    ]);

    await db.insert(postsTaxonomies).values([
      { post_id: 1, term_id: 11 },
      { post_id: 2, term_id: 11 },
      { post_id: 3, term_id: 11 },
    ]);
  });

  it("counts posts per term excluding trash", async () => {
    const counts = await getPostCountsByTermIds(db, [11, 13]);
    expect(counts.get(11)).toBe(2);
    expect(counts.get(13)).toBeUndefined();
  });

  it("resolves post type slug from taxonomy configuration", async () => {
    await expect(resolveListPostTypeForTaxonomy(db, "genero")).resolves.toBe("jobs");
    await expect(resolveListPostTypeForTaxonomy(db, "category")).resolves.toBe("post");
    await expect(resolveListPostTypeForTaxonomy(db, "unknown")).resolves.toBe("post");
  });
});
