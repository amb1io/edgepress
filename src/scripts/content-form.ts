/**
 * Client-side logic for the content editor form: slugify, Alpine contentForm,
 * blocknote/thumbnail handlers, form submit (custom fields, HTMX/fetch).
 * Used by content.astro via initContentForm(); deleteContentThumbnail is exposed on window.
 */
import { slugify as slugifyFn } from "../lib/slugify.ts";

declare global {
  interface Window {
    slugify?: (text: string) => string;
    deleteContentThumbnail?: (
      formEl: HTMLFormElement,
      ctx: ContentFormContext
    ) => Promise<void>;
    Alpine?: {
      data: (name: string, fn: () => Record<string, unknown>) => void;
      $data: (el: Element) => ContentFormContext | undefined;
    };
    uppyThumbnailInstance?: {
      getFiles: () => { progress?: { uploadStarted?: boolean; uploadComplete?: boolean } }[];
      upload: () => Promise<void>;
    };
    htmx?: {
      ajax: (
        method: string,
        url: string,
        opts: { source: HTMLFormElement; target: string; swap: string }
      ) => void;
    };
  }
}

export type ContentFormInitProps = {
  initialTitle: string;
  initialSlug: string;
  initialExcerpt: string;
  initialStatus: string;
  initialAuthorId: string;
  thumbnailPath: string;
  thumbnailUrl: string;
  initialThumbnailAttachmentId: number;
};

export type ContentFormContext = {
  title: string;
  slug: string;
  excerpt: string;
  status: string;
  author_id: string;
  thumbnail_path: string;
  thumbnail_url: string;
  thumbnail_attachment_id: number | null;
  blocknote_attachment_ids: number[];
  notification: { show: boolean; type: string; message: string; title: string };
  slugifyFromTitle: () => void;
  showNotification: (type: string, message: string, title?: string) => void;
  hideNotification: () => void;
};

function safeStr(v: unknown): string {
  if (typeof v === "string" && !v.includes("[object ")) return v.trim();
  return "";
}

