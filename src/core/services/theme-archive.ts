import { parseTarGzip } from "nanotar";
import type { ThemeArchiveEntry } from "./theme-package-collector.ts";

const SIG_LOCAL_FILE_HEADER = 0x04034b50;
const SIG_CENTRAL_DIRECTORY = 0x02014b50;
const SIG_END_OF_CENTRAL_DIRECTORY = 0x06054b50;

type ZipCentralEntry = {
  name: string;
  compression: number;
  compressedSize: number;
  localHeaderOffset: number;
};

function findEndOfCentralDirectoryOffset(view: DataView, length: number): number {
  const min = Math.max(0, length - 22 - 65535);
  for (let pos = length - 22; pos >= min; pos--) {
    if (view.getUint32(pos, true) === SIG_END_OF_CENTRAL_DIRECTORY) {
      return pos;
    }
  }
  throw new Error("Invalid ZIP archive: end of central directory not found");
}

function readZipCentralEntries(bytes: Uint8Array, view: DataView): ZipCentralEntry[] {
  const eocd = findEndOfCentralDirectoryOffset(view, bytes.length);
  const entryCount = view.getUint16(eocd + 10, true);
  const centralDirOffset = view.getUint32(eocd + 16, true);

  const entries: ZipCentralEntry[] = [];
  let offset = centralDirOffset;

  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(offset, true) !== SIG_CENTRAL_DIRECTORY) {
      throw new Error("Invalid ZIP central directory entry");
    }

    const compression = view.getUint16(offset + 10, true);
    let compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);

    const nameStart = offset + 46;
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength));

    if (compressedSize === 0xffffffff) {
      const extraStart = nameStart + nameLength;
      let extraOffset = extraStart;
      const extraEnd = extraStart + extraLength;
      while (extraOffset + 4 <= extraEnd) {
        const headerId = view.getUint16(extraOffset, true);
        const dataSize = view.getUint16(extraOffset + 2, true);
        if (headerId === 0x0001 && dataSize >= 8) {
          compressedSize = Number(view.getBigUint64(extraOffset + 4, true));
        }
        extraOffset += 4 + dataSize;
      }
    }

    entries.push({ name, compression, compressedSize, localHeaderOffset });
    offset = nameStart + nameLength + extraLength + commentLength;
  }

  return entries;
}

function getLocalFileDataOffset(view: DataView, localHeaderOffset: number): number {
  if (view.getUint32(localHeaderOffset, true) !== SIG_LOCAL_FILE_HEADER) {
    throw new Error("Invalid ZIP local file header");
  }
  const nameLength = view.getUint16(localHeaderOffset + 26, true);
  const extraLength = view.getUint16(localHeaderOffset + 28, true);
  return localHeaderOffset + 30 + nameLength + extraLength;
}

async function inflateRawDeflate(data: Uint8Array): Promise<Uint8Array> {
  if (data.length === 0) {
    return new Uint8Array(0);
  }

  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function parseZip(buffer: ArrayBuffer): Promise<ThemeArchiveEntry[]> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const centralEntries = readZipCentralEntries(bytes, view);
  const entries: ThemeArchiveEntry[] = [];

  for (const entry of centralEntries) {
    if (entry.name.endsWith("/")) continue;

    const dataOffset = getLocalFileDataOffset(view, entry.localHeaderOffset);
    const compressed = bytes.subarray(dataOffset, dataOffset + entry.compressedSize);

    if (compressed.length !== entry.compressedSize) {
      throw new Error(`ZIP entry "${entry.name}" has incomplete compressed data`);
    }

    let data: Uint8Array;
    if (entry.compression === 0) {
      data = compressed;
    } else if (entry.compression === 8) {
      data = await inflateRawDeflate(compressed);
    } else {
      throw new Error(`Unsupported ZIP compression method: ${entry.compression}`);
    }

    entries.push({ name: entry.name, data });
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
