/**
 * Testes para form-data (getString, getNumber, getBoolean, getArray, escapeHtml, etc.).
 */
import { describe, it, expect } from "vitest";
import {
  getString,
  getNumber,
  getPositiveNumber,
  getBoolean,
  getArray,
  getNumberArray,
  getOptionalNumber,
  getFieldsWithPrefix,
  trimFormValue,
  escapeHtml,
} from "../form-data.ts";

function formDataFromObject(entries: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) {
      value.forEach((v) => fd.append(key, v));
    } else {
      fd.append(key, value);
    }
  }
  return fd;
}

describe("form-data", () => {
  describe("getString", () => {
    it("retorna valor trimado quando existe", () => {
      const fd = formDataFromObject({ name: "  foo  " });
      expect(getString(fd, "name")).toBe("foo");
    });

    it("retorna default quando chave ausente", () => {
      const fd = new FormData();
      expect(getString(fd, "missing")).toBe("");
      expect(getString(fd, "missing", "default")).toBe("default");
    });
  });

  describe("getNumber", () => {
    it("retorna número quando valor válido", () => {
      const fd = formDataFromObject({ n: "42" });
      expect(getNumber(fd, "n")).toBe(42);
    });

    it("retorna default quando ausente ou inválido", () => {
      const fd = formDataFromObject({ n: "x" });
      expect(getNumber(fd, "n")).toBeNull();
      expect(getNumber(fd, "missing", 10)).toBe(10);
    });
  });

  describe("getPositiveNumber", () => {
    it("retorna número quando positivo", () => {
      const fd = formDataFromObject({ n: "5" });
      expect(getPositiveNumber(fd, "n")).toBe(5);
    });

    it("retorna default quando zero ou negativo", () => {
      const fd = formDataFromObject({ n: "0" });
      expect(getPositiveNumber(fd, "n")).toBeNull();
    });
  });

  describe("getBoolean", () => {
    it("retorna true para 'true', '1', 'on'", () => {
      expect(getBoolean(formDataFromObject({ x: "true" }), "x")).toBe(true);
      expect(getBoolean(formDataFromObject({ x: "1" }), "x")).toBe(true);
      expect(getBoolean(formDataFromObject({ x: "on" }), "x")).toBe(true);
    });

    it("retorna false para outros ou ausente", () => {
      expect(getBoolean(formDataFromObject({ x: "false" }), "x")).toBe(false);
      expect(getBoolean(new FormData(), "x")).toBe(false);
      expect(getBoolean(new FormData(), "x", true)).toBe(true);
    });
  });

  describe("getArray", () => {
    it("retorna array de strings trimadas", () => {
      const fd = new FormData();
      fd.append("ids", "a");
      fd.append("ids", " b ");
      fd.append("ids", "c");
      expect(getArray(fd, "ids")).toEqual(["a", "b", "c"]);
    });

    it("retorna array vazio quando chave ausente", () => {
      expect(getArray(new FormData(), "ids")).toEqual([]);
    });
  });

  describe("getNumberArray", () => {
    it("retorna array de inteiros válidos", () => {
      const fd = new FormData();
      fd.append("n", "1");
      fd.append("n", "2");
      fd.append("n", "x");
      expect(getNumberArray(fd, "n")).toEqual([1, 2]);
    });
  });

  describe("getOptionalNumber", () => {
    it("retorna undefined quando chave não enviada", () => {
      expect(getOptionalNumber(new FormData(), "id")).toBeUndefined();
    });

    it("retorna null quando valor vazio", () => {
      expect(getOptionalNumber(formDataFromObject({ id: "" }), "id")).toBeNull();
    });

    it("retorna número quando válido e positivo", () => {
      expect(getOptionalNumber(formDataFromObject({ id: "10" }), "id")).toBe(10);
    });
  });

  describe("getFieldsWithPrefix", () => {
    it("extrai campos com prefixo e remove prefixo das chaves", () => {
      const fd = formDataFromObject({
        meta_title: "Hi",
        meta_slug: "hi",
        other: "no",
      });
      expect(getFieldsWithPrefix(fd, "meta_")).toEqual({ title: "Hi", slug: "hi" });
    });
  });

  describe("trimFormValue", () => {
    it("aplica trim em string", () => {
      expect(trimFormValue("  x  ")).toBe("x");
    });

    it("retorna string vazia para null/undefined", () => {
      expect(trimFormValue(null)).toBe("");
      expect(trimFormValue(undefined)).toBe("");
    });
  });

  describe("escapeHtml", () => {
    it("escapa &, <, >, \"", () => {
      expect(escapeHtml("a & b")).toBe("a &amp; b");
      expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
      expect(escapeHtml('"quoted"')).toBe("&quot;quoted&quot;");
    });

    it("retorna string segura para inserção em HTML", () => {
      expect(escapeHtml("<img src=x onerror=alert(1)>")).toBe(
        "&lt;img src=x onerror=alert(1)&gt;"
      );
    });
  });
});
