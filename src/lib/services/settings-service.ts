import { eq, inArray } from "drizzle-orm";
import { settings as settingsTable } from "../../db/schema.ts";
import type { Database } from "../types/database.ts";
import type { KVLike } from "../utils/runtime-locals.ts";

/** Chaves permitidas para atualização em lote (PATCH). */
export const ALLOWED_PATCH_KEYS = ["site_name", "site_description", "setup_done"] as const;

export type SettingRecord = {
  id: number;
  name: string;
  value: string;
  autoload: boolean;
};

export type SettingCreatePayload = {
  name: string;
  value: string;
  autoload?: boolean;
};

export type SettingUpdatePayload = {
  name: string;
  value: string;
  autoload: boolean;
};

/**
 * Busca settings no banco: por nomes específicos ou todas com autoload.
 */
export async function getSettingsFromDb(
  db: Database,
  options: { names?: string[] | null }
): Promise<Record<string, string>> {
  const { names } = options;
  const rows =
    names && names.length > 0
      ? await db
          .select({ name: settingsTable.name, value: settingsTable.value })
          .from(settingsTable)
          .where(inArray(settingsTable.name, names))
      : await db
          .select({ name: settingsTable.name, value: settingsTable.value })
          .from(settingsTable)
          .where(eq(settingsTable.autoload, true));

  return Object.fromEntries(rows.map((r) => [r.name, r.value]));
}

/**
 * Busca settings com cache KV: não autenticado usa KV primeiro e grava no KV após leitura do DB.
 */
export async function getSettingsWithCache(
  db: Database,
  options: {
    namesParam: string | null;
    kv: KVLike | null;
    isAuthenticated: boolean;
  }
): Promise<Record<string, string>> {
  const { namesParam, kv, isAuthenticated } = options;
  const cacheKey = `settings:${namesParam ?? "autoload"}`;
  const names = namesParam
    ? namesParam.split(",").map((n) => n.trim()).filter(Boolean)
    : null;

  if (!isAuthenticated && kv) {
    try {
      const cached = (await kv.get(cacheKey, "json")) as Record<string, string> | null;
      if (cached != null && typeof cached === "object") {
        return cached;
      }
    } catch {
      // Ignora erro de KV e segue para o banco
    }
  }

  const record = await getSettingsFromDb(db, { names });

  if (!isAuthenticated && kv && Object.keys(record).length > 0) {
    try {
      await kv.put(cacheKey, JSON.stringify(record));
    } catch {
      // Não falha a resposta se o KV não aceitar o put
    }
  }

  return record;
}

/**
 * Cria um novo registro em settings.
 */
export async function createSetting(
  db: Database,
  payload: SettingCreatePayload
): Promise<{ id: number }> {
  const [inserted] = await db
    .insert(settingsTable)
    .values({
      name: payload.name,
      value: payload.value,
      autoload: payload.autoload ?? true,
    })
    .returning({ id: settingsTable.id });

  if (!inserted?.id) {
    throw new Error("Failed to create setting");
  }
  return { id: inserted.id };
}

/**
 * Atualiza vários settings por nome (apenas chaves permitidas).
 */
export async function updateSettingsByKeys(
  db: Database,
  body: Record<string, string>,
  allowedKeys: readonly string[] = ALLOWED_PATCH_KEYS
): Promise<void> {
  for (const key of Object.keys(body)) {
    if (!allowedKeys.includes(key)) continue;
    const value = String(body[key] ?? "").trim();
    await db.update(settingsTable).set({ value }).where(eq(settingsTable.name, key));
  }
}

/**
 * Busca um setting por ID.
 */
export async function getSettingById(db: Database, id: number): Promise<SettingRecord | null> {
  const [row] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.id, id))
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    value: row.value,
    autoload: Boolean(row.autoload),
  };
}

/**
 * Atualiza um setting por ID.
 */
export async function updateSettingById(
  db: Database,
  id: number,
  payload: SettingUpdatePayload
): Promise<void> {
  await db
    .update(settingsTable)
    .set({
      name: payload.name,
      value: payload.value,
      autoload: payload.autoload,
    })
    .where(eq(settingsTable.id, id));
}

/**
 * Remove um setting por ID.
 */
export async function deleteSettingById(db: Database, id: number): Promise<void> {
  await db.delete(settingsTable).where(eq(settingsTable.id, id));
}

/**
 * Verifica se existe um setting com o ID.
 */
export async function settingExists(db: Database, id: number): Promise<boolean> {
  const [row] = await db
    .select({ id: settingsTable.id })
    .from(settingsTable)
    .where(eq(settingsTable.id, id))
    .limit(1);
  return !!row;
}
