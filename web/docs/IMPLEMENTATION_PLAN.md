# Implementation plan

Working document for the build described in `../BUILD_PROMPT_WEB.md`, `../SPEC_ADDENDUM.md` and `../CLAUDE.md`.
Authority order: `SPEC_ADDENDUM.md` → `CLAUDE.md` → `reference/SOURCE_MAP.md` → build prompt step ordering.

## Environment (checked 2026-08-22)

| | Found | Decision |
|---|---|---|
| Node | v24.11.1 | Newer than the prompt's "20/22 LTS" guidance. Node 24 is an active LTS line and `better-sqlite3` 13 publishes prebuilds for it. Verified empirically at Step 2 — no `node-gyp` build required. |
| pnpm | not installed → 11.22.0 | `corepack enable` failed with `EPERM` on `C:\Program Files\nodejs`. Installed with `npm i -g pnpm` instead. |
| next | 16.3.2 | Current stable. Turbopack is the default bundler in 16, so no flag is passed. |
| zod | 4.4.3 | Current stable major is 4. |

## Architecture

Single Next.js App Router application. No services, no queues, no vector database.

```
web/src/
  app/                     routes (build, generating, exam, results, history) + /api handlers
  components/
    build/                 syllabus tree selector
    exam/                  exam shell — header, navigator, tools, layouts
    renderers/             one component per question renderer type
    results/               review + syllabus analysis
  lib/
    config.ts              exam timing + mark-mix constants (READING_MINUTES, MINUTES_PER_MARK…)
    paths.ts               single source of truth for the reference/ and data/ locations
    db/                    drizzle schema, client, queries (student vs marking split)
    schemas/               Zod question/renderer/blueprint schemas
    ai/                    provider interface, mock provider, anthropic provider, prompts
    marking/               deterministic markers + AI marking orchestration
    ingest/                parsers, chunking, FTS5 retrieval, archetype extraction
scripts/                   seed-syllabus.ts, ingest-references.ts, migrate.ts
tests/                     vitest unit tests + playwright e2e
data/                      gitignored: app.db
```

**Data flow.** Selection (localStorage) → `POST /api/exams` → provider (mock | anthropic) → Zod validation →
persisted question groups/parts → attempt created → exam page reads *student-shaped* rows only → autosave via
`PATCH /api/attempts/:id/responses` → submit → deterministic markers, then AI rubric marker → results.

**Answer-key containment (SPEC_ADDENDUM §7).** `answer_key_json` and `marking_guideline_json` live on
`question_parts` but are only ever read by `lib/db/queries/marking.ts`. The student query in
`lib/db/queries/student.ts` selects an explicit column list that omits them, and returns
`QuestionPartForStudent`, a type with no key-bearing field. A test asserts the attempt page response body
contains no guideline text.

**Timing (SPEC_ADDENDUM §1).** `READING_MINUTES = 10`, `MINUTES_PER_MARK = 1.75` → 175 min working time for a
100-mark paper. `reading_started_at` / `working_started_at` / `working_expires_at` are stored server-side and
remaining time is always computed from them.

## Dependencies

| Package | Version | Why |
|---|---|---|
| next / react / react-dom | 16.3.2 / 19.2.8 | App Router, server actions, single-process local app. |
| tailwindcss | 4.3.3 | Styling. Exam mode uses a restrained token set, not component-library defaults. |
| zod | 4.4.3 | Validates every AI output and every renderer payload before it reaches UI or DB. |
| drizzle-orm / drizzle-kit | 0.45.2 / 0.31.10 | Typed SQLite access + migrations, explicit column selection (needed for the key split). |
| better-sqlite3 | 13.0.3 | Synchronous local SQLite with FTS5 compiled in. Prebuilt for Node 24. |
| vitest | 4.1.11 | Unit tests for schemas, marking, blueprint validation. |
| @playwright/test | latest | End-to-end flow per CLAUDE.md §26. |
| @anthropic-ai/sdk | latest | Step 11+ only; server-side, model read from `ANTHROPIC_MODEL`. |
| p-limit | latest | Bounded concurrency (6–8) for question generation. |
| pdfjs-dist / mammoth / officeparser | latest | Deterministic PDF / DOCX / PPTX parsing at ingestion. |
| isomorphic-dompurify | latest | Sanitising rich-text responses before storage and review render. |

Deferred until their step: monaco-editor + pyodide (Step 13), sql.js (Step 13), excalidraw/tldraw (Step 14).

## Steps

- [x] 1 — Initialise `web/`, tsconfig strictness, `.env.example`, this plan
- [x] 2 — Drizzle schema (all of CLAUDE.md §20) + syllabus seed from the supplied JSON, 4/12/73 asserted
- [x] 3 — Build Trial screen: exact wording, tri-state checkboxes, search, persistence
- [x] 4 — Zod question schemas; `QuestionPartForStudent` vs `QuestionPartForMarking`
- [x] 5 — Mock AI provider + hand-written 100-mark fixture paper with real keys and guidelines
- [x] 6 — Exam shell matching the five screenshots; instructions screen; reading time
- [x] 7 — Attempt engine: autosave, server-authoritative timers, refresh restoration
- [x] 8 — Deterministic marking (integer marks, documented partial-credit rule)
- [x] 9 — Results and review, syllabus performance, not-assessed list 🚩 Slice 1 checkpoint
- [x] 10 — Reference ingestion, FTS5 retrieval, Binder archetype library
- [x] 11 — AI generation pipeline (stages A–E), coverage sampling, novelty fingerprints, bounded concurrency
- [x] 12 — AI marking + moderation + prompt-injection defence 🚩 Slice 3 checkpoint
- [x] 13 — Richer renderers: dropdown/table/ordering/matching → diagram_viewer → python → sql → pseudocode
- [x] 14 — `diagram_builder`
- [x] 15 — Quality pass: Playwright, leakage test, accessibility, README, Dockerfile

## Decisions log

- **Node 24 kept** rather than downgrading. `better-sqlite3` installed from a prebuild; no Visual Studio Build
  Tools needed. If that ever breaks, `@libsql/client` is the agreed fallback (it also supports FTS5).
- **`create-next-app` extras removed.** The generator wrote `web/CLAUDE.md` and `web/AGENTS.md` (generic Next
  guidance) which would shadow the real project spec; deleted. Default `public/*.svg` art deleted too.
- **`serverExternalPackages: ["better-sqlite3"]`** in `next.config.ts` so the native module is not bundled.
- **Selectable unit is the content dot point**; `including` arrays are stored as JSON on the parent and are not
  independently selectable (SPEC_ADDENDUM §8).
- **Integer marks only**, everywhere, including partial credit.
- **`multi_select` partial credit rule** (defined at Step 8): score = correct selected − incorrect selected,
  clamped to `[0, marks]`, then scaled `round(score / totalCorrect × marks)`. Over-selecting everything scores 0.
- **Highlights** are stored per attempt as `{questionGroupId, partId?, text, occurrence, colour}` rather than DOM
  ranges, so they survive re-render and reload.
- **Scenario domains** are a fixed vocabulary in `src/lib/ai/scenario-domains.ts` (SPEC_ADDENDUM §3).
