const SIDEBAR_COLLAPSED_KEY = "edgepress-admin-sidebar-collapsed";
const SECTION_PREFIX = "edgepress-admin-sidebar-section-";

export function initAdminSidebar(root: Document | HTMLElement = document): void {
  const sidebar = root.querySelector<HTMLElement>("#admin-sidebar");
  if (!sidebar || sidebar.dataset["bound"] === "true") return;
  sidebar.dataset["bound"] = "true";

  const applyCollapsed = (collapsed: boolean) => {
    document.body.classList.toggle("admin-sidebar-collapsed", collapsed);
    document.body.classList.remove("admin-sidebar-mobile-open");
    const toggle = sidebar.querySelector<HTMLButtonElement>("[data-admin-sidebar-drawer-toggle]");
    if (toggle) toggle.setAttribute("aria-expanded", String(!collapsed));
  };

  const storedCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  applyCollapsed(storedCollapsed);

  sidebar.querySelector<HTMLButtonElement>("[data-admin-sidebar-drawer-toggle]")?.addEventListener(
    "click",
    () => {
      const next = !document.body.classList.contains("admin-sidebar-collapsed");
      applyCollapsed(next);
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
    },
  );

  sidebar.querySelectorAll<HTMLElement>(".admin-sidebar__section").forEach((section) => {
    const slug = section.dataset["sectionSlug"];
    if (!slug) return;

    const panel = section.querySelector<HTMLElement>(".admin-sidebar__section-panel");
    const toggle = section.querySelector<HTMLButtonElement>("[data-admin-sidebar-section-toggle]");
    if (!panel || !toggle) return;

    const storageKey = `${SECTION_PREFIX}${slug}`;
    const collapsed = localStorage.getItem(storageKey) === "1";

    const setCollapsed = (value: boolean) => {
      section.classList.toggle("is-collapsed", value);
      toggle.setAttribute("aria-expanded", String(!value));
      panel.style.maxHeight = value ? "0px" : `${panel.scrollHeight}px`;
    };

    setCollapsed(collapsed);

    toggle.addEventListener("click", () => {
      const next = !section.classList.contains("is-collapsed");
      setCollapsed(next);
      localStorage.setItem(storageKey, next ? "1" : "0");
    });

    window.addEventListener("resize", () => {
      if (!section.classList.contains("is-collapsed")) {
        panel.style.maxHeight = `${panel.scrollHeight}px`;
      }
    });
  });

  root.querySelector<HTMLButtonElement>("[data-admin-sidebar-mobile-open]")?.addEventListener("click", () => {
    document.body.classList.toggle("admin-sidebar-mobile-open");
  });

  root.querySelector<HTMLElement>("[data-admin-sidebar-backdrop]")?.addEventListener("click", () => {
    document.body.classList.remove("admin-sidebar-mobile-open");
  });
}

export function bindAdminSidebarInit(): void {
  const boot = () => initAdminSidebar(document);
  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", boot);
    document.addEventListener("astro:page-load", boot);
  }
}
