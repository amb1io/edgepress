import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { insertOrUpdateBlockForSlashMenu } from "@blocknote/core/extensions";
import { withMultiColumn } from "@blocknote/xl-multi-column";

const createCtaButtonBlock = createReactBlockSpec(
  {
    type: "ctaButton",
    propSchema: {
      variant: { default: "primary" },
    },
    content: "inline",
  },
  {
    render: (props) => {
      const variant =
        String(props.block.props.variant || "primary") === "secondary"
          ? "secondary"
          : "primary";

      return (
        <span
          className={`edgepress-bn-button edgepress-bn-button--${variant}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "2.5rem",
            minWidth: "7rem",
            padding: "0.625rem 1rem",
            borderRadius: "0.5rem",
            border:
              variant === "secondary"
                ? "1px solid #cbd5e1"
                : "1px solid #2563eb",
            backgroundColor:
              variant === "secondary" ? "#ffffff" : "#2563eb",
            color: variant === "secondary" ? "#0f172a" : "#ffffff",
            fontWeight: "600",
          }}
        >
          <span ref={props.contentRef} />
        </span>
      );
    },
    toExternalHTML: (props) => {
      const variant =
        String(props.block.props.variant || "primary") === "secondary"
          ? "secondary"
          : "primary";
      return (
        <span
          className={`edgepress-bn-button edgepress-bn-button--${variant}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "2.5rem",
            minWidth: "7rem",
            padding: "0.625rem 1rem",
            borderRadius: "0.5rem",
            border:
              variant === "secondary"
                ? "1px solid #cbd5e1"
                : "1px solid #2563eb",
            backgroundColor:
              variant === "secondary" ? "#ffffff" : "#2563eb",
            color: variant === "secondary" ? "#0f172a" : "#ffffff",
            fontWeight: "600",
          }}
        >
          <span ref={props.contentRef} />
        </span>
      );
    },
  },
);

export const edgepressBlockNoteSchema = withMultiColumn(
  BlockNoteSchema.create({
    blockSpecs: {
      ...defaultBlockSpecs,
      ctaButton: createCtaButtonBlock(),
    },
  }) as any,
);

function getButtonMenuLabels(locale: string): {
  title: string;
  subtext: string;
  promptUrl: string;
  promptText: string;
} {
  if (locale === "es") {
    return {
      title: "Boton",
      subtext: "Inserta un boton y agrega el enlace al texto",
      promptUrl: "",
      promptText: "",
    };
  }
  if (locale === "pt-br" || locale === "pt") {
    return {
      title: "Botao",
      subtext: "Insere um botao e aplique link no texto",
      promptUrl: "",
      promptText: "",
    };
  }
  return {
    title: "Button",
    subtext: "Insert a button and add link to text",
    promptUrl: "",
    promptText: "",
  };
}

export function createButtonSlashMenuItem(editor: any, locale: string) {
  const labels = getButtonMenuLabels(locale);
  return {
    key: "ctaButton",
    title: labels.title,
    subtext: labels.subtext,
    aliases: ["button", "cta", "botao", "boton", "link"],
    group: "Basic blocks",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="3" y="6" width="18" height="12" rx="4" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 12H16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
    onItemClick: () => {
      insertOrUpdateBlockForSlashMenu(editor, {
        type: "ctaButton",
        props: { variant: "primary" },
      });
    },
  };
}
