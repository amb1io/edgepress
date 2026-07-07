import { describe, it, expect } from "vitest";
import { normalizeTemplateKey } from "../resolve-template.ts";

describe("resolve-template", () => {
  it("normalizes template keys", () => {
    expect(normalizeTemplateKey("templates/trabalhos/[categorias].liquid")).toBe(
      "trabalhos/[categorias]",
    );
    expect(normalizeTemplateKey("index.liquid")).toBe("index");
  });
});
