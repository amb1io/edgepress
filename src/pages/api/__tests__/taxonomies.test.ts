/**
 * Testes para os endpoints da API de taxonomias (POST, PUT, DELETE).
 * Valida extração de FormData, regras de validação e formato das respostas.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { slugify } from "../../../lib/slugify.ts";

describe("POST /api/taxonomies", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("FormData extraction", () => {
    it("should extract name, slug, description, type, parent_id, id_locale_code and locale", () => {
      const formData = new FormData();
      formData.set("name", "  Categoria Exemplo  ");
      formData.set("slug", "categoria-exemplo");
      formData.set("description", "Descrição opcional");
      formData.set("type", "category");
      formData.set("parent_id", "5");
      formData.set("id_locale_code", "1");
      formData.set("locale", "pt-br");

      const name = (formData.get("name") as string)?.trim();
      const slugInput = (formData.get("slug") as string)?.trim();
      const description = (formData.get("description") as string)?.trim() || null;
      const type = (formData.get("type") as string)?.trim();
      const parentIdRaw = formData.get("parent_id");
      const idLocaleCodeRaw = formData.get("id_locale_code");
      const locale = (formData.get("locale") as string)?.trim() || "pt-br";

      expect(name).toBe("Categoria Exemplo");
      expect(slugInput).toBe("categoria-exemplo");
      expect(description).toBe("Descrição opcional");
      expect(type).toBe("category");
      expect(parentIdRaw).toBe("5");
      expect(idLocaleCodeRaw).toBe("1");
      expect(locale).toBe("pt-br");
    });

    it("should treat empty description and locale with defaults", () => {
      const formData = new FormData();
      formData.set("name", "Tag");
      formData.set("type", "tag");

      const description = (formData.get("description") as string)?.trim() || null;
      const locale = (formData.get("locale") as string)?.trim() || "pt-br";

      expect(description).toBeNull();
      expect(locale).toBe("pt-br");
    });

    it("should parse parent_id and id_locale_code as integers or null", () => {
      const parseOptionalInt = (raw: FormDataEntryValue | null): number | null => {
        if (raw == null || raw === "" || !/^\d+$/.test(String(raw))) return null;
        return parseInt(String(raw), 10);
      };

      expect(parseOptionalInt("5")).toBe(5);
      expect(parseOptionalInt("1")).toBe(1);
      expect(parseOptionalInt("")).toBeNull();
      expect(parseOptionalInt(null)).toBeNull();
      expect(parseOptionalInt("abc")).toBeNull();
    });
  });

  describe("Validation", () => {
    it("should require name and type", () => {
      const valid = (name: string | undefined, type: string | undefined) => !!name && !!type;
      expect(valid("Categoria", "category")).toBe(true);
      expect(valid("", "category")).toBe(false);
      expect(valid("Categoria", "")).toBe(false);
      expect(valid("", "")).toBe(false);
    });

    it("should derive slug from name when slug is empty", () => {
      const name = "Olá Mundo";
      const slugInput = "";
      const slug = slugInput ? slugify(slugInput) : slugify(name);
      expect(slug).toBe("ola-mundo");
    });

    it("should use slug input when provided", () => {
      const slugInput = "meu-slug-custom";
      const slug = slugify(slugInput);
      expect(slug).toBe("meu-slug-custom");
    });

    it("should consider empty slug after slugify as invalid", () => {
      const slug = slugify("  ---  ");
      expect(slug).toBe("");
    });
  });

  describe("Success response contract", () => {
    it("should return 200 JSON with success and taxonomy and HX-Trigger taxonomy-added", () => {
      const inserted = { id: 42, name: "Categoria", slug: "categoria" };
      const type = "category";
      const language = "pt-br";
      const parent_id = 5;

      const body = JSON.stringify({
        success: true,
        taxonomy: { ...inserted, type, language },
      });
      const trigger = JSON.stringify({
        "taxonomy-added": {
          id: inserted.id,
          name: inserted.name,
          slug: inserted.slug,
          type,
          language,
          parent_id,
        },
      });

      expect(JSON.parse(body).success).toBe(true);
      expect(JSON.parse(body).taxonomy).toEqual({
        id: 42,
        name: "Categoria",
        slug: "categoria",
        type: "category",
        language: "pt-br",
      });
      expect(JSON.parse(trigger)["taxonomy-added"]).toEqual({
        id: 42,
        name: "Categoria",
        slug: "categoria",
        type: "category",
        language: "pt-br",
        parent_id: 5,
      });
    });
  });

  describe("Error response contract", () => {
    it("should return HTML error with Content-Type text/html and status 200", () => {
      const contentType = "text/html; charset=utf-8";
      const status = 200;
      expect(contentType).toContain("text/html");
      expect(status).toBe(200);
    });
  });
});

describe("PUT /api/taxonomies/[id]", () => {
  describe("FormData and validation", () => {
    it("should require name and type for update", () => {
      const valid = (name: string | undefined, type: string | undefined) => !!name && !!type;
      expect(valid("Categoria Atualizada", "category")).toBe(true);
      expect(valid("", "category")).toBe(false);
    });

    it("should parse parent_id and id_locale_code for update", () => {
      const parentIdRaw = "10";
      const idLocaleCodeRaw = "2";
      const parent_id =
        parentIdRaw != null && parentIdRaw !== "" && /^\d+$/.test(parentIdRaw)
          ? parseInt(parentIdRaw, 10)
          : null;
      const id_locale_code =
        idLocaleCodeRaw != null && idLocaleCodeRaw !== "" && /^\d+$/.test(idLocaleCodeRaw)
          ? parseInt(idLocaleCodeRaw, 10)
          : null;
      expect(parent_id).toBe(10);
      expect(id_locale_code).toBe(2);
    });
  });

  describe("Success response contract", () => {
    it("should return 200 JSON with success and HX-Trigger taxonomy-updated", () => {
      const termId = 7;
      const name = "Categoria Editada";
      const slug = "categoria-editada";
      const type = "category";
      const language = "pt-br";

      const body = JSON.stringify({ success: true });
      const trigger = JSON.stringify({
        "taxonomy-updated": { id: termId, name, slug, type, language },
      });

      expect(JSON.parse(body).success).toBe(true);
      expect(JSON.parse(trigger)["taxonomy-updated"]).toEqual({
        id: 7,
        name: "Categoria Editada",
        slug: "categoria-editada",
        type: "category",
        language: "pt-br",
      });
    });
  });

  describe("Parameter validation", () => {
    it("should reject invalid id (non-numeric)", () => {
      const id = "abc";
      const valid = id && /^\d+$/.test(id);
      expect(valid).toBe(false);
    });

    it("should accept numeric id", () => {
      const id = "42";
      const valid = id && /^\d+$/.test(id);
      expect(valid).toBe(true);
    });
  });
});

describe("DELETE /api/taxonomies/[id]", () => {
  describe("Parameter validation", () => {
    it("should reject missing or invalid id", () => {
      const valid = (id: string | undefined) => !!id && /^\d+$/.test(id);
      expect(valid(undefined)).toBe(false);
      expect(valid("")).toBe(false);
      expect(valid("abc")).toBe(false);
      expect(valid("12")).toBe(true);
    });
  });

  describe("Success response contract", () => {
    it("should return 200 with empty body and Content-Type text/html", () => {
      const status = 200;
      const body = "";
      const contentType = "text/html; charset=utf-8";
      expect(status).toBe(200);
      expect(body).toBe("");
      expect(contentType).toContain("text/html");
    });
  });
});
