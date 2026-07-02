/**
 * Alpine.js init for Import/Export settings page.
 */
declare global {
  interface Window {
    __importExportStrings?: {
      importConfirm?: string;
      importError?: string;
      importSuccess?: string;
      exportSelectWarning?: string;
      importProgressTitle?: string;
      importPolling?: string;
      importClose?: string;
    };
  }
}

function parseDownloadFilename(disposition: string | null): string {
  if (!disposition) return "edgepress-export.edgepress";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? "edgepress-export.edgepress";
}

type ImportStatusResponse = {
  status?: string;
  phaseLabel?: string;
  percent?: number;
  error?: string;
  cause?: string;
};

function getImportModalElements() {
  return {
    modal: document.getElementById("import-progress-modal"),
    bar: document.getElementById("import-progress-bar") as HTMLProgressElement | null,
    phase: document.getElementById("import-progress-phase"),
    errorBox: document.getElementById("import-progress-error"),
    errorText: document.getElementById("import-progress-error-text"),
    closeBtn: document.getElementById("import-progress-close"),
  };
}

document.addEventListener("alpine:init", () => {
  window.Alpine.data("importExportPage", () => ({
    exporting: false,
    importing: false,
    importMessage: "",
    importOk: false,
    exportDatabase: true,
    exportMedia: true,
    exportThemes: true,
    exportWarning: false,
    importJobId: "",
    importPercent: 0,
    importPhaseLabel: "",
    importPollingTimer: null as ReturnType<typeof setInterval> | null,

    showImportModal() {
      const { modal, errorBox, closeBtn } = getImportModalElements();
      if (!modal) return;
      modal.classList.remove("hidden");
      modal.classList.add("flex");
      errorBox?.classList.add("hidden");
      closeBtn?.classList.add("hidden");
    },

    hideImportModal() {
      const { modal } = getImportModalElements();
      if (!modal) return;
      modal.classList.add("hidden");
      modal.classList.remove("flex");
    },

    updateImportModal(status: ImportStatusResponse) {
      const { bar, phase, errorBox, errorText, closeBtn } = getImportModalElements();
      const percent = typeof status.percent === "number" ? status.percent : 0;
      this.importPercent = percent;
      this.importPhaseLabel = status.phaseLabel ?? "";

      if (bar) bar.value = percent;
      if (phase) {
        phase.textContent = status.phaseLabel ?? window.__importExportStrings?.importPolling ?? "";
      }

      if (status.status === "failed") {
        const message = status.cause
          ? `${status.error ?? "Import failed"} — cause: ${status.cause}`
          : (status.error ?? window.__importExportStrings?.importError ?? "Import failed");
        if (errorText) errorText.textContent = message;
        errorBox?.classList.remove("hidden");
        closeBtn?.classList.remove("hidden");
      }
    },

    stopImportPolling() {
      if (this.importPollingTimer) {
        clearInterval(this.importPollingTimer);
        this.importPollingTimer = null;
      }
    },

    async pollImportJob(jobId: string) {
      const strings = window.__importExportStrings ?? {};
      try {
        const res = await fetch(`/api/import/${encodeURIComponent(jobId)}`, {
          credentials: "same-origin",
        });
        const data = (await res.json().catch(() => ({}))) as ImportStatusResponse & {
          message?: string;
          error?: string;
        };

        if (!res.ok) {
          throw new Error(data.message || data.error || strings.importError || "Import failed");
        }

        this.updateImportModal(data);

        if (data.status === "completed") {
          this.stopImportPolling();
          this.importOk = true;
          this.importMessage = strings.importSuccess ?? "Import completed";
          this.importing = false;
          const { closeBtn } = getImportModalElements();
          closeBtn?.classList.remove("hidden");
          setTimeout(() => this.hideImportModal(), 1200);
          return;
        }

        if (data.status === "failed") {
          this.stopImportPolling();
          this.importOk = false;
          const message = data.cause
            ? `${data.error ?? strings.importError} — cause: ${data.cause}`
            : (data.error ?? strings.importError ?? "Import failed");
          this.importMessage = message;
          this.importing = false;
        }
      } catch (error) {
        this.stopImportPolling();
        this.importOk = false;
        this.importing = false;
        this.importMessage =
          error instanceof Error ? error.message : (strings.importError ?? "Import failed");
        this.updateImportModal({
          status: "failed",
          error: this.importMessage,
          percent: this.importPercent,
        });
      }
    },

    startImportPolling(jobId: string) {
      this.importJobId = jobId;
      this.stopImportPolling();
      void this.pollImportJob(jobId);
      this.importPollingTimer = setInterval(() => {
        void this.pollImportJob(jobId);
      }, 1500);
    },

    async exportData() {
      if (!this.exportDatabase && !this.exportMedia && !this.exportThemes) {
        this.exportWarning = true;
        this.importMessage = "";
        return;
      }

      this.exportWarning = false;
      this.exporting = true;
      this.importMessage = "";
      try {
        const params = new URLSearchParams();
        if (this.exportDatabase) params.set("database", "1");
        if (this.exportMedia) params.set("media", "1");
        if (this.exportThemes) params.set("themes", "1");
        const res = await fetch(`/api/export?${params.toString()}`, { credentials: "same-origin" });
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
      this.showImportModal();
      this.updateImportModal({
        status: "queued",
        phaseLabel: strings.importPolling ?? "Processing…",
        percent: 0,
      });

      try {
        const body = new FormData(form);
        const res = await fetch("/api/import", {
          method: "POST",
          body,
          credentials: "same-origin",
        });
        const data = (await res.json().catch(() => ({}))) as {
          jobId?: string;
          message?: string;
          error?: string;
        };

        if (res.status === 202 && data.jobId) {
          this.startImportPolling(data.jobId);
          form.reset();
          return;
        }

        if (!res.ok) {
          throw new Error(data.message || data.error || strings.importError || "Import failed");
        }

        this.importOk = true;
        this.importMessage = strings.importSuccess ?? "Import completed";
        this.importing = false;
        this.hideImportModal();
        form.reset();
      } catch (error) {
        this.stopImportPolling();
        this.importOk = false;
        this.importing = false;
        this.importMessage =
          error instanceof Error ? error.message : (strings.importError ?? "Import failed");
        this.updateImportModal({ status: "failed", error: this.importMessage, percent: 0 });
      }
    },
  }));
});

document.addEventListener("DOMContentLoaded", () => {
  const closeBtn = document.getElementById("import-progress-close");
  closeBtn?.addEventListener("click", () => {
    const modal = document.getElementById("import-progress-modal");
    modal?.classList.add("hidden");
    modal?.classList.remove("flex");
  });
});

export {};
