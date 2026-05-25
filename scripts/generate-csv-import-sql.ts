/**
 * Gera SQL idempotente a partir dos CSVs exportados do D1 (pasta farramedia-edgepresss).
 *
 * Uso:
 *   tsx scripts/generate-csv-import-sql.ts
 *   tsx scripts/generate-csv-import-sql.ts --dir ../farramedia-edgepresss
 *
 * Saída: drizzle/seed/import-farramedia-edgepress.sql
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { EDP_TABLES } from "../src/db/table-prefix.ts";

const OUT_DIR = join(process.cwd(), "drizzle", "seed");
const OUT_FILE = join(OUT_DIR, "import-farramedia-edgepress.sql");

type ColType = "text" | "int" | "bool";

type TableImport = {
  csvPrefix: string;
  table: string;
  columns: { name: string; type: ColType; nullable?: boolean }[];
  /** INSERT OR IGNORE quando não há coluna id (tabelas pivot). */
  ignoreOnConflict?: boolean;
};

const IMPORT_ORDER: TableImport[] = [
  {
    csvPrefix: "locales_",
    table: EDP_TABLES.locales,
    columns: [
      { name: "id", type: "int" },
      { name: "language", type: "text" },
      { name: "hello_world", type: "text" },
      { name: "locale_code", type: "text" },
      { name: "country", type: "text" },
      { name: "timezone", type: "text" },
    ],
  },
  {
    csvPrefix: "post_types_",
    table: EDP_TABLES.post_types,
    columns: [
      { name: "id", type: "int" },
      { name: "slug", type: "text" },
      { name: "name", type: "text" },
      { name: "meta_schema", type: "text", nullable: true },
      { name: "created_at", type: "int", nullable: true },
      { name: "updated_at", type: "int", nullable: true },
    ],
  },
  {
    csvPrefix: "_user__",
    table: EDP_TABLES.user,
    columns: [
      { name: "id", type: "text" },
      { name: "name", type: "text" },
      { name: "email", type: "text" },
      { name: "email_verified", type: "bool" },
      { name: "image", type: "text", nullable: true },
      { name: "role", type: "int", nullable: true },
      { name: "created_at", type: "int" },
      { name: "updated_at", type: "int" },
    ],
  },
  {
    csvPrefix: "account_",
    table: EDP_TABLES.account,
    columns: [
      { name: "id", type: "text" },
      { name: "user_id", type: "text" },
      { name: "account_id", type: "text" },
      { name: "provider_id", type: "text" },
      { name: "access_token", type: "text", nullable: true },
      { name: "refresh_token", type: "text", nullable: true },
      { name: "access_token_expires_at", type: "int", nullable: true },
      { name: "refresh_token_expires_at", type: "int", nullable: true },
      { name: "scope", type: "text", nullable: true },
      { name: "id_token", type: "text", nullable: true },
      { name: "password", type: "text", nullable: true },
      { name: "created_at", type: "int" },
      { name: "updated_at", type: "int" },
    ],
  },
  {
    csvPrefix: "_session__",
    table: EDP_TABLES.session,
    columns: [
      { name: "id", type: "text" },
      { name: "user_id", type: "text" },
      { name: "token", type: "text" },
      { name: "expires_at", type: "int" },
      { name: "ip_address", type: "text", nullable: true },
      { name: "user_agent", type: "text", nullable: true },
      { name: "created_at", type: "int" },
      { name: "updated_at", type: "int" },
    ],
  },
  {
    csvPrefix: "verification_",
    table: EDP_TABLES.verification,
    columns: [
      { name: "id", type: "text" },
      { name: "identifier", type: "text" },
      { name: "value", type: "text" },
      { name: "expires_at", type: "int" },
      { name: "created_at", type: "int" },
      { name: "updated_at", type: "int" },
    ],
  },
  {
    csvPrefix: "role_capability_",
    table: EDP_TABLES.role_capability,
    columns: [
      { name: "role_id", type: "int" },
      { name: "capability", type: "text" },
    ],
  },
  {
    csvPrefix: "settings_",
    table: EDP_TABLES.settings,
    columns: [
      { name: "id", type: "int" },
      { name: "name", type: "text" },
      { name: "value", type: "text" },
      { name: "autoload", type: "bool" },
    ],
  },
  {
    csvPrefix: "taxonomies_",
    table: EDP_TABLES.taxonomies,
    columns: [
      { name: "id", type: "int" },
      { name: "name", type: "text" },
      { name: "slug", type: "text" },
      { name: "description", type: "text", nullable: true },
      { name: "type", type: "text" },
      { name: "parent_id", type: "int", nullable: true },
      { name: "created_at", type: "int", nullable: true },
      { name: "updated_at", type: "int", nullable: true },
      { name: "id_locale_code", type: "int", nullable: true },
    ],
  },
  {
    csvPrefix: "translations_",
    table: EDP_TABLES.translations,
    columns: [
      { name: "id", type: "int" },
      { name: "namespace", type: "text" },
      { name: "key", type: "text" },
      { name: "created_at", type: "int", nullable: true },
      { name: "updated_at", type: "int", nullable: true },
    ],
  },
  {
    csvPrefix: "translations_languages_",
    table: EDP_TABLES.translations_languages,
    columns: [
      { name: "id", type: "int" },
      { name: "id_translations", type: "int" },
      { name: "id_locale_code", type: "int" },
      { name: "value", type: "text" },
    ],
  },
  {
    csvPrefix: "posts_",
    table: EDP_TABLES.posts,
    columns: [
      { name: "id", type: "int" },
      { name: "post_type_id", type: "int" },
      { name: "parent_id", type: "int", nullable: true },
      { name: "author_id", type: "text", nullable: true },
      { name: "id_locale_code", type: "int", nullable: true },
      { name: "title", type: "text" },
      { name: "slug", type: "text" },
      { name: "excerpt", type: "text", nullable: true },
      { name: "body", type: "text", nullable: true },
      { name: "status", type: "text", nullable: true },
      { name: "meta_values", type: "text", nullable: true },
      { name: "published_at", type: "int", nullable: true },
      { name: "created_at", type: "int", nullable: true },
      { name: "updated_at", type: "int", nullable: true },
    ],
  },
  {
    csvPrefix: "posts_taxonomies_",
    table: EDP_TABLES.posts_taxonomies,
    ignoreOnConflict: true,
    columns: [
      { name: "post_id", type: "int" },
      { name: "term_id", type: "int" },
    ],
  },
  {
    csvPrefix: "posts_media_",
    table: EDP_TABLES.posts_media,
    ignoreOnConflict: true,
    columns: [
      { name: "post_id", type: "int" },
      { name: "media_id", type: "int" },
    ],
  },
];

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      if (row.length > 1 || row[0] !== "") {
        rows.push(row);
      }
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") {
      rows.push(row);
    }
  }

  return rows;
}

