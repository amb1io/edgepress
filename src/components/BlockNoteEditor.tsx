import { BlockNoteSchema } from "@blocknote/core";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import { combineByGroup } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { getDefaultReactSlashMenuItems } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { SuggestionMenuController } from "@blocknote/react";
import { en, es, pt } from "@blocknote/core/locales";
import {
  withMultiColumn,
  getMultiColumnSlashMenuItems,
  locales as multiColumnLocales,
} from "@blocknote/xl-multi-column";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { uploadFileToR2 } from "../lib/upload";

function getDocumentTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  const theme = document.documentElement.getAttribute("data-theme");
  return theme === "dark" ? "dark" : "light";
}

const BLOCKNOTE_LOCALES: Record<string, typeof en> = {
  en,
  es,
  "pt-br": pt,
  pt,
};

const MULTICOLUMN_LOCALES: Record<string, { slash_menu: { two_columns: object; three_columns: object } }> = {
  en: multiColumnLocales.en,
  es: multiColumnLocales.es,
  "pt-br": multiColumnLocales.pt,
  pt: multiColumnLocales.pt,
};

const schema = withMultiColumn(BlockNoteSchema.create() as any);

export interface BlockNoteEditorProps {
  /** Conteúdo inicial em HTML (ex.: body do post). */
  initialBody?: string | null;
  /** Nome do input hidden enviado no form (ex.: "body"). */
  name?: string;
  /** Id do input hidden para acessibilidade. */
  inputId?: string;
  /** Locale do admin (en, es, pt-br) para a UI do BlockNote. */
  locale?: string;
}

/**
 * Editor BlockNote (estilo Notion) que sincroniza o conteúdo com um input hidden
 * para envio em formulários. Use dentro de <form>.
 */
