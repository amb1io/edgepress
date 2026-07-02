import { describe, it, expect } from "vitest";
import { extractPlainTextFromBodyBlocks } from "../extract-plain-text-from-body-blocks.ts";

describe("extractPlainTextFromBodyBlocks", () => {
  it("returns empty for null, empty or invalid JSON", () => {
    expect(extractPlainTextFromBodyBlocks(null)).toBe("");
    expect(extractPlainTextFromBodyBlocks("")).toBe("");
    expect(extractPlainTextFromBodyBlocks("[]")).toBe("");
    expect(extractPlainTextFromBodyBlocks("{invalid")).toBe("");
  });

  it("extracts text from BlockNote-like blocks", () => {
    const blocks = JSON.stringify([
      {
        type: "paragraph",
        content: [{ type: "text", text: "Hello " }, { type: "text", text: "world" }],
      },
      {
        type: "heading",
        content: [{ type: "text", text: "Section title" }],
      },
    ]);
    expect(extractPlainTextFromBodyBlocks(blocks)).toBe("Hello world Section title");
  });

  it("walks nested children and props", () => {
    const blocks = JSON.stringify({
      children: [{ text: "nested value" }],
    });
    expect(extractPlainTextFromBodyBlocks(blocks)).toBe("nested value");
  });
});
