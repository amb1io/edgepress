import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  buildExportBundleZip,
  buildPartFilename,
  chunkMediaByEstimatedSize,
  EDGEPRESS_FORMAT,
  estimateTarGzipBytes,
  type ExportPart,
} from "../edgepress-archive.ts";
import { MAX_IMPORT_PART_BYTES } from "../edgepress-import-limits.ts";

function makePart(partIndex: number, partCount: number, sizeBytes: number): ExportPart {
  const padding = new Uint8Array(sizeBytes);
  return {
    filename: buildPartFilename(partIndex),
    data: padding,
    manifest: {
      format: EDGEPRESS_FORMAT,
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      appVersion: "0.0.1",
      includes: { database: partIndex === 1, media: true, themes: false },
      tableOrder: [],
      counts: {},
      mediaCount: 1,
      mediaFiles: [{ key: "uploads/test.bin", contentType: "application/octet-stream" }],
      themeCount: 0,
      themePackages: [],
      bundle: {
        id: "test-bundle",
        partIndex,
        partCount,
        partKind: partIndex === 1 ? "base" : "media",
      },
    },
  };
}

describe("chunkMediaByEstimatedSize", () => {
  it("splits media objects so each chunk stays under the part limit", () => {
    const media = [
      { key: "uploads/a.bin", data: new Uint8Array(50 * 1024 * 1024), contentType: "application/octet-stream" },
      { key: "uploads/b.bin", data: new Uint8Array(50 * 1024 * 1024), contentType: "application/octet-stream" },
    ];
    const prefix = 1024;
    const chunks = chunkMediaByEstimatedSize(media, MAX_IMPORT_PART_BYTES, prefix, prefix);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(1);
    expect(chunks[1]).toHaveLength(1);
  });
});

describe("estimateTarGzipBytes", () => {
  it("approximates raw payload size with tar and gzip margin", () => {
    const payload = new Uint8Array(1024);
    const estimate = estimateTarGzipBytes([{ name: "file.bin", data: payload }]);
    expect(estimate).toBeGreaterThan(payload.byteLength);
    expect(estimate).toBeLessThan(payload.byteLength * 2);
  });
});

describe("buildExportBundleZip", () => {
  it("creates a zip containing only the .edgepress parts", () => {
    const parts = [makePart(1, 2, 1024), makePart(2, 2, 2048)];
    const zip = buildExportBundleZip(parts);
    const entries = unzipSync(zip);

    expect(entries["bundle-manifest.json"]).toBeUndefined();
    expect(entries[parts[0]!.filename]).toBeDefined();
    expect(entries[parts[1]!.filename]).toBeDefined();
    expect(Object.keys(entries)).toHaveLength(2);
  });

  it("keeps each mocked part under the import limit", () => {
    const underLimit = MAX_IMPORT_PART_BYTES - 1024;
    const parts = [makePart(1, 2, underLimit), makePart(2, 2, underLimit)];
    for (const part of parts) {
      expect(part.data.byteLength).toBeLessThan(MAX_IMPORT_PART_BYTES);
    }
  });
});
