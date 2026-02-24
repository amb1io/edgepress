/**
 * Testes para db-utils (getSafeTableName, escapeIdentifier, VALID_TABLE_IDENTIFIER, getContentApiRuntime).
 */
import { describe, it, expect } from "vitest";
import {
  getSafeTableName,
  escapeIdentifier,
  VALID_TABLE_IDENTIFIER,
  getContentApiRuntime,
} from "../db-utils.ts";

describe("db-utils", () => {
  describe("VALID_TABLE_IDENTIFIER", () => {
    it("aceita identificadores SQL válidos", () => {
      expect(VALID_TABLE_IDENTIFIER.test("posts")).toBe(true);
      expect(VALID_TABLE_IDENTIFIER.test("post_types")).toBe(true);
      expect(VALID_TABLE_IDENTIFIER.test("_private")).toBe(true);
    });

    it("rejeita inválidos", () => {
      expect(VALID_TABLE_IDENTIFIER.test("123")).toBe(false);
      expect(VALID_TABLE_IDENTIFIER.test("post-types")).toBe(false);
      expect(VALID_TABLE_IDENTIFIER.test("")).toBe(false);
    });
  });

  describe("getSafeTableName", () => {
    it("retorna param quando válido e permitido", () => {
      expect(getSafeTableName("posts", ["posts", "settings"])).toBe("posts");
    });

    it("retorna null quando param não está na lista", () => {
      expect(getSafeTableName("other", ["posts"])).toBeNull();
    });

    it("retorna null quando param não é identificador válido", () => {
      expect(getSafeTableName("123", ["123"])).toBeNull();
    });
  });

  describe("escapeIdentifier", () => {
    it("duplica aspas duplas", () => {
      expect(escapeIdentifier('table"name')).toBe('table""name');
    });

    it("mantém nome sem aspas", () => {
      expect(escapeIdentifier("posts")).toBe("posts");
    });
  });

  describe("getContentApiRuntime", () => {
    it("retorna isAuthenticated true e kv null quando user presente", () => {
      const locals = {
        user: { id: "1", email: "a@b.com" },
        runtime: { env: { edgepress_cache: {} } },
      } as App.Locals;
      const r = getContentApiRuntime(locals);
      expect(r.isAuthenticated).toBe(true);
      expect(r.kv).toBeNull();
    });

    it("retorna isAuthenticated false e kv quando user ausente e KV presente", () => {
      const mockKv = { get: async () => null, put: async () => {} };
      const locals = {
        user: null,
        session: null,
        runtime: { env: { edgepress_cache: mockKv } },
      } as App.Locals;
      const r = getContentApiRuntime(locals);
      expect(r.isAuthenticated).toBe(false);
      expect(r.kv).toBe(mockKv);
    });
  });
});
