import { relations } from "drizzle-orm";
import { customType, int, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Integer column that accepts Date or number; D1 requires number, so we convert Date to timestamp. */
const timestampInt = customType<{ data: number; driverData: number }>({
  dataType() {
    return "integer";
  },
  toDriver(value: number | Date): number {
    return value instanceof Date ? value.getTime() : value;
  },
  fromDriver(value: number): number {
    return value;
  },
});

/** Role stored as number: 0=administrador, 1=editor, 2=autor, 3=leitor */
export const USER_ROLE_IDS = [0, 1, 2, 3] as const;
export type UserRoleId = (typeof USER_ROLE_IDS)[number];

/** Label keys for i18n (admin.user.role.${key}) */
export const USER_ROLE_LABEL_KEYS = ["administrador", "editor", "autor", "leitor"] as const;

export const user = sqliteTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: int("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text(),
  role: int().default(3), // 0=administrador, 1=editor, 2=autor, 3=leitor
  createdAt: timestampInt("created_at").notNull(),
  updatedAt: timestampInt("updated_at").notNull(),
});

export const session = sqliteTable("session", {
  id: text().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text().notNull().unique(),
  expiresAt: timestampInt("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestampInt("created_at").notNull(),
  updatedAt: timestampInt("updated_at").notNull(),
});

export const account = sqliteTable("account", {
  id: text().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestampInt("access_token_expires_at"),
  refreshTokenExpiresAt: timestampInt("refresh_token_expires_at"),
  scope: text(),
  idToken: text("id_token"),
  password: text(),
  createdAt: timestampInt("created_at").notNull(),
  updatedAt: timestampInt("updated_at").notNull(),
});

export const verification = sqliteTable("verification", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestampInt("expires_at").notNull(),
  createdAt: timestampInt("created_at").notNull(),
  updatedAt: timestampInt("updated_at").notNull(),
});

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user),
}));
