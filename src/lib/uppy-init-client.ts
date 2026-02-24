/**
 * Client for Uppy initialization - will be processed by the bundler
 */

import { initUppyInstance, type UppyInitOptions } from "./uppy-init.ts";

export function setupUppy(options: UppyInitOptions) {
  function onReady() {
    // Use MutationObserver to detect when the element is added to the DOM
    const checkAndInit = () => {
      const target = document.getElementById(options.containerId);
      if (target && !(target as unknown as { __uppy?: unknown }).__uppy) {
        initUppyInstance(options);
        return true;
      }
      return false;
    };

    // Try immediately
    if (checkAndInit()) return;

    // If not found, use MutationObserver to detect when it is added
    const observer = new MutationObserver(() => {
      if (checkAndInit()) {
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Safety timeout
    setTimeout(() => {
      observer.disconnect();
      checkAndInit();
    }, 2000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    // If DOM is already ready, wait a bit for Astro components to render
    setTimeout(onReady, 100);
  }
}
