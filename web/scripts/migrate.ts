/**
 * Applies Drizzle migrations and creates the FTS5 index used for reference
 * retrieval (CLAUDE.md §16). FTS5 virtual tables and their sync triggers are
 * not modelled by Drizzle, so they are created here idempotently.
 *
 *   pnpm db:migrate
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { ensureDataDir, MIGRATIONS_DIR, resolveDatabaseFile } from "../src/lib/paths";

const FTS_SETUP = `
CREATE VIRTUAL TABLE IF NOT EXISTS reference_chunks_fts USING fts5(
  content,
  focus_area UNINDEXED,
  chunk_id UNINDEXED,
  tokenize = 'porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS reference_chunks_ai AFTER INSERT ON reference_chunks BEGIN
  INSERT INTO reference_chunks_fts (rowid, content, focus_area, chunk_id)
  VALUES (new.rowid, new.content, COALESCE(new.focus_area, ''), new.id);
END;

CREATE TRIGGER IF NOT EXISTS reference_chunks_ad AFTER DELETE ON reference_chunks BEGIN
  DELETE FROM reference_chunks_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS reference_chunks_au AFTER UPDATE ON reference_chunks BEGIN
  DELETE FROM reference_chunks_fts WHERE rowid = old.rowid;
  INSERT INTO reference_chunks_fts (rowid, content, focus_area, chunk_id)
  VALUES (new.rowid, new.content, COALESCE(new.focus_area, ''), new.id);
END;
`;

function main(): void {
  ensureDataDir();
  const file = resolveDatabaseFile();
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_DIR });
  sqlite.exec(FTS_SETUP);
  sqlite.close();

  process.stdout.write(`Migrated ${file}\n`);
}

main();
