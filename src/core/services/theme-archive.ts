import { parseTarGzip } from "nanotar";
import type { ThemeArchiveEntry } from "./theme-package-collector.ts";

async function inflateRawDeflate(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  await writer.write(data);
  await writer.close();

  const chunks: Uint8Array[] = [];
  const reader = ds.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

async function parseZip(buffer: ArrayBuffer): Promise<ThemeArchiveEntry[]> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const entries: ThemeArchiveEntry[] = [];
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    const signature = view.getUint32(offset, true);
    if (signature !== 0x04034b50) break;

    const compression = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);

    if (!name.endsWith("/")) {
      let data: Uint8Array;
      if (compression === 0) {
        data = compressed;
      } else if (compression === 8) {
        data = await inflateRawDeflate(compressed);
      } else {
        throw new Error(`Unsupported ZIP compression method: ${compression}`);
      }
      entries.push({ name, data });
    }

    offset = dataStart + compressedSize;
  }

  if (entries.length === 0) {
    throw new Error("No files found in ZIP archive");
  }

  return entries;
}

function isGzipArchive(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

function isZipArchive(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export async function parseThemeArchive(
  buffer: ArrayBuffer,
  filename: string,
): Promise<ThemeArchiveEntry[]> {
  const lower = filename.toLowerCase();
  const bytes = new Uint8Array(buffer);

  if (lower.endsWith(".zip") || isZipArchive(bytes)) {
    return parseZip(buffer);
  }

  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz") || isGzipArchive(bytes)) {
    const tarEntries = await parseTarGzip(buffer);
    return tarEntries.map((entry) => ({
      name: entry.name,
      data: entry.data ? new Uint8Array(entry.data) : undefined,
    }));
  }

  throw new Error("Unsupported archive format. Use .zip or .tar.gz");
}
