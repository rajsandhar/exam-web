import fs from "node:fs";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { resolveDatabaseUrl } from "@/lib/db/config";
import { DATA_DIR } from "@/lib/paths";

import { mediaTypeFor, type MediaType } from "./media-types";

/**
 * Where uploaded files are kept.
 *
 * Two backends behind one interface, chosen by whether Supabase credentials are
 * present:
 *
 * - **Local disk**, beside the database. Right for development and for any host
 *   with a persistent volume.
 * - **Supabase Storage**, for a serverless host, where the filesystem is
 *   read-only and thrown away between invocations.
 *
 * Neither is reachable without a session: the local files sit outside `public/`,
 * and the Supabase bucket is private, served through a short-lived signed URL
 * that the route issues only after checking who is asking.
 */

if (typeof window !== "undefined") {
  throw new Error("src/lib/assets/storage.ts is server-only.");
}

/** How long a signed URL stays valid. Long enough to watch a video, no longer. */
const SIGNED_URL_SECONDS = 60 * 60;

export type StoredObject = { byteSize: number };

/**
 * Either bytes to send, or a URL to send the browser to.
 *
 * A serverless function should not stream a 60 MB video through itself, and
 * cannot serve byte ranges well if it does. Redirecting hands both jobs to
 * storage, which does them properly.
 */
export type AssetSource =
  | { kind: "bytes"; body: Buffer }
  | { kind: "redirect"; url: string };

export interface AssetStorage {
  readonly name: "local" | "supabase";
  put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredObject>;
  get(key: string, contentType: string): Promise<AssetSource | null>;
  /** Bytes of a whole object, for the local range-request path. */
  bytes(key: string, contentType: string): Promise<Buffer | null>;
  size(key: string, contentType: string): Promise<number | null>;
  delete(key: string, contentType: string): Promise<void>;
}

/* ------------------------------------------------------------------ local */

/**
 * Named after the database it belongs to, so a test run and a development
 * database do not share files. Only the local backend reads it — with Supabase
 * configured, nothing here touches the disk.
 */
export const ASSETS_DIR = path.resolve(
  DATA_DIR,
  `${path.basename(resolveDatabaseUrl()?.url ?? "local").replace(/[^\w-]/g, "_")}-assets`,
);

/** `<key>.<ext>`, resolved inside the assets directory and nowhere else. */
export function localPath(key: string, extension: string): string {
  if (!/^[a-zA-Z0-9-]+$/.test(key)) {
    throw new Error(`Refusing to resolve an asset path for key ${JSON.stringify(key)}.`);
  }
  if (!/^[a-z0-9]+$/.test(extension)) {
    throw new Error(`Refusing to resolve an asset path for extension ${extension}.`);
  }
  return path.join(ASSETS_DIR, `${key}.${extension}`);
}

const localStorage: AssetStorage = {
  name: "local",

  async put(key, bytes, contentType) {
    const type = requireType(contentType);
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
    fs.writeFileSync(localPath(key, type.extension), bytes);
    return { byteSize: bytes.byteLength };
  },

  async get(key, contentType) {
    const body = await this.bytes(key, contentType);
    return body ? { kind: "bytes", body } : null;
  },

  async bytes(key, contentType) {
    const file = localPath(key, requireType(contentType).extension);
    return fs.existsSync(file) ? fs.readFileSync(file) : null;
  },

  async size(key, contentType) {
    const file = localPath(key, requireType(contentType).extension);
    return fs.existsSync(file) ? fs.statSync(file).size : null;
  },

  async delete(key, contentType) {
    const type = mediaTypeFor(contentType);
    if (type) fs.rmSync(localPath(key, type.extension), { force: true });
  },
};

/* --------------------------------------------------------------- supabase */

function supabaseConfig(): { url: string; key: string; bucket: string } | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return { url, key, bucket: process.env.SUPABASE_STORAGE_BUCKET?.trim() || "exam-media" };
}

let cachedClient: SupabaseClient | null = null;

function supabaseClient(url: string, key: string): SupabaseClient {
  // The service-role key never leaves the server, and no session is persisted:
  // this client acts as the application, not as a signed-in person.
  cachedClient ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

function supabaseStorage(config: { url: string; key: string; bucket: string }): AssetStorage {
  const bucket = () => supabaseClient(config.url, config.key).storage.from(config.bucket);

  return {
    name: "supabase",

    async put(key, bytes, contentType) {
      const { error } = await bucket().upload(objectName(key, contentType), bytes, {
        contentType,
        upsert: true,
      });
      if (error) throw new Error(`Could not store the file: ${error.message}`);
      return { byteSize: bytes.byteLength };
    },

    async get(key, contentType) {
      // Signed rather than streamed: storage serves the bytes and handles byte
      // ranges, which is what makes seeking a video work.
      const { data, error } = await bucket().createSignedUrl(
        objectName(key, contentType),
        SIGNED_URL_SECONDS,
      );
      if (error || !data) return null;
      return { kind: "redirect", url: data.signedUrl };
    },

    async bytes(key, contentType) {
      const { data, error } = await bucket().download(objectName(key, contentType));
      if (error || !data) return null;
      return Buffer.from(await data.arrayBuffer());
    },

    async size(key, contentType) {
      const body = await this.bytes(key, contentType);
      return body?.byteLength ?? null;
    },

    async delete(key, contentType) {
      await bucket().remove([objectName(key, contentType)]);
    },
  };
}

function objectName(key: string, contentType: string): string {
  return `${key}.${requireType(contentType).extension}`;
}

function requireType(contentType: string): MediaType {
  const type = mediaTypeFor(contentType);
  if (!type) throw new Error(`Unsupported media type ${contentType}.`);
  return type;
}

/* ------------------------------------------------------------------ port */

/**
 * Supabase when it is configured, local disk otherwise. Deliberately not a
 * setting: a host either has a durable filesystem or it does not, and guessing
 * wrong is how uploads vanish.
 */
export function assetStorage(): AssetStorage {
  const config = supabaseConfig();
  return config ? supabaseStorage(config) : localStorage;
}
