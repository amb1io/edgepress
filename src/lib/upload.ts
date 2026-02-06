/**
 * Função utilitária para upload de arquivos para R2 via /api/upload.
 * Pode ser usada por Uppy, BlockNote e outros componentes.
 * 
 * @param file - Arquivo a ser enviado
 * @returns URL da imagem acessível via /api/media/ ou erro
 */
export interface UploadResult {
  url: string;
  path: string;
  key: string;
  filename: string;
  mimeType: string;
}

export interface UploadError {
  error: string;
  status?: number;
}

export async function uploadFileToR2(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Upload failed" }));
      throw new Error(errorData.error || `Upload failed with status ${response.status}`);
    }

    const data = (await response.json()) as {
      key?: string;
      path?: string;
      mimeType?: string;
      filename?: string;
    };

    if (!data.path || !data.key) {
      throw new Error("Invalid response from upload endpoint");
    }

    // Converter path do R2 para URL acessível via endpoint /api/media/
    const imageUrl = data.path.startsWith("http")
      ? data.path
      : data.path.startsWith("/uploads/")
        ? `/api/media${data.path}`
        : data.path.startsWith("/")
          ? `/api/media${data.path}`
          : `/api/media/uploads/${data.path}`;

    return {
      url: imageUrl,
      path: data.path,
      key: data.key,
      filename: data.filename || file.name,
      mimeType: data.mimeType || file.type,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Upload failed";
    throw new Error(errorMessage);
  }
}
