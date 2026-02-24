/**
 * Testes para runtime-locals (getKvFromLocals, isAuthenticatedFromLocals, getCacheKvFromLocals).
 */
import { describe, it, expect } from "vitest";
import {
  getKvFromLocals,
  isAuthenticatedFromLocals,
  getCacheKvFromLocals,
} from "../runtime-locals.ts";

describe("runtime-locals", () => {
  const mockKv = {
    get: async () => null,
    put: async () => {},
  };

  describe("getKvFromLocals", () => {
    it("retorna null quando locals não tem runtime", () => {
      expect(getKvFromLocals({} as App.Locals)).toBeNull();
      expect(getKvFromLocals({ user: null, session: null } as App.Locals)).toBeNull();
    });

    it("retorna null quando runtime.env não tem edgepress_cache", () => {
      expect(
        getKvFromLocals({ runtime: { env: {} } } as App.Locals)
      ).toBeNull();
    });

    it("retorna KV quando presente em locals.runtime.env.edgepress_cache", () => {
      const locals = {
        runtime: { env: { edgepress_cache: mockKv } },
      } as App.Locals;
      expect(getKvFromLocals(locals)).toBe(mockKv);
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
      const locals = {
        user: { id: "1", email: "a@b.com" },
        runtime: { env: { edgepress_cache: mockKv } },
      } as App.Locals;
      expect(getCacheKvFromLocals(locals)).toBeNull();
    });

    it("retorna KV quando não autenticado e KV disponível", () => {
      const locals = {
        user: null,
        session: null,
        runtime: { env: { edgepress_cache: mockKv } },
      } as App.Locals;
      expect(getCacheKvFromLocals(locals)).toBe(mockKv);
    });

    it("retorna null quando não autenticado mas KV ausente", () => {
      const locals = { user: null, session: null } as App.Locals;
      expect(getCacheKvFromLocals(locals)).toBeNull();
    });
  });
});