export function BlockNoteEditor({
  initialBody,
  name = "body",
  inputId = "body",
  locale: localeProp = "en",
}: BlockNoteEditorProps) {
  const dictionary = useMemo(() => {
    const base = BLOCKNOTE_LOCALES[localeProp] ?? en;
    const multiColumn = MULTICOLUMN_LOCALES[localeProp] ?? multiColumnLocales.en;
    return { ...base, multi_column: multiColumn };
  }, [localeProp]);

  // Função de upload para BlockNote (usa a mesma função utilitária do Uppy)
  // Após upload bem-sucedido, cria um post do tipo attachment
  const uploadFile = useCallback(async (file: File): Promise<string> => {
    try {
      const result = await uploadFileToR2(file);
      
      // Criar post do tipo attachment após upload bem-sucedido
      try {
        const form = document.getElementById(inputId)?.closest("form");
        if (!form) return result.url;
        
        const localeVal = form.querySelector<HTMLInputElement>('input[name="locale"]')?.value ?? "pt-br";
        const postTypeSlug = form.querySelector<HTMLInputElement>('input[name="post_type"]')?.value?.trim() || "post";
        
        // Gerar título e slug únicos para o attachment
        const originalFilename = file.name || "untitled";
        const postTitle = originalFilename;
        
        // Função slugify simples (mesma lógica do Uppy)
        const slugify = (text: string): string => {
          if (typeof text !== "string" || !text.trim()) return "";
          return text
            .trim()
            .normalize("NFD")
            .replace(/\p{Diacritic}/gu, "")
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "");
        };
        
        const postBaseSlug = slugify(originalFilename) || "file";
        const postSlug = `${postBaseSlug}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        
        const fd = new FormData();
        fd.set("post_type", "attachment");
        fd.set("action", "new");
        fd.set("locale", localeVal);
        fd.set("title", postTitle);
        fd.set("slug", postSlug);
        fd.set("status", "published");
        fd.set("meta_mime_type", result.mimeType);
        fd.set("meta_attachment_file", result.filename);
        fd.set("meta_attachment_path", result.path);
        fd.set("meta_attachment_alt", "");
        
        const res = await fetch("/api/posts", {
          method: "POST",
          body: fd,
          headers: { Accept: "application/json" },
        });
        
        if (res.ok) {
          const data = await res.json();
          const attachmentId = typeof data?.id === "number" ? data.id : null;
          
          // Disparar evento para criar relação posts_media quando o formulário for submetido
          if (attachmentId) {
            window.dispatchEvent(new CustomEvent("blocknote-image-uploaded", {
              detail: {
                attachmentId,
                imageUrl: result.url,
                path: result.path,
              }
            }));
          }
        }
      } catch (attachmentError) {
        // Se falhar ao criar attachment, apenas loga o erro mas não impede o uso da imagem
        console.error("Failed to create attachment post:", attachmentError);
      }
      
      return result.url;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Upload failed";
      console.error("BlockNote upload error:", errorMessage);
      throw new Error(errorMessage);
    }
  }, [inputId]);

  const editor = useCreateBlockNote({ schema, dictionary, uploadFile });
  const initialLoaded = useRef(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Sincroniza com data-theme do layout (light/dark)
  useEffect(() => {
    setTheme(getDocumentTheme());
    const observer = new MutationObserver(() => setTheme(getDocumentTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  // Carrega HTML inicial no editor (uma vez)
  useEffect(() => {
    if (!editor || initialLoaded.current || !initialBody?.trim()) return;
    initialLoaded.current = true;
    try {
      const blocks = editor.tryParseHTMLToBlocks(initialBody);
      if (blocks.length > 0) {
        editor.replaceBlocks(editor.document, blocks);
      }
    } catch {
      // Ignora erro de parse; editor fica vazio
    }
  }, [editor, initialBody]);

  const EXCERPT_MAX_LENGTH = 250;

  function htmlToPlainText(html: string): string {
    if (typeof document === "undefined") return "";
    const div = document.createElement("div");
    div.innerHTML = html;
    return (div.textContent ?? div.innerText ?? "").trim().replace(/\s+/g, " ");
  }

  // Sincroniza conteúdo do editor para o input hidden e dispara excerpt (250 chars)
  const syncToInput = () => {
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    if (!input || !editor) return;
    try {
      const html = editor.blocksToHTMLLossy(editor.document);
      input.value = html ?? "";
      const plain = htmlToPlainText(html ?? "");
      const excerpt = plain.slice(0, EXCERPT_MAX_LENGTH);
      window.dispatchEvent(new CustomEvent("blocknote-excerpt", { detail: { text: excerpt } }));
    } catch {
      input.value = "";
      window.dispatchEvent(new CustomEvent("blocknote-excerpt", { detail: { text: "" } }));
    }
  };

  useEffect(() => {
    if (!editor) return;
    const unsub = editor.onChange(syncToInput);
    syncToInput(); // valor inicial
    return unsub;
  }, [editor, inputId]);

  // Garante que o body está sincronizado no submit do form
  useEffect(() => {
    const form = document.getElementById(inputId)?.closest("form");
    if (!form) return;
    const onSubmit = () => syncToInput();
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [editor, inputId]);

  const getSlashMenuItems = useCallback(
    async (query: string) => {
      const defaultItems = getDefaultReactSlashMenuItems(editor);
      const columnItems = getMultiColumnSlashMenuItems(editor);
      const combined = combineByGroup(defaultItems, columnItems);
      return filterSuggestionItems(combined, query);
    },
    [editor],
  );

  return (
    <div className="content-editor-wrapper h-full min-h-0 flex flex-col rounded-lg overflow-hidden bg-base-100">
      <input
        type="hidden"
        id={inputId}
        name={name}
        defaultValue=""
        aria-hidden="true"
      />
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <BlockNoteView
        editor={editor as any}
        theme={theme}
        className="flex-1 min-h-0 w-full [&_.bn-editor]:min-h-full"
        slashMenu={false}
      >
        <SuggestionMenuController triggerCharacter="/" getItems={getSlashMenuItems} />
      </BlockNoteView>
    </div>
  );
}
