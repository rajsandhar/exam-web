# Repair pass — highlight tool and unmarked responses

Both defects from the live QA pass are fixed, tested and merged to `main`.

## Deployment

| | |
|---|---|
| Merge commit on `main` | `a92a609` (merge of `fix/highlight-and-unmarked-responses`) |
| Commits | `016c419` (F1), `7411987` (F2) |
| Pushed | yes — `68f48c2..a92a609`, which triggers the Vercel build |
| SHA Vercel is serving | **not confirmed from here** |

I could not verify the running deployment from outside. Every change in this pass sits behind
authentication, so nothing on the signed-out surface changes — the login page's chunk hashes are
content-addressed and need not move at all. I polled them for several minutes and they did not,
which is consistent both with "not deployed yet" and with "deployed, and this page is byte-identical".
It is not evidence either way, so I am not claiming it as such.

### Behavioural marker — check this first

**Sign in, open any ready paper from `/history`, and look at the instructions screen before pressing
START.** Under *About this paper* there is now a bordered notice beginning:

> **Written responses will not be marked.**

That string does not exist in `68f48c2`. If it is there, the new code is live. It needs no paper to
be generated, sat or failed — which is the trap the last two markers fell into.

Two further markers, once you sit a paper:

- Results screen, on every written question: `Not marked — no model endpoint configured (7 marks)`
- Exam screen: press **HIGHLIGHT**, drag across question text, and a yellow mark appears.

## F1 — the highlight tool

**Root cause: hypothesis 1, in a specific form — the handler was wired, but to the wrong element.**

Not focus loss, not `surroundContents` throwing, not a swallowed catch, not React discarding a
mutation. `Highlightable` listened for `mouseup` on its own inline `<span>`, so the release had to
land on the text itself. Instrumenting a real drag showed the release landing on `P`, with
`inRegion: false`, 105 characters selected, and no console error. Dispatching `mouseup` directly at
the region produced a highlight immediately — proving capture, storage and rendering all worked and
only delivery was broken. Letting go a few pixels past the end of a line, which is how anyone selects
to the end of a sentence, silently did nothing.

The scripted probe in the brief could not have found this: it set a `Range` and clicked the button,
which is not the interaction. The button turns a mode on; the highlight is made by selecting while it
is on.

**What changed**

- `src/components/exam/use-highlight-selection.ts` (new) — captures on the **document**, so the
  release can land anywhere. A selection running past the region it started in is clamped to that
  region rather than discarded, so dragging into the next paragraph marks the part that was inside
  the first. Selections inside inputs, textareas and contenteditable are ignored.
- `src/components/exam/highlightable.tsx` — now renders highlights and nothing else.
- `src/components/exam/exam-shell.tsx` — uses the hook; persists the tool's on/off state.
- `src/app/api/attempts/[attemptId]/ui/route.ts` — accepts `highlightMode`.

**Persistence**: yes. A highlight survives a refresh, restored with flags, font size and theme. The
POST is fire-and-forget in the UI, so the test waits for it rather than racing the reload — the same
treatment `exam-flow` already gives the `/ui` PATCH.

**Reading time**: yes, verified — the test highlights during reading time, as the banner promises.

**Keyboard selection** now works too (shift+arrows). It never did.

**One behaviour change worth knowing**: the tool's on/off state now persists across a refresh. It had
to. Removing a highlight is a click on it *while the tool is on*, and the mode reset to off on every
reload, so the INFO panel's "Click a highlight to remove it" was untrue for anything highlighted
before the last refresh. `ExamUiState` already declared the field; nothing wrote it.

**To verify in a browser**

1. Start any paper. During reading time, press **HIGHLIGHT** (it takes on an active state).
2. Drag across a sentence in the question text, releasing past the end of the line. A yellow mark
   appears — this is the case that failed before.
3. Refresh. The mark is still there, and HIGHLIGHT is still on.
4. Click the mark. It disappears. Refresh again to confirm it stayed gone.
5. Press HIGHLIGHT to turn it off, then drag across text: nothing is marked.

## F2 — written responses scoring zero

**Root cause: provider selection, not presentation.** `resolveMarkingProvider()` returned the stored
setting before checking anything, and the deployment had `marking_provider = "model"` with no
endpoint configured. A `ModelRubricMarker` was built with no model behind it and returned zeros. The
comment at `provider.ts:66` claimed "The endpoint is checked before this is constructed" — it was not.

This matters for how it presented: the codebase *already* had a `not_marked` path, an "awaiting
marking" notice and a marked-only percentage. None of it was reachable, because marking never
reported anything as unmarked. It reported confident zeros instead.

**Marking-status states**

Stored on the mark record in `responses.marking_json`, not inferred from a zero:

- `method: "not_marked"` with `notMarkedReason: "no_model_endpoint"` — no endpoint configured.
- `method: "not_marked"` with `notMarkedReason: "no_checker"` — no deterministic checker applied.

**Migration required: no.** `marking_json` is a JSON column, so the reason is storable without a
schema change. That is deliberate beyond convenience: a migration would have to reach the hosted
database *before* this deployed, and running migrations against production is outside this task's
authorisation. Nothing needs to be applied to Supabase for this merge.

**Exact strings now on the results screen**

| Where | String |
|---|---|
| Each unmarked item | `Not marked — no model endpoint configured (7 marks)` |
| Headline stat label | `Mark (of what was marked)` |
| Headline value | `3 / 25` — never `/ 100` |
| Percentage label | `Percentage of marked items` |
| Short answer stat | `75 marks not marked` |
| Notice | `75 marks not marked.` then `No model endpoint is configured, so written responses could not be assessed and are not counted in the mark or the percentage above — they are not zeros. Objective items were marked automatically. The marking criteria and a full-mark response are shown for every question below.` |

