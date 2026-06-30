/**
 * Instala o tema blog-rhamses no KV e assets no R2 (local).
 *
 * O pacote do tema não fica mais embutido no repositório EdgePress.
 * Gere o arquivo com @edgepress/cli e faça upload pelo admin, ou use:
 *   edgepress theme build --theme-dir <pasta-do-tema>
 *   (upload do .tar.gz em Admin → Temas)
 */
console.error(
  "[seed-theme] Temas embutidos foram removidos do EdgePress.",
);
console.error(
  "[seed-theme] Instale o tema via admin (upload .tar.gz) ou use @edgepress/cli:",
);
console.error("  edgepress theme build --theme-dir <pasta-do-tema>");
process.exit(1);
