import { describe, expect, it, vi, beforeEach } from "vitest";
import { env } from "cloudflare:workers";
import { triggerThemeImportFromRuntime } from "../services/theme-import-trigger.ts";

function clearTestEnv() {
  for (const k of Object.keys(env)) {
    delete env[k];
  }
}

describe("theme-import-trigger", () => {
  beforeEach(() => {
    clearTestEnv();
  });

  it("does not throw when dispatch config is missing", async () => {
    await expect(
      triggerThemeImportFromRuntime(
        {} as App.Locals,
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

    env.THEME_IMPORT_DISPATCH_REPO = "acme/edgepress-deploy";
    env.THEME_IMPORT_GITHUB_TOKEN = "token";

    await expect(
      triggerThemeImportFromRuntime(
        {} as App.Locals,
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
