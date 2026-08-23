# HSC Software Engineering — Trial Exam Builder

A local-first web application that generates and runs **100-mark NSW HSC Software
Engineering trial examinations** in a computer-based format modelled on the NESA
online examination experience.

Select Year 12 syllabus content → generate a 100-mark paper → sit it under
examination conditions → have it marked automatically → review every question
against the exact syllabus dot points.

> Independent practice tool. Not affiliated with, endorsed by, or connected to
> the NSW Education Standards Authority. Marks it produces are estimates in the
> style of HSC marking, not official results.

---

## Requirements

| | Version | Notes |
|---|---|---|
| Node | 20 LTS, 22 LTS or 24 LTS | Verified on 24.11.1. `better-sqlite3` ships prebuilt binaries for these; an odd-numbered release will try to compile from source and need Visual Studio Build Tools. |
| pnpm | 9 or later | Verified on 11.22. If `corepack enable` fails with `EPERM` on Windows, use `npm i -g pnpm`. |

No API key is needed to run the application. It ships with a complete hand-written
sample paper and runs entirely offline by default.

---

## Setup

From this directory (`web/`):

```bash
pnpm install
```

```bash
pnpm setup:assets
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

```bash
pnpm ingest:references
```

```bash
pnpm dev
```

Then open <http://localhost:3000>.

What each step does:

- **`pnpm setup:assets`** copies the Pyodide runtime, the Monaco editor and the
  `sql.js` wasm binary from `node_modules` into `public/`. Serving them locally
  rather than from a CDN means the exam works offline and no request leaves the
  machine mid-examination. Required before Python or SQL questions will run.
- **`pnpm db:migrate`** creates `data/app.db` and the FTS5 index.
- **`pnpm db:seed`** loads the Year 12 syllabus — 4 focus areas, 12 subtopics and
  73 selectable dot points — from `../reference/syllabus/year12_syllabus_seed.json`.
- **`pnpm ingest:references`** parses the PDF, DOCX and PPTX files in
  `../reference/` into ~1,550 searchable chunks and derives the question
  archetype library. Only needed for AI generation and AI marking; the sample
  paper works without it.

### Environment

Copy `.env.example` to `.env.local`. Nothing needs changing to run with the
sample paper.

```env
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-opus-5
DATABASE_URL=file:./data/app.db
AI_PROVIDER=mock
```

`AI_PROVIDER` defaults to `mock`. In that mode the app replays a built-in
100-mark sample paper: everything works end to end — sitting, autosave, timing,
objective marking, review — with no API calls. The instructions screen says
plainly when you are looking at the sample paper rather than one built from your
selection.

Set `AI_PROVIDER=anthropic` and supply `ANTHROPIC_API_KEY` to generate real
papers from your own syllabus selection and to have written responses marked.
No model name appears anywhere in the source — `ANTHROPIC_MODEL` is required in
that mode.

---

## Using it

1. **Build trial** (`/build`) — the Year 12 syllabus in exact NESA wording.
   Tick individual dot points, whole subtopics or whole focus areas; search the
   wording; the selection is remembered between visits. One button:
   **Generate 100-mark Trial**.
2. **Exam mode** — 10 minutes reading time (navigation, flagging and
   highlighting work; answering does not), then 2 h 55 m working time. Flag,
   highlight, font size and colour theme all work and persist. Everything
   autosaves; a refresh restores the paper exactly and does not return time.
3. **Results** (`/results/[attemptId]`) — an estimated mark out of 100, the
   objective/constructed split, per-question review with the correct answer and
   marking criteria, performance aggregated to exact syllabus dot points, and the
   list of selected content this paper did not assess.
4. **History** (`/history`) — every paper you have generated and every attempt.

---

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm test` | Unit tests (117). No API key, no network. |
| `pnpm test:e2e` | Playwright end-to-end suite, including the answer-key leakage check |
| `pnpm test:live` | Tests that call the real Anthropic API. Skipped unless `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` are set. |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm db:reset` | Delete the local database (follow with `db:migrate` and `db:seed`) |
| `pnpm setup:assets` | Re-copy Pyodide, Monaco and sql.js into `public/` |

Playwright needs its browser once: `pnpm exec playwright install chromium`.

---

## How it works

```
src/
  app/                 routes: /build, /generating, /exam, /results, /history, /api
  components/
    build/             syllabus selector
    exam/              exam shell — header, navigator, tools, adaptive layouts
    renderers/         one component per question response type
    results/           review and syllabus analysis
  lib/
    config.ts          exam timing and mark-mix constants
    db/                Drizzle schema and queries
    schemas/           Zod question, renderer and blueprint schemas
    ai/                provider interface, mock, Anthropic pipeline, prompts
    marking/           deterministic markers and marking orchestration
    ingest/            document parsers, chunking, FTS5 retrieval, archetypes
    python/  sql/      browser-side execution
