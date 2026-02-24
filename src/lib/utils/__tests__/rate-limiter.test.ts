/**
 * Testes para rate limiter
 * Para executar: npm test
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  checkRateLimit,
  getClientIP,
  clearRateLimitStore,
  RATE_LIMITS,
  getRateLimits,
} from "../rate-limiter.ts";

describe("rate-limiter", () => {
  beforeEach(() => {
    // Clear store before each test
    clearRateLimitStore();
  });

  describe("checkRateLimit", () => {
    it("permite primeira requisição", () => {
      const result = checkRateLimit("192.168.1.1", {
        maxRequests: 5,
        windowMs: 60000, // 1 minute
      });

      expect(result.limited).toBe(false);
      expect(result.remaining).toBe(4); // 5 - 1
    });

    it("bloqueia após exceder limite", () => {
      const config = {
        maxRequests: 3,
        windowMs: 60000,
      };
      const identifier = "192.168.1.1";

      // Make 3 requests (limit)
      for (let i = 0; i < 3; i++) {
        checkRateLimit(identifier, config);
      }

      // 4th request should be blocked
      const result = checkRateLimit(identifier, config);
      expect(result.limited).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it("reseta contador após expirar janela", () => {
      const config = {
        maxRequests: 2,
        windowMs: 100, // 100ms
      };
      const identifier = "192.168.1.1";

      // Make 2 requests
      checkRateLimit(identifier, config);
      checkRateLimit(identifier, config);

      // Aguardar janela expirar
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // New request should be allowed
          const result = checkRateLimit(identifier, config);
          expect(result.limited).toBe(false);
          expect(result.remaining).toBe(1); // Nova janela, 2 - 1
          resolve();
        }, 150);
      });
    });

    it("gerencia múltiplos identificadores independentemente", () => {
      const config = {
        maxRequests: 2,
        windowMs: 60000,
      };

      // IP 1 makes 2 requests
      checkRateLimit("192.168.1.1", config);
      checkRateLimit("192.168.1.1", config);

      // IP 2 ainda deve ter limite completo
      const result = checkRateLimit("192.168.1.2", config);
      expect(result.limited).toBe(false);
      expect(result.remaining).toBe(1); // 2 - 1
    });

    it("usa mensagem customizada quando fornecida", () => {
      const config = {
        maxRequests: 1,
        windowMs: 60000,
        message: "Custom error message",
      };
      const identifier = "192.168.1.1";

      // Exceder limite
      checkRateLimit(identifier, config);
      const result = checkRateLimit(identifier, config);

      expect(result.limited).toBe(true);
      expect(result.message).toBe("Custom error message");
    });

    it("calcula corretamente remaining", () => {
      const config = {
        maxRequests: 5,
        windowMs: 60000,
      };
      const identifier = "192.168.1.1";

      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(checkRateLimit(identifier, config));
      }

      expect(results[0].remaining).toBe(4); // 5 - 1
      expect(results[1].remaining).toBe(3); // 5 - 2
      expect(results[2].remaining).toBe(2); // 5 - 3
      expect(results[3].remaining).toBe(1); // 5 - 4
      expect(results[4].remaining).toBe(0); // 5 - 5
    });
  });

  describe("getClientIP", () => {
    it("extrai IP do header CF-Connecting-IP (Cloudflare)", () => {
      const request = new Request("http://localhost", {
        headers: { "CF-Connecting-IP": "203.0.113.1" },
      });

      expect(getClientIP(request)).toBe("203.0.113.1");
    });

    it("fallback para X-Forwarded-For", () => {
      const request = new Request("http://localhost", {
        headers: { "X-Forwarded-For": "203.0.113.1, 198.51.100.1" },
      });

      // Should use the first IP in the list
      expect(getClientIP(request)).toBe("203.0.113.1");
    });

    it("fallback para X-Real-IP", () => {
      const request = new Request("http://localhost", {
        headers: { "X-Real-IP": "203.0.113.1" },
      });

      expect(getClientIP(request)).toBe("203.0.113.1");
    });

    it("retorna 'unknown' se nenhum header presente", () => {
      const request = new Request("http://localhost");
      expect(getClientIP(request)).toBe("unknown");
    });

    it("prioriza CF-Connecting-IP sobre outros headers", () => {
      const request = new Request("http://localhost", {
        headers: {
          "CF-Connecting-IP": "203.0.113.1",
          "X-Forwarded-For": "198.51.100.1",
          "X-Real-IP": "192.0.2.1",
        },
      });

      expect(getClientIP(request)).toBe("203.0.113.1");
    });
  });

  describe("RATE_LIMITS presets", () => {
    it("LOGIN tem configuração correta", () => {
      expect(RATE_LIMITS.LOGIN.maxRequests).toBe(5);
      expect(RATE_LIMITS.LOGIN.windowMs).toBe(15 * 60 * 1000); // 15 min
      expect(RATE_LIMITS.LOGIN.message).toContain("login");
    });

    it("REGISTER tem configuração correta", () => {
      expect(RATE_LIMITS.REGISTER.maxRequests).toBe(3);
      expect(RATE_LIMITS.REGISTER.windowMs).toBe(60 * 60 * 1000); // 1 hora
      expect(RATE_LIMITS.REGISTER.message).toContain("registro");
    });

    it("UPLOAD tem configuração correta", () => {
      expect(RATE_LIMITS.UPLOAD.maxRequests).toBe(20);
      expect(RATE_LIMITS.UPLOAD.windowMs).toBe(60 * 60 * 1000); // 1 hora
      expect(RATE_LIMITS.UPLOAD.message).toContain("upload");
    });

    it("API_GENERAL tem configuração correta", () => {
      expect(RATE_LIMITS.API_GENERAL.maxRequests).toBe(100);
      expect(RATE_LIMITS.API_GENERAL.windowMs).toBe(60 * 1000); // 1 min
    });
  });

  describe("getRateLimits with env vars", () => {
    it("usa valores padrão quando env não fornecido", () => {
      const limits = getRateLimits();
      
      expect(limits.LOGIN.maxRequests).toBe(5);
      expect(limits.LOGIN.windowMs).toBe(15 * 60 * 1000);
      expect(limits.REGISTER.maxRequests).toBe(3);
      expect(limits.UPLOAD.maxRequests).toBe(20);
      expect(limits.API_GENERAL.maxRequests).toBe(100);
    });

    it("usa valores customizados do env", () => {
      const env = {
        RATE_LIMIT_LOGIN_MAX: "10",
        RATE_LIMIT_LOGIN_WINDOW_MIN: "30",
        RATE_LIMIT_REGISTER_MAX: "5",
        RATE_LIMIT_UPLOAD_MAX: "50",
      };

      const limits = getRateLimits(env);

      expect(limits.LOGIN.maxRequests).toBe(10);
      expect(limits.LOGIN.windowMs).toBe(30 * 60 * 1000);
      expect(limits.REGISTER.maxRequests).toBe(5);
      expect(limits.UPLOAD.maxRequests).toBe(50);
    });

    it("ignora valores inválidos e usa padrões", () => {
      const env = {
        RATE_LIMIT_LOGIN_MAX: "abc", // invalid
        RATE_LIMIT_LOGIN_WINDOW_MIN: "xyz", // invalid
      };

      const limits = getRateLimits(env);

      // Should use defaults
      expect(limits.LOGIN.maxRequests).toBe(5);
      expect(limits.LOGIN.windowMs).toBe(15 * 60 * 1000);
    });

    it("aceita valores parciais e complementa com padrões", () => {
      const env = {
        RATE_LIMIT_LOGIN_MAX: "20", // customizado
        // RATE_LIMIT_LOGIN_WINDOW_MIN not defined
      };

      const limits = getRateLimits(env);

      expect(limits.LOGIN.maxRequests).toBe(20); // customizado
      expect(limits.LOGIN.windowMs).toBe(15 * 60 * 1000); // default
    });

    it("aceita zero como valor válido", () => {
      const env = {
        RATE_LIMIT_LOGIN_MAX: "0", // desabilitar rate limit
      };

      const limits = getRateLimits(env);

      expect(limits.LOGIN.maxRequests).toBe(0);
    });
  });
});
