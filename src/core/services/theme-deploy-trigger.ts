import { env as cfEnv } from "cloudflare:workers";
import type { ThemeImportState, ThemeImportStatus } from "./theme-service.ts";
import { postRepositoryDispatch } from "./github-repository-dispatch.ts";

export type DeployTriggerPayload = {
  theme_post_id: number;
  theme_slug: string;
  requested_by: string;
};

/**
 * Dispara deploy do Worker somente na primeira ativação bem-sucedida.
 * Evita deploy duplicado em retries do callback de import.
 */
export function shouldTriggerWorkerDeployAfterActivation(
  previousState: ThemeImportState,
  canActivate: boolean
): boolean {
  if (!canActivate) return false;
  if (
    previousState.is_active &&
    (previousState.import_status === "ready" ||
      previousState.import_status === "deploying")
  ) {
    return false;
  }
  return true;
}

export function resolveThemeImportCallbackOutcome(input: {
  previousState: ThemeImportState;
  success: boolean;
  canActivate: boolean;
}): {
  shouldTriggerDeploy: boolean;
  importStatus: ThemeImportStatus;
} {
  const shouldTriggerDeploy = shouldTriggerWorkerDeployAfterActivation(
    input.previousState,
    input.canActivate
  );

  let importStatus: ThemeImportStatus;
  if (input.canActivate) {
    importStatus = shouldTriggerDeploy ? "deploying" : "ready";
  } else if (input.success) {
    importStatus = "packaged";
  } else {
    importStatus = "failed";
  }

  return { shouldTriggerDeploy, importStatus };
}

export async function triggerWorkerDeployFromRuntime(
  _locals: App.Locals,
  payload: DeployTriggerPayload
): Promise<void> {
  const dispatchRepo = String(cfEnv.THEME_IMPORT_DISPATCH_REPO ?? "").trim();
  const token = String(cfEnv.THEME_IMPORT_GITHUB_TOKEN ?? "").trim();
  const eventType = String(cfEnv.THEME_DEPLOY_EVENT_TYPE ?? "edgepress_deploy").trim();

  if (!dispatchRepo || !token) {
    console.warn(
      "[themes] deploy trigger skipped: missing THEME_IMPORT_DISPATCH_REPO or THEME_IMPORT_GITHUB_TOKEN"
    );
    return;
  }

  await postRepositoryDispatch({
    dispatchRepo,
    token,
    eventType,
    clientPayload: payload,
    userAgent: "edgepress-theme-deploy",
    logLabel: "deploy trigger",
  });
}
