/**
 * What may be uploaded, decided by the bytes rather than the filename.
 *
 * An uploaded file is untrusted input (CLAUDE.md §23). The extension and the
 * browser-supplied content type are both attacker-controlled, so the type is
 * read from the file's own magic bytes and anything unrecognised is refused.
 *
 * SVG is deliberately absent: it is a document that can carry script, and it
 * would be served from the application's own origin.
 */

export type AssetKind = "image" | "video" | "captions";

export type MediaType = {
  mimeType: string;
  kind: AssetKind;
  extension: string;
  /** Largest file accepted, in bytes. */
  maxBytes: number;
};

const MB = 1024 * 1024;

export const IMAGE_MAX_BYTES = 3 * MB;
export const VIDEO_MAX_BYTES = 60 * MB;
export const CAPTIONS_MAX_BYTES = 256 * 1024;

const TYPES: MediaType[] = [
  { mimeType: "image/png", kind: "image", extension: "png", maxBytes: IMAGE_MAX_BYTES },
  { mimeType: "image/jpeg", kind: "image", extension: "jpg", maxBytes: IMAGE_MAX_BYTES },
  { mimeType: "image/webp", kind: "image", extension: "webp", maxBytes: IMAGE_MAX_BYTES },
  { mimeType: "video/mp4", kind: "video", extension: "mp4", maxBytes: VIDEO_MAX_BYTES },
  { mimeType: "video/webm", kind: "video", extension: "webm", maxBytes: VIDEO_MAX_BYTES },
  {
    mimeType: "text/vtt",
    kind: "captions",
    extension: "vtt",
    maxBytes: CAPTIONS_MAX_BYTES,
  },
];

export const ACCEPTED_MIME_TYPES = TYPES.map((type) => type.mimeType);

export function mediaTypeFor(mimeType: string): MediaType | undefined {
  return TYPES.find((type) => type.mimeType === mimeType);
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/**
 * Identifies a file from its contents. Returns undefined for anything not on
 * the allowlist, which is what the caller must reject on.
 */
export function sniffMediaType(bytes: Uint8Array): MediaType | undefined {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return mediaTypeFor("image/png");
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return mediaTypeFor("image/jpeg");
  }
  // RIFF....WEBP
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return mediaTypeFor("image/webp");
  }
  // EBML header — WebM and Matroska share it.
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    return mediaTypeFor("video/webm");
  }
  // ISO base media: a size field, then "ftyp".
  if (startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) {
    return mediaTypeFor("video/mp4");
  }
  if (isWebVtt(bytes)) {
    return mediaTypeFor("text/vtt");
  }
  return undefined;
}

/** WebVTT has no magic number, only a required first line. */
function isWebVtt(bytes: Uint8Array): boolean {
  // Skip a UTF-8 byte-order mark if one is present.
  const offset = startsWith(bytes, [0xef, 0xbb, 0xbf]) ? 3 : 0;
  const header = new TextDecoder().decode(bytes.slice(offset, offset + 6));
  return header === "WEBVTT";
}
