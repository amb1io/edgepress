import { en, es, pt } from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { locales as multiColumnLocales } from "@blocknote/xl-multi-column";
import { useMemo } from "react";
import { edgepressBlockNoteSchema } from "../../shared/blocknote/schema.tsx";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/blocknoteStyles.css";
import "./blocknote-readonly-reset.css";

type Props = {
  bodyBlocks?: string | null;
  locale?: string;
  className?: string;
};

const BLOCKNOTE_LOCALES: Record<string, typeof en> = {
  en,
  es,
  "pt-br": pt,
  pt,
};

const MULTICOLUMN_LOCALES: Record<
  string,
  { slash_menu: { two_columns: object; three_columns: object } }
> = {
  en: multiColumnLocales.en,
  es: multiColumnLocales.es,
  "pt-br": multiColumnLocales.pt,
  pt: multiColumnLocales.pt,
};

const schema = edgepressBlockNoteSchema;

export default function BlockNoteReadonly({
  bodyBlocks,
  locale = "pt-br",
  className = "",
}: Props) {
  const dictionary = useMemo(() => {
    const base = BLOCKNOTE_LOCALES[locale] ?? en;
    const multiColumn = MULTICOLUMN_LOCALES[locale] ?? multiColumnLocales.en;
    return { ...base, multi_column: multiColumn };
  }, [locale]);

  const initialContent = useMemo(() => {
    if (!bodyBlocks?.trim()) return undefined;
    try {
      const parsed = JSON.parse(bodyBlocks) as unknown;
      return Array.isArray(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }, [bodyBlocks]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editor = useCreateBlockNote({ schema: schema as any, dictionary, editable: false, initialContent });

  if (!initialContent || initialContent.length === 0) return null;

  return (
    <div className={className}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <BlockNoteView editor={editor as any} editable={false} slashMenu={false} />
    </div>
  );
}
