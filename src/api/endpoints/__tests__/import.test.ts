/**
 * Testes do endpoint POST /api/import
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { env } from "cloudflare:workers";

const mockAuthUser = { user: { id: "admin", role: 0 }, session: { id: "s1", userId: "admin" } };

vi.mock("../../../utils/api-auth.ts", () => ({
  requireMinRole: vi.fn().mockResolvedValue(mockAuthUser),
}));

const restoreImportMock = vi.fn();

vi.mock("../../../core/services/edgepress-archive.ts", () => ({
  restoreImport: (...args: unknown[]) => restoreImportMock(...args),
}));

vi.mock("../../../db/index.ts", () => ({
  db: { marker: "test-db" },
}));

function clearTestEnv() {
  for (const key of Object.keys(env)) {
    delete env[key];
  }
}

describe("import API", () => {
  beforeEach(() => {
    clearTestEnv();
    vi.clearAllMocks();
    restoreImportMock.mockResolvedValue({
      counts: { posts: 2 },
      mediaCount: 1,
    });
    env.MEDIA_BUCKET = {
      list: vi.fn(),
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };
  });

  it("returns 503 when R2 bucket is not configured", async () => {
    delete env.MEDIA_BUCKET;
    const { POST } = await import("../import.ts");
    const response = await POST({
      request: new Request("http://localhost/api/import", { method: "POST" }),
      locals: {} as Parameters<typeof POST>[0]["locals"],
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(503);
  });

  it("returns 400 when content-type is not multipart", async () => {
    const { POST } = await import("../import.ts");
    const response = await POST({
      request: new Request("http://localhost/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      locals: {} as Parameters<typeof POST>[0]["locals"],
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toEqual({ error: "Expected multipart/form-data" });
  });

  it("returns 400 when file field is missing", async () => {
    const formData = new FormData();
    formData.set("other", "value");

    const { POST } = await import("../import.ts");
    const response = await POST({
      request: new Request("http://localhost/api/import", {
        method: "POST",
        body: formData,
      }),
      locals: {} as Parameters<typeof POST>[0]["locals"],
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toEqual({ error: "No file in request" });
  });

  it("returns 400 for invalid file extension", async () => {
    const formData = new FormData();
    formData.set("file", new Blob(["x"], { type: "text/plain" }), "backup.txt");

    const { POST } = await import("../import.ts");
    const response = await POST({
      request: new Request("http://localhost/api/import", {
        method: "POST",
        body: formData,
      }),
      locals: {} as Parameters<typeof POST>[0]["locals"],
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toEqual({ error: "Invalid file type. Use .edgepress" });
  });

  it("imports valid .edgepress file", async () => {
    const formData = new FormData();
    formData.set(
      "file",
      new Blob([0x1f, 0x8b], { type: "application/gzip" }),
      "site.edgepress",
    );

    const { POST } = await import("../import.ts");
    const response = await POST({
      request: new Request("http://localhost/api/import", {
        method: "POST",
        body: formData,
      }),
      locals: {} as Parameters<typeof POST>[0]["locals"],
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      ok: true,
      message: "Import completed successfully",
      counts: { posts: 2 },
      mediaCount: 1,
    });
    expect(restoreImportMock).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when restoreImport throws", async () => {
    restoreImportMock.mockRejectedValue(new Error("Import failed"));

    const formData = new FormData();
    formData.set(
      "file",
      new Blob([0x1f, 0x8b], { type: "application/gzip" }),
      "site.edgepress",
    );

    const { POST } = await import("../import.ts");
    const response = await POST({
      request: new Request("http://localhost/api/import", {
        method: "POST",
        body: formData,
      }),
      locals: {} as Parameters<typeof POST>[0]["locals"],
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(500);
  });
});
