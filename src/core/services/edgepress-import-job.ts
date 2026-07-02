/**
 * Import job step model and deterministic step computation for chunked queue processing.
 */
import {
  DEFAULT_INSERT_BATCH_SIZE,
  FTS_INSERT_BATCH_SIZE,
  INSERT_BATCH_SIZE,
  resolveImportTableOrder,
  type EdgepressLogicalTable,
  type EdgepressManifest,
  type ExportIncludes,
} from "./edgepress-archive.ts";

export type ImportStep =
  | { type: "wipe_database" }
  | { type: "insert_table"; table: EdgepressLogicalTable; offset: number; limit: number }
  | { type: "reset_sequences" }
  | { type: "restore_parent_ids"; table: "posts" | "taxonomies"; offset: number; limit: number }
  | { type: "restore_fts"; offset: number; limit: number }
  | { type: "backfill_fts" }
  | { type: "wipe_media"; cursor?: string }
  | { type: "restore_media"; offset: number; limit: number }
  | { type: "wipe_themes"; cursor?: string; kvWiped?: boolean }
  | { type: "restore_themes"; offset: number; limit: number }
  | { type: "finalize" };

export const TARGET_STATEMENTS_PER_STEP = 100;
export const PARENT_ID_ROWS_PER_STEP = 100;
export const FTS_ROWS_PER_STEP = FTS_INSERT_BATCH_SIZE * TARGET_STATEMENTS_PER_STEP;
export const MEDIA_FILES_PER_STEP = 100;
export const THEME_FILES_PER_STEP = 100;
export const R2_WIPE_PAGE_SIZE = 1000;

export function rowsPerInsertStep(table: EdgepressLogicalTable): number {
  const batchSize = INSERT_BATCH_SIZE[table] ?? DEFAULT_INSERT_BATCH_SIZE;
  return batchSize * TARGET_STATEMENTS_PER_STEP;
}

export function chunkOffsets(total: number, chunkSize: number): Array<{ offset: number; limit: number }> {
  if (total <= 0 || chunkSize <= 0) return [];
  const chunks: Array<{ offset: number; limit: number }> = [];
  for (let offset = 0; offset < total; offset += chunkSize) {
    chunks.push({ offset, limit: Math.min(chunkSize, total - offset) });
  }
  return chunks;
}

export function phaseLabelForStep(step: ImportStep, manifest: EdgepressManifest): string {
  switch (step.type) {
    case "wipe_database":
      return "Limpando banco de dados…";
    case "insert_table": {
      const total = manifest.counts?.[step.table] ?? 0;
      const end = Math.min(step.offset + step.limit, total);
      return `Inserindo ${step.table} (${end}/${total})`;
    }
    case "reset_sequences":
      return "Atualizando sequências…";
    case "restore_parent_ids": {
      const total = manifest.counts?.[step.table] ?? 0;
      const end = Math.min(step.offset + step.limit, total);
      return `Restaurando parent_id em ${step.table} (${end}/${total})`;
    }
    case "restore_fts": {
      const total = manifest.ftsCount ?? 0;
      const end = Math.min(step.offset + step.limit, total);
      return `Restaurando FTS (${end}/${total})`;
    }
    case "backfill_fts":
      return "Reconstruindo índice de busca…";
    case "wipe_media":
      return "Limpando mídia…";
    case "restore_media": {
      const total = manifest.mediaCount ?? 0;
      const end = Math.min(step.offset + step.limit, total);
      return `Restaurando mídia (${end}/${total})`;
    }
    case "wipe_themes":
      return step.kvWiped === false ? "Limpando cache de temas…" : "Limpando arquivos de temas…";
    case "restore_themes": {
      const total = step.limit > 0 ? step.offset + step.limit : manifest.themeCount ?? 0;
      const end = Math.min(step.offset + step.limit, total);
      return `Restaurando temas (${end}/${total})`;
    }
    case "finalize":
      return "Finalizando importação…";
    default:
      return "Processando…";
  }
}

export function computeImportSteps(
  manifest: EdgepressManifest,
  includes: ExportIncludes,
  options?: { themeFileCount?: number },
): ImportStep[] {
  const steps: ImportStep[] = [];
  const tableOrder = resolveImportTableOrder(manifest.tableOrder);
  const themeFileCount = options?.themeFileCount ?? manifest.themeCount ?? 0;

  if (includes.database) {
    steps.push({ type: "wipe_database" });

    for (const table of tableOrder) {
      const count = manifest.counts?.[table] ?? 0;
      for (const chunk of chunkOffsets(count, rowsPerInsertStep(table))) {
        steps.push({ type: "insert_table", table, ...chunk });
      }
    }

    steps.push({ type: "reset_sequences" });

    const postsCount = manifest.counts?.posts ?? 0;
    for (const chunk of chunkOffsets(postsCount, PARENT_ID_ROWS_PER_STEP)) {
      steps.push({ type: "restore_parent_ids", table: "posts", ...chunk });
    }

    const taxonomiesCount = manifest.counts?.taxonomies ?? 0;
    for (const chunk of chunkOffsets(taxonomiesCount, PARENT_ID_ROWS_PER_STEP)) {
      steps.push({ type: "restore_parent_ids", table: "taxonomies", ...chunk });
    }

    const ftsCount = manifest.ftsCount ?? 0;
    if (ftsCount > 0) {
      for (const chunk of chunkOffsets(ftsCount, FTS_ROWS_PER_STEP)) {
        steps.push({ type: "restore_fts", ...chunk });
      }
    } else {
      steps.push({ type: "backfill_fts" });
    }
  }

  if (includes.media) {
    steps.push({ type: "wipe_media" });
    const mediaCount = manifest.mediaCount ?? 0;
    for (const chunk of chunkOffsets(mediaCount, MEDIA_FILES_PER_STEP)) {
      steps.push({ type: "restore_media", ...chunk });
    }
  }

  if (includes.themes) {
    steps.push({ type: "wipe_themes", kvWiped: false });
    steps.push({ type: "wipe_themes", kvWiped: true });
    for (const chunk of chunkOffsets(themeFileCount, THEME_FILES_PER_STEP)) {
      steps.push({ type: "restore_themes", ...chunk });
    }
  }

  steps.push({ type: "finalize" });
  return steps;
}

export function importJobPercent(stepIndex: number, totalSteps: number): number {
  if (totalSteps <= 0) return 0;
  return Math.min(100, Math.round((stepIndex / totalSteps) * 100));
}
