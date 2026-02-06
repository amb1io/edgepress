/**
 * Cliente para inicialização do Uppy - será processado pelo bundler
 */

import { initUppyInstance, type UppyInitOptions } from "./uppy-init.ts";

export function setupUppy(options: UppyInitOptions) {
  function onReady() {
    // Usar MutationObserver para detectar quando o elemento é adicionado ao DOM
    const checkAndInit = () => {
      const target = document.getElementById(options.containerId);
      if (target && !(target as unknown as { __uppy?: unknown }).__uppy) {
        initUppyInstance(options);
        return true;
      }
      return false;
    };

    // Tentar imediatamente
    if (checkAndInit()) return;

    // Se não encontrou, usar MutationObserver para detectar quando for adicionado
    const observer = new MutationObserver(() => {
      if (checkAndInit()) {
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Timeout de segurança
    setTimeout(() => {
      observer.disconnect();
      checkAndInit();
    }, 2000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    // Se o DOM já está pronto, aguardar um pouco para componentes Astro renderizarem
    setTimeout(onReady, 100);
  }
}
