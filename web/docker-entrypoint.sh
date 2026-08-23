#!/bin/sh
# Migrate and seed on first start; both are idempotent, so a restart with an
# existing volume is a no-op. Ingestion is skipped when the corpus has already
# been processed into this database.
set -e

pnpm db:migrate
pnpm db:seed

if [ "${INGEST_ON_START:-auto}" != "never" ]; then
  chunks=$(pnpm exec tsx -e "
    import { db } from './src/lib/db/client';
    import { referenceChunks } from './src/lib/db/schema';
    import { count } from 'drizzle-orm';
    const [row] = await db.select({ n: count() }).from(referenceChunks);
    process.stdout.write(String(row?.n ?? 0));
  " 2>/dev/null || echo 0)
  if [ "$chunks" = "0" ]; then
    echo "Ingesting reference corpus (first start)…"
    pnpm ingest:references
  fi
fi

exec "$@"
