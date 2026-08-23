import { sniffMediaType, type MediaType } from "./media-types";
import { assetStorage } from "./storage";

/**
 * Accepting an upload.
 *
 * The type is decided by the file's own bytes: the extension and the browser's
 * content type are both supplied by whoever is uploading (CLAUDE.md §23).
 * Where the bytes are then kept is `storage.ts`'s business, not this file's.
 */

export type StoredFile = { mediaType: MediaType; byteSize: number };
export type StoreProblem = { problem: string };

export async function storeUpload(
  id: string,
  bytes: Uint8Array,
  expected?: { kind: MediaType["kind"] },
): Promise<StoredFile | StoreProblem> {
  if (bytes.byteLength === 0) return { problem: "That file is empty." };

  const mediaType = sniffMediaType(bytes);
  if (!mediaType) {
    return {
      problem:
        "That file type is not accepted. Images must be PNG, JPEG or WebP; " +
        "video must be MP4 or WebM; captions must be WebVTT.",
    };
  }

  if (expected && mediaType.kind !== expected.kind) {
    return {
      problem: `That file is ${mediaType.mimeType}, which is not a ${expected.kind}.`,
    };
  }

  if (bytes.byteLength > mediaType.maxBytes) {
    const limit = Math.round(mediaType.maxBytes / (1024 * 1024));
    return { problem: `That file is larger than the ${limit} MB limit.` };
  }

  await assetStorage().put(id, bytes, mediaType.mimeType);
  return { mediaType, byteSize: bytes.byteLength };
}

export async function readAsset(id: string, mimeType: string): Promise<Buffer | null> {
  return assetStorage().bytes(id, mimeType);
}

export async function assetSize(id: string, mimeType: string): Promise<number | null> {
  return assetStorage().size(id, mimeType);
}

/** Reads part of a file, for the range requests a video player makes. */
export async function readAssetRange(
  id: string,
  mimeType: string,
  start: number,
  end: number,
): Promise<Buffer | null> {
  const body = await assetStorage().bytes(id, mimeType);
  return body ? body.subarray(start, end + 1) : null;
}

export async function deleteAssetFiles(
  id: string,
  mimeType: string,
  captionsExtension: string | null,
): Promise<void> {
  const storage = assetStorage();
  await storage.delete(id, mimeType);
  if (captionsExtension) await storage.delete(id, "text/vtt");
}

export { ASSETS_DIR } from "./storage";
