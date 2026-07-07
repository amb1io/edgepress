import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getPostCustomFields,
  getPostsCustomFieldsBatch,
} from "../content-post-payload.ts";

const mockGetPostTypeId = vi.fn();
const mockSelect = vi.fn();

vi.mock("../services/post-service.ts", () => ({
  getPostTypeId: (...args: unknown[]) => mockGetPostTypeId(...args),
}));

vi.mock("../../db/schema.ts", () => ({
  posts: {
    id: "id",
    parent_id: "parent_id",
    post_type_id: "post_type_id",
    title: "title",
    slug: "slug",
    meta_values: "meta_values",
  },
}));

function chainSelect(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
  };
  mockSelect.mockReturnValue(chain);
  return chain;
}

describe("getPostsCustomFieldsBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPostTypeId.mockResolvedValue(99);
  });

  it("returns empty map when postIds is empty", async () => {
    const db = { select: mockSelect } as never;
    const result = await getPostsCustomFieldsBatch(db, []);
    expect(result.size).toBe(0);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("groups custom field blocks by parent_id", async () => {
    chainSelect([
      {
        id: 201,
        parent_id: 10,
        title: "Dados da Equipe",
        slug: "dados-da-equipe",
        meta_values: JSON.stringify({
          fields: [
            { name: "cargo", value: "Sócio", type: "text" },
            { name: "dono", value: "sim", type: "text" },
          ],
        }),
      },
      {
        id: 202,
        parent_id: 11,
        title: "Dados da Equipe",
        slug: "dados-da-equipe",
        meta_values: JSON.stringify({
          fields: [{ name: "cargo", value: "Designer", type: "text" }],
        }),
      },
    ]);

    const db = { select: mockSelect } as never;
    const result = await getPostsCustomFieldsBatch(db, [10, 11]);

    expect(result.get(10)).toEqual([
      expect.objectContaining({
        title: "Dados da Equipe",
        fields: [
          { name: "cargo", value: "Sócio", type: "text" },
          { name: "dono", value: "sim", type: "text" },
        ],
      }),
    ]);
    expect(result.get(11)?.[0]?.fields[0]?.name).toBe("cargo");
  });

  it("uses a single query for multiple posts (no N+1)", async () => {
    const chain = chainSelect([]);
    const db = { select: mockSelect } as never;

    await getPostsCustomFieldsBatch(db, [1, 2, 3]);

    expect(mockGetPostTypeId).toHaveBeenCalledTimes(1);
    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(chain.where).toHaveBeenCalledTimes(1);
  });

  it("chunks large post id lists to stay under D1 bound parameter limit", async () => {
    const postIds = Array.from({ length: 150 }, (_, i) => i + 1);
    chainSelect([]);

    const db = { select: mockSelect } as never;
    await getPostsCustomFieldsBatch(db, postIds);

    expect(mockSelect).toHaveBeenCalledTimes(2);
  });
});

describe("getPostCustomFields vs batch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPostTypeId.mockResolvedValue(99);
  });

  it("getPostCustomFields still works for a single post", async () => {
    chainSelect([
      {
        id: 301,
        title: "Dados da Equipe",
        slug: "dados-da-equipe",
        meta_values: JSON.stringify({
          fields: [{ name: "cargo", value: "Diretor", type: "text" }],
        }),
      },
    ]);

    const db = { select: mockSelect } as never;
    const items = await getPostCustomFields(db, 42);

    expect(items[0]?.fields[0]?.name).toBe("cargo");
    expect(items[0]?.fields[0]?.value).toBe("Diretor");
  });
});
