/**
 * Alpine.js init for Import/Export settings page.
 */
declare global {
  interface Window {
    __importExportStrings?: {
      importConfirm?: string;
      importError?: string;
      importSuccess?: string;
    };
  }
}

function parseDownloadFilename(disposition: string | null): string {
  if (!disposition) return "edgepress-export.edgepress";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? "edgepress-export.edgepress";
}

document.addEventListener("alpine:init", () => {
  window.Alpine.data("importExportPage", () => ({
    exporting: false,
    importing: false,
    importMessage: "",
    importOk: false,

    async exportData() {
      this.exporting = true;
      this.importMessage = "";
      try {
        const res = await fetch("/api/export", { credentials: "same-origin" });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
          throw new Error(err.message || err.error || "Export failed");
        }
        const blob = await res.blob();
        const filename = parseDownloadFilename(res.headers.get("Content-Disposition"));
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        this.importOk = false;
        this.importMessage = error instanceof Error ? error.message : "Export failed";
      } finally {
        this.exporting = false;
      }
    },

    async submitImport(event: SubmitEvent) {
      event.preventDefault();
      const strings = window.__importExportStrings ?? {};
      if (!confirm(strings.importConfirm ?? "Confirm import?")) return;

      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;

      const fileInput = form.querySelector('input[type="file"]');
      if (!(fileInput instanceof HTMLInputElement) || !fileInput.files?.length) return;

      this.importing = true;
      this.importMessage = "";

      try {
        const body = new FormData(form);
        const res = await fetch("/api/import", {
          method: "POST",
          body,
          credentials: "same-origin",
        });
        const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        if (!res.ok) {
          throw new Error(data.message || data.error || strings.importError || "Import failed");
        }
        this.importOk = true;
        this.importMessage = strings.importSuccess ?? "Import completed";
        form.reset();
      } catch (error) {
        this.importOk = false;
        this.importMessage =
          error instanceof Error ? error.message : (strings.importError ?? "Import failed");
      } finally {
        this.importing = false;
      }
    },
  }));
});

export {};
