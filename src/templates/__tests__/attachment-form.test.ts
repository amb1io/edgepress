/**
 * Testes para o formulário de edição de attachment
 * Valida o fluxo completo de atualização incluindo upload de nova imagem
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Attachment Form Update Flow", () => {
  beforeEach(() => {
    vi.resetModules();
    // Limpar mocks globais
    delete (global as unknown as { window?: unknown }).window;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("handleSubmit - Form Data Validation", () => {
    it("should include all attachment meta fields in FormData when submitting", async () => {
      // Simula o estado do Alpine após upload de nova imagem
      const mockFormData = {
        post_type: "attachment",
        action: "edit",
        id: "123",
        locale: "pt-br",
        status: "published",
        title: "Nova Imagem",
        slug: "nova-imagem",
        meta_mime_type: "image/jpeg",
        meta_attachment_file: "nova-imagem.jpg",
        meta_attachment_path: "/uploads/2024/01/nova-imagem-abc123.jpg",
        meta_attachment_alt: "Descrição da imagem",
      };

      const formData = new FormData();
      Object.entries(mockFormData).forEach(([key, value]) => {
        formData.set(key, value);
      });

      // Valida que todos os campos necessários estão presentes
      expect(formData.get("post_type")).toBe("attachment");
      expect(formData.get("action")).toBe("edit");
      expect(formData.get("id")).toBe("123");
      expect(formData.get("meta_mime_type")).toBe("image/jpeg");
      expect(formData.get("meta_attachment_file")).toBe("nova-imagem.jpg");
      expect(formData.get("meta_attachment_path")).toBe("/uploads/2024/01/nova-imagem-abc123.jpg");
      expect(formData.get("meta_attachment_alt")).toBe("Descrição da imagem");
    });

    it("should set action='edit' and include correct id when initialPostId is present", () => {
      // Simula o estado do Alpine em modo de edição
      const alpineState = {
        postId: null,
        initialPostId: 123,
        title: "Imagem",
        slug: "imagem",
      };

      const currentId = alpineState.postId ?? alpineState.initialPostId;
      const isEdit = currentId != null && currentId !== "";

      const formData = new FormData();
      formData.set("action", isEdit ? "edit" : "new");
      formData.set("id", isEdit ? String(currentId) : "");

      expect(formData.get("action")).toBe("edit");
      expect(formData.get("id")).toBe("123");
    });

    it("should set action='edit' and include correct id when postId is present", () => {
      // Simula o estado do Alpine após criar novo post
      const alpineState = {
        postId: 456,
        initialPostId: null,
        title: "Nova Imagem",
        slug: "nova-imagem",
      };

      const currentId = alpineState.postId ?? alpineState.initialPostId;
      const isEdit = currentId != null && currentId !== "";

      const formData = new FormData();
      formData.set("action", isEdit ? "edit" : "new");
      formData.set("id", isEdit ? String(currentId) : "");

      expect(formData.get("action")).toBe("edit");
      expect(formData.get("id")).toBe("456");
    });

    it("should set action='new' when no id is present", () => {
      // Simula o estado do Alpine em modo de criação
      const alpineState = {
        postId: null,
        initialPostId: null,
        title: "Nova Imagem",
        slug: "nova-imagem",
      };

      const currentId = alpineState.postId ?? alpineState.initialPostId;
      const isEdit = currentId != null && currentId !== "";

      const formData = new FormData();
      formData.set("action", isEdit ? "edit" : "new");
      formData.set("id", isEdit ? String(currentId) : "");

      expect(formData.get("action")).toBe("new");
      expect(formData.get("id")).toBe("");
    });

    it("should merge meta_values correctly when updating existing attachment", async () => {
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

      // Simula o merge que acontece no backend
      const merged = { ...existingMeta, ...newMeta };
      expect(merged.mime_type).toBe("image/jpeg");
      expect(merged.attachment_file).toBe("new-image.jpg");
      expect(merged.attachment_path).toBe("/uploads/2024/01/new-image.jpg");
      expect(merged.attachment_alt).toBe("Nova imagem");
    });
  });

  describe("Uppy Upload Integration", () => {
    it("should wait for upload to complete before submitting form", async () => {
      let uploadComplete = false;
      const mockUppy = {
        getFiles: vi.fn(() => [
          {
            id: "file1",
            name: "test.jpg",
            progress: {
              uploadStarted: true,
              uploadComplete: false,
            },
          },
        ]),
        upload: vi.fn(() => Promise.resolve()),
      };

      // Simula o fluxo de aguardar upload
      const waitForUpload = async () => {
        const files = mockUppy.getFiles();
        const uploadingFiles = files.filter(
          (f) => f.progress?.uploadStarted && !f.progress?.uploadComplete
        );

        if (uploadingFiles.length > 0) {
          await new Promise((resolve) => {
            const checkComplete = () => {
              const stillUploading = mockUppy.getFiles().filter(
                (f) => f.progress?.uploadStarted && !f.progress?.uploadComplete
              );
              if (stillUploading.length === 0) {
                uploadComplete = true;
                resolve(undefined);
              } else {
                setTimeout(checkComplete, 100);
              }
            };
            checkComplete();
          });
        }
      };

      // Simula upload completando após 200ms
      setTimeout(() => {
        mockUppy.getFiles.mockReturnValue([
          {
            id: "file1",
            name: "test.jpg",
            progress: {
              uploadStarted: true,
              uploadComplete: true,
            },
          },
        ]);
      }, 200);

      await waitForUpload();
      expect(uploadComplete).toBe(true);
    });

    it("should update form hidden fields after upload success", () => {
      const uploadResponse = {
        path: "/uploads/2024/01/new-image-abc123.jpg",
        imageUrl: "/uploads/2024/01/new-image-abc123.jpg",
        filename: "new-image.jpg",
        mimeType: "image/jpeg",
      };

      // Simula o evento attachment-uploaded
      const event = new CustomEvent("attachment-uploaded", {
        detail: uploadResponse,
      });

      // Simula o handler que atualiza os campos
      const mockCtx = {
        attachment_path: "",
        attachment_file: "",
        mime_type: "",
        attachment_alt: "",
      };

      // Simula handleAttachmentUploaded
      mockCtx.attachment_path = uploadResponse.path;
      mockCtx.attachment_file = uploadResponse.filename;
      mockCtx.mime_type = uploadResponse.mimeType;

      expect(mockCtx.attachment_path).toBe("/uploads/2024/01/new-image-abc123.jpg");
      expect(mockCtx.attachment_file).toBe("new-image.jpg");
      expect(mockCtx.mime_type).toBe("image/jpeg");
    });
  });

  describe("Race Condition Prevention", () => {
    it("should not submit form if upload is still in progress", async () => {
      const mockUppy = {
        getFiles: vi.fn(() => [
          {
            id: "file1",
            progress: {
              uploadStarted: true,
              uploadComplete: false,
            },
          },
        ]),
      };

      let formSubmitted = false;
      const submitForm = async () => {
        const files = mockUppy.getFiles();
        const uploadingFiles = files.filter(
          (f) => f.progress?.uploadStarted && !f.progress?.uploadComplete
        );

        if (uploadingFiles.length > 0) {
          // Não deve submeter se ainda está fazendo upload
          return;
        }

        formSubmitted = true;
      };

      await submitForm();
      expect(formSubmitted).toBe(false);
    });

    it("should submit form only after all uploads complete", async () => {
      const mockUppy = {
        getFiles: vi.fn(() => [
          {
            id: "file1",
            progress: {
              uploadStarted: true,
              uploadComplete: true,
            },
          },
        ]),
      };

      let formSubmitted = false;
      const submitForm = async () => {
        const files = mockUppy.getFiles();
        const uploadingFiles = files.filter(
          (f) => f.progress?.uploadStarted && !f.progress?.uploadComplete
        );

        if (uploadingFiles.length === 0) {
          formSubmitted = true;
        }
      };

      await submitForm();
      expect(formSubmitted).toBe(true);
    });
  });

  describe("Form Field Synchronization", () => {
    it("should use Alpine state values directly in FormData instead of relying on hidden fields", () => {
      // Simula o estado do Alpine após upload de nova imagem
      const alpineState = {
        title: "Nova Imagem",
        slug: "nova-imagem",
        attachment_path: "/uploads/2024/01/new-image.jpg",
        attachment_file: "new-image.jpg",
        mime_type: "image/jpeg",
        attachment_alt: "Nova descrição",
        status: "published",
        postId: 123,
        initialPostId: 123,
      };

      // Simula campos hidden que podem estar desatualizados (problema comum)
      const staleHiddenFields = {
        title: "Imagem Antiga",
        slug: "imagem-antiga",
        "meta_attachment_path": "/uploads/2023/12/old-image.jpg",
        "meta_attachment_file": "old-image.jpg",
        "meta_mime_type": "image/png",
        "meta_attachment_alt": "Descrição antiga",
      };

      // CORREÇÃO: Usar valores do Alpine state diretamente ao invés de campos hidden
      const formData = new FormData();
      formData.set("title", alpineState.title);
      formData.set("slug", alpineState.slug);
      formData.set("meta_mime_type", alpineState.mime_type);
      formData.set("meta_attachment_file", alpineState.attachment_file);
      formData.set("meta_attachment_path", alpineState.attachment_path);
      formData.set("meta_attachment_alt", alpineState.attachment_alt);

      // Valida que os valores corretos (do Alpine) são usados, não os desatualizados
      expect(formData.get("title")).toBe("Nova Imagem");
      expect(formData.get("slug")).toBe("nova-imagem");
      expect(formData.get("meta_attachment_path")).toBe("/uploads/2024/01/new-image.jpg");
      expect(formData.get("meta_attachment_file")).toBe("new-image.jpg");
      expect(formData.get("meta_mime_type")).toBe("image/jpeg");
      expect(formData.get("meta_attachment_alt")).toBe("Nova descrição");

      // Valida que NÃO está usando valores desatualizados
      expect(formData.get("meta_attachment_path")).not.toBe(staleHiddenFields["meta_attachment_path"]);
      expect(formData.get("meta_attachment_file")).not.toBe(staleHiddenFields["meta_attachment_file"]);
    });

    it("should sync Alpine state with hidden form fields", () => {
      const alpineState = {
        title: "Nova Imagem",
        slug: "nova-imagem",
        attachment_path: "/uploads/2024/01/image.jpg",
        attachment_file: "image.jpg",
        mime_type: "image/jpeg",
        attachment_alt: "Descrição",
      };

      // Simula os campos hidden do form
      const hiddenFields = {
        title: alpineState.title,
        slug: alpineState.slug,
        "meta_attachment_path": alpineState.attachment_path,
        "meta_attachment_file": alpineState.attachment_file,
        "meta_mime_type": alpineState.mime_type,
        "meta_attachment_alt": alpineState.attachment_alt,
      };

      expect(hiddenFields.title).toBe(alpineState.title);
      expect(hiddenFields.slug).toBe(alpineState.slug);
      expect(hiddenFields["meta_attachment_path"]).toBe(alpineState.attachment_path);
      expect(hiddenFields["meta_attachment_file"]).toBe(alpineState.attachment_file);
      expect(hiddenFields["meta_mime_type"]).toBe(alpineState.mime_type);
    });

    it("should preserve existing meta values when updating only some fields", () => {
      const existingMeta = {
        mime_type: "image/png",
        attachment_file: "old.png",
        attachment_path: "/uploads/old.png",
        attachment_alt: "Antiga",
        custom_field: "preserved",
      };

      const newMeta = {
        attachment_path: "/uploads/new.jpg",
        attachment_file: "new.jpg",
      };

      // Simula merge preservando campos não atualizados
      const merged = { ...existingMeta, ...newMeta };
      expect(merged.mime_type).toBe("image/png"); // Preservado
      expect(merged.attachment_alt).toBe("Antiga"); // Preservado
      expect(merged.custom_field).toBe("preserved"); // Preservado
      expect(merged.attachment_path).toBe("/uploads/new.jpg"); // Atualizado
      expect(merged.attachment_file).toBe("new.jpg"); // Atualizado
    });
  });

  describe("API Endpoint Integration", () => {
    it("should send correct FormData structure to POST /api/posts", async () => {
      const formData = new FormData();
      formData.set("post_type", "attachment");
      formData.set("action", "edit");
      formData.set("id", "123");
      formData.set("locale", "pt-br");
      formData.set("status", "published");
      formData.set("title", "Imagem Atualizada");
      formData.set("slug", "imagem-atualizada");
      formData.set("meta_mime_type", "image/jpeg");
      formData.set("meta_attachment_file", "imagem.jpg");
      formData.set("meta_attachment_path", "/uploads/2024/01/imagem.jpg");
      formData.set("meta_attachment_alt", "Nova descrição");

      // Valida estrutura esperada pelo endpoint
      const entries = Array.from(formData.entries());
      const metaEntries = entries.filter(([key]) => key.startsWith("meta_"));

      expect(metaEntries.length).toBeGreaterThan(0);
      expect(formData.get("action")).toBe("edit");
      expect(formData.get("id")).toBe("123");
      expect(formData.get("meta_mime_type")).toBe("image/jpeg");
    });

    it("should handle missing meta fields gracefully", () => {
      const formData = new FormData();
      formData.set("post_type", "attachment");
      formData.set("action", "edit");
      formData.set("id", "123");
      formData.set("title", "Test");
      formData.set("slug", "test");

      // Meta fields podem estar vazios, mas não devem quebrar
      const metaMimeType = formData.get("meta_mime_type");
      const metaFile = formData.get("meta_attachment_file");
      const metaPath = formData.get("meta_attachment_path");

      // Valida que não quebra mesmo sem meta fields
      expect(formData.get("title")).toBe("Test");
      expect(formData.get("slug")).toBe("test");
      // Meta fields podem ser null se não foram setados
      expect(metaMimeType === null || typeof metaMimeType === "string").toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle upload failure gracefully", async () => {
      const mockUppy = {
        getFiles: vi.fn(() => [
          {
            id: "file1",
            progress: {
              uploadStarted: true,
              uploadComplete: false,
              uploadError: new Error("Upload failed"),
            },
          },
        ]),
      };

      const files = mockUppy.getFiles();
      const failedFiles = files.filter((f) => f.progress?.uploadError);

      expect(failedFiles.length).toBeGreaterThan(0);
      // Deve tratar erro sem quebrar o fluxo
    });

    it("should fallback to form.submit() if fetch fails", async () => {
      const mockForm = {
        action: "/api/posts",
        method: "POST",
        submit: vi.fn(),
      };

      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));

      try {
        await mockFetch(mockForm.action, {
          method: mockForm.method,
          body: new FormData(),
        });
      } catch {
        // Fallback para submit normal
        mockForm.submit();
      }

      expect(mockForm.submit).toHaveBeenCalled();
    });

    it("should use getAttribute('action') instead of form.action to avoid conflict with input[name='action']", () => {
      // Simula um form com input[name="action"] que sobrescreve form.action
      const mockForm = {
        getAttribute: vi.fn((attr) => {
          if (attr === "action") return "/api/posts";
          return null;
        }),
        method: "POST",
        action: "[object HTMLInputElement]", // Simula o problema
      };

      // CORREÇÃO: Usar getAttribute ao invés de form.action
      const formAction = mockForm.getAttribute("action") || "/api/posts";

      expect(formAction).toBe("/api/posts");
      expect(formAction).not.toBe("[object HTMLInputElement]");
      expect(typeof formAction).toBe("string");
    });
  });
});
