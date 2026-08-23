/** Deletes the local SQLite database. `pnpm db:reset && pnpm db:migrate && pnpm db:seed`. */
import fs from "node:fs";

import { resolveDatabaseFile } from "../src/lib/paths";

const file = resolveDatabaseFile();
for (const suffix of ["", "-wal", "-shm"]) {
  const p = `${file}${suffix}`;
  if (fs.existsSync(p)) fs.rmSync(p);
}
process.stdout.write(`Removed ${file}\n`);
