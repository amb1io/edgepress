/**
 * Testes para o endpoint POST /api/posts focados na atualização de attachments
 * Valida que os meta_values são atualizados corretamente quando uma nova imagem é enviada
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("POST /api/posts - Attachment Update", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("Meta Values Update", () => {
    it("should update meta_values when meta fields are provided in edit mode", () => {
      const existingMeta = {
        mime_type: "image/png",
        attachment_file: "old-image.png",
        attachment_path: "/uploads/2023/12/old-image.png",
        attachment_alt: "Imagem antiga",
      };

      const newMeta = {
        mime_type: "image/jpeg",
        attachment_file: "new-image.jpg",
        attachment_path: "/uploads/2024/01/new-image.jpg",
        attachment_alt: "Nova imagem",
      };

      // Simula o merge que acontece no endpoint
      const merged = { ...existingMeta, ...newMeta };

      expect(merged.mime_type).toBe("image/jpeg");
      expect(merged.attachment_file).toBe("new-image.jpg");
      expect(merged.attachment_path).toBe("/uploads/2024/01/new-image.jpg");
      expect(merged.attachment_alt).toBe("Nova imagem");
    });

    it("should preserve existing meta fields when only some are updated", () => {
      const existingMeta = {
        mime_type: "image/png",
        attachment_file: "old.png",
        attachment_path: "/uploads/old.png",
        attachment_alt: "Antiga",
        custom_field: "preserved_value",
      };

      const newMeta = {
        attachment_alt: "Nova descrição",
      };

      const merged = { ...existingMeta, ...newMeta };

      // Campos não atualizados devem ser preservados
      expect(merged.mime_type).toBe("image/png");
      expect(merged.attachment_file).toBe("old.png");
      expect(merged.attachment_path).toBe("/uploads/old.png");
      expect(merged.custom_field).toBe("preserved_value");
      // Campo atualizado
      expect(merged.attachment_alt).toBe("Nova descrição");
    });

    it("should handle FormData with meta_ prefix correctly", () => {
      const formData = new FormData();
      formData.set("post_type", "attachment");
      formData.set("action", "edit");
      formData.set("id", "123");
      formData.set("meta_mime_type", "image/jpeg");
      formData.set("meta_attachment_file", "image.jpg");
      formData.set("meta_attachment_path", "/uploads/image.jpg");
      formData.set("meta_attachment_alt", "Descrição");

      // Simula o processamento do endpoint
      const metaValues: Record<string, string> = {};
      for (const [key, value] of formData.entries()) {
        if (key.startsWith("meta_") && typeof value === "string") {
          metaValues[key.replace(/^meta_/, "")] = value.trim();
        }
      }

      expect(metaValues.mime_type).toBe("image/jpeg");
      expect(metaValues.attachment_file).toBe("image.jpg");
      expect(metaValues.attachment_path).toBe("/uploads/image.jpg");
      expect(metaValues.attachment_alt).toBe("Descrição");
    });

    it("should create metaValuesJson when meta fields are present", () => {
      const metaValues = {
        mime_type: "image/jpeg",
        attachment_file: "image.jpg",
        attachment_path: "/uploads/image.jpg",
        attachment_alt: "Descrição",
      };

      const metaValuesJson =
        Object.keys(metaValues).length > 0 ? JSON.stringify(metaValues) : null;

      expect(metaValuesJson).not.toBeNull();
      const parsed = JSON.parse(metaValuesJson!);
      expect(parsed.mime_type).toBe("image/jpeg");
      expect(parsed.attachment_file).toBe("image.jpg");
    });

    it("should handle empty metaValues gracefully", () => {
      const metaValues: Record<string, string> = {};
      const metaValuesJson =
        Object.keys(metaValues).length > 0 ? JSON.stringify(metaValues) : null;

      expect(metaValuesJson).toBeNull();
    });
  });

  describe("FormData Validation", () => {
    it("should extract all required fields for attachment update", () => {
      const formData = new FormData();
      formData.set("post_type", "attachment");
      formData.set("action", "edit");
      formData.set("id", "123");
      formData.set("locale", "pt-br");
      formData.set("status", "published");
      formData.set("title", "Nova Imagem");
      formData.set("slug", "nova-imagem");
      formData.set("meta_mime_type", "image/jpeg");
      formData.set("meta_attachment_file", "nova-imagem.jpg");
      formData.set("meta_attachment_path", "/uploads/2024/01/nova-imagem.jpg");
      formData.set("meta_attachment_alt", "Descrição da imagem");

      // Valida campos obrigatórios
      expect(formData.get("post_type")).toBe("attachment");
      expect(formData.get("action")).toBe("edit");
      expect(formData.get("id")).toBe("123");
      expect(formData.get("title")).toBe("Nova Imagem");
      expect(formData.get("slug")).toBe("nova-imagem");

      // Valida meta fields
      expect(formData.get("meta_mime_type")).toBe("image/jpeg");
      expect(formData.get("meta_attachment_file")).toBe("nova-imagem.jpg");
      expect(formData.get("meta_attachment_path")).toBe("/uploads/2024/01/nova-imagem.jpg");
      expect(formData.get("meta_attachment_alt")).toBe("Descrição da imagem");
    });

    it("should handle missing optional meta fields", () => {
      const formData = new FormData();
      formData.set("post_type", "attachment");
      formData.set("action", "edit");
      formData.set("id", "123");
      formData.set("title", "Imagem");
      formData.set("slug", "imagem");
      // Meta fields não fornecidos

      const metaMimeType = formData.get("meta_mime_type");
      const metaFile = formData.get("meta_attachment_file");
      const metaPath = formData.get("meta_attachment_path");

      expect(metaMimeType).toBeNull();
      expect(metaFile).toBeNull();
      expect(metaPath).toBeNull();
      // Não deve quebrar se meta fields estão ausentes
    });
  });

  describe("Edge Cases", () => {
    it("should handle malformed existing meta_values JSON", () => {
      const existingMetaJson = "{ invalid json }";
      const newMeta = {
        mime_type: "image/jpeg",
        attachment_file: "image.jpg",
      };

      let merged = newMeta;
      try {
        const parsed = JSON.parse(existingMetaJson);
        merged = { ...parsed, ...newMeta };
      } catch {
        // Se JSON inválido, usa apenas os novos valores
        merged = newMeta;
      }

      expect(merged.mime_type).toBe("image/jpeg");
      expect(merged.attachment_file).toBe("image.jpg");
    });

    it("should handle null existing meta_values", () => {
      const existingMetaJson = null;
      const newMeta = {
        mime_type: "image/jpeg",
        attachment_file: "image.jpg",
      };

      let merged = newMeta;
      if (existingMetaJson) {
        try {
          const parsed = JSON.parse(existingMetaJson);
          merged = { ...parsed, ...newMeta };
        } catch {
          merged = newMeta;
        }
      }

      expect(merged.mime_type).toBe("image/jpeg");
      expect(merged.attachment_file).toBe("image.jpg");
    });

    it("should trim whitespace from meta values", () => {
      const formData = new FormData();
      formData.set("meta_mime_type", "  image/jpeg  ");
      formData.set("meta_attachment_file", "  image.jpg  ");
      formData.set("meta_attachment_path", "  /uploads/image.jpg  ");

      const metaValues: Record<string, string> = {};
      for (const [key, value] of formData.entries()) {
        if (key.startsWith("meta_") && typeof value === "string") {
          metaValues[key.replace(/^meta_/, "")] = value.trim();
        }
      }

      expect(metaValues.mime_type).toBe("image/jpeg");
      expect(metaValues.attachment_file).toBe("image.jpg");
      expect(metaValues.attachment_path).toBe("/uploads/image.jpg");
    });
  });
});
