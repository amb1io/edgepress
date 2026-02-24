/**
 * Post type form initialization: slug generated from name
 * (same logic as content.astro). Used in templates/post-types.astro.
 */
import { slugify } from "../lib/slugify.ts";

export function initPostTypeSlugFromName(): void {
  const form = document.getElementById("post-type-name")?.closest("form");
  if (!form || form.getAttribute("data-is-edit") === "true") return;
  const nameEl = document.getElementById("post-type-name") as HTMLInputElement | null;
  const slugEl = document.getElementById("post-type-slug") as HTMLInputElement | null;
  if (!nameEl || !slugEl) return;

  function updateSlug(): void {
    if (nameEl && slugEl) slugEl.value = slugify(nameEl.value);
  }
  nameEl.addEventListener("input", updateSlug);
  if (nameEl && slugEl && !slugEl.value && nameEl.value) updateSlug();
}
