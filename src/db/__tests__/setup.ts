import { createClient } from "@libsql/client/node";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import {
  postTypes,
  posts,
  taxonomies,
  postsTaxonomies,
  postsMedia,
  user,
  session,
  account,
  verification,
} from "../schema.ts";

export type TestDb = ReturnType<typeof drizzle>;

export async function createTestDb(): Promise<{
  client: ReturnType<typeof createClient>;
  db: TestDb;
}> {
  const client = createClient({ url: ":memory:" });
  const db = drizzle(client, {
    schema: {
      postTypes,
      posts,
      taxonomies,
      postsTaxonomies,
      postsMedia,
      user,
      session,
      account,
      verification,
    },
  });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { client, db };
}
