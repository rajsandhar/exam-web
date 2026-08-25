# F0 — generation timeout, and what a paper actually costs

## Read this first

**A single failed generation cost $73.38** — 788 requests and 3.28M input
tokens, for a paper that produced nothing. Until the branch below is merged
there is no ceiling on that, so **do not press Generate again yet**.

Also worth setting a hard cap on the provider side: the usage screen shows
$74.49 against a $10.00 August budget, so whatever that figure is, it is not
stopping anything.

## Deployment

| | |
|---|---|
| On `main`, deployed | `f810c73` (PR #8) — resumable generation, region pin, timeouts |
| Pushed, **not merged** | `fix/generation-call-budget` — the spend ceiling and call budget |

**Behavioural marker for `f810c73`:** `POST /api/exams/{id}/advance` returns
**401** rather than 404 — the route only exists in the new code. Verified live.

**Marker for the unmerged branch, once merged:** a paper that overruns fails
with the words *"which is the ceiling for one paper"*, and generation no longer
dies on the first `Request timed out`.

## F0.1 — mechanism

**Chosen: a resumable state machine.** Each `POST /api/exams/{id}/advance` does
one bounded piece — the blueprint, a batch of questions the width of the
existing concurrency, or validation and publication — persists it, and says
whether there is more. The progress screen drives it on the tick it already
polled. `POST /api/exams` now returns as soon as the row exists.

**Rejected `waitUntil`:** bounded by the same `maxDuration`, so it does not help
a multi-minute job — it would have turned a visible failure into a silent one.

**Rejected a queue, for now:** more machinery than a paper someone is watching
needs. The boundary is unattended work; that is where it earns its keep.

**No migration.** State lives in `blueprint_json` (declared, never written) and
`progress_json`. Deliberate: a migration would have to reach the hosted database
before the deploy that needs it, and this workflow may not run one.

**Honest consequence:** work advances while the progress screen is open. Close
the tab and the paper stops and is swept up as stalled.

**Stalled runs:** every step stamps `lastProgressAt`; silence beyond four
minutes is treated as death by whoever asks next, and the row is failed with a
readable reason instead of spinning forever.

## F0.2 — the 75-seconds-per-call rate

**Root cause: no per-call timeout.** The client was built as
`new OpenAI({ baseURL, apiKey, maxRetries: 2 })` with no `timeout`, so the SDK
default of **ten minutes** applied on a **five-minute** function. A slow call
could not fail before the invocation did. With two retries plus the
structured-output repair path, one blueprint call becomes the four hanging POSTs
the log showed.

**Not concurrency.** `pLimit(7)` is correctly wired over the question stage,
which that run never reached — it died in stage one.

**Then the timeout revealed the real rate.** With 60s enforced, a live run
failed with `Request timed out — this operation was aborted`, having saved its
blueprint. So calls genuinely exceed a minute on this model. The budget is now
120s with one retry: 240s worst case, inside the 300s function.

**And the count is the real problem.** 788 requests for ~31 questions is roughly
ten times what it should be. Multiplying together:

- `MAX_QUESTION_ATTEMPTS = 3` per question
- the structured-output ladder: `json_schema` → `json_object` → a repair call
- a critic pass on every ≥4-mark question and 25% of objective ones
- the SDK's own retries on top of all of it

None is unreasonable alone; the product had no limit. There is now a ceiling of
150 calls / 2M tokens per paper, counted per invocation and carried on the row.
**That is a blast-radius control, not a fix for the rate** — reducing the rate
means changing `effort` and `maxTokens`, which is a quality decision, below.

## F0.3 — prompt caching

Already stable-prefix-first: `system` is a per-stage constant (`QUESTION_SYSTEM`
and friends), so the cacheable prefix is identical across calls of a kind. No
restructuring was needed.

**Cache hit rate: not measured.** It needs a completed run against your account.
The usage screen has a Prompt caching tab that will show it.

## F0.4 — region

**`preferredRegion` cannot express this.** It is deprecated in this version of
Next, and on Vercel accepts only `auto`, `global` or `home` — a region code
throws. Committed `vercel.json` with `{"regions": ["syd1"]}` instead.

**Not yet confirmed in effect.** Check any function log for `X-Vercel-Id`: it
should read `syd1::syd1::…` rather than `syd1::iad1::…`. If `vercel.json` sits
outside the project's configured root directory it is ignored, which is the
thing to rule out first.

## Cost — the decision this forces

| | |
|---|---|
| Spend | **$73.38** in one day |
| Requests | **788** |
| Input tokens | **3,284,141** |
| Papers produced | **none** — the runs failed |

Per-call settings driving it:

| Call | Effort | Max tokens | Count |
|---|---|---|---|
| Blueprint | high | 24,000 | 1–2 |
| Question | high (≥4 marks) | 16,000 | 31 × up to 3 attempts |
| Critic | high | 8,000 | every ≥4-mark question + 25% objective |

On a reasoning model, `effort: high` bills hidden reasoning as output, and an
aborted call still bills for what it generated — which is how a run that
produced nothing cost $73.

**Three levers, in order of effect and in your gift, not mine:**

1. **Lower `effort`** from `high` to `medium` on questions and the critic. The
   dominant cost on a reasoning model, and a direct quality trade.
2. **Cut `maxTokens`** — 24k for a blueprint and 16k per question are generous.
3. **Reduce `MAX_QUESTION_ATTEMPTS` (3) and the critic sample rate.**

**This also strengthens the case for the question bank** (see
`QUESTION_BANK_DESIGN_NOTE.md`). If a paper costs anything like this to
generate, generating one per sitting is not viable, and authoring a bank once
and assembling from it changes the economics rather than trimming them.

## Tests

| Command | Before | After |
|---|---|---|
| `pnpm vitest run` | 293 | **307**, no failures |
| `pnpm typecheck` | clean | clean |
| `pnpm lint` | clean | clean |
| `pnpm build` | passes | `Compiled successfully in 16.5s` |
| `pnpm test:e2e` | 33–34 | 33–34 (see flake below) |

Zero `any` in `src/lib/`.

**New tests** — `tests/unit/resumable-generation.test.ts` (14): plans before
asking for questions; finishes in bounded steps; **returns immediately with a
slow provider**; never generates a question already stored; keeps its questions
when a step fails and comes back; gives up after repeated failures saying how
far it got; forgets failures after a success; does nothing to a finished paper;
three stall-detection cases; and three on the spend ceiling.

One of these found a real defect while being written: reporting "nothing more to
do" as the last question landed stopped the run with every question generated
and nothing published.

## Not fixed

- **The call rate itself.** Capped, not reduced. Needs the `effort`/`maxTokens`
  decision above.
- **`accessibility.spec.ts` is flaky under full-suite load** — a *different*
  test fails each run, all pass 8/8 in isolation. Pre-existing, unrelated,
  deserves its own pass.
- **Production rows**, untouched as instructed: `2f774bef…`, `20e7bcd2…` (stuck
  `generating`), `a38d40a4…` and `58adfe34…` (failed), the 12:20:56 paper, and
  QA attempt `549acd99…`.
- **Orphaned test images** in the `exam-assets` bucket from an early e2e run.
- **Cache hit rate and per-stage timings** — need one completed run.

## Re-test scope

**The generation path is rewritten.** `POST /api/exams` no longer produces the
paper; the advance route does, in steps. The sample-paper path still runs inline
and is covered end to end, which is the best evidence the split is faithful.

**Results aggregation** was changed in the earlier round and is load-bearing for
several checks that pass today. Untouched here, but worth a glance if anything
looks wrong on the results screen.

**The client is shared by marking.** The timeout and retry change affects marking
calls as well as generation — a marking call that used to hang for ten minutes
now fails at two.
