import manifest from "./blocknote-public-assets.manifest.json";

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
