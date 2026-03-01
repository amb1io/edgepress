import { describe, expect, it, vi } from "vitest";
import { triggerThemeImportFromRuntime } from "../services/theme-import-trigger.ts";

describe("theme-import-trigger", () => {
  it("does not throw when dispatch config is missing", async () => {
    await expect(
      triggerThemeImportFromRuntime(
        { runtime: { env: {} } } as App.Locals,
        {
          theme_post_id: 1,
          theme_slug: "theme-a",
          repo_url: "https://github.com/foo/bar",
          ref: "main",
          subdir: "",
          requested_by: "user-1",
        }
      )
    ).resolves.toBeUndefined();
  });

  it("throws when GitHub dispatch responds with error", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response("forbidden", { status: 403 })
      );

    await expect(
      triggerThemeImportFromRuntime(
        {
          runtime: {
            env: {
              THEME_IMPORT_DISPATCH_REPO: "acme/edgepress-deploy",
              THEME_IMPORT_GITHUB_TOKEN: "token",
            },
          },
        } as unknown as App.Locals,
        {
          theme_post_id: 1,
          theme_slug: "theme-a",
          repo_url: "https://github.com/foo/bar",
          ref: "main",
          subdir: "",
          requested_by: "user-1",
        }
      )
    ).rejects.toThrow("GitHub dispatch failed");

    fetchMock.mockRestore();
  });
});
