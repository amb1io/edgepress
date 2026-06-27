import { parseTarGzip } from "nanotar";
import { db } from "../../db/index.ts";
import {
  isValidPublicGitHubRepoUrl,
  normalizeGitHubRef,
  normalizeThemeSubdir,
} from "./theme-service.ts";
import type { ThemePackageRecord } from "../theme/theme-package.ts";
import { collectPackageFromEntries } from "./theme-package-collector.ts";
import { installThemePackage } from "./theme-install.ts";

export type ThemeImportInput = {
  themePostId: number;
  themeSlug: string;
  repoUrl: string;
  ref?: string;
  subdir?: string;
};

function parseGitHubRepo(url: string): { owner: string; repo: string } {
  const parsed = new URL(url.trim());
  const parts = parsed.pathname.split("/").filter(Boolean);
  const owner = parts[0] ?? "";
  const repo = (parts[1] ?? "").replace(/\.git$/i, "");
  if (!owner || !repo) {
    throw new Error("Invalid GitHub repository URL");
  }
  return { owner, repo };
}

function buildArchiveUrl(owner: string, repo: string, ref: string): string {
  return `https://codeload.github.com/${owner}/${repo}/tar.gz/${encodeURIComponent(ref)}`;
}

export async function importThemeFromGitHub(
  locals: App.Locals,
  input: ThemeImportInput,
): Promise<ThemePackageRecord> {
  if (!isValidPublicGitHubRepoUrl(input.repoUrl)) {
    throw new Error("github_repo_url must be a public GitHub URL");
  }

  const { owner, repo } = parseGitHubRepo(input.repoUrl);
  const ref = normalizeGitHubRef(input.ref);
  const archiveUrl = buildArchiveUrl(owner, repo, ref);

  const response = await fetch(archiveUrl, {
    headers: { "User-Agent": "edgepress-theme-importer" },
  });
  if (!response.ok) {
    throw new Error(`Failed to download theme archive (${response.status})`);
  }

  const gzipped = await response.arrayBuffer();
  const entries = await parseTarGzip(gzipped);
  const { manifest, templates, assets } = collectPackageFromEntries(
    entries.map((entry) => ({
      name: entry.name,
      data: entry.data ? new Uint8Array(entry.data) : undefined,
    })),
    input.subdir ?? "",
  );

  return installThemePackage(locals, {
    themePostId: input.themePostId,
    themeSlug: input.themeSlug,
    manifest,
    templates,
    assets,
    activate: true,
  });
}
