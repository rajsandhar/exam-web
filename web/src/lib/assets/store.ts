import fs from "node:fs";
import path from "node:path";

import { DATA_DIR, resolveDatabaseFile } from "@/lib/paths";

import { mediaTypeFor, sniffMediaType, type MediaType } from "./media-types";

/**
 * Where uploaded files live on disk.
 *
 * Beside the database rather than in `public/`, so serving one requires a
 * session. Files are named by asset id and never by anything the uploader
 * chose, which is what stops a filename from escaping the directory.
 *
 * The directory is named after the database it belongs to. An asset without its
 * row is meaningless, so a test run or an end-to-end run must not write into
 * the store the development database is using.
 */

if (typeof window !== "undefined") {
  throw new Error("src/lib/assets/store.ts is server-only.");
}

export const ASSETS_DIR = path.resolve(
  DATA_DIR,
  `${path.basename(resolveDatabaseFile()).replace(/\.db$/, "")}-assets`,
);

export function ensureAssetsDir(): string {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  return ASSETS_DIR;
}

/** `<id>.<ext>`, resolved inside the assets directory and nowhere else. */
export function assetPath(id: string, extension: string): string {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) {
    throw new Error(`Refusing to resolve an asset path for id ${JSON.stringify(id)}.`);
  }
  if (!/^[a-z0-9]+$/.test(extension)) {
    throw new Error(`Refusing to resolve an asset path for extension ${extension}.`);
  }
  return path.join(ASSETS_DIR, `${id}.${extension}`);
}

export type StoredFile = { mediaType: MediaType; byteSize: number };

export type StoreProblem = { problem: string };

/**
 * Writes an upload, refusing anything that is not what it claims to be.
 *
 * The type is decided by the file's own bytes: the extension and the browser's
 * content type are both supplied by whoever is uploading.
 */
export function storeUpload(
  id: string,
  bytes: Uint8Array,
  expected?: { kind: MediaType["kind"] },
): StoredFile | StoreProblem {
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

  ensureAssetsDir();
  fs.writeFileSync(assetPath(id, mediaType.extension), bytes);
  return { mediaType, byteSize: bytes.byteLength };
}

export function readAsset(id: string, mimeType: string): Buffer | null {
  const mediaType = mediaTypeFor(mimeType);
  if (!mediaType) return null;

  const file = assetPath(id, mediaType.extension);
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

export function assetSize(id: string, mimeType: string): number | null {
  const mediaType = mediaTypeFor(mimeType);
  if (!mediaType) return null;

  const file = assetPath(id, mediaType.extension);
  return fs.existsSync(file) ? fs.statSync(file).size : null;
}

/** Reads part of a file, for the range requests a video player makes. */
export function readAssetRange(
  id: string,
  mimeType: string,
  start: number,
  end: number,
): Buffer | null {
  const mediaType = mediaTypeFor(mimeType);
  if (!mediaType) return null;

  const file = assetPath(id, mediaType.extension);
  if (!fs.existsSync(file)) return null;

  const handle = fs.openSync(file, "r");
  try {
    const length = end - start + 1;
    const buffer = Buffer.alloc(length);
    const read = fs.readSync(handle, buffer, 0, length, start);
    return read === length ? buffer : buffer.subarray(0, read);
  } finally {
    fs.closeSync(handle);
  }
}

export function deleteAssetFiles(id: string, mimeType: string, captionsExtension: string | null): void {
  const mediaType = mediaTypeFor(mimeType);
  if (mediaType) fs.rmSync(assetPath(id, mediaType.extension), { force: true });
  if (captionsExtension) fs.rmSync(assetPath(id, captionsExtension), { force: true });
}
