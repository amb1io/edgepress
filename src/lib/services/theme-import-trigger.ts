type TriggerPayload = {
  theme_post_id: number;
  theme_slug: string;
  repo_url: string;
  ref: string;
  subdir: string;
  requested_by: string;
};

export async function triggerThemeImportFromRuntime(
  locals: App.Locals,
  payload: TriggerPayload
): Promise<void> {
  const runtimeEnv = (locals.runtime?.env ?? {}) as Record<string, unknown>;
  const dispatchRepo = String(runtimeEnv["THEME_IMPORT_DISPATCH_REPO"] ?? "").trim();
  const token = String(runtimeEnv["THEME_IMPORT_GITHUB_TOKEN"] ?? "").trim();
  const eventType = String(runtimeEnv["THEME_IMPORT_EVENT_TYPE"] ?? "theme_import_requested").trim();

  if (!dispatchRepo || !token) {
    console.warn(
      "[themes] import trigger skipped: missing THEME_IMPORT_DISPATCH_REPO or THEME_IMPORT_GITHUB_TOKEN"
    );
    return;
  }

  const response = await fetch(`https://api.github.com/repos/${dispatchRepo}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "edgepress-theme-import",
    },
    body: JSON.stringify({
      event_type: eventType,
      client_payload: payload,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`GitHub dispatch failed (${response.status}): ${body.slice(0, 500)}`);
  }
}
