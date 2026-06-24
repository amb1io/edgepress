import { env as cfEnv } from "cloudflare:workers";
import { postRepositoryDispatch } from "./github-repository-dispatch.ts";

type TriggerPayload = {
  theme_post_id: number;
  theme_slug: string;
  repo_url: string;
  ref: string;
  subdir: string;
  requested_by: string;
};

export async function triggerThemeImportFromRuntime(
  _locals: App.Locals,
  payload: TriggerPayload
): Promise<void> {
  const dispatchRepo = String(cfEnv.THEME_IMPORT_DISPATCH_REPO ?? "").trim();
  const token = String(cfEnv.THEME_IMPORT_GITHUB_TOKEN ?? "").trim();
  const eventType = String(cfEnv.THEME_IMPORT_EVENT_TYPE ?? "theme_import_requested").trim();

  if (!dispatchRepo || !token) {
    console.warn(
      "[themes] import trigger skipped: missing THEME_IMPORT_DISPATCH_REPO or THEME_IMPORT_GITHUB_TOKEN"
    );
    return;
  }

  await postRepositoryDispatch({
    dispatchRepo,
    token,
    eventType,
    clientPayload: payload,
    userAgent: "edgepress-theme-import",
    logLabel: "import trigger",
  });
}
