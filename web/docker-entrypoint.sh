#!/bin/sh
# Migrate and seed on first start; both are idempotent, so a restart with an
# existing volume is a no-op. Ingestion is skipped when the corpus has already
# been processed into this database.
set -e

pnpm db:migrate
pnpm db:seed

if [ "${INGEST_ON_START:-auto}" != "never" ]; then
  chunks=$(node -e "
    const D = require('better-sqlite3');
    try {
      const db = new D(process.env.DATABASE_URL.replace(/^file:/, ''));
      const row = db.prepare('SELECT COUNT(*) AS n FROM reference_chunks').get();
      process.stdout.write(String(row.n));
    } catch { process.stdout.write('0'); }
  ")
  if [ "$chunks" = "0" ]; then
    echo "Ingesting reference corpus (first start)…"
    pnpm ingest:references
  fi
fi

exec "$@"
