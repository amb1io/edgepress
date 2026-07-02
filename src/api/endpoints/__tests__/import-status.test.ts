/**
 * Testes do endpoint GET /api/import/:jobId
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { env } from "cloudflare:workers";

const mockAuthUser = { user: { id: "admin", role: 0 }, session: { id: "s1", userId: "admin" } };

vi.mock("../../../utils/api-auth.ts", () => ({
  requireMinRole: vi.fn().mockResolvedValue(mockAuthUser),
}));

const readImportJobMock = vi.fn();

vi.mock("../../../core/services/import-job-state.ts", () => ({
  readImportJob: (...args: unknown[]) => readImportJobMock(...args),
}));

function clearTestEnv() {
  for (const key of Object.keys(env)) {
    delete env[key];
  }
}

describe("import status API", () => {
  beforeEach(() => {
    clearTestEnv();
    vi.clearAllMocks();
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

  it("returns job progress payload", async () => {
    readImportJobMock.mockResolvedValue({
      status: "running",
      steps: [],
      stepIndex: 2,
      totalSteps: 10,
      phaseLabel: "Restaurando posts (400/1300)",
      countsSoFar: { posts: 400 },
      createdAt: 1,
      updatedAt: 2,
    });

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
});
