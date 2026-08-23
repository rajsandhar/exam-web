import fs from "node:fs";
import path from "node:path";

/**
 * Reads `.env.local` for the command-line scripts.
 *
 * Next loads it for the application, but nothing loaded it for
 * `pnpm db:migrate`, `pnpm db:seed` or `pnpm ingest:references` — they saw only
 * what the shell exported, so the setup the README documents worked in the
 * application and not in the scripts that have to run before it can serve
 * anything.
 *
 * Deliberately small: no substitution, no expansion, and the shell always wins,
 * so exporting a connection string for a single command cannot be silently
 * overridden by a file left in the working tree.
 */

/** Read in order; nothing overwrites a name already set. */
export const ENV_FILES = [".env.local", ".env"] as const;

const ASSIGNMENT = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/;

function unquote(value: string): string {
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.length > 1 && value.endsWith(quote)) {
    return value.slice(1, -1);
  }
  // An unquoted value runs to a trailing comment, as in every other .env reader.
  return value.split(" #")[0]!.trimEnd();
}

export function parseEnvFile(contents: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    if (line.trim().length === 0 || line.trimStart().startsWith("#")) continue;
    const match = ASSIGNMENT.exec(line);
    if (match) parsed[match[1]!] = unquote(match[2]!);
  }
  return parsed;
}

/** Applies the env files in `directory`, and returns the names it set. */
export function loadEnvFiles(
  directory: string,
  env: Record<string, string | undefined> = process.env,
): string[] {
  const applied: string[] = [];
  for (const name of ENV_FILES) {
    const file = path.join(directory, name);
    if (!fs.existsSync(file)) continue;
    const parsed = parseEnvFile(fs.readFileSync(file, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (env[key] !== undefined) continue;
      env[key] = value;
      applied.push(key);
    }
  }
  return applied;
}
