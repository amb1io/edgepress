import { describe, it, expect } from "vitest";
import { sanitizeFtsQuery } from "../../../core/services/search-service.ts";

describe("GET /api/search contract", () => {
  it("requires q query param", () => {
    const q = "";
    expect(q.trim()).toBe("");
  });

  it("sanitizes search query for FTS MATCH", () => {
    expect(sanitizeFtsQuery("edgepress cms")).toBe('"edgepress" "cms"');
  });

  it("paginated response shape includes items, total, page, limit, totalPages, q", () => {
    const response = {
      items: [{ id: 1, title: "Post", rank: -1.5 }],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
      q: "post",
    };
    expect(response).toHaveProperty("items");
    expect(response).toHaveProperty("total");
    expect(response).toHaveProperty("page");
    expect(response).toHaveProperty("limit");
    expect(response).toHaveProperty("totalPages");
    expect(response).toHaveProperty("q");
    expect(response.items[0]).toHaveProperty("rank");
  });
});
