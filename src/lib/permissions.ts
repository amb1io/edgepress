/**
 * Verificação genérica de permissões por perfil (role).
 * Regras: admin = tudo; editor = conteúdo + list + media + delete, sem settings;
 * autor = conteúdo e list só próprios, sem delete; leitor = só dashboard.
 */
import { eq } from "drizzle-orm";
import { roleCapability } from "../db/schema.ts";
import type { Database } from "./types/database.ts";
import type { MenuItem } from "./menu.ts";
import { USER_ROLE_IDS, type UserRoleId } from "../db/schema/auth.ts";

export const CAPABILITY = {
  DASHBOARD: "admin.dashboard",
  CONTENT: "admin.content",
  LIST: "admin.list",
  SETTINGS: "admin.settings",
  MEDIA: "admin.media",
  DELETE: "action.delete",
  MENU_FULL: "menu.full",
} as const;

/** Normaliza role do usuário (undefined/null -> 3 leitor). */
export function normalizeRole(role: number | undefined | null): UserRoleId {
  const n = Number(role);
  if (USER_ROLE_IDS.includes(n as UserRoleId)) return n as UserRoleId;
  return 3;
}

/**
 * Verificação síncrona usando conjunto de capacidades já carregado (evita várias queries).
 */
export function canSync(capabilities: Set<string>, capability: string): boolean {
  return capabilities.has("*") || capabilities.has(capability);
}

/**
 * Retorna todas as capacidades do perfil a partir da tabela role_capability.
 * Em caso de falha (ex.: D1 sem seed, tabela vazia), retorna fallback seguro:
 * role 0 (admin) = todas; outros = vazio (acesso negado).
 */
export async function getCapabilities(
  db: Database,
  roleId: number
): Promise<Set<string>> {
  try {
    const rows = await db
      .select({ capability: roleCapability.capability })
      .from(roleCapability)
      .where(eq(roleCapability.roleId, roleId));
    const set = new Set(rows.map((r) => r.capability));
    if (set.has("*")) {
      return new Set([
        "*",
        CAPABILITY.DASHBOARD,
        CAPABILITY.CONTENT,
        CAPABILITY.LIST,
        CAPABILITY.SETTINGS,
        CAPABILITY.MEDIA,
        CAPABILITY.DELETE,
        CAPABILITY.MENU_FULL,
      ]);
    }
    return set;
  } catch {
    // Tabela role_capability inexistente/vazia ou falha no D1 (ex.: após deploy sem seed)
    if (roleId === 0) {
      return new Set([
        "*",
        CAPABILITY.DASHBOARD,
        CAPABILITY.CONTENT,
        CAPABILITY.LIST,
        CAPABILITY.SETTINGS,
        CAPABILITY.MEDIA,
        CAPABILITY.DELETE,
        CAPABILITY.MENU_FULL,
      ]);
    }
    return new Set();
  }
}

/**
 * Verifica se o perfil tem a capacidade indicada.
 */
export async function can(
  db: Database,
  roleId: number,
  capability: string
): Promise<boolean> {
  const caps = await getCapabilities(db, roleId);
  return caps.has("*") || caps.has(capability);
}

/**
 * Verifica se o perfil pode acessar a rota (pathname).
 * pathname: ex. /pt-br/admin, /pt-br/admin/content, /pt-br/admin/list, /pt-br/admin/settings, /pt-br/admin/media
 */
export async function canAccessRoute(
  db: Database,
  roleId: number,
  pathname: string
): Promise<boolean> {
  const normalized = pathname.replace(/^\/[^/]+/, ""); // remove locale
  if (normalized === "/admin" || normalized === "/admin/") {
    return can(db, roleId, CAPABILITY.DASHBOARD);
  }
  if (normalized.startsWith("/admin/content")) {
    return can(db, roleId, CAPABILITY.CONTENT);
  }
  if (normalized.startsWith("/admin/list")) {
    return can(db, roleId, CAPABILITY.LIST);
  }
  if (normalized.startsWith("/admin/settings")) {
    return can(db, roleId, CAPABILITY.SETTINGS);
  }
  if (normalized.startsWith("/admin/media")) {
    return can(db, roleId, CAPABILITY.MEDIA);
  }
  if (normalized.startsWith("/admin/post") || normalized.startsWith("/admin/page")) {
    return can(db, roleId, CAPABILITY.LIST);
  }
  // admin/[slug] com domain/template (taxonomies etc) -> exige list ou content conforme contexto; tratamos como list
  if (normalized.startsWith("/admin/")) {
    return can(db, roleId, CAPABILITY.LIST);
  }
  return false;
}

/**
 * Retorna itens de menu filtrados pelo perfil.
 * Leitor: só dashboard. Editor/Autor: tudo exceto settings. Admin: tudo.
 */
export async function filterMenuItemsByRole(
  db: Database,
  menuItems: MenuItem[],
  roleId: number
): Promise<MenuItem[]> {
  const caps = await getCapabilities(db, roleId);
  if (caps.has("*")) return menuItems;
  if (!caps.has(CAPABILITY.MENU_FULL)) {
    return menuItems.filter((item) => item.postTypeSlug === "dashboard");
  }
  if (!caps.has(CAPABILITY.SETTINGS)) {
    return menuItems.filter((item) => item.postTypeSlug !== "settings");
  }
  return menuItems;
}

/**
 * Verifica se o usuário pode ver o botão/action de deletar (admin ou editor).
 */
export async function canDelete(db: Database, roleId: number): Promise<boolean> {
  return can(db, roleId, CAPABILITY.DELETE);
}

/**
 * Verifica se o usuário é autor (só pode ver/editar próprios conteúdos; não pode deletar).
 */
export function isAuthorRole(roleId: number): boolean {
  return roleId === 2;
}

/**
 * Verifica se o usuário é leitor (só dashboard no admin).
 */
export function isReaderRole(roleId: number): boolean {
  return roleId === 3;
}

/** Tipo do user em locals (better-auth User + role). */
export type UserWithRole = { id?: string; name?: string; email?: string; image?: string | null | undefined; role?: number };

/** Extrai role do usuário (default 3 = leitor). */
export function getRoleFromUser(user: UserWithRole | null | undefined): number {
  if (!user) return 3;
  const r = (user as { role?: number }).role;
  return normalizeRole(r);
}
