/**
 * Extrai texto plain de body_blocks (BlockNote JSON) para indexação FTS.
 */
export function extractPlainTextFromBodyBlocks(raw: string | null | undefined): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed || trimmed === "[]") return "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return "";
  }

  const parts: string[] = [];
  collectTextFromNode(parsed, parts);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function collectTextFromNode(node: unknown, parts: string[]): void {
  if (node == null) return;

  if (typeof node === "string") {
    const text = node.trim();
    if (text) parts.push(text);
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      collectTextFromNode(item, parts);
    }
    return;
  }

  if (typeof node !== "object") return;

  const record = node as Record<string, unknown>;

  if (typeof record.text === "string" && record.text.trim()) {
    parts.push(record.text.trim());
  }

  for (const key of ["content", "children", "props", "rows", "cells"]) {
    if (key in record) {
      collectTextFromNode(record[key], parts);
    }
  }
}
