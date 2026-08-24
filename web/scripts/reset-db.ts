/**
 * Deletes the local database. `pnpm db:reset && pnpm db:migrate && pnpm db:seed`.
 *
 * Refuses a hosted connection string. `DATABASE_URL` can now name a Supabase
 * project rather than a folder, and a reset script that quietly did something
 * to one is not worth the convenience.
 */
import "./load-env";

import fs from "node:fs";

import { isPostgresUrl, resolveDatabaseUrl } from "../src/lib/db/config";
import { resolveDatabaseDirectory } from "../src/lib/paths";

const resolved = resolveDatabaseUrl();

if (!resolved) {
  process.stderr.write("DATABASE_URL is not set, so there is no local database to remove.\n");
  process.exit(1);
}

if (isPostgresUrl(resolved.url)) {
  process.stderr.write(
    `${resolved.variable} points at a hosted database. Refusing to reset it: drop and ` +
      `re-migrate it from the provider's console if that is really what you want.\n`,
  );
  process.exit(1);
}

const directory = resolveDatabaseDirectory(resolved.url);
fs.rmSync(directory, { recursive: true, force: true });
fs.rmSync(`${directory}-assets`, { recursive: true, force: true });
process.stdout.write(`Removed ${directory}\n`);
