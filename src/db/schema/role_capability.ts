import { int, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Capacidades por perfil (role).
 * 0=admin, 1=editor, 2=autor, 3=leitor.
 * Capability "*" = todas as permissões (apenas admin).
 *
 * Chaves de capacidade:
 * - admin.dashboard: ver dashboard
 * - admin.content: criar/editar conteúdo
 * - admin.list: ver listagens
 * - admin.settings: menu e páginas de configuração
 * - admin.media: mídia
 * - action.delete: poder deletar (admin e editor)
 * - menu.full: ver menu completo (oculto para leitor)
 */
export const roleCapability = sqliteTable(
  "role_capability",
  {
    roleId: int("role_id").notNull(),
    capability: text("capability").notNull(),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.capability] })]
);
