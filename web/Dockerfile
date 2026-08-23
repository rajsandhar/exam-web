# Build context is the pack root, so `reference/` is available for ingestion:
#
#   docker build -t hsc-se-trial -f web/Dockerfile .
#   docker run -p 3000:3000 -v hsc-se-data:/app/data hsc-se-trial
#
# The production build refuses to start while the syllabus seed is provisional
# (15 unverified dot points). Resolve them per
# reference/syllabus/SYLLABUS_VERIFICATION.md before deploying.

# --------------------------------------------------------------- dependencies
FROM node:22-bookworm-slim AS deps
WORKDIR /app

RUN corepack enable

COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# --------------------------------------------------------------------- build
FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY web/ ./
# Read-only source corpus, needed by `pnpm ingest:references`.
COPY reference/ /reference/

# Pyodide, Monaco and sql.js are served from public/ so the exam works offline.
RUN pnpm setup:assets
RUN pnpm build

# ---------------------------------------------------------------------- run
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=file:./data/app.db
ENV AI_PROVIDER=mock

RUN corepack enable && \
    groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs exam

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src ./src
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY reference/ /reference/
COPY web/docker-entrypoint.sh ./docker-entrypoint.sh

# The database lives on a volume; without one, every paper is lost on restart.
RUN mkdir -p /app/data && \
    chown -R exam:nodejs /app/data && \
    chmod +x ./docker-entrypoint.sh

USER exam
VOLUME ["/app/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD node -e "fetch('http://127.0.0.1:3000/build').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["pnpm", "start"]
