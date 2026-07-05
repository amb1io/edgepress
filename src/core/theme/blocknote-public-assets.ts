import manifest from "../../generated/blocknote-public-assets.json";

export type BlockNotePublicAssets = {
  js: string;
  css: string;
};

export function getBlockNotePublicAssets(): BlockNotePublicAssets | null {
  const js = String(manifest.js ?? "").trim();
  if (!js) return null;
  return {
    js,
    css: String(manifest.css ?? "").trim(),
  };
}