scripts/               seed, migrate, ingest, asset setup
tests/unit  tests/e2e  tests/live
```

A few decisions worth knowing about:

**Answer keys never reach the browser during an attempt.** There are two part
types — `QuestionPartForStudent` has no answer-key or marking-guideline field at
all, and the query that feeds the exam page does not select those columns. A
Playwright test asserts against the raw response body, because in the App Router
a key passed to a client component would be serialised invisibly into the page
source where no DOM-based test would catch it.

**Student code never runs on the server.** Python runs in Pyodide inside a Web
Worker; SQL runs in `sql.js`. Because marking is server-side, submission is two
phase: the server marks everything deterministic and hands back the execution
work, the browser runs it and posts the outcomes, and the server totals the
paper. An infinite loop is stopped by terminating the worker.

**The clock is server-side.** `reading_started_at`, `working_started_at` and
`working_expires_at` live in the database and remaining time is computed from
them, so refreshing grants no extra time and closing the laptop does not pause it.

**Deterministic marking wherever it is reliable.** Single choice, multi-select,
ordering, matching, dropdowns and table cells are marked in application logic and
never cost a model call. Only written responses, open pseudocode and diagram
constructions go to the rubric marker. Marks are always integers.

**Coverage is sampling, not enumeration.** A 100-mark paper is roughly 43 items;
73 dot points cannot all be assessed. At or below 25 selected items every one is
assessed; above that the paper samples, weighted towards content earlier papers
skipped, and the results screen lists what it missed.

---

## Syllabus wording

All 73 dot points now carry confirmed NESA wording. The supplied seed left 15 of
them unresolved — the NESA pages render glossary-linked terms as lazy-loaded
links, so a server-side fetch receives the literal string `Loading` in their
place and produces text that reads as valid English but is wrong. Those 15 were
read from the live pages in a browser, where the terms hydrate, and are applied
by `src/lib/syllabus/resolved-terms.json`. That file sits in `web/` rather than
being patched into the seed because `reference/` is read-only source material.

Two of the informed guesses recorded in `SYLLABUS_VERIFICATION.md` turned out to
be wrong, which is why the document says not to accept them without looking:
`pwa.2.14` is **Object-Relational Mapping (ORM)**, not NoSQL, and `proj.3.8`
needed two terms rather than one.

---

## Known limitations

- **The live AI path is untested against the real API.** The pipeline, its
  validators and the prompt-injection defence are covered by unit tests, and the
  acceptance checks are written in `tests/live/` — but they have never been run
  with a key.

---

## Deployment

The application is designed to run on one machine for one student, and that is
how it is best used. A container is provided for putting it on a small VPS or a
home server.

```bash
docker build -t hsc-se-trial -f Dockerfile ..
```

```bash
docker run -p 3000:3000 -v hsc-se-data:/app/data hsc-se-trial
```

Notes for anything beyond a single user:

- **The database must be on a persistent volume.** SQLite lives in `/app/data`;
  without a volume every paper and result is lost when the container restarts.
- **Resolve the 15 provisional syllabus items first.** The production build
  refuses to start otherwise, by design — shipping provisional syllabus wording
  to a student is worse than not shipping.
- **There are no accounts.** Every visitor sees every paper. Put it behind
  authentication at the proxy, or keep it on a private network.
- **Generation is a long-running request in-process.** That is fine for one user
  generating a paper occasionally. Several concurrent generations would need a
  queue, which this deliberately does not have.
