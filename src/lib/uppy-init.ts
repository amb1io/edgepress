/**
 * Inicialização do Uppy - código compartilhado para componentes que usam Uppy
 */

import Uppy from "@uppy/core";
import Dashboard from "@uppy/dashboard";
import ImageEditor from "@uppy/image-editor";
import XHRUpload from "@uppy/xhr-upload";
import pt_BR from "@uppy/locales/lib/pt_BR.js";
import en_US from "@uppy/locales/lib/en_US.js";
import es_ES from "@uppy/locales/lib/es_ES.js";
import "@uppy/core/css/style.min.css";
import "@uppy/dashboard/css/style.min.css";
import "@uppy/image-editor/css/style.min.css";

const UPPY_LOCALES: Record<string, typeof pt_BR> = {
  "pt-br": pt_BR,
  en: en_US,
  es: es_ES,
};

const CODE_EXTS = [
  ".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs", ".py", ".rb", ".php", ".java",
  ".c", ".cpp", ".h", ".hpp", ".cs", ".go", ".rs", ".vue", ".svelte", ".astro",
  ".sh", ".bash", ".ps1", ".bat", ".cmd", ".sql", ".html", ".htm", ".css",
  ".scss", ".less", ".json", ".xml", ".yaml", ".yml", ".md", ".lock",
];

function getExt(name: string): string {
  return name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
}

export interface UppyInitOptions {
  containerId: string;
  currentLocale: string;
  mode: "new" | "edit";
  height: number | null;
  eventName: string;
  hideUploadButton: boolean;
  clearOnComplete: boolean;
}

export function initUppyInstance(options: UppyInitOptions): Uppy | null {
  const {
    containerId,
    currentLocale,
    mode,
    height,
    eventName,
    hideUploadButton,
    clearOnComplete,
  } = options;

  const target = document.getElementById(containerId);
  if (!target) return null;

  // Verificar se já foi inicializado
  if ((target as unknown as { __uppy?: Uppy }).__uppy) return null;

  const form = target.closest("form") || document.querySelector<HTMLFormElement>('form[action="/api/posts"]');
  const appLocale = (form?.querySelector<HTMLInputElement>('input[name="locale"]')?.value ?? currentLocale).toLowerCase();
  const normalizedLocale = appLocale === "pt_br" ? "pt-br" : appLocale.startsWith("en") ? "en" : appLocale.startsWith("es") ? "es" : appLocale;
  const uppyLocale = UPPY_LOCALES[normalizedLocale] ?? pt_BR;

  const isEdit = mode === "edit";
  const containerHeight = height || (isEdit ? 280 : Math.max(400, window.innerHeight - 64));
  const maxFiles = isEdit ? 1 : 50;
  const autoProceed = isEdit;
  const hideUploadBtn = hideUploadButton;

  const uppy = new Uppy({
    id: `uppy-${containerId}`,
    locale: uppyLocale,
    autoProceed,
    restrictions: {
      maxFileSize: 20 * 1024 * 1024,
      allowedFileTypes: ["image/*", "audio/*", "application/pdf"],
      maxNumberOfFiles: maxFiles,
    },
  });

  uppy.use(Dashboard, {
    target: `#${containerId}`,
    inline: true,
    height: containerHeight,
    note: "",
    hideUploadButton: hideUploadBtn,
  });

  uppy.use(ImageEditor);

  uppy.use(XHRUpload, {
    endpoint: "/api/upload",
    fieldName: "file",
    formData: true,
    getResponseData(xhr: XMLHttpRequest) {
      try {
        const raw = xhr.response ?? xhr.responseText;
        if (typeof raw === "object" && raw !== null && "key" in raw) return raw as { key?: string; path?: string; mimeType?: string; filename?: string };
        if (typeof raw === "string") return JSON.parse(raw) as { key?: string; path?: string; mimeType?: string; filename?: string };
      } catch {
        // ignore
      }
      return {};
    },
  });

  const codeFilesErrorMsg = form?.dataset["codeFilesError"] ?? "Code files are not allowed.";
  uppy.on("file-added", (file) => {
    if (CODE_EXTS.includes(getExt(file.name ?? ""))) {
      uppy.removeFile(file.id);
      uppy.info(codeFilesErrorMsg, "error", 3000);
      return;
    }
    // Armazenar o nome original do arquivo antes de qualquer renomeação
    if (file.name && !file.meta?.["originalName"]) {
      uppy.setFileMeta(file.id, { originalName: file.name });
    }
  });

  uppy.on("upload-success", (file, response) => {
    if (!file) return;
    const body = (response?.body ?? response) as { key?: string; path?: string; mimeType?: string; filename?: string } | undefined;
    if (!body || !("key" in body)) return;
    const path = body.path ?? "";
    // Converter path do R2 para URL acessível via endpoint /api/media/
    const imageUrl = path.startsWith("http")
      ? path
      : path.startsWith("/uploads/")
        ? `/api/media${path}`
        : path.startsWith("/")
          ? `/api/media${path}`
          : `/api/media/uploads/${path}`;
    // Usar o nome original do arquivo (antes de qualquer renomeação no Uppy)
    const originalFilename = (file.meta?.["originalName"] as string) || file.name || body.filename || "";
    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail: {
          path,
          imageUrl,
          filename: body.filename ?? "",
          originalFilename: originalFilename,
          mimeType: body.mimeType ?? "",
        },
      })
    );
  });

  uppy.on("complete", () => {
    if (clearOnComplete) {
      setTimeout(() => uppy.cancelAll(), 100);
    }
  });

  (target as unknown as { __uppy?: Uppy }).__uppy = uppy;
  if (typeof window !== "undefined" && isEdit) {
    // Criar chave baseada no containerId: "uppy-edit" -> "uppyEditInstance", "uppy-thumbnail" -> "uppyThumbnailInstance"
    const camelCaseId = containerId.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const instanceKey = `uppy${camelCaseId.charAt(0).toUpperCase() + camelCaseId.slice(1)}Instance`;
    (window as unknown as Record<string, Uppy | undefined>)[instanceKey] = uppy;
  }

  return uppy;
}
