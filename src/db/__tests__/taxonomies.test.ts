import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { describe, it, expect, beforeAll } from "vitest";
import { taxonomies } from "../schema.ts";
import { createTestDb } from "./setup.ts";

describe("taxonomies", () => {
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    const { db: testDb } = await createTestDb();
    db = testDb;
  });

  it("should insert and select a taxonomy", async () => {
    const [inserted] = await db
      .insert(taxonomies)
      .values({
        name: "Technology",
        slug: "technology",
        type: "category",
      })
      .returning();

    expect(inserted).toBeDefined();
    expect(inserted?.id).toBe(1);
    expect(inserted?.name).toBe("Technology");
    expect(inserted?.type).toBe("category");
    expect(inserted?.description).toBeNull();

    const [selected] = await db
      .select()
      .from(taxonomies)
      .where(eq(taxonomies.slug, "technology"));

    expect(selected?.name).toBe("Technology");
  });

  it("should insert a taxonomy with description", async () => {
    const [inserted] = await db
      .insert(taxonomies)
      .values({
        name: "Design",
        slug: "design",
        description: "Design-related posts",
        type: "category",
      })
      .returning();

    expect(inserted).toBeDefined();
    expect(inserted?.description).toBe("Design-related posts");
  });
});
