/**
 * Inicialização do formulário de post types: slug gerado a partir do nome
 * (mesma lógica do content.astro). Usado em templates/post-types.astro.
 */
import { slugify } from "../../utils/slugify.ts";

const TAXONOMY_MENU_PREFIX = "taxonomies_type_";

export function isTaxonomyMenuOption(option: string): boolean {
  return option.startsWith(TAXONOMY_MENU_PREFIX);
}

export function taxonomyTypeToMenuOption(type: string): string {
  return `${TAXONOMY_MENU_PREFIX}${type}`;
}

/** Atualiza o campo menu_options com taxonomies_type_* conforme checkboxes de categorização. */
export function syncMenuOptionsFromTaxonomies(): void {
  const showInMenu = (document.getElementById("fixed-show-in-menu") as HTMLInputElement | null)
    ?.checked;
  if (!showInMenu) return;

  const menuOptEl = document.getElementById("fixed-menu-options") as HTMLInputElement | null;
  if (!menuOptEl) return;

  const current = menuOptEl.value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const base = current.filter((o) => !isTaxonomyMenuOption(o));
  const taxonomyOpts = Array.from(
    document.querySelectorAll<HTMLElement>(".fixed-taxonomy-cb:checked"),
  )
    .map((el) => el.dataset["fixedTaxonomyType"])
    .filter((type): type is string => Boolean(type))
    .map(taxonomyTypeToMenuOption);

  menuOptEl.value = [...base, ...taxonomyOpts].join(",");
}

export function appendTaxonomyTypeCheckbox(type: string, label: string): void {
  const list = document.getElementById("taxonomy-type-list");
  if (!list) return;
  if (list.querySelector(`[data-fixed-taxonomy-type="${type}"]`)) return;

  const labelEl = document.createElement("label");
  labelEl.className = "label cursor-pointer justify-start gap-2 py-0";
  labelEl.innerHTML = `
    <input
      type="checkbox"
      class="checkbox checkbox-sm checkbox-primary fixed-taxonomy-cb"
      data-fixed-taxonomy-type="${type}"
    />
    <span class="label-text text-sm">${label}</span>
  `;
  list.appendChild(labelEl);
}

export function initPostTypeTaxonomyMenuSync(): void {
  const list = document.getElementById("taxonomy-type-list");
  list?.addEventListener("change", (ev) => {
    const target = ev.target as HTMLElement;
    if (target.classList.contains("fixed-taxonomy-cb")) {
      syncMenuOptionsFromTaxonomies();
    }
  });

}

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
