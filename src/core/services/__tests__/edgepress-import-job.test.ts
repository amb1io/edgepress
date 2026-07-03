import { describe, expect, it } from "vitest";
import {
  computeImportSteps,
  computeMediaAppendSteps,
  FTS_ROWS_PER_STEP,
  importJobPercent,
  MEDIA_FILES_PER_STEP,
  PARENT_ID_ROWS_PER_STEP,
  rowsPerInsertStep,
  THEME_FILES_PER_STEP,
} from "../edgepress-import-job.ts";
import {
  DEFAULT_EXPORT_INCLUDES,
  EDGEPRESS_FORMAT,
  EDGEPRESS_SCHEMA_VERSION,
  type EdgepressManifest,
} from "../edgepress-archive.ts";

function buildManifest(
  overrides: Partial<EdgepressManifest> = {},
): EdgepressManifest {
  return {
    format: EDGEPRESS_FORMAT,
    schemaVersion: EDGEPRESS_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: "0.0.1",
    includes: { ...DEFAULT_EXPORT_INCLUDES },
    tableOrder: [
      "post_types",
      "user",
      "account",
      "taxonomies",
      "settings",
      "posts",
      "seo_metadata",
      "posts_taxonomies",
      "posts_media",
    ],
    counts: {
      posts: 1300,
      posts_taxonomies: 2500,
      taxonomies: 40,
    },
    ftsCount: 1300,
    mediaCount: 220,
    mediaFiles: [],
    themeCount: 2,
    themePackages: [{ slug: "2026" }, { slug: "brand" }],
    ...overrides,
  };
}

describe("computeImportSteps", () => {
  it("chunks large post inserts below the D1 statement target", () => {
    const steps = computeImportSteps(buildManifest(), DEFAULT_EXPORT_INCLUDES);
    const postSteps = steps.filter(
      (step) => step.type === "insert_table" && step.table === "posts",
    );

    expect(postSteps.length).toBeGreaterThan(1);
    for (const step of postSteps) {
      if (step.type !== "insert_table") continue;
      expect(step.limit).toBeLessThanOrEqual(rowsPerInsertStep("posts"));
    }
  });

  it("includes wipe, parent restore, fts, media, themes, and finalize for full archives", () => {
    const steps = computeImportSteps(buildManifest(), DEFAULT_EXPORT_INCLUDES, {
      themeFileCount: 12,
    });

    expect(steps[0]).toEqual({ type: "wipe_database" });
    expect(steps.at(-1)).toEqual({ type: "finalize" });
    expect(steps.some((step) => step.type === "reset_sequences")).toBe(true);
    expect(steps.some((step) => step.type === "restore_parent_ids" && step.table === "posts")).toBe(
      true,
    );
    expect(steps.some((step) => step.type === "restore_fts")).toBe(true);
    expect(steps.some((step) => step.type === "wipe_media")).toBe(true);
    expect(steps.some((step) => step.type === "restore_media")).toBe(true);
    expect(steps.some((step) => step.type === "wipe_themes")).toBe(true);
    expect(steps.some((step) => step.type === "restore_themes")).toBe(true);
  });

  it("uses backfill_fts for legacy archives without fts rows", () => {
    const steps = computeImportSteps(
      buildManifest({ ftsCount: 0 }),
      { database: true, media: false, themes: false },
    );

    expect(steps.some((step) => step.type === "backfill_fts")).toBe(true);
    expect(steps.some((step) => step.type === "restore_fts")).toBe(false);
  });

  it("respects selective includes for database-only imports", () => {
    const steps = computeImportSteps(buildManifest(), {
      database: true,
      media: false,
      themes: false,
    });

    expect(steps.some((step) => step.type === "wipe_media")).toBe(false);
    expect(steps.some((step) => step.type === "wipe_themes")).toBe(false);
    expect(steps.some((step) => step.type === "insert_table")).toBe(true);
  });

  it("chunks parent ids, fts, and media with configured sizes", () => {
    const manifest = buildManifest({
      counts: { posts: 250, taxonomies: 150 },
      ftsCount: FTS_ROWS_PER_STEP + 10,
      mediaCount: MEDIA_FILES_PER_STEP + 5,
    });

    const steps = computeImportSteps(manifest, DEFAULT_EXPORT_INCLUDES, {
      themeFileCount: THEME_FILES_PER_STEP + 1,
    });

    const postParentSteps = steps.filter(
      (step) => step.type === "restore_parent_ids" && step.table === "posts",
    );
    expect(postParentSteps).toHaveLength(Math.ceil(250 / PARENT_ID_ROWS_PER_STEP));

    const ftsSteps = steps.filter((step) => step.type === "restore_fts");
    expect(ftsSteps).toHaveLength(2);

    const mediaSteps = steps.filter((step) => step.type === "restore_media");
    expect(mediaSteps).toHaveLength(2);
  });
});

describe("computeMediaAppendSteps", () => {
  it("skips wipe steps and only restores media for bundle media parts", () => {
    const manifest = buildManifest({
      includes: { database: false, media: true, themes: false },
      mediaCount: MEDIA_FILES_PER_STEP + 5,
      bundle: {
        id: "bundle-1",
        partIndex: 2,
        partCount: 2,
        partKind: "media",
      },
    });

    const steps = computeMediaAppendSteps(manifest);

    expect(steps.some((step) => step.type === "wipe_database")).toBe(false);
    expect(steps.some((step) => step.type === "wipe_media")).toBe(false);
    expect(steps.some((step) => step.type === "wipe_themes")).toBe(false);
    expect(steps.some((step) => step.type === "restore_media")).toBe(true);
    expect(steps.at(-1)).toEqual({ type: "finalize" });
  });

  it("delegates media bundle parts through computeImportSteps", () => {
    const manifest = buildManifest({
      includes: { database: false, media: true, themes: false },
      mediaCount: 10,
      bundle: {
        id: "bundle-1",
        partIndex: 2,
        partCount: 2,
        partKind: "media",
      },
    });

    const steps = computeImportSteps(manifest, manifest.includes);
    expect(steps.some((step) => step.type === "wipe_media")).toBe(false);
    expect(steps.filter((step) => step.type === "restore_media")).toHaveLength(1);
  });
});

describe("importJobPercent", () => {
  it("calculates progress from step index", () => {
    expect(importJobPercent(0, 10)).toBe(0);
    expect(importJobPercent(5, 10)).toBe(50);
    expect(importJobPercent(10, 10)).toBe(100);
  });
});
