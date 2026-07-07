import { describe, expect, it, vi, beforeEach } from "vitest";
import { getTableContentListResult } from "../edgepress-content.ts";

const mockGetTableContentWithCache = vi.fn();
const mockGetPostsCustomFieldsBatch = vi.fn();
const mockGetPostCustomFields = vi.fn();

vi.mock("../../../utils/content-cache.ts", () => ({
  getTableContentWithCache: (...args: unknown[]) => mockGetTableContentWithCache(...args),
}));

vi.mock("../../../utils/content-post-payload.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../utils/content-post-payload.ts")>();
  return {
    ...actual,
    getPostsCustomFieldsBatch: (...args: unknown[]) => mockGetPostsCustomFieldsBatch(...args),
    getPostCustomFields: (...args: unknown[]) => mockGetPostCustomFields(...args),
  };
});

describe("getTableContentListResult include=custom_fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTableContentWithCache.mockResolvedValue({
      items: [
        { id: 10, title: "Member A", meta_values: "{}" },
        { id: 11, title: "Member B", meta_values: "{}" },
      ],
      total: 2,
      page: 1,
      limit: 10,
      totalPages: 1,
      columns: ["id", "title", "meta_values"],
    });
    mockGetPostsCustomFieldsBatch.mockResolvedValue(
      new Map([
        [
          10,
          [
            {
              id: 201,
              title: "Dados da Equipe",
              slug: "dados-da-equipe",
              fields: [{ name: "cargo", value: "Sócio", type: "text" }],
            },
          ],
        ],
      ]),
    );
  });

  it("attaches custom_fields when include=custom_fields", async () => {
    const result = await getTableContentListResult(null, "posts", {
      include: "custom_fields",
      limit: "10",
    });

    expect(mockGetPostsCustomFieldsBatch).toHaveBeenCalledTimes(1);
    expect(mockGetPostsCustomFieldsBatch).toHaveBeenCalledWith(expect.anything(), [10, 11]);
    expect(mockGetPostCustomFields).not.toHaveBeenCalled();

    expect(result.items[0]).toMatchObject({
      id: 10,
      custom_fields: [
        expect.objectContaining({
          title: "Dados da Equipe",
          fields: [expect.objectContaining({ name: "cargo" })],
        }),
      ],
    });
    expect(result.items[1]).toMatchObject({ id: 11, custom_fields: [] });
  });

  it("does not attach custom_fields without include param", async () => {
    const result = await getTableContentListResult(null, "posts", { limit: "10" });

    expect(mockGetPostsCustomFieldsBatch).not.toHaveBeenCalled();
    expect(result.items[0]).not.toHaveProperty("custom_fields");
  });
});
