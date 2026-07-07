import { createRoot } from "react-dom/client";
import BlockNoteReadonly from "../components/themes/BlockNoteReadonly.tsx";

function parseBlocks(raw: string | null | undefined): unknown[] | null {
  const text = String(raw ?? "").trim();
  if (!text || text === "[]") return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function mountBlockNoteRoots(): void {
  document.querySelectorAll<HTMLElement>(".edgepress-blocknote-root").forEach((root) => {
    if (root.dataset.edgepressMounted === "true") return;

    const dataEl = root.querySelector<HTMLScriptElement>("script.edgepress-blocknote-data");
    const blocks = parseBlocks(dataEl?.textContent);
    if (!blocks) return;

    const locale = root.getAttribute("data-locale") || "pt-br";
    const wrapper = root.closest(".edgepress-blocknote");
    const fallback = wrapper?.querySelector<HTMLElement>(".edgepress-blocknote-fallback");

    root.dataset.edgepressMounted = "true";
    root.hidden = false;
    root.removeAttribute("aria-hidden");

    createRoot(root).render(
      <BlockNoteReadonly
        bodyBlocks={JSON.stringify(blocks)}
        locale={locale}
        className="edgepress-blocknote-view"
      />,
    );

    if (fallback) {
      fallback.hidden = true;
      fallback.setAttribute("aria-hidden", "true");
    }
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountBlockNoteRoots);
  } else {
    mountBlockNoteRoots();
  }
}

/** Used by edgepress-internal/blocknote-bundle.astro to emit the public hydration chunk at build time. */
export default function BlockNoteHydration(): null {
  return null;
}
