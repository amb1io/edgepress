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
      importPartProgress?: string;
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

function isEdgepressFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".edgepress") ||
    name.endsWith(".tar.gz") ||
    name.endsWith(".tgz")
  );
}

function filterEdgepressFiles(files: File[]): File[] {
  return files.filter(isEdgepressFile);
}

function partIndexFromFilename(name: string): number | null {
  const match = name.match(/part-(\d+)/i);
  if (!match?.[1]) return null;
  return Number.parseInt(match[1], 10);
}

function sortImportFiles(files: File[]): File[] {
  return [...files].sort((a, b) => {
    const aPart = partIndexFromFilename(a.name);
    const bPart = partIndexFromFilename(b.name);
    if (aPart != null && bPart != null) return aPart - bPart;
    if (aPart != null) return -1;
    if (bPart != null) return 1;
    return a.name.localeCompare(b.name);
  });
}

function formatPartProgress(
  template: string,
  current: number,
  total: number,
  filename: string,
): string {
  return template
    .replace("{current}", String(current))
    .replace("{total}", String(total))
    .replace("{filename}", filename);
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
    importPollToken: "",
    importBundleUploadToken: "",
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

    updateImportModal(status: ImportStatusResponse, partLabel?: string) {
      const { bar, phase, errorBox, errorText, closeBtn } = getImportModalElements();
      const percent = typeof status.percent === "number" ? status.percent : 0;
      this.importPercent = percent;
      this.importPhaseLabel = partLabel ?? status.phaseLabel ?? "";

      if (bar) bar.value = percent;
      if (phase) {
        const label = partLabel
          ? partLabel
          : (status.phaseLabel ?? window.__importExportStrings?.importPolling ?? "");
        phase.textContent = label;
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

    waitForImportJob(jobId: string, pollToken: string): Promise<ImportStatusResponse> {
      return new Promise((resolve, reject) => {
        const strings = window.__importExportStrings ?? {};

        const poll = async () => {
          try {
            const res = await fetch(`/api/import/${encodeURIComponent(jobId)}`, {
              credentials: "same-origin",
              headers: pollToken ? { "X-Import-Poll-Token": pollToken } : {},
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
              resolve(data);
              return;
            }

            if (data.status === "failed") {
              this.stopImportPolling();
              const message = data.cause
                ? `${data.error ?? strings.importError} — cause: ${data.cause}`
                : (data.error ?? strings.importError ?? "Import failed");
              reject(new Error(message));
            }
          } catch (error) {
            this.stopImportPolling();
            reject(error);
          }
        };

        this.importJobId = jobId;
        this.importPollToken = pollToken;
        this.stopImportPolling();
        void poll();
        this.importPollingTimer = setInterval(() => {
          void poll();
        }, 1500);
      });
    },

    async uploadImportFile(
      file: File,
      bundleUploadToken?: string,
    ): Promise<{ jobId: string; pollToken: string; bundleUploadToken?: string }> {
      const strings = window.__importExportStrings ?? {};
      const body = new FormData();
      body.append("file", file);

      const headers: Record<string, string> = {};
      if (bundleUploadToken) {
        headers["X-Import-Bundle-Token"] = bundleUploadToken;
      }

      const res = await fetch("/api/import", {
        method: "POST",
        body,
        credentials: "same-origin",
        headers,
      });
      const data = (await res.json().catch(() => ({}))) as {
        jobId?: string;
        pollToken?: string;
        bundleUploadToken?: string;
        message?: string;
        error?: string;
      };

      if (res.status === 202 && data.jobId && data.pollToken) {
        return {
          jobId: data.jobId,
          pollToken: data.pollToken,
          bundleUploadToken: data.bundleUploadToken,
        };
      }

      if (!res.ok) {
        throw new Error(data.message || data.error || strings.importError || "Import failed");
      }

      throw new Error(strings.importError || "Import failed");
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

      const files = sortImportFiles(filterEdgepressFiles(Array.from(fileInput.files)));
      if (files.length === 0) {
        this.importOk = false;
        this.importMessage = strings.importError ?? "No valid .edgepress files selected";
        return;
      }
      const totalParts = files.length;

      this.importing = true;
      this.importMessage = "";
      this.importBundleUploadToken = "";
      this.showImportModal();

      try {
        for (let index = 0; index < files.length; index++) {
          const file = files[index]!;
          const partLabel = formatPartProgress(
            strings.importPartProgress ?? "Part {current} of {total}: {filename}",
            index + 1,
            totalParts,
            file.name,
          );

          this.updateImportModal(
            {
              status: "queued",
              phaseLabel: strings.importPolling ?? "Processing…",
              percent: Math.round((index / totalParts) * 100),
            },
            partLabel,
          );

          const uploadToken =
            index > 0 ? this.importBundleUploadToken || undefined : undefined;
          const { jobId, pollToken, bundleUploadToken } = await this.uploadImportFile(
            file,
            uploadToken,
          );
          if (bundleUploadToken) {
            this.importBundleUploadToken = bundleUploadToken;
          }
          await this.waitForImportJob(jobId, pollToken);
        }

        this.importOk = true;
        this.importMessage = strings.importSuccess ?? "Import completed";
        this.importing = false;
        const { closeBtn } = getImportModalElements();
        closeBtn?.classList.remove("hidden");
        setTimeout(() => this.hideImportModal(), 1200);
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
