import { filterSuggestionItems } from "@blocknote/core/extensions";
import { combineByGroup } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { getDefaultReactSlashMenuItems } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { SuggestionMenuController } from "@blocknote/react";
import { en, es, pt } from "@blocknote/core/locales";
import {
  getMultiColumnSlashMenuItems,
  locales as multiColumnLocales,
} from "@blocknote/xl-multi-column";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { uploadFileToR2 } from "../../utils/upload";
import {
  createButtonSlashMenuItem,
  edgepressBlockNoteSchema,
} from "../../shared/blocknote/schema.tsx";

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

const schema = edgepressBlockNoteSchema;

export interface BlockNoteEditorProps {
  initialBody?: string | null;
  initialBodyBlocks?: string | null;
  name?: string;
  inputId?: string;
  blocksName?: string;
  blocksInputId?: string;
  locale?: string;
}

export default function BlockNoteEditor({
  initialBody,
  initialBodyBlocks,
  name = "body",
  inputId = "body",
  blocksName = "body_blocks",
  blocksInputId = "body_blocks",
  locale: localeProp = "en",
}: BlockNoteEditorProps) {
  const dictionary = useMemo(() => {
    const base = BLOCKNOTE_LOCALES[localeProp] ?? en;
    const multiColumn = MULTICOLUMN_LOCALES[localeProp] ?? multiColumnLocales.en;
    return { ...base, multi_column: multiColumn };
  }, [localeProp]);

  const uploadFile = useCallback(async (file: File): Promise<string> => {
    try {
      const result = await uploadFileToR2(file);

      try {
        const form = document.getElementById(inputId)?.closest("form");
        if (!form) return result.url;

        const localeVal = form.querySelector<HTMLInputElement>('input[name="locale"]')?.value ?? "pt-br";
        const idLocaleCode = form.querySelector<HTMLInputElement>('input[name="id_locale_code"]')?.value;
        const postId = form.querySelector<HTMLInputElement>('input[name="id"]')?.value;

        const originalFilename = file.name || "untitled";
        const postTitle = originalFilename;

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
        if (idLocaleCode && idLocaleCode.trim() !== "") {
          fd.set("id_locale_code", idLocaleCode);
        }
        if (postId && postId.trim() !== "" && /^\d+$/.test(postId.trim())) {
          fd.set("parent_id", postId.trim());
        }
        fd.set("title", postTitle);
        fd.set("slug", postSlug);
        fd.set("status", "published");
        fd.set("meta_mime_type", result.mimeType);
        fd.set("meta_attachment_file", result.filename);
        fd.set("meta_attachment_path", result.path);
        fd.set("meta_attachment_alt", "");
        if (result.cloudflareImageId) {
          fd.set("meta_cloudflare_image_id", result.cloudflareImageId);
        }

        const res = await fetch("/api/posts", {
          method: "POST",
          body: fd,
          headers: { Accept: "application/json" },
        });

        if (res.ok) {
          const data = await res.json();
          const attachmentId = typeof data?.id === "number" ? data.id : null;

          if (attachmentId) {
            window.dispatchEvent(new CustomEvent("blocknote-image-uploaded", {
              detail: {
                attachmentId,
                imageUrl: result.url,
                path: result.path,
              },
            }));
          }
        }
      } catch (attachmentError) {
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

  useEffect(() => {
    setTheme(getDocumentTheme());
    const observer = new MutationObserver(() => setTheme(getDocumentTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!editor || initialLoaded.current) return;
    initialLoaded.current = true;

    if (initialBodyBlocks?.trim()) {
      try {
        const parsed = JSON.parse(initialBodyBlocks) as unknown;
        if (Array.isArray(parsed) && parsed.length > 0) {
          editor.replaceBlocks(editor.document, parsed as never);
          return;
        }
      } catch {
        // fallback para parse de HTML abaixo
      }
    }

    if (!initialBody?.trim()) return;
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

  const syncToInput = () => {
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    const blocksInput = document.getElementById(blocksInputId) as HTMLInputElement | null;
    if (!input || !editor) return;
    try {
      const html =
        typeof (editor as { blocksToFullHTML?: (blocks: unknown) => string }).blocksToFullHTML ===
        "function"
          ? (editor as { blocksToFullHTML: (blocks: unknown) => string }).blocksToFullHTML(
              editor.document,
            )
          : editor.blocksToHTMLLossy(editor.document);
      const blocks = editor.document;
      input.value = html ?? "";
      if (blocksInput) blocksInput.value = JSON.stringify(blocks ?? []);
      const plain = htmlToPlainText(html ?? "");
      const excerpt = plain.slice(0, EXCERPT_MAX_LENGTH);
      window.dispatchEvent(new CustomEvent("blocknote-excerpt", { detail: { text: excerpt } }));
    } catch {
      input.value = "";
      if (blocksInput) blocksInput.value = "[]";
      window.dispatchEvent(new CustomEvent("blocknote-excerpt", { detail: { text: "" } }));
    }
  };

  useEffect(() => {
    if (!editor) return;
    const unsub = editor.onChange(syncToInput);
    syncToInput();
    return unsub;
  }, [editor, inputId]);

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
      const buttonItem = createButtonSlashMenuItem(editor, localeProp);
      const allItems = [...combined, buttonItem];
      return filterSuggestionItems(allItems, query);
    },
    [editor, localeProp],
  );

  return (
    <div className="content-editor-wrapper flex min-h-[480px] w-full flex-col rounded-lg bg-base-100">
      <input type="hidden" id={inputId} name={name} defaultValue="" aria-hidden="true" />
      <input
        type="hidden"
        id={blocksInputId}
        name={blocksName}
        defaultValue=""
        aria-hidden="true"
      />
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <BlockNoteView
        editor={editor as any}
        theme={theme}
        className="min-h-[480px] w-full flex-1 [&_.bn-editor]:min-h-[480px]"
        slashMenu={false}
      >
        <SuggestionMenuController triggerCharacter="/" getItems={getSlashMenuItems} />
      </BlockNoteView>
    </div>
  );
}
