/**
 * Converte markdown inline e blocos MDX → HTML para migração de posts.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Converte markdown inline (links, negrito, itálico, código) preservando HTML existente. */
export function convertInlineMarkdown(text: string): string {
  const placeholders: string[] = [];

  let s = text.replace(/<[^>]+>/g, (tag) => {
    const idx = placeholders.length;
    placeholders.push(tag);
    return `@@HTML_${idx}@@`;
  });

  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, url: string) => {
    const href = url.trim();
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
  s = s.replace(/(?<!_)_([^_\n]+)_(?!_)/g, "<em>$1</em>");
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  for (let i = 0; i < placeholders.length; i++) {
    s = s.replace(`@@HTML_${i}@@`, placeholders[i]!);
  }

  return s;
}

function isHtmlBlockLine(line: string): boolean {
  const t = line.trim();
  return (
    t.startsWith("<") &&
    (t.startsWith("<figure") ||
      t.startsWith("<div") ||
      t.startsWith("<iframe") ||
      t.startsWith("<video") ||
      t.startsWith("<img") ||
      t.startsWith("<ul") ||
      t.startsWith("<ol") ||
      t.startsWith("<blockquote") ||
      t.startsWith("<table") ||
      /^<\/?[a-z][^>]*>$/i.test(t))
  );
}

function rewriteMediaPaths(html: string, mediaPrefix: string): string {
  return html.replace(/(?:\/blog)?\/assets\/blog\/([^"'\s)]+)/g, (_match, path: string) => {
    const normalized = String(path).replace(/^\/+/, "");
    return `/api/media/${mediaPrefix}/${normalized}`;
  });
}

/** Converte corpo MDX/Markdown misto com HTML → HTML completo. */
export function mdxBodyToHtml(body: string, mediaPrefix: string): string {
  const codeBlocks: string[] = [];
  let working = body.replace(/^import\s+.+$/gm, "");

  working = working.replace(/```[\w]*\n([\s\S]*?)```/g, (_match, code: string) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code>${escapeHtml(code.trim())}</code></pre>`);
    return `@@CODE_BLOCK_${idx}@@`;
  });

  const lines = working.split("\n");
  const blocks: string[] = [];
  let listItems: string[] = [];

  function flushList(): void {
    if (listItems.length === 0) return;
    blocks.push(`<ul>\n${listItems.map((item) => `  <li>${item}</li>`).join("\n")}\n</ul>`);
    listItems = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    if (trimmed.startsWith("@@CODE_BLOCK_")) {
      flushList();
      blocks.push(trimmed);
      continue;
    }

    if (isHtmlBlockLine(trimmed)) {
      flushList();
      blocks.push(rewriteMediaPaths(trimmed, mediaPrefix));
      continue;
    }

    const h4 = trimmed.match(/^#### (.+)$/);
    if (h4) {
      flushList();
      blocks.push(`<h4>${convertInlineMarkdown(h4[1]!)}</h4>`);
      continue;
    }

    const h3 = trimmed.match(/^### (.+)$/);
    if (h3) {
      flushList();
      blocks.push(`<h3>${convertInlineMarkdown(h3[1]!)}</h3>`);
      continue;
    }

    const h2 = trimmed.match(/^## (.+)$/);
    if (h2) {
      flushList();
      blocks.push(`<h2>${convertInlineMarkdown(h2[1]!)}</h2>`);
      continue;
    }

    const h1 = trimmed.match(/^# (.+)$/);
    if (h1) {
      flushList();
      blocks.push(`<h1>${convertInlineMarkdown(h1[1]!)}</h1>`);
      continue;
    }

    const img = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (img) {
      flushList();
      const src = rewriteMediaPaths(img[2]!, mediaPrefix);
      blocks.push(`<img src="${src}" alt="${escapeHtml(img[1]!)}" loading="lazy" />`);
      continue;
    }

    const listMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      listItems.push(convertInlineMarkdown(listMatch[1]!));
      continue;
    }

    if (/^https?:\/\//.test(trimmed)) {
      flushList();
      blocks.push(
        `<p><a href="${trimmed}" target="_blank" rel="noopener noreferrer">${trimmed}</a></p>`,
      );
      continue;
    }

    flushList();
    blocks.push(`<p>${convertInlineMarkdown(trimmed)}</p>`);
  }

  flushList();

  let html = rewriteMediaPaths(blocks.join("\n\n"), mediaPrefix);

  for (let i = 0; i < codeBlocks.length; i++) {
    html = html.replace(`@@CODE_BLOCK_${i}@@`, codeBlocks[i]!);
    html = html.replace(`<p>@@CODE_BLOCK_${i}@@</p>`, codeBlocks[i]!);
  }

  return html.replace(/\n{3,}/g, "\n\n").trim();
}

/** Aplica conversão inline em HTML que ainda contenha markdown residual. */
export function polishBodyHtml(html: string): string {
  return html
    .replace(/<(h[1-6]|p|li|figcaption|strong|em)>([^<]*)<\/\1>/g, (match, tag: string, inner: string) => {
      if (!/[\[*`_]/.test(inner)) return match;
      return `<${tag}>${convertInlineMarkdown(inner)}</${tag}>`;
    })
    .replace(/<h([1-6])>([^<]+)<\/h\1>/g, (_m, level: string, inner: string) => {
      if (!/[\[*`_]/.test(inner)) return _m;
      return `<h${level}>${convertInlineMarkdown(inner)}</h${level}>`;
    });
}
