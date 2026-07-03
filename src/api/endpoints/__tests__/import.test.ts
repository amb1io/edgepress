/**
 * Testes do endpoint POST /api/import
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { env } from "cloudflare:workers";
import { IMPORT_BUNDLE_UPLOAD_TOKEN_HEADER } from "../../../core/services/import-job-state.ts";

const mockAuthUser = { user: { id: "admin", role: 0 }, session: { id: "s1", userId: "admin" } };

const requireMinRoleMock = vi.fn().mockResolvedValue(mockAuthUser);

vi.mock("../../../utils/api-auth.ts", () => ({
  requireMinRole: (...args: unknown[]) => requireMinRoleMock(...args),
}));

const stageImportArchiveMock = vi.fn();
const writeImportJobMock = vi.fn();
const computeImportStepsMock = vi.fn();

vi.mock("../../../core/services/import-staging.ts", () => ({
  stageImportArchive: (...args: unknown[]) => stageImportArchiveMock(...args),
}));

vi.mock("../../../core/services/import-job-state.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../core/services/import-job-state.ts")>();
  return {
    ...actual,
    writeImportJob: (...args: unknown[]) => writeImportJobMock(...args),
  };
});

vi.mock("../../../core/services/edgepress-import-job.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../core/services/edgepress-import-job.ts")>();
  return {
    ...actual,
    computeImportSteps: (...args: unknown[]) => computeImportStepsMock(...args),
  };
});

function clearTestEnv() {
  for (const key of Object.keys(env)) {
    delete env[key];
  }
}

describe("import API", () => {
  beforeEach(() => {
    clearTestEnv();
    vi.clearAllMocks();
    requireMinRoleMock.mockResolvedValue(mockAuthUser);
    stageImportArchiveMock.mockResolvedValue({
      manifest: {
        includes: { database: true, media: true, themes: true },
        counts: { posts: 2 },
        mediaCount: 1,
        themeCount: 0,
      },
      includes: { database: true, media: true, themes: true },
      mediaFiles: [],
      themeFiles: [],
    });
    computeImportStepsMock.mockReturnValue([
      { type: "wipe_database" },
      { type: "finalize" },
    ]);
    env.MEDIA_BUCKET = {
      list: vi.fn(),
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };
    env.CACHE = {
      get: vi.fn(),
      put: vi.fn(),
    };
    env.IMPORT_QUEUE = {
      send: vi.fn(),
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

  it("returns 503 when import queue is not configured", async () => {
    delete env.IMPORT_QUEUE;
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

  it("queues valid .edgepress file and returns 202 + jobId", async () => {
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

    expect(response.status).toBe(202);
    const json = await response.json();
    expect(json.status).toBe("queued");
    expect(typeof json.jobId).toBe("string");
    expect(typeof json.pollToken).toBe("string");
    expect(writeImportJobMock).toHaveBeenCalledTimes(1);
    const writtenJob = writeImportJobMock.mock.calls[0]?.[2] as { pollToken?: string };
    expect(writtenJob.pollToken).toBe(json.pollToken);
    expect(stageImportArchiveMock).toHaveBeenCalledTimes(1);
    expect(env.IMPORT_QUEUE.send).toHaveBeenCalledWith({
      jobId: json.jobId,
      stepIndex: 0,
    });
  });

  it("returns 400 when bundle media part is uploaded before the base part", async () => {
    stageImportArchiveMock.mockResolvedValue({
      manifest: {
        includes: { database: false, media: true, themes: false },
        counts: {},
        mediaCount: 1,
        themeCount: 0,
        bundle: {
          id: "bundle-1",
          partIndex: 2,
          partCount: 2,
          partKind: "media",
        },
      },
      includes: { database: false, media: true, themes: false },
      mediaFiles: [],
      themeFiles: [],
    });
    (env.CACHE.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const formData = new FormData();
    formData.set(
      "file",
      new Blob([0x1f, 0x8b], { type: "application/gzip" }),
      "part-002.edgepress",
    );

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
    expect(json.error).toMatch(/parte base/i);
    expect(writeImportJobMock).not.toHaveBeenCalled();
  });

  it("queues bundle media part with upload token when session is missing", async () => {
    requireMinRoleMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );
    stageImportArchiveMock.mockResolvedValue({
      manifest: {
        includes: { database: false, media: true, themes: false },
        counts: {},
        mediaCount: 1,
        themeCount: 0,
        bundle: {
          id: "bundle-1",
          partIndex: 2,
          partCount: 2,
          partKind: "media",
        },
      },
      includes: { database: false, media: true, themes: false },
      mediaFiles: [],
      themeFiles: [],
    });
    (env.CACHE.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      partCount: 2,
      lastCompletedPart: 1,
      uploadToken: "bundle-upload-token",
    });

    const formData = new FormData();
    formData.set(
      "file",
      new Blob([0x1f, 0x8b], { type: "application/gzip" }),
      "part-002.edgepress",
    );

    const { POST } = await import("../import.ts");
    const response = await POST({
      request: new Request("http://localhost/api/import", {
        method: "POST",
        body: formData,
        headers: {
          [IMPORT_BUNDLE_UPLOAD_TOKEN_HEADER]: "bundle-upload-token",
        },
      }),
      locals: {} as Parameters<typeof POST>[0]["locals"],
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(202);
    expect(writeImportJobMock).toHaveBeenCalledTimes(1);
  });

  it("returns 401 for bundle media part without session or upload token", async () => {
    requireMinRoleMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );
    stageImportArchiveMock.mockResolvedValue({
      manifest: {
        includes: { database: false, media: true, themes: false },
        counts: {},
        mediaCount: 1,
        themeCount: 0,
        bundle: {
          id: "bundle-1",
          partIndex: 2,
          partCount: 2,
          partKind: "media",
        },
      },
      includes: { database: false, media: true, themes: false },
      mediaFiles: [],
      themeFiles: [],
    });
    (env.CACHE.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      partCount: 2,
      lastCompletedPart: 1,
      uploadToken: "bundle-upload-token",
    });

    const formData = new FormData();
    formData.set(
      "file",
      new Blob([0x1f, 0x8b], { type: "application/gzip" }),
      "part-002.edgepress",
    );

    const { POST } = await import("../import.ts");
    const response = await POST({
      request: new Request("http://localhost/api/import", {
        method: "POST",
        body: formData,
      }),
      locals: {} as Parameters<typeof POST>[0]["locals"],
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(401);
    expect(writeImportJobMock).not.toHaveBeenCalled();
  });

  it("returns bundleUploadToken when queueing multi-part base archive", async () => {
    stageImportArchiveMock.mockResolvedValue({
      manifest: {
        includes: { database: true, media: true, themes: false },
        counts: { posts: 1 },
        mediaCount: 1,
        themeCount: 0,
        bundle: {
          id: "bundle-1",
          partIndex: 1,
          partCount: 2,
          partKind: "base",
        },
      },
      includes: { database: true, media: true, themes: false },
      mediaFiles: [],
      themeFiles: [],
    });
    (env.CACHE.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const formData = new FormData();
    formData.set(
      "file",
      new Blob([0x1f, 0x8b], { type: "application/gzip" }),
      "part-001.edgepress",
    );

    const { POST } = await import("../import.ts");
    const response = await POST({
      request: new Request("http://localhost/api/import", {
        method: "POST",
        body: formData,
      }),
      locals: {} as Parameters<typeof POST>[0]["locals"],
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(202);
    const json = await response.json();
    expect(typeof json.bundleUploadToken).toBe("string");
    expect(env.CACHE.put).toHaveBeenCalled();
  });

  it("returns 500 when staging throws", async () => {
    stageImportArchiveMock.mockRejectedValue(new Error("Import failed"));

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
