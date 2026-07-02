import { beforeEach, describe, expect, it, vi } from "vitest";
import { processImportStep } from "../import-queue-consumer.ts";
import type { ImportJobState } from "../import-job-state.ts";

const writeImportJob = vi.fn();
const readImportJob = vi.fn();
const markImportJobFailed = vi.fn();

vi.mock("../import-job-state.ts", () => ({
  readImportJob: (...args: unknown[]) => readImportJob(...args),
  writeImportJob: (...args: unknown[]) => writeImportJob(...args),
  markImportJobFailed: (...args: unknown[]) => markImportJobFailed(...args),
}));

const wipeDatabase = vi.fn();
const wipeFtsTable = vi.fn();
const insertRowsInBatches = vi.fn();
const resetAutoIncrementSequences = vi.fn();

vi.mock("../edgepress-archive.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../edgepress-archive.ts")>();
  return {
    ...actual,
    wipeDatabase: (...args: unknown[]) => wipeDatabase(...args),
    wipeFtsTable: (...args: unknown[]) => wipeFtsTable(...args),
    insertRowsInBatches: (...args: unknown[]) => insertRowsInBatches(...args),
    resetAutoIncrementSequences: (...args: unknown[]) => resetAutoIncrementSequences(...args),
  };
});

vi.mock("../import-staging.ts", () => ({
  importStagingKey: (jobId: string, relative: string) => `imports/${jobId}/${relative}`,
  readStagedTableRows: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
  readStagedFtsRows: vi.fn().mockResolvedValue([]),
  readStagedMediaFiles: vi.fn().mockResolvedValue([]),
  readStagedThemeFiles: vi.fn().mockResolvedValue([]),
  readStagedArchiveBuffer: vi.fn(),
  deleteImportStaging: vi.fn(),
}));

function buildJob(overrides: Partial<ImportJobState> = {}): ImportJobState {
  return {
    status: "queued",
    steps: [
      { type: "wipe_database" },
      { type: "insert_table", table: "posts", offset: 0, limit: 2 },
      { type: "finalize" },
    ],
    stepIndex: 0,
    totalSteps: 3,
    phaseLabel: "queued",
    countsSoFar: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function buildEnv() {
  const send = vi.fn();
  return {
    env: {
      DB: {} as D1Database,
      CACHE: {
        get: vi.fn(),
        put: vi.fn(),
      },
      MEDIA_BUCKET: {
        get: vi.fn().mockResolvedValue({
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(JSON.stringify({ mediaCount: 0 })));
              controller.close();
            },
          }),
        }),
        put: vi.fn(),
        list: vi.fn(),
        delete: vi.fn(),
      },
      IMPORT_QUEUE: { send },
    },
    send,
  };
}

describe("processImportStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wipeDatabase.mockResolvedValue(undefined);
    wipeFtsTable.mockResolvedValue(undefined);
    insertRowsInBatches.mockResolvedValue(undefined);
    resetAutoIncrementSequences.mockResolvedValue(undefined);
  });

  it("acks stale steps without reprocessing", async () => {
    readImportJob.mockResolvedValue(buildJob({ stepIndex: 2 }));
    const { env } = buildEnv();

    await processImportStep("job-1", 1, env);

    expect(wipeDatabase).not.toHaveBeenCalled();
    expect(env.IMPORT_QUEUE.send).not.toHaveBeenCalled();
  });

  it("executes a step and enqueues the next one", async () => {
    readImportJob.mockResolvedValue(buildJob());
    const { env, send } = buildEnv();

    await processImportStep("job-1", 0, env);

    expect(wipeDatabase).toHaveBeenCalledTimes(1);
    expect(wipeFtsTable).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ jobId: "job-1", stepIndex: 1 });
    expect(writeImportJob).toHaveBeenCalled();
  });

  it("marks the job failed and rethrows on step errors", async () => {
    readImportJob.mockResolvedValue(buildJob());
    wipeDatabase.mockRejectedValue(new Error("boom", { cause: "D1 limit" }));
    const { env } = buildEnv();

    await expect(processImportStep("job-1", 0, env)).rejects.toThrow("boom");
    expect(markImportJobFailed).toHaveBeenCalled();
  });

  it("skips processing when job already failed", async () => {
    readImportJob.mockResolvedValue(buildJob({ status: "failed" }));
    const { env } = buildEnv();

    await processImportStep("job-1", 0, env);

    expect(wipeDatabase).not.toHaveBeenCalled();
  });
});
