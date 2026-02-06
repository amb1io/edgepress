/**
 * Testes para a função utilitária de upload uploadFileToR2
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { uploadFileToR2 } from "../upload.ts";

describe("uploadFileToR2", () => {
  beforeEach(() => {
    vi.resetModules();
    global.fetch = vi.fn();
  });

  it("should upload file and return URL with /api/media/ prefix", async () => {
    const mockFile = new File(["image content"], "test.jpg", { type: "image/jpeg" });
    const mockResponse = {
      key: "uploads/2024/01/test-abc123.jpg",
      path: "/uploads/2024/01/test-abc123.jpg",
      mimeType: "image/jpeg",
      filename: "test.jpg",
    };

    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await uploadFileToR2(mockFile);

    expect(result.url).toBe("/api/media/uploads/2024/01/test-abc123.jpg");
    expect(result.path).toBe("/uploads/2024/01/test-abc123.jpg");
    expect(result.key).toBe("uploads/2024/01/test-abc123.jpg");
    expect(result.filename).toBe("test.jpg");
    expect(result.mimeType).toBe("image/jpeg");
    expect(global.fetch).toHaveBeenCalledWith("/api/upload", {
      method: "POST",
      body: expect.any(FormData),
    });
  });

  it("should handle path without leading slash", async () => {
    const mockFile = new File(["image"], "photo.png", { type: "image/png" });
    const mockResponse = {
      key: "uploads/2024/01/photo-xyz789.png",
      path: "uploads/2024/01/photo-xyz789.png",
      mimeType: "image/png",
      filename: "photo.png",
    };

    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await uploadFileToR2(mockFile);

    expect(result.url).toBe("/api/media/uploads/uploads/2024/01/photo-xyz789.png");
  });

  it("should handle HTTP URLs (external)", async () => {
    const mockFile = new File(["image"], "external.jpg", { type: "image/jpeg" });
    const mockResponse = {
      key: "uploads/2024/01/external.jpg",
      path: "https://cdn.example.com/image.jpg",
      mimeType: "image/jpeg",
      filename: "external.jpg",
    };

    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await uploadFileToR2(mockFile);

    expect(result.url).toBe("https://cdn.example.com/image.jpg");
  });

  it("should throw error when upload fails", async () => {
    const mockFile = new File(["content"], "test.jpg", { type: "image/jpeg" });

    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "File too large" }),
    });

    await expect(uploadFileToR2(mockFile)).rejects.toThrow("File too large");
  });

  it("should throw error when response is invalid", async () => {
    const mockFile = new File(["content"], "test.jpg", { type: "image/jpeg" });

    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ invalid: "response" }),
    });

    await expect(uploadFileToR2(mockFile)).rejects.toThrow("Invalid response");
  });

  it("should create FormData with file", async () => {
    const mockFile = new File(["content"], "test.jpg", { type: "image/jpeg" });
    const mockResponse = {
      key: "uploads/2024/01/test.jpg",
      path: "/uploads/2024/01/test.jpg",
      mimeType: "image/jpeg",
      filename: "test.jpg",
    };

    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    await uploadFileToR2(mockFile);

    const fetchCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe("/api/upload");
    expect(fetchCall[1]?.method).toBe("POST");
    expect(fetchCall[1]?.body).toBeInstanceOf(FormData);
  });
});
