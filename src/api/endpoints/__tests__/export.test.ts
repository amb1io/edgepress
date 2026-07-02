/**
 * Testes do endpoint GET /api/export
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { env } from "cloudflare:workers";

const mockAuthUser = { user: { id: "admin", role: 0 }, session: { id: "s1", userId: "admin" } };

vi.mock("../../../utils/api-auth.ts", () => ({
  requireMinRole: vi.fn().mockResolvedValue(mockAuthUser),
}));

const buildExportMock = vi.fn();
const buildExportFilenameMock = vi.fn();

vi.mock("../../../core/services/edgepress-archive.ts", () => ({
  buildExport: (...args: unknown[]) => buildExportMock(...args),
  buildExportFilename: (...args: unknown[]) => buildExportFilenameMock(...args),
}));

vi.mock("../../../db/index.ts", () => ({
  db: { marker: "test-db" },
}));

function clearTestEnv() {
  for (const key of Object.keys(env)) {
    delete env[key];
  }
}

describe("export API", () => {
  beforeEach(() => {
    clearTestEnv();
    vi.clearAllMocks();
    buildExportMock.mockResolvedValue(new Uint8Array([0x1f, 0x8b]));
    buildExportFilenameMock.mockReturnValue("edgepress-export-test.edgepress");
  });

  it("returns 503 when R2 bucket is not configured", async () => {
    const { GET } = await import("../export.ts");
    const response = await GET({
      request: new Request("http://localhost/api/export?database=1"),
      locals: {} as Parameters<typeof GET>[0]["locals"],
    } as Parameters<typeof GET>[0]);
    const json = await response.json();
    expect(json).toEqual({ error: "R2 bucket not configured" });
  });

  it("returns 400 when no export options are selected", async () => {
    env.MEDIA_BUCKET = {
      list: vi.fn(),
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };

    const { GET } = await import("../export.ts");
    const response = await GET({
      request: new Request("http://localhost/api/export"),
      locals: {} as Parameters<typeof GET>[0]["locals"],
    } as Parameters<typeof GET>[0]);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toEqual({ error: "select at least one option" });
    expect(buildExportMock).not.toHaveBeenCalled();
  });

  it("returns gzip attachment on success", async () => {
    env.MEDIA_BUCKET = {
      list: vi.fn(),
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };

    const { GET } = await import("../export.ts");
    const response = await GET({
      request: new Request("http://localhost/api/export?database=1&media=1&themes=1"),
      locals: {} as Parameters<typeof GET>[0]["locals"],
    } as Parameters<typeof GET>[0]);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/gzip");
    expect(response.headers.get("Content-Disposition")).toContain("edgepress-export-test.edgepress");
    expect(buildExportMock).toHaveBeenCalledTimes(1);
    expect(buildExportMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
      { database: true, media: true, themes: true },
    );

    const body = new Uint8Array(await response.arrayBuffer());
    expect(body).toEqual(new Uint8Array([0x1f, 0x8b]));
  });

  it("returns 500 when buildExport throws", async () => {
    env.MEDIA_BUCKET = {
      list: vi.fn(),
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };
    buildExportMock.mockRejectedValue(new Error("Export failed"));

    const { GET } = await import("../export.ts");
    const response = await GET({
      request: new Request("http://localhost/api/export?database=1"),
      locals: {} as Parameters<typeof GET>[0]["locals"],
    } as Parameters<typeof GET>[0]);

    expect(response.status).toBe(500);
  });
});
