/**
 * Entry that runs initContentForm with props from window.__contentFormProps.
 * Used by content.astro so the page script only has one top-level import.
 */
import {
  initContentForm,
  deleteContentThumbnail,
  type ContentFormInitProps,
} from "./content-form.ts";

declare global {
  interface Window {
    __contentFormProps?: Partial<ContentFormInitProps>;
    deleteContentThumbnail?: typeof deleteContentThumbnail;
  }
}

window.deleteContentThumbnail = deleteContentThumbnail;
initContentForm((window.__contentFormProps || {}) as ContentFormInitProps);
