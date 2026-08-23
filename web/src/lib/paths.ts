import fs from "node:fs";
import path from "node:path";

/**
 * Single source of truth for on-disk locations.
 *
 * Never hardcode a path separator and never assume the process CWD is the app
 * root: `next build`, `next dev`, `pnpm exec tsx scripts/…` and `vitest` all
 * start from slightly different places. The app root is found by walking up
 * from the current directory to the nearest folder containing a `package.json`
 * whose `name` is `web`, which is stable across all of them.
 */

function findAppRoot(): string {
  const explicit = process.env.APP_ROOT;
  if (explicit && explicit.length > 0) return path.resolve(explicit);

  let dir = process.cwd();
  for (;;) {
    const manifest = path.join(dir, "package.json");
    if (fs.existsSync(manifest)) {
      try {
        const parsed: unknown = JSON.parse(fs.readFileSync(manifest, "utf8"));
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          (parsed as { name?: unknown }).name === "web"
        ) {
          return dir;
        }
      } catch {
        // Unreadable package.json — keep walking up.
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Last resort: the current directory. Callers surface a clear error if the
  // reference corpus or data directory is then missing.
  return process.cwd();
}

/** `…/Claude_HSC_SE_Exam_Builder_Pack/web` */
export const APP_ROOT = findAppRoot();

/** `…/Claude_HSC_SE_Exam_Builder_Pack` */
export const PACK_ROOT = path.resolve(APP_ROOT, "..");

/** Read-only source corpus. Never written to. */
export const REFERENCE_DIR = path.resolve(PACK_ROOT, "reference");

export const SYLLABUS_SEED_FILE = path.resolve(
  REFERENCE_DIR,
  "syllabus",
  "year12_syllabus_seed.json",
);

/** Gitignored runtime data (SQLite database, ingestion artefacts). */
export const DATA_DIR = path.resolve(APP_ROOT, "data");

export const MIGRATIONS_DIR = path.resolve(APP_ROOT, "drizzle");

/**
 * Resolves `DATABASE_URL` (`file:./data/app.db`) to an absolute file path.
 * A bare path is accepted too.
 */
export function resolveDatabaseFile(
  url: string = process.env.DATABASE_URL ?? "file:./data/app.db",
): string {
  const withoutScheme = url.startsWith("file:") ? url.slice("file:".length) : url;
  const normalised = withoutScheme.replace(/^\/{2,}/, "");
  return path.isAbsolute(normalised)
    ? normalised
    : path.resolve(APP_ROOT, normalised);
}

export function ensureDataDir(): string {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  return DATA_DIR;
}
