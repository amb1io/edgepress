import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client/node";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../../../db/schema.ts";

const SCHEMA_PATH = join(
  import.meta.dirname,
  "fixtures",
  "import-export-schema.sql",
);

export async function applyArchiveTestSchema(client: Client): Promise<void> {
  const sql = readFileSync(SCHEMA_PATH, "utf8");
  await client.executeMultiple(sql);
}

export async function createArchiveTestDb() {
  const client = createClient({ url: ":memory:" });
  await applyArchiveTestSchema(client);
  const db = drizzle(client, { schema });
  return { client, db };
}

export type ArchiveTestDb = Awaited<ReturnType<typeof createArchiveTestDb>>["db"];
