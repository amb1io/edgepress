/**
 * Testes do endpoint GET /api/import/:jobId
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { env } from "cloudflare:workers";

const mockAuthUser = { user: { id: "admin", role: 0 }, session: { id: "s1", userId: "admin" } };

const requireMinRoleMock = vi.fn().mockResolvedValue(mockAuthUser);

vi.mock("../../../utils/api-auth.ts", () => ({
  requireMinRole: (...args: unknown[]) => requireMinRoleMock(...args),
}));

const readImportJobMock = vi.fn();

vi.mock("../../../core/services/import-job-state.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../core/services/import-job-state.ts")>();
  return {
    ...actual,
    readImportJob: (...args: unknown[]) => readImportJobMock(...args),
  };
});

function clearTestEnv() {
  for (const key of Object.keys(env)) {
    delete env[key];
  }
}

const sampleJob = {
  status: "running" as const,
  steps: [],
  stepIndex: 2,
  totalSteps: 10,
  phaseLabel: "Restaurando posts (400/1300)",
  pollToken: "secret-poll-token",
  countsSoFar: { posts: 400 },
  createdAt: 1,
  updatedAt: 2,
};

describe("import status API", () => {
  beforeEach(() => {
    clearTestEnv();
    vi.clearAllMocks();
    requireMinRoleMock.mockResolvedValue(mockAuthUser);
    env.CACHE = {
      get: vi.fn(),
      put: vi.fn(),
    };
  });

  it("returns 404 when job is missing", async () => {
    readImportJobMock.mockResolvedValue(null);
    const { GET } = await import("../import/[jobId].ts");
    const response = await GET({
      params: { jobId: "missing" },
      request: new Request("http://localhost/api/import/missing"),
      locals: {} as Parameters<typeof GET>[0]["locals"],
    } as Parameters<typeof GET>[0]);

    expect(response.status).toBe(404);
  });

  it("returns job progress payload with admin session", async () => {
    readImportJobMock.mockResolvedValue(sampleJob);

    const { GET } = await import("../import/[jobId].ts");
    const response = await GET({
      params: { jobId: "job-123" },
      request: new Request("http://localhost/api/import/job-123"),
      locals: {} as Parameters<typeof GET>[0]["locals"],
    } as Parameters<typeof GET>[0]);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({
      jobId: "job-123",
      status: "running",
      phaseLabel: "Restaurando posts (400/1300)",
      percent: 20,
      counts: { posts: 400 },
    });
  });

  it("returns job progress when session is missing but poll token is valid", async () => {
    readImportJobMock.mockResolvedValue(sampleJob);
    requireMinRoleMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "Autenticação necessária" }), { status: 401 }),
    );

    const { GET } = await import("../import/[jobId].ts");
    const response = await GET({
      params: { jobId: "job-123" },
      request: new Request("http://localhost/api/import/job-123", {
        headers: { "X-Import-Poll-Token": "secret-poll-token" },
      }),
      locals: {} as Parameters<typeof GET>[0]["locals"],
    } as Parameters<typeof GET>[0]);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe("running");
  });

  it("returns 401 when session and poll token are invalid", async () => {
    readImportJobMock.mockResolvedValue(sampleJob);
    requireMinRoleMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "Autenticação necessária" }), { status: 401 }),
    );

    const { GET } = await import("../import/[jobId].ts");
    const response = await GET({
      params: { jobId: "job-123" },
      request: new Request("http://localhost/api/import/job-123", {
        headers: { "X-Import-Poll-Token": "wrong-token" },
      }),
      locals: {} as Parameters<typeof GET>[0]["locals"],
    } as Parameters<typeof GET>[0]);

    expect(response.status).toBe(401);
  });
});
