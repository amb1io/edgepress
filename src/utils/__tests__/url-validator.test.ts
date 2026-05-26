/**
 * Testes para validação de URLs
 * Para executar: npm test
 */

import { describe, it, expect } from "vitest";
import {
  isValidCallbackURL,
  sanitizeCallbackURL,
  isAllowedCallbackPath,
  isValidAndAllowedCallbackURL,
} from "../url-validator.ts";

describe("url-validator", () => {
  const baseURL = "http://localhost:8788";

  describe("isValidCallbackURL", () => {
    it("aceita paths relativos válidos", () => {
      expect(isValidCallbackURL("/admin", baseURL)).toBe(true);
      expect(isValidCallbackURL("/pt-br/admin", baseURL)).toBe(true);
      expect(isValidCallbackURL("/admin/content", baseURL)).toBe(true);
    });

    it("rejeita double-slash redirects", () => {
      expect(isValidCallbackURL("//evil.com", baseURL)).toBe(false);
      expect(isValidCallbackURL("//evil.com/phishing", baseURL)).toBe(false);
    });

    it("aceita URLs absolutas com mesma origem", () => {
      expect(isValidCallbackURL("http://localhost:8788/admin", baseURL)).toBe(true);
      expect(isValidCallbackURL("http://localhost:8788/pt-br/admin", baseURL)).toBe(true);
    });

    it("rejeita URLs absolutas de outras origens", () => {
      expect(isValidCallbackURL("http://evil.com", baseURL)).toBe(false);
      expect(isValidCallbackURL("https://evil.com/steal", baseURL)).toBe(false);
      expect(isValidCallbackURL("http://phishing.com/admin", baseURL)).toBe(false);
    });

    it("rejeita URLs vazias ou undefined", () => {
      expect(isValidCallbackURL("", baseURL)).toBe(false);
      expect(isValidCallbackURL("   ", baseURL)).toBe(false);
    });

    it("rejeita javascript: URLs", () => {
      expect(isValidCallbackURL("javascript:alert(1)", baseURL)).toBe(false);
    });

    it("rejeita data: URLs", () => {
      expect(isValidCallbackURL("data:text/html,<script>alert(1)</script>", baseURL)).toBe(false);
    });
  });

  describe("sanitizeCallbackURL", () => {
    it("retorna URL válida sem modificação", () => {
      expect(sanitizeCallbackURL("/admin", baseURL)).toBe("/admin");
      expect(sanitizeCallbackURL("/pt-br/admin", baseURL)).toBe("/pt-br/admin");
    });

    it("retorna fallback para URL inválida", () => {
      expect(sanitizeCallbackURL("http://evil.com", baseURL)).toBe("/admin");
      expect(sanitizeCallbackURL("//evil.com", baseURL)).toBe("/admin");
    });

    it("usa fallback customizado", () => {
      expect(sanitizeCallbackURL("http://evil.com", baseURL, "/home")).toBe("/home");
      expect(sanitizeCallbackURL(undefined, baseURL, "/home")).toBe("/home");
    });

    it("retorna fallback para undefined", () => {
      expect(sanitizeCallbackURL(undefined, baseURL)).toBe("/admin");
      expect(sanitizeCallbackURL(undefined, baseURL, "/custom")).toBe("/custom");
    });
  });

  describe("isAllowedCallbackPath", () => {
    it("aceita paths da whitelist", () => {
      expect(isAllowedCallbackPath("/admin")).toBe(true);
      expect(isAllowedCallbackPath("/pt-br/admin")).toBe(true);
      expect(isAllowedCallbackPath("/en/admin")).toBe(true);
      expect(isAllowedCallbackPath("/es/admin")).toBe(true);
    });

    it("aceita subpaths de paths permitidos", () => {
      expect(isAllowedCallbackPath("/admin/content")).toBe(true);
      expect(isAllowedCallbackPath("/pt-br/admin/list")).toBe(true);
      expect(isAllowedCallbackPath("/en/admin/settings")).toBe(true);
    });

    it("rejeita paths fora da whitelist", () => {
      expect(isAllowedCallbackPath("/public")).toBe(false);
      expect(isAllowedCallbackPath("/api")).toBe(false);
      expect(isAllowedCallbackPath("/login")).toBe(false);
    });

    it("rejeita double-slash", () => {
      expect(isAllowedCallbackPath("//admin")).toBe(false);
      expect(isAllowedCallbackPath("//evil.com")).toBe(false);
    });

    it("rejeita paths sem leading slash", () => {
      expect(isAllowedCallbackPath("admin")).toBe(false);
      expect(isAllowedCallbackPath("pt-br/admin")).toBe(false);
    });
  });

  describe("isValidAndAllowedCallbackURL", () => {
    it("aceita URLs válidas e permitidas", () => {
      expect(isValidAndAllowedCallbackURL("/admin", baseURL)).toBe(true);
      expect(isValidAndAllowedCallbackURL("/pt-br/admin/content", baseURL)).toBe(true);
    });

    it("rejeita URLs inválidas mesmo se path é permitido", () => {
      expect(isValidAndAllowedCallbackURL("//admin", baseURL)).toBe(false);
    });

    it("rejeita URLs válidas mas não permitidas", () => {
      expect(isValidAndAllowedCallbackURL("/public", baseURL)).toBe(false);
      expect(isValidAndAllowedCallbackURL("/api", baseURL)).toBe(false);
    });

    it("aceita URLs absolutas permitidas", () => {
      expect(
        isValidAndAllowedCallbackURL("http://localhost:8788/admin", baseURL)
      ).toBe(true);
      expect(
        isValidAndAllowedCallbackURL("http://localhost:8788/pt-br/admin/list", baseURL)
      ).toBe(true);
    });

    it("rejeita URLs absolutas de outras origens", () => {
      expect(isValidAndAllowedCallbackURL("http://evil.com/admin", baseURL)).toBe(false);
    });
  });
});
