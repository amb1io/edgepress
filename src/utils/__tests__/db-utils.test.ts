/**
 * Testes para db-utils (getSafeTableName, escapeIdentifier, VALID_TABLE_IDENTIFIER, getContentApiRuntime).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:workers";
import {
  getSafeTableName,
  escapeIdentifier,
  VALID_TABLE_IDENTIFIER,
  getContentApiRuntime,
  findPhysicalTableName,
  resolveTableName,
} from "../db-utils.ts";

function clearTestEnv() {
  for (const k of Object.keys(env)) {
    delete env[k];
  }
}

describe("db-utils", () => {
  beforeEach(() => {
    clearTestEnv();
  });

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
    it("retorna nome físico quando param lógico é válido e permitido", () => {
      expect(getSafeTableName("posts", ["posts", "settings"])).toBe("edp_posts");
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

  describe("findPhysicalTableName", () => {
    it("retorna nome exato quando presente", () => {
      expect(findPhysicalTableName("user", ["posts", "user"])).toBe("user");
    });

    it("retorna tabela prefixada quando nome exato não existe", () => {
      expect(findPhysicalTableName("user", ["edp_posts", "edp_user"])).toBe("edp_user");
    });

    it("retorna null quando nenhuma tabela corresponde", () => {
      expect(findPhysicalTableName("user", ["posts", "settings"])).toBeNull();
    });
  });

  describe("resolveTableName", () => {
    it("resolve tipos lógicos de schema (user, settings)", () => {
      expect(resolveTableName("user", ["edp_user"])).toBe("edp_user");
      expect(resolveTableName("settings", ["settings"])).toBe("settings");
    });

    it("resolve tabelas dinâmicas pelo nome exato", () => {
      expect(resolveTableName("posts", ["posts", "user"])).toBe("posts");
    });

    it("retorna null para post types sem tabela homônima", () => {
      expect(resolveTableName("post", ["posts", "user"])).toBeNull();
    });
  });

  describe("getContentApiRuntime", () => {
    it("retorna isAuthenticated true e kv null quando user presente", () => {
      env.CACHE = {};
      const locals = {
        user: { id: "1", email: "a@b.com" },
      } as App.Locals;
      const r = getContentApiRuntime(locals);
      expect(r.isAuthenticated).toBe(true);
      expect(r.kv).toBeNull();
    });

    it("retorna isAuthenticated false e kv quando user ausente e KV presente", () => {
      const mockKv = { get: async () => null, put: async () => {} };
      env.CACHE = mockKv;
      const locals = {
        user: null,
        session: null,
      } as App.Locals;
      const r = getContentApiRuntime(locals);
      expect(r.isAuthenticated).toBe(false);
      expect(r.kv).toBe(mockKv);
    });
  });
});
