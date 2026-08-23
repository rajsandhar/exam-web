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

Then open <http://localhost:3000>. The first visit asks you to create an
administrator account — see [Accounts](#accounts) below.

What each step does:

- **`pnpm setup:assets`** copies the Pyodide runtime, the Monaco editor and the
  `sql.js` wasm binary from `node_modules` into `public/`. Serving them locally
  rather than from a CDN means the exam works offline and no request leaves the
  machine mid-examination. Required before Python or SQL questions will run.
- **`pnpm db:migrate`** creates `data/app.db` and the FTS5 index.
  Uploaded media lives beside it in `data/app-assets/`; when hosting, that
  directory needs to persist just as the database does.
- **`pnpm db:seed`** loads the Year 12 syllabus — 4 focus areas, 12 subtopics and
  73 selectable dot points — from `../reference/syllabus/year12_syllabus_seed.json`.
- **`pnpm ingest:references`** parses the PDF, DOCX and PPTX files in
  `../reference/` into ~1,550 searchable chunks and derives the question
  archetype library. Only needed for AI generation and AI marking; the sample
  paper works without it.

### Where configuration comes from

There are two places, and the first wins:

1. **The settings screen** (`/settings`, administrators only). What an
   administrator saves there overrides the environment, field by field — setting
   a model does not blank a base URL coming from the environment.
2. **The environment**, below. Useful for a container that has no administrator
   yet, or for keeping a key out of the database.

The screen has a **Test connection** button that makes one small call and reports
whether the endpoint is reachable, which JSON mode it supports, and whether the
output validated. The stored key is never sent back to the browser and is never
shown again after it is saved.

### Environment

Copy `.env.example` to `.env.local`. Nothing needs changing to run with the
sample paper.

```env
AI_BASE_URL=
AI_API_KEY=
AI_MODEL=
DATABASE_URL=file:./data/app.db
GENERATION_PROVIDER=sample
```

**The application is vendor-neutral.** It speaks one wire format — the widely
implemented chat-completions shape — and knows only a base URL, a key and a
model name. No provider is named anywhere in the code or in configuration.

Check any configuration before relying on it:

```bash
pnpm ai:smoke
```

That makes one small call and reports whether the endpoint is reachable, whether
it supports schema-constrained JSON or only plain JSON, whether the output
validated, and how slow it is. Worth doing first — generating a paper is around
a hundred calls, and finding out on call seventy is an expensive way to learn.

### Endpoints known to work

These are examples for the `AI_BASE_URL` field, not dependencies. Anything
implementing the same format will work, including services not listed here.

| | Base URL | Notes |
|---|---|---|
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | Free tier; good schema support |
| Groq | `https://api.groq.com/openai/v1` | Free tier; fast; schema support varies by model |
| OpenRouter | `https://openrouter.ai/api/v1` | Has free models; quality varies widely |
| Anthropic | `https://api.anthropic.com/v1/` | Paid; strongest marking quality |
| OpenAI | `https://api.openai.com/v1` | Paid |
| Ollama | `http://localhost:11434/v1` | Local, no key, no quota; weakest quality |

### Generation and marking are separate settings

They have very different costs. Producing a paper is roughly 100 model calls;
marking the written responses on one is roughly 30 small ones. So a modest
budget goes much further on marking — which is also the half where a model is
irreplaceable, since nothing in code can judge a 6-mark "evaluate" response.

| Setting | Values | Default |
|---|---|---|
| `GENERATION_PROVIDER` | `sample`, `model` | `sample` |
| `MARKING_PROVIDER` | `none`, `model` | `model` once an endpoint is configured |

- **`sample`** serves a built-in 100-mark paper. Everything works end to end —
  sitting, autosave, timing, objective marking, review — with no calls at all.
  The instructions screen says plainly when you are looking at it rather than a
  paper built from your selection.
- **Configuring an endpoint turns on marking, not generation.** That is
  deliberate: you get real marks on the written 75 without paying to generate.
- **`GENERATION_PROVIDER=model`** additionally builds papers from your selection.
- **`MARKING_PROVIDER=none`** leaves written responses unmarked and shows the
  marking guideline and a full-mark exemplar instead of inventing a score.

### Different models for different stages

Anything unset falls back to `AI_MODEL`:

```env
AI_MODEL_BLUEPRINT=   AI_MODEL_QUESTION=   AI_MODEL_CRITIC=
AI_MODEL_MARKING=     AI_MODEL_MODERATION=
```

Generating questions tolerates a cheaper model far better than marking them
does. A weak question is a poor practice item; a weak mark on a correct answer
is the thing that makes a student stop trusting the tool.

---

## Accounts

There is no self sign-up. The first time the application runs, `/setup` asks for
a username and password and creates the administrator; every later account is
created by an administrator. Anything else would hand out accounts to whoever
found the machine on the network.

- Passwords are hashed with scrypt and never stored in any recoverable form.
- The session cookie is `httpOnly` and `SameSite=Lax`; the database keeps only a
  SHA-256 hash of the token, so a copy of `data/app.db` is not a set of keys.
- Sessions last 30 days and slide forward as they are used. Changing a password,
  or disabling an account, ends every session it has.
- There is no password reset by email. An administrator sets a new password.
- Papers, attempts and results belong to the account that created them, and are
  not visible to any other account.
- Administrators manage accounts at `/admin/users`: add, disable, change role and
  reset a password. A new or reset account must choose its own password before it
  can do anything else, so a password an administrator has seen never becomes
  permanent. The last administrator cannot be disabled or demoted.
- Anyone can change their own password at `/account/password`, which requires the
  current one — a signed-in unattended browser is not enough to take an account
  over.
- Papers generated before accounts existed are transferred to the first
  administrator, so upgrading an existing installation loses nothing.

If you forget the only administrator password, delete `data/app.db` and start
again, or clear the `users` table with any SQLite client to return to `/setup`.

---

## Media

Some questions need a stimulus the application cannot produce — a photograph, a
recording. An administrator uploads those at `/admin/assets` and tags them to the
syllabus dot points they suit; a generated paper is only offered media that
matches the content the student selected.

**The description matters more than the file.** Neither the question writer nor
the marker can see or hear what you upload — both work from the description, and
for video that means a full transcript. A thin description produces a question
that cannot be answered or marked fairly, so a minimum length is enforced.

- Type is decided by the file's own bytes, never its name or the browser's
  claim. PNG, JPEG and WebP up to 3 MB; MP4 and WebM up to 60 MB; WebVTT
  captions. **SVG is refused** — it can carry script and would be served from
  this application's own origin.
- Files live in `data/<database>-assets/`, not `public/`, and are served through
  `/api/assets/[id]`, which requires a session. Video is served with range
  support so a player can seek.
- A licence field is required. This is a study tool, not a licence to
  redistribute — NESA itself cannot show the video in its own familiarisation
  paper.
- Papers copy the description they were written from, so editing an asset later
  cannot change what an already-sat paper was marked against, and removing one
  leaves existing papers markable.

---

## Using it

1. **Sign in** — or create the administrator account on first run.
2. **Build trial** (`/build`) — the Year 12 syllabus in exact NESA wording.
   Tick individual dot points, whole subtopics or whole focus areas; search the
   wording; the selection is remembered between visits. One button:
   **Generate 100-mark Trial**.
3. **Model settings** (`/settings`, administrators) — point the application at
   an endpoint and test it, without touching a file.
4. **Exam mode** — 10 minutes reading time (navigation, flagging and
   highlighting work; answering does not), then 2 h 55 m working time. Flag,
   highlight, font size and colour theme all work and persist. Everything
   autosaves; a refresh restores the paper exactly and does not return time.
5. **Results** (`/results/[attemptId]`) — an estimated mark out of 100, the
   objective/constructed split, per-question review with the correct answer and
   marking criteria, performance aggregated to exact syllabus dot points, and the
   list of selected content this paper did not assess.
6. **History** (`/history`) — every paper you have generated and every attempt.

---

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm test` | Unit tests (117). No API key, no network. |
| `pnpm test:e2e` | Playwright end-to-end suite, including the answer-key leakage check |
| `pnpm test:live` | Tests that call the configured endpoint. Skipped unless `AI_BASE_URL` and `AI_MODEL` are set. |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm db:reset` | Delete the local database (follow with `db:migrate` and `db:seed`) |
| `pnpm setup:assets` | Re-copy Pyodide, Monaco and sql.js into `public/` |
| `pnpm ai:smoke` | Check the configured model endpoint |

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
    ai/                endpoint config, structured-output client, generation pipeline, prompts
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

- **The live path is untested against a real endpoint.** The pipeline, its
  validators and the prompt-injection defence are covered by unit tests, and the
  acceptance checks are written in `tests/live/` — but they have never been run
  against a configured endpoint. Start with `pnpm ai:smoke`.
- **The blueprint call is the one most likely to fail on a free tier.** It emits
  ~34 question groups in a single response, and free tiers commonly cap output
  near 8k tokens. Marking is unaffected — it returns a small flat object.
- **The stored API key is not encrypted.** It sits in `data/app.db`, which
  should be treated as holding a credential. Encrypting it with a key kept
  beside it would look like protection without being any.

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
