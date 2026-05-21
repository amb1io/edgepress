import { describe, expect, it } from "vitest";
import {
  buildThemePathFromSlug,
  isValidPublicGitHubRepoUrl,
  normalizeGitHubRef,
  normalizeSupports,
  normalizeThemeSlug,
  normalizeThemeSubdir,
  parseThemeImportState,
  validateThemeCanonicalMeta,
  withThemeImportState,
} from "../services/theme-service.ts";

describe("theme-service", () => {
  it("validates public GitHub URLs", () => {
    expect(isValidPublicGitHubRepoUrl("https://github.com/foo/bar")).toBe(true);
    expect(isValidPublicGitHubRepoUrl("https://github.com/foo/bar.git")).toBe(true);
    expect(isValidPublicGitHubRepoUrl("http://github.com/foo/bar")).toBe(false);
    expect(isValidPublicGitHubRepoUrl("https://gitlab.com/foo/bar")).toBe(false);
    expect(isValidPublicGitHubRepoUrl("https://github.com/foo")).toBe(false);
  });

  it("normalizes derived theme identity and metadata fields", () => {
    const slug = normalizeThemeSlug("My-Theme");
    const path = buildThemePathFromSlug(slug);
    const ref = normalizeGitHubRef("develop");
    const subdir = normalizeThemeSubdir("packages/theme/");
    const supports = normalizeSupports("single,archive");

    expect(slug).toBe("my-theme");
    expect(path).toBe("src/themes/my-theme");
    expect(ref).toBe("develop");
    expect(subdir).toBe("packages/theme");
    expect(supports).toEqual(["single", "archive"]);
  });

  it("requires github_repo_url when activation is requested", () => {
    const validation = validateThemeCanonicalMeta(
      {
        theme_slug: "theme-a",
        theme_path: "src/themes/theme-a",
        supports: [],
      },
      { requireGithubRepoUrl: true }
    );
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain("github_repo_url is required when requesting activation");
  });

  it("requires package metadata when ready state depends on R2 package", () => {
    const validation = validateThemeCanonicalMeta(
      {
        theme_slug: "theme-a",
        theme_path: "src/themes/theme-a",
        supports: [],
        github_repo_url: "https://github.com/acme/theme-a",
      },
      { requirePackageMeta: true }
    );
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain(
      "r2_key, package_version and package_checksum are required for ready state"
    );
  });

  it("validates package checksum format", () => {
    const validation = validateThemeCanonicalMeta(
      {
        theme_slug: "theme-a",
        theme_path: "src/themes/theme-a",
        supports: [],
        r2_key: "themes/theme-a/v1/theme.zip",
        package_version: "v1",
        package_checksum: "abc123",
      },
      { requirePackageMeta: true }
    );
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain(
      "package_checksum must be a 64-char sha256 hex"
    );
  });

  it("serializes and re-parses theme import state", () => {
    const serialized = withThemeImportState(null, {
      requested_active: true,
      is_active: false,
      import_status: "importing",
      import_error: "",
      import_commit_sha: "",
    });
    const state = parseThemeImportState(serialized);
    expect(state.requested_active).toBe(true);
    expect(state.is_active).toBe(false);
    expect(state.import_status).toBe("importing");
  });

  it("parses packaged import status", () => {
    const serialized = JSON.stringify({
      import_status: "packaged",
      requested_active: "0",
      is_active: "0",
    });
    const state = parseThemeImportState(serialized);
    expect(state.import_status).toBe("packaged");
  });
});