function parseCsvFile(path: string): Record<string, string>[] {
  const rows = parseCsv(readFileSync(path, "utf8"));
  if (rows.length === 0) return [];

  const headers = rows[0]!.map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? "";
    });
    return record;
  });
}

function sqlValue(raw: string | undefined, type: ColType, nullable = false): string {
  const value = raw ?? "";
  if (value === "") {
    if (nullable) return "NULL";
    if (type === "text") return "''";
    if (type === "bool") return "0";
    return "0";
  }

  if (type === "int") return String(Number(value));
  if (type === "bool") return value === "0" || value.toLowerCase() === "false" ? "0" : "1";
  return `'${escapeSql(value)}'`;
}

function findCsvFile(dir: string, prefix: string): string {
  const match = readdirSync(dir)
    .filter((name) => {
      if (!name.endsWith(".csv") || !name.startsWith(prefix)) return false;
      if (prefix === "posts_" && (name.startsWith("posts_taxonomies_") || name.startsWith("posts_media_"))) {
        return false;
      }
      if (prefix === "translations_" && name.startsWith("translations_languages_")) {
        return false;
      }
      return true;
    })
    .sort()
    .at(-1);

  if (!match) {
    throw new Error(`CSV não encontrado para prefixo "${prefix}" em ${dir}`);
  }

  return join(dir, match);
}

function buildInsertStatements(config: TableImport, records: Record<string, string>[]): string[] {
  const columnNames = config.columns.map((col) => col.name).join(", ");
  const verb = config.ignoreOnConflict ? "INSERT OR IGNORE" : "INSERT OR REPLACE";

  return records.map((record) => {
    const values = config.columns
      .map((col) => sqlValue(record[col.name], col.type, col.nullable))
      .join(", ");
    return `${verb} INTO ${config.table} (${columnNames}) VALUES (${values});`;
  });
}

function resolveCsvDir(): string {
  const dirArgIndex = process.argv.indexOf("--dir");
  if (dirArgIndex !== -1 && process.argv[dirArgIndex + 1]) {
    return resolve(process.argv[dirArgIndex + 1]!);
  }
  return resolve(process.cwd(), "..", "farramedia-edgepresss");
}

function main(): void {
  const csvDir = resolveCsvDir();
  const lines: string[] = [
    "-- Importação idempotente a partir de farramedia-edgepresss/*.csv",
    `-- Gerado por scripts/generate-csv-import-sql.ts em ${new Date().toISOString()}`,
    `-- Fonte: ${csvDir}`,
    "-- Pré-requisito: migrações D1 aplicadas (schema edp_*)",
    "",
    "PRAGMA foreign_keys = OFF;",
    "",
  ];

  let totalRows = 0;

  for (const config of IMPORT_ORDER) {
    const csvPath = findCsvFile(csvDir, config.csvPrefix);
    const records = parseCsvFile(csvPath);
    totalRows += records.length;

    lines.push(`-- ${config.table} (${records.length} linhas) ← ${csvPath.split("/").pop()}`);
    lines.push(...buildInsertStatements(config, records));
    lines.push("");
  }

  lines.push("PRAGMA foreign_keys = ON;");

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, `${lines.join("\n")}\n`, "utf8");

  console.log(`[generate-csv-import-sql] ${totalRows} linhas → ${OUT_FILE}`);
}

main();
