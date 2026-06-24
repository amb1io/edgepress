import { describe, expect, it, vi, beforeEach } from "vitest";
import { env } from "cloudflare:workers";
import {
  resolveThemeImportCallbackOutcome,
  shouldTriggerWorkerDeployAfterActivation,
  triggerWorkerDeployFromRuntime,
} from "../../core/services/theme-deploy-trigger.ts";

function clearTestEnv() {
  for (const k of Object.keys(env)) {
    delete env[k];
  }
}

describe("theme-deploy-trigger", () => {
  beforeEach(() => {
    clearTestEnv();
  });

  it("does not trigger deploy when activation is not possible", () => {
    expect(
      shouldTriggerWorkerDeployAfterActivation(
        { requested_active: true, is_active: false, import_status: "importing" },
        false
      )
    ).toBe(false);
  });

  it("triggers deploy on first successful activation", () => {
    expect(
      shouldTriggerWorkerDeployAfterActivation(
        { requested_active: true, is_active: false, import_status: "importing" },
        true
      )
    ).toBe(true);
  });

  it("skips deploy when theme is already active and ready", () => {
    expect(
      shouldTriggerWorkerDeployAfterActivation(
        { requested_active: false, is_active: true, import_status: "ready" },
        true
      )
    ).toBe(false);
  });

  it("skips deploy when theme is already deploying", () => {
    expect(
      shouldTriggerWorkerDeployAfterActivation(
        { requested_active: false, is_active: true, import_status: "deploying" },
        true
      )
    ).toBe(false);
  });

  it("resolves callback outcome for failed import without deploy", () => {
    const outcome = resolveThemeImportCallbackOutcome({
      previousState: {
        requested_active: true,
        is_active: false,
        import_status: "importing",
      },
      success: false,
      canActivate: false,
    });

    expect(outcome).toEqual({
      shouldTriggerDeploy: false,
      importStatus: "failed",
    });
  });

  it("resolves callback outcome for first activation with deploying status", () => {
    const outcome = resolveThemeImportCallbackOutcome({
      previousState: {
        requested_active: true,
        is_active: false,
        import_status: "importing",
      },
      success: true,
      canActivate: true,
    });

    expect(outcome).toEqual({
      shouldTriggerDeploy: true,
      importStatus: "deploying",
    });
  });

  it("resolves callback outcome for retry without duplicate deploy", () => {
    const outcome = resolveThemeImportCallbackOutcome({
      previousState: {
        requested_active: false,
        is_active: true,
        import_status: "ready",
      },
      success: true,
      canActivate: true,
    });

    expect(outcome).toEqual({
      shouldTriggerDeploy: false,
      importStatus: "ready",
    });
  });

  it("does not throw when deploy dispatch config is missing", async () => {
    await expect(
      triggerWorkerDeployFromRuntime({} as App.Locals, {
        theme_post_id: 1,
        theme_slug: "theme-a",
        requested_by: "theme-import-callback",
      })
    ).resolves.toBeUndefined();
  });

  it("throws when GitHub deploy dispatch responds with error", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("forbidden", { status: 403 }));

    env.THEME_IMPORT_DISPATCH_REPO = "acme/edgepress";
    env.THEME_IMPORT_GITHUB_TOKEN = "token";

    await expect(
      triggerWorkerDeployFromRuntime({} as App.Locals, {
        theme_post_id: 1,
        theme_slug: "theme-a",
        requested_by: "theme-import-callback",
      })
    ).rejects.toThrow("deploy trigger failed");

    fetchMock.mockRestore();
  });

  it("uses THEME_DEPLOY_EVENT_TYPE when configured", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    env.THEME_IMPORT_DISPATCH_REPO = "acme/edgepress";
    env.THEME_IMPORT_GITHUB_TOKEN = "token";
    env.THEME_DEPLOY_EVENT_TYPE = "custom_deploy";

    await triggerWorkerDeployFromRuntime({} as App.Locals, {
      theme_post_id: 42,
      theme_slug: "my-theme",
      requested_by: "theme-import-callback",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.event_type).toBe("custom_deploy");
    expect(body.client_payload).toEqual({
      theme_post_id: "42",
      theme_slug: "my-theme",
      requested_by: "theme-import-callback",
    });

    fetchMock.mockRestore();
  });
});