`Estimated HSC-style mark` and the NESA disclaimer are unchanged. Marking criteria and the full-mark
exemplar still render for unmarked items — they are the value in this mode.

**Syllabus performance table**: unmarked marks are excluded from earned and available rather than
counted as zeros. A row that was only ever unmarkable shows `—` for marks and `not marked` for result;
a partly-marked row shows its marked figures with `(+4 not marked)` beside them. Nothing is reported
at 0% because it could not be marked.

**History `BEST MARK`**: reports the best attempt against the marks *that attempt* was marked out of —
`3/25` — with `(75 not marked)` beside it, instead of `3/100`.

**Instructions screen** now says, whenever no endpoint is configured (independent of the sample-paper
notice, because marking and generation are separate settings):

> **Written responses will not be marked.** No model endpoint is configured, so only objective
> questions can be marked automatically. Your written answers are saved and shown back to you with
> the marking criteria and a full-mark response, but they will not receive a mark.

## Test results

| Command | Before | After |
|---|---|---|
| `pnpm vitest run` | 277 passed / 19 files | **283 passed / 20 files**, no failures |
| `pnpm typecheck` | clean | clean |
| `pnpm lint` | clean | clean |
| `pnpm build` | passes | `Compiled successfully in 12.6s` |
| `pnpm test:e2e` | 32 passed | **34 passed** (3.0m) |

Zero `any` in `src/lib/`.

**New tests**

- `tests/e2e/highlight.spec.ts` — *marks selected question text, and keeps it across a reload*
  (covers creation by real mouse drag, persistence across refresh, and removal by clicking);
  *does nothing while the tool is off*.
- `tests/unit/unmarked-results.test.ts` — *reports written items as not marked rather than as zero*;
  *does not present unmarkable marks as a denominator*; *keeps unmarked marks out of the syllabus
  aggregate*; *does not report a misleading total in the history list*.
- `tests/unit/ai-settings.test.ts` — *refuses the model marker when nothing can reach a model*;
  *honours the stored preference once an endpoint exists*.

**Non-regression, verified explicitly**: answer-key leakage (asserted against the raw response body,
not the DOM), the autosave `saved -> Saving... -> saved` transition with a reload at the flip,
sanitiser neutralisation on input and render-back, and a generated paper totalling exactly 100 marks —
all still passing, in `answer-key-leakage.spec.ts`, `exam-flow.spec.ts`, `answer-tools.spec.ts`,
`sanitise.test.ts` and `fixture-paper.test.ts`.

## Not fixed

**§4.1 — failure-screen markers, still unverified.** Not done. Covering the failure state needs a
React renderer, and there is none: no `@testing-library`, no `jsdom`, no `happy-dom`. Adding one is a
new dev dependency and would reintroduce the DOM implementation deliberately removed in `d86ef01`.
An end-to-end alternative cannot work either — forcing an exam row to `failed` means writing to the
database, and the dev server owns the PGlite store; two processes opening it abort the runtime. Worth
doing behind a small test-only route or a fixture-driven story, which is more than "small".

**§4.2 — blueprint validator: not a defect.** The rule is enforced everywhere; nobody passes
`enforceItemCounts: false`. Measured against the fixture directly:

```
rules:   objective 18-23, constructed 20-23
fixture: objectiveItems 18, constructedItems 22, totalMarks 100, coverage 1
ok=true issues=[]
```

The sample paper complies. The reported "13 constructed-response items" counted question *groups* on
the results screen; a group holds several responsive parts. No rule was loosened.

**§4.3 — production test rows: left in place, as instructed.** Not deleted.

- exam `2f774bef-4c5d-454f-835d-0cfccbc2bf30`
- attempt `549acd99-fc90-4fc1-a934-fe986a548c4f`
- the paper generated at 12:20:56 on 24/08/2026

**Left deliberately**: `marking_provider` in the hosted `ai_settings` row is still `"model"` with no
endpoint. The code now ignores it correctly, so it is harmless — but it is a misleading row, and the
settings screen will keep showing "model" while nothing marks. Changing it is a production write.

**Surprised me**: the not-marked plumbing was already there — the record type, the notice, the
marked-only percentage. This read as a missing feature and was a single wrong branch upstream making
correct downstream code unreachable. Worth remembering before building something that already exists.

**Unsure about**: highlighting is verified on question prompts, not on stimulus text. It is the same
component and the same document listener, so I expect it to work, but I did not assert it.

## Re-test scope — where to look hardest

**Results aggregation is load-bearing and I changed it.** `build-results.ts` now splits marked from
unmarked in three accumulators: the objective/constructed buckets, the per-syllabus-item map, and the
marked-available total. If anything is off, it shows up as wrong totals on the results screen, wrong
percentages in the syllabus table, or a wrong `BEST MARK` in history. Check a paper where objective
marking succeeded — the objective figures should be untouched.

**Exam mode event handling.** A document-level `mouseup`/`keyup` listener is now attached whenever
highlight mode is on. It ignores inputs, textareas and contenteditable, but the rich-text editor, the
Monaco code editor and the SQL editor are the places to try selecting text with the tool on.

**Attempt UI state.** `highlightMode` is persisted alongside font size, theme and last question. If
that write regressed, the symptom would be font size or theme failing to survive a refresh.

**Instructions screen** now resolves the marking provider on render — one extra settings read before
the page renders. Harmless, but it is a new query on that path.

**History list** runs one extra aggregate query joining `responses` to `question_parts`. On a large
history this is the thing to watch for slowness, particularly with the function still in `iad1` and
the database in Sydney.
