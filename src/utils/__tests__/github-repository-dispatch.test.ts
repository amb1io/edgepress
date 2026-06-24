import { describe, expect, it } from "vitest";
import { toRepositoryDispatchClientPayload } from "../../core/services/github-repository-dispatch.ts";

describe("github-repository-dispatch", () => {
  it("coerces client_payload values to strings for GitHub API", () => {
    expect(
      toRepositoryDispatchClientPayload({
        theme_post_id: 42,
        theme_slug: "my-theme",
        ref: "main",
        subdir: "",
        requested_by: "user-1",
      })
    ).toEqual({
      theme_post_id: "42",
      theme_slug: "my-theme",
      ref: "main",
      subdir: "",
      requested_by: "user-1",
    });
  });

  it("omits null and undefined payload fields", () => {
    expect(
      toRepositoryDispatchClientPayload({
        theme_post_id: 1,
        subdir: undefined,
        requested_by: null,
      })
    ).toEqual({
      theme_post_id: "1",
    });
  });
});