export function initContentForm(props: ContentFormInitProps): void {
  const {
    initialTitle,
    initialSlug,
    initialExcerpt,
    initialStatus,
    initialAuthorId,
    thumbnailPath,
    thumbnailUrl,
    initialThumbnailAttachmentId,
  } = props;

  window.slugify = slugifyFn;

  document.addEventListener("alpine:init", () => {
    if (!window.Alpine) return;
    window.Alpine.data("contentForm", () => ({
      title: safeStr(initialTitle),
      slug: safeStr(initialSlug),
      excerpt: safeStr(initialExcerpt),
      status: String(initialStatus || "draft"),
      author_id: String(initialAuthorId || ""),
      thumbnail_path: String(thumbnailPath || ""),
      thumbnail_url: String(thumbnailUrl || ""),
      thumbnail_attachment_id:
        initialThumbnailAttachmentId && initialThumbnailAttachmentId > 0
          ? initialThumbnailAttachmentId
          : null,
      blocknote_attachment_ids: [] as number[],
      notification: {
        show: false,
        type: "error",
        message: "",
        title: "",
      },
      slugifyFromTitle() {
        this.slug = window.slugify?.(this.title) ?? "";
      },
      showNotification(type: string, message: string, title = "") {
        this.notification = { show: true, type, message, title };
      },
      hideNotification() {
        this.notification.show = false;
      },
    }));
  });

  window.addEventListener("blocknote-image-uploaded", (ev: Event) => {
    const customEvent = ev as CustomEvent<{ attachmentId?: number }>;
    const form = document.querySelector('form[action="/api/posts"]');
    const Alpine = window.Alpine;
    if (!form || !Alpine) return;
    const ctx = Alpine.$data(form) as ContentFormContext | undefined;
    if (!ctx || !customEvent.detail?.attachmentId) return;
    if (!ctx.blocknote_attachment_ids) ctx.blocknote_attachment_ids = [];
    if (!ctx.blocknote_attachment_ids.includes(customEvent.detail.attachmentId)) {
      ctx.blocknote_attachment_ids.push(customEvent.detail.attachmentId);
    }
  });

  window.addEventListener("media-manager-select", (ev: Event) => {
    const customEvent = ev as CustomEvent<{ items: { id: number; title: string; url: string; path?: string }[] }>;
    const items = customEvent.detail?.items;
    if (!items?.length) return;
    const form = document.querySelector('form[action="/api/posts"]');
    const Alpine = window.Alpine;
    if (!form || !Alpine) return;
    const ctx = Alpine.$data(form) as ContentFormContext | undefined;
    if (!ctx) return;
    const first = items[0];
    ctx.thumbnail_path = first.path ?? "";
    ctx.thumbnail_url = first.url ?? "";
    ctx.thumbnail_attachment_id = first.id;
  });

  window.addEventListener("thumbnail-uploaded", async (ev: Event) => {
    const customEvent = ev as CustomEvent<{
      path?: string;
      imageUrl?: string;
      mimeType?: string;
      filename?: string;
      originalFilename?: string;
    }>;
    const form = document.querySelector('form[action="/api/posts"]');
    const Alpine = window.Alpine;
    if (!form || !Alpine) {
      console.error("Form ou Alpine não encontrado");
      return;
    }
    const ctx = Alpine.$data(form) as ContentFormContext | undefined;
    if (!ctx) {
      console.error("Contexto Alpine não encontrado no form");
      return;
    }
    ctx.thumbnail_path = customEvent.detail?.path ?? "";
    ctx.thumbnail_url = customEvent.detail?.imageUrl ?? "";

    const localeVal =
      (form.querySelector('input[name="locale"]') as HTMLInputElement)?.value ??
      "pt-br";
    const idLocaleCode = (
      form.querySelector('input[name="id_locale_code"]') as HTMLInputElement
    )?.value;
    const postId = (form.querySelector('input[name="id"]') as HTMLInputElement)
      ?.value;
    const originalFilename =
      customEvent.detail?.originalFilename ||
      customEvent.detail?.filename ||
      "untitled";
    const postBaseSlug = window.slugify?.(originalFilename) ?? "file";
    const postSlug = `${postBaseSlug}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

    const fd = new FormData();
    fd.set("post_type", "attachment");
    fd.set("action", "new");
    fd.set("locale", localeVal);
    if (idLocaleCode?.trim()) fd.set("id_locale_code", idLocaleCode);
    if (postId?.trim() && /^\d+$/.test(postId.trim())) {
      fd.set("parent_id", postId.trim());
    }
    fd.set("title", originalFilename);
    fd.set("slug", postSlug);
    fd.set("status", "published");
    fd.set("meta_mime_type", customEvent.detail?.mimeType ?? "");
    fd.set("meta_attachment_file", customEvent.detail?.filename ?? "");
    fd.set("meta_attachment_path", customEvent.detail?.path ?? "");
    fd.set("meta_attachment_alt", "");

    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        body: fd,
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        console.error("Erro ao criar attachment:", res.status, await res.text());
        return;
      }
      const data = (await res.json()) as { id?: number };
      if (typeof data?.id === "number") {
        ctx.thumbnail_attachment_id = data.id;
      } else {
        console.error("Resposta não contém ID válido");
      }
    } catch (err) {
      console.error("Erro ao processar upload do thumbnail:", err);
    }
  });

  function setupFormSubmit(): void {
    const formElement = document.querySelector(
      'form[action="/api/posts"]'
    ) as HTMLFormElement | null;
    if (!formElement) {
      console.error("Form não encontrado - submit não será interceptado");
      return;
    }

    formElement.addEventListener("submit", async (e: Event) => {
      e.preventDefault();
      const form = (e.target as HTMLFormElement) ?? formElement;
      const Alpine = window.Alpine;
      if (!form || !Alpine) {
        console.error("Form ou Alpine não encontrados");
        return;
      }
      const ctx = Alpine.$data(form) as ContentFormContext | undefined;
      if (!ctx) {
        console.error("Contexto Alpine não encontrado");
        return;
      }
      if (typeof ctx.hideNotification === "function") {
        ctx.hideNotification();
      }

      const uppyThumbnailInstance = window.uppyThumbnailInstance;
      if (uppyThumbnailInstance) {
        const files = uppyThumbnailInstance.getFiles();
        const pendingFiles = files.filter((f) => !f.progress?.uploadStarted);
        const uploadingFiles = files.filter(
          (f) =>
            f.progress?.uploadStarted && !f.progress?.uploadComplete
        );
        if (pendingFiles.length > 0) {
          await uppyThumbnailInstance.upload();
        }
        if (uploadingFiles.length > 0) {
          await new Promise<void>((resolve) => {
            const checkComplete = () => {
              const currentFiles = uppyThumbnailInstance.getFiles();
              const stillUploading = currentFiles.filter(
                (f) =>
                  f.progress?.uploadStarted && !f.progress?.uploadComplete
              );
              if (stillUploading.length === 0) resolve();
              else setTimeout(checkComplete, 100);
            };
            checkComplete();
          });
        }
      }

      const existingAttachmentIdInput = form.querySelector(
        'input[name="thumbnail_attachment_id"]'
      );
      if (existingAttachmentIdInput) existingAttachmentIdInput.remove();
      if (ctx.thumbnail_attachment_id && ctx.thumbnail_attachment_id > 0) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "thumbnail_attachment_id";
        input.value = String(ctx.thumbnail_attachment_id);
        form.appendChild(input);
      }

      if (
        ctx.blocknote_attachment_ids &&
        Array.isArray(ctx.blocknote_attachment_ids) &&
        ctx.blocknote_attachment_ids.length > 0
      ) {
        form
          .querySelectorAll('input[name="blocknote_attachment_ids[]"]')
          .forEach((el) => el.remove());
        ctx.blocknote_attachment_ids.forEach((id) => {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = "blocknote_attachment_ids[]";
          input.value = String(id);
          form.appendChild(input);
        });
      }

      const titleInput = form.querySelector('input[name="title"]');
      const slugInput = form.querySelector('input[name="slug"]');
      const excerptInput = form.querySelector('textarea[name="excerpt"]');
      const safeTitle = safeStr(ctx.title);
      const safeSlug = safeStr(ctx.slug);
      const safeExcerpt = safeStr(ctx.excerpt).slice(0, 250);
      if (titleInput instanceof HTMLInputElement) titleInput.value = safeTitle;
      if (slugInput instanceof HTMLInputElement) slugInput.value = safeSlug;
      if (excerptInput instanceof HTMLTextAreaElement) excerptInput.value = safeExcerpt;

      try {
        const formData = new FormData(form);
        formData.set("title", safeTitle);
        formData.set("slug", safeSlug);
        formData.set("excerpt", safeExcerpt);

        const wrapperEl = document.getElementById("custom-fields-wrapper");
        if (wrapperEl && window.Alpine) {
        const wrapperData = window.Alpine.$data(wrapperEl) as {
            customFields?: Array<{
              id: number;
              rows?: Array<{ id: number; value: string }>;
              _deleted?: boolean;
              template?: boolean;
            }>;
          } | undefined;
          if (wrapperData?.customFields && Array.isArray(wrapperData.customFields)) {
            const fileInputs = wrapperEl.querySelectorAll<
              HTMLInputElement & { files: FileList | null }
            >('input[type="file"][data-item-id][data-row-id]');
            for (const input of fileInputs) {
              const file = input.files?.[0];
              if (!file) continue;
              const itemId = Number(input.getAttribute("data-item-id"));
              const rowId = Number(input.getAttribute("data-row-id"));
              try {
                const uploadFd = new FormData();
                uploadFd.set("file", file);
                const uploadRes = await fetch("/api/upload", {
                  method: "POST",
                  body: uploadFd,
                });
                if (!uploadRes.ok) continue;
                const uploadJson = (await uploadRes.json()) as { path?: string };
                const path = uploadJson.path ?? "";
                if (path) {
                  const item = wrapperData.customFields.find(
                    (f: { id: number }) => f.id === itemId
                  );
                  const row = item?.rows?.find((r: { id: number }) => r.id === rowId);
                  if (row) row.value = path;
                }
              } catch {
                // ignore
              }
            }
            const customFieldsToSave = wrapperData.customFields
              .filter((item) => !item._deleted)
              .map((item) => ({
                ...item,
                rows: item.rows?.filter((row: { _deleted?: boolean }) => !row._deleted) ?? [],
                template: item.template === true,
              }))
              .filter((item) => (item.rows?.length ?? 0) > 0);
            const existingFieldIds = wrapperData.customFields
              .filter((item) => {
                const isExisting =
                  item.id &&
                  typeof item.id === "number" &&
                  item.id < 1000000000000;
                const isMarkedForDeletion = item._deleted === true;
                const hasNoRows = !item.rows || item.rows.length === 0;
                const allRowsDeleted =
                  item.rows && item.rows.every((r: { _deleted?: boolean }) => r._deleted);
                return (
                  isExisting &&
                  (isMarkedForDeletion || hasNoRows || !!allRowsDeleted)
                );
              })
              .map((item) => item.id);
            if (customFieldsToSave.length > 0) {
              formData.set(
                "custom_fields_data",
                JSON.stringify(customFieldsToSave)
              );
            }
            if (existingFieldIds.length > 0) {
              formData.set(
                "custom_fields_to_delete",
                JSON.stringify(existingFieldIds)
              );
            }
        }
      }

      // Ensure custom_fields_data and custom_fields_to_delete are sent
      // when the submit is via HTMX (htmx serializes the form in the DOM, not the in-memory FormData)
        form.querySelectorAll('input[name="custom_fields_data"]').forEach((el) => el.remove());
        form.querySelectorAll('input[name="custom_fields_to_delete"]').forEach((el) => el.remove());
        const cfData = formData.get("custom_fields_data");
        const cfDelete = formData.get("custom_fields_to_delete");
        if (cfData !== undefined && cfData !== null && String(cfData).trim() !== "") {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = "custom_fields_data";
          input.value = String(cfData);
          form.appendChild(input);
        }
        if (cfDelete !== undefined && cfDelete !== null && String(cfDelete).trim() !== "") {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = "custom_fields_to_delete";
          input.value = String(cfDelete);
          form.appendChild(input);
        }

        const htmx = window.htmx;
        if (htmx?.ajax) {
          htmx.ajax("post", form.getAttribute("action") || "/api/posts", {
            source: form,
            target: "#content-form-error",
            swap: "innerHTML",
          });
          document.body.addEventListener(
            "htmx:afterOnLoad",
            function onLoad(ev: Event) {
              const e = ev as CustomEvent<{
                successful?: boolean;
                xhr?: { responseText?: string };
              }>;
              if (
                e.detail?.successful === false &&
                e.detail?.xhr?.responseText
              ) {
                ctx.showNotification(
                  "error",
                  "Ocorreu um erro ao salvar. Verifique a mensagem acima.",
                  "Erro ao salvar"
                );
                window.scrollTo({ top: 0, behavior: "smooth" });
              }
              document.body.removeEventListener("htmx:afterOnLoad", onLoad);
            },
            { once: true }
          );
          return;
        }

        const response = await fetch(
          form.getAttribute("action") || "/api/posts",
          { method: "POST", body: formData }
        );

        if (!response.ok) {
          let errorMessage =
            "Ocorreu um erro ao salvar. Por favor, tente novamente.";
          try {
            const errorData = (await response.json()) as {
              error?: string;
              details?: Record<string, unknown>;
            };
            if (errorData.error) errorMessage = errorData.error;
            if (
              errorData.details &&
              typeof errorData.details === "object"
            ) {
              const detailsArray = Object.entries(errorData.details).map(
                ([k, v]) => `${k}: ${v}`
              );
              if (detailsArray.length > 0) {
                errorMessage += "\n\nDetalhes:\n" + detailsArray.join("\n");
              }
            }
          } catch {
            // ignore
          }
          ctx.showNotification("error", errorMessage, "Erro ao salvar");
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }

        if (response.redirected) {
          window.location.href = response.url;
        } else {
          try {
            const data = (await response.json()) as { id?: number };
            if (data.id) {
              const postType = formData.get("post_type");
              const loc = formData.get("locale");
              window.location.href = `/${loc}/admin/list?type=${postType}&limit=10&page=1`;
            }
          } catch {
            window.location.reload();
          }
        }
      } catch {
        ctx.showNotification(
          "error",
          "Erro de conexão. Verifique sua internet e tente novamente.",
          "Erro de Conexão"
        );
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupFormSubmit);
  } else {
    setupFormSubmit();
  }
}

/**
 * Remove thumbnail: confirm, DELETE /api/posts/:id, then clear Alpine state.
 * Exposed on window for use by the sidebar delete button.
 */
export async function deleteContentThumbnail(
  formEl: HTMLFormElement,
  ctx: ContentFormContext
): Promise<void> {
  if (!confirm("Tem certeza que deseja remover o thumbnail?")) return;
  const attachmentId = ctx.thumbnail_attachment_id;
  if (attachmentId != null && attachmentId > 0) {
    try {
      const response = await fetch(`/api/posts/${attachmentId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      const result = (await response.json()) as { success?: boolean; error?: string };
      if (response.ok && result.success) {
        ctx.thumbnail_attachment_id = null;
        ctx.thumbnail_path = "";
        ctx.thumbnail_url = "";
      } else {
        alert("Erro ao deletar thumbnail: " + (result.error || "Erro desconhecido"));
      }
    } catch (err) {
      console.error("Erro ao deletar thumbnail:", err);
      alert("Erro de conexão ao deletar thumbnail");
    }
  } else {
    ctx.thumbnail_attachment_id = null;
    ctx.thumbnail_path = "";
    ctx.thumbnail_url = "";
  }
}
