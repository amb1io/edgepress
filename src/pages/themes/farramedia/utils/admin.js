export function isAdmin(Astro) {
  if (Astro.url.pathname.includes("admin")) {
    return 'contenteditable="true"';
  }
}
