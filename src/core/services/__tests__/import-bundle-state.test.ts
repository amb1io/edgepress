import { describe, expect, it } from "vitest";
import {
  isBundleUploadTokenValid,
  validateBundlePartOrder,
} from "../import-job-state.ts";

describe("validateBundlePartOrder", () => {
  const bundleBase = {
    id: "bundle-1",
    partIndex: 1,
    partCount: 3,
    partKind: "base" as const,
  };

  const bundleMedia = {
    id: "bundle-1",
    partIndex: 2,
    partCount: 3,
    partKind: "media" as const,
  };

  it("allows the first base part without prior bundle state", () => {
    expect(validateBundlePartOrder(bundleBase, null)).toBeNull();
  });

  it("rejects media parts before the base part completes", () => {
    expect(validateBundlePartOrder(bundleMedia, null)).toMatch(/parte base/i);
  });

  it("rejects out-of-order media parts", () => {
    expect(
      validateBundlePartOrder(
        { ...bundleMedia, partIndex: 3 },
        { partCount: 3, lastCompletedPart: 1 },
      ),
    ).toMatch(/Parte 2 de 3 esperada/);
  });

  it("accepts the next media part in sequence", () => {
    expect(
      validateBundlePartOrder(bundleMedia, { partCount: 3, lastCompletedPart: 1 }),
    ).toBeNull();
  });
});

describe("isBundleUploadTokenValid", () => {
  it("accepts matching upload tokens", () => {
    const token = "abc-123-def";
    expect(isBundleUploadTokenValid({ uploadToken: token }, token)).toBe(true);
  });

  it("rejects missing or mismatched tokens", () => {
    expect(isBundleUploadTokenValid({ uploadToken: "secret" }, null)).toBe(false);
    expect(isBundleUploadTokenValid({ uploadToken: "secret" }, "wrong")).toBe(false);
  });
});
