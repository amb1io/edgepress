/**
 * Testes do cache-aside de conteúdo: KV primeiro; em miss, banco; grava no KV só quando resultado não é vazio.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getTableContentWithCache,
  buildContentCacheKey,
  type KVLike,
} from "../content-cache.ts";
import type { GetTableListResult } from "../list-table-dynamic.ts";

const resultWithItems: GetTableListResult = {
  items: [{ name: "site_name", value: "My Site" }],
  total: 1,
  page: 1,
  limit: 10,
  totalPages: 1,
  columns: ["name", "value"],
};

const resultEmpty: GetTableListResult = {
  items: [],
  total: 0,
  page: 1,
  limit: 10,
  totalPages: 0,
  columns: ["name", "value"],
};

const mockGetTableList = vi.fn();
vi.mock("../list-table-dynamic.ts", () => ({
  getTableList: (...args: unknown[]) => mockGetTableList(...args),
}));

describe("buildContentCacheKey", () => {
  it("builds stable key from table and params", () => {
    const key = buildContentCacheKey("settings", { page: 1, limit: 10 });
    expect(key).toMatch(/^content:settings:/);
    expect(buildContentCacheKey("settings", { page: 1, limit: 10 })).toBe(key);
  });

  it("sanitizes invalid table name", () => {
    const key = buildContentCacheKey("invalid-table!", {});
    expect(key).toMatch(/^content:invalid:/);
  });
});

describe("getTableContentWithCache", () => {
  const table = "settings";
  const params = { page: 1, limit: 10 };
  const mockDb = {} as never;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns cached value from KV when key exists and does not call DB", async () => {
    const kv: KVLike = {
      get: vi.fn().mockResolvedValue(resultWithItems),
      put: vi.fn().mockResolvedValue(undefined),
    };

    const result = await getTableContentWithCache({
      kv,
      db: mockDb,
      table,
      params,
    });

    expect(result).toEqual(resultWithItems);
    expect(kv.get).toHaveBeenCalledWith(
      expect.stringMatching(/^content:settings:/),
      "json"
    );
    expect(mockGetTableList).not.toHaveBeenCalled();
  });

  it("on cache miss: fetches from DB and stores in KV when result has items", async () => {
    const kv: KVLike = {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
    };
    mockGetTableList.mockResolvedValue(resultWithItems);

    const result = await getTableContentWithCache({
      kv,
      db: mockDb,
      table,
      params,
    });

    expect(result).toEqual(resultWithItems);
    expect(mockGetTableList).toHaveBeenCalledWith(mockDb, table, params);
    expect(kv.put).toHaveBeenCalledWith(
      expect.stringMatching(/^content:settings:/),
      JSON.stringify(resultWithItems)
    );
  });

  it("on cache miss with empty result: returns result but does not save to KV", async () => {
    const kv: KVLike = {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
    };
    mockGetTableList.mockResolvedValue(resultEmpty);

    const result = await getTableContentWithCache({
      kv,
      db: mockDb,
      table,
      params,
    });

    expect(result).toEqual(resultEmpty);
    expect(result.items).toHaveLength(0);
    expect(kv.put).not.toHaveBeenCalled();
  });

  it("when kv is null: fetches from DB and never calls put", async () => {
    mockGetTableList.mockResolvedValue(resultWithItems);

    const result = await getTableContentWithCache({
      kv: null,
      db: mockDb,
      table,
      params,
    });

    expect(result).toEqual(resultWithItems);
    expect(mockGetTableList).toHaveBeenCalledWith(mockDb, table, params);
  });

  it("when KV.get throws: falls back to DB and still returns result", async () => {
    const kv: KVLike = {
      get: vi.fn().mockRejectedValue(new Error("KV unavailable")),
      put: vi.fn().mockResolvedValue(undefined),
    };
    mockGetTableList.mockResolvedValue(resultWithItems);

    const result = await getTableContentWithCache({
      kv,
      db: mockDb,
      table,
      params,
    });

    expect(result).toEqual(resultWithItems);
    expect(mockGetTableList).toHaveBeenCalled();
  });
});
