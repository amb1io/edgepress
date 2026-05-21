/**
 * Testes para runtime-locals (getKvFromLocals, isAuthenticatedFromLocals, getCacheKvFromLocals).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:workers";
import {
  getKvFromLocals,
  isAuthenticatedFromLocals,
  getCacheKvFromLocals,
} from "../runtime-locals.ts";

function clearTestEnv() {
  for (const k of Object.keys(env)) {
    delete env[k];
  }
}

describe("runtime-locals", () => {
  const mockKv = {
    get: async () => null,
    put: async () => {},
  };

  beforeEach(() => {
    clearTestEnv();
  });

  describe("getKvFromLocals", () => {
    it("retorna null quando edgepress_cache não está no env", () => {
      expect(getKvFromLocals({} as App.Locals)).toBeNull();
      expect(getKvFromLocals({ user: null, session: null } as App.Locals)).toBeNull();
    });

    it("retorna KV quando edgepress_cache está no env do Worker", () => {
      env.edgepress_cache = mockKv;
      expect(getKvFromLocals({} as App.Locals)).toBe(mockKv);
    });
  });

  describe("isAuthenticatedFromLocals", () => {
    it("retorna false quando user é null ou ausente", () => {
      expect(isAuthenticatedFromLocals({} as App.Locals)).toBe(false);
      expect(isAuthenticatedFromLocals({ user: null } as App.Locals)).toBe(false);
    });

    it("retorna true quando user está presente", () => {
      expect(
        isAuthenticatedFromLocals({ user: { id: "1", email: "a@b.com" } } as App.Locals)
      ).toBe(true);
    });
  });

  describe("getCacheKvFromLocals", () => {
    it("retorna null quando autenticado (bypass de cache)", () => {
      env.edgepress_cache = mockKv;
      const locals = {
        user: { id: "1", email: "a@b.com" },
      } as App.Locals;
      expect(getCacheKvFromLocals(locals)).toBeNull();
    });

    it("retorna KV quando não autenticado e KV disponível", () => {
      env.edgepress_cache = mockKv;
      const locals = {
        user: null,
        session: null,
      } as App.Locals;
      expect(getCacheKvFromLocals(locals)).toBe(mockKv);
    });

    it("retorna null quando não autenticado mas KV ausente", () => {
      const locals = { user: null, session: null } as App.Locals;
      expect(getCacheKvFromLocals(locals)).toBeNull();
    });
  });
});
