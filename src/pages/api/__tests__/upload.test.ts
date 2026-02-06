/**
 * Testes do endpoint /api/upload (upload para Cloudflare R2).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("upload API", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns 503 when R2 bucket is not configured", async () => {
    const { POST } = await import("../upload.ts");
    const formData = new FormData();
    formData.set("file", new Blob(["test"], { type: "image/png" }), "test.png");

    const request = new Request("http://localhost/api/upload", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=----boundary" },
      body: formData,
    });

    const result = await POST({
      request,
      locals: { runtime: { env: {} } },
    } as Parameters<typeof POST>[0]);

    expect(result.status).toBe(503);
    const json = await result.json();
    expect(json).toHaveProperty("error", "R2 bucket not configured");
  });

  it("returns 400 when content-type is not multipart", async () => {
    const { POST } = await import("../upload.ts");
    const request = new Request("http://localhost/api/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    const result = await POST({
      request,
      locals: { runtime: { env: { MEDIA_BUCKET: { put: vi.fn().mockResolvedValue(undefined) } } } },
    } as Parameters<typeof POST>[0]);

    expect(result.status).toBe(400);
    const json = await result.json();
    expect(json).toHaveProperty("error", "Expected multipart/form-data");
  });

  it("returns 400 when no file in request", async () => {
    const { POST } = await import("../upload.ts");
    const formData = new FormData();
    formData.set("other", "value");

    const request = new Request("http://localhost/api/upload", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=----boundary" },
      body: formData,
    });

    const putMock = vi.fn().mockResolvedValue(undefined);
    const result = await POST({
      request,
      locals: { runtime: { env: { MEDIA_BUCKET: { put: putMock } } } },
    } as Parameters<typeof POST>[0]);

    expect(result.status).toBe(400);
    const json = await result.json();
    expect(json).toHaveProperty("error");
    expect(["No file in request", "Invalid form data"]).toContain(json.error);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("uploads file to R2 and returns key, path, mimeType, filename", async () => {
    const putMock = vi.fn().mockResolvedValue(undefined);
    const formData = new FormData();
    const blob = new Blob(["image content"], { type: "image/jpeg" });
    formData.set("file", blob, "photo.jpg");

    const request = new Request("http://localhost/api/upload", {
      method: "POST",
      body: formData,
    });

    const { POST } = await import("../upload.ts");
    const result = await POST({
      request,
      locals: { runtime: { env: { MEDIA_BUCKET: { put: putMock } } } },
    } as Parameters<typeof POST>[0]);

    expect(result.status).toBe(200);
    const json = await result.json();
    expect(json).toHaveProperty("key");
    expect(json).toHaveProperty("path");
    expect(json).toHaveProperty("mimeType", "image/jpeg");
    expect(json).toHaveProperty("filename", "photo.jpg");
    expect(json.key).toMatch(/^uploads\/\d{4}\/\d{2}\/.+-.+\..+$/);
    expect(json.path).toBe(`/${json.key}`);

    expect(putMock).toHaveBeenCalledTimes(1);
    const [key, body, options] = putMock.mock.calls[0] as [string, unknown, { httpMetadata?: { contentType?: string } }];
    expect(key).toBe(json.key);
    expect(options?.httpMetadata?.contentType).toBe("image/jpeg");
  });

  it("returns 413 when file exceeds max size", async () => {
    const putMock = vi.fn().mockResolvedValue(undefined);
    const largeBlob = new Blob([new ArrayBuffer(21 * 1024 * 1024)]); // 21 MB
    const formData = new FormData();
    formData.set("file", largeBlob, "large.jpg");

    const request = new Request("http://localhost/api/upload", {
      method: "POST",
      body: formData,
    });

    const { POST } = await import("../upload.ts");
    const result = await POST({
      request,
      locals: { runtime: { env: { MEDIA_BUCKET: { put: putMock } } } },
    } as Parameters<typeof POST>[0]);

    expect(result.status).toBe(413);
    const json = await result.json();
    expect(json).toHaveProperty("error", "File too large");
    expect(putMock).not.toHaveBeenCalled();
  });

  it("returns 400 for rejected programming file extension (.js)", async () => {
    const putMock = vi.fn().mockResolvedValue(undefined);
    const formData = new FormData();
    formData.set("file", new Blob(["console.log(1)"], { type: "application/javascript" }), "script.js");

    const request = new Request("http://localhost/api/upload", {
      method: "POST",
      body: formData,
    });

    const { POST } = await import("../upload.ts");
    const result = await POST({
      request,
      locals: { runtime: { env: { MEDIA_BUCKET: { put: putMock } } } },
    } as Parameters<typeof POST>[0]);

    expect(result.status).toBe(400);
    const json = await result.json();
    expect(json.error).toMatch(/não permitido|programação/i);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("returns 400 for disallowed MIME type (e.g. text/plain)", async () => {
    const putMock = vi.fn().mockResolvedValue(undefined);
    const formData = new FormData();
    formData.set("file", new Blob(["plain"], { type: "text/plain" }), "readme.txt");

    const request = new Request("http://localhost/api/upload", {
      method: "POST",
      body: formData,
    });

    const { POST } = await import("../upload.ts");
    const result = await POST({
      request,
      locals: { runtime: { env: { MEDIA_BUCKET: { put: putMock } } } },
    } as Parameters<typeof POST>[0]);

    expect(result.status).toBe(400);
    const json = await result.json();
    expect(json.error).toMatch(/não permitido/i);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("accepts PDF file", async () => {
    const putMock = vi.fn().mockResolvedValue(undefined);
    const formData = new FormData();
    formData.set("file", new Blob(["%PDF-1.4"], { type: "application/pdf" }), "doc.pdf");

    const request = new Request("http://localhost/api/upload", {
      method: "POST",
      body: formData,
    });

    const { POST } = await import("../upload.ts");
    const result = await POST({
      request,
      locals: { runtime: { env: { MEDIA_BUCKET: { put: putMock } } } },
    } as Parameters<typeof POST>[0]);

    expect(result.status).toBe(200);
    const json = await result.json();
    expect(json.mimeType).toBe("application/pdf");
    expect(json.filename).toBe("doc.pdf");
    expect(putMock).toHaveBeenCalledTimes(1);
  });

  it("accepts audio file", async () => {
    const putMock = vi.fn().mockResolvedValue(undefined);
    const formData = new FormData();
    formData.set("file", new Blob(["audio"], { type: "audio/mpeg" }), "track.mp3");

    const request = new Request("http://localhost/api/upload", {
      method: "POST",
      body: formData,
    });

    const { POST } = await import("../upload.ts");
    const result = await POST({
      request,
      locals: { runtime: { env: { MEDIA_BUCKET: { put: putMock } } } },
    } as Parameters<typeof POST>[0]);

    expect(result.status).toBe(200);
    const json = await result.json();
    expect(json.mimeType).toBe("audio/mpeg");
    expect(putMock).toHaveBeenCalledTimes(1);
  });

  it("accepts file from first form entry when not named 'file'", async () => {
    const putMock = vi.fn().mockResolvedValue(undefined);
    const formData = new FormData();
    formData.set("upload", new Blob(["x"], { type: "image/png" }), "pic.png");

    const request = new Request("http://localhost/api/upload", {
      method: "POST",
      body: formData,
    });

    const { POST } = await import("../upload.ts");
    const result = await POST({
      request,
      locals: { runtime: { env: { MEDIA_BUCKET: { put: putMock } } } },
    } as Parameters<typeof POST>[0]);

    expect(result.status).toBe(200);
    const json = await result.json();
    expect(json.filename).toBe("pic.png");
    expect(putMock).toHaveBeenCalledTimes(1);
  });
});
