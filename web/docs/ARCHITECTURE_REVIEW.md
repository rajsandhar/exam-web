# Architecture review — why generating a paper is this hard

Asked directly: is this an architecture problem, or should a free API be able to
generate an exam paper?

**Both.** The immediate blocker is not architectural — the key is out of quota.
But the architecture is what exhausted it, and would exhaust it again tomorrow.

## Evidence, measured against the live endpoint

Three probes, run directly rather than inferred from error strings.

**1. The endpoint refuses the schemas the app sends.**

```
model=gemini-3.6-flash   blueprint schema = 2,893 bytes
json_schema:  REFUSED 400  "Request contains an invalid argument."
json_object:  ACCEPTED
```

Fixed: the fallback drops to plain JSON automatically now. Worth noting the app
was built assuming `response_format: json_schema` works, with a fallback that had
never been exercised against a real provider that refuses it.

**2. The quota is spent, not merely throttled.**

```
after a 20-second pause: 429 "You exceeded your current quota,
please check your plan and billing details"
```

A single 2,000-token call fails. This is a daily allowance, not a per-minute
burst limit — waiting does not help, and no amount of backoff will.

**3. The model is a reasoning model, and the token budgets do not account for it.**

```
max_completion_tokens = 200  →  8,827ms, 7 visible tokens, finish_reason=length
```

Seven tokens of visible output from a 200-token budget. The rest went on
reasoning, which `max_completion_tokens` counts and the caller never sees. This
matters more than it looks:

- The 16,000-token budget for a question may be mostly reasoning.
- `finish_reason: "length"` — which this codebase treats as a hard error — becomes
  likely rather than exceptional.
- It explains the blueprint call exceeding two minutes: it is thinking, at length,
  before writing a 31-group plan.

The application was written for completion models that answer. It is talking to a
model that deliberates first, and nothing in the configuration acknowledges that.

## The structural problem

A paper costs **≈55 model calls** in the healthy case and up to 186 if questions
are retried (`estimatePaperCost`, derived from the same constants generation
uses). That number is not incidental — it is mandated:

> **CLAUDE.md §6, Stage C:** Generate each question group separately from the
> approved blueprint.

One call per question group is a real quality decision: a focused prompt per
question, and a bad question regenerated without discarding the paper. It was
made without a throughput budget, and on a free tier a throughput budget is the
binding constraint.

Free Gemini allowances for flash models are in the low hundreds of requests per
day. At 55 calls a paper that is **two or three papers per day**, and a single
retry storm — of which this project has now had several — spends the day's
allowance on papers that were never finished.

So: the architecture is not wrong, it is *sized for a paid API*. Nothing about
generating an exam paper requires sixty calls.

## Three mismatches, in order of severity

**1. Call count against free-tier quota.** The dominant issue. Everything else is
downstream of it.

**2. Reasoning models against fixed token budgets.** Budgets that assume output
tokens are output tokens. Needs explicit reasoning-effort control per stage, and
budgets set with reasoning in mind — or a non-reasoning model for the structural
stages, where deliberation buys little.

**3. Serverless execution against a multi-minute job.** The resumable state
machine solves the five-minute function limit, but it advances only while the
progress screen is open, because this plan's cron runs daily. That is a real
limitation, honestly labelled in the UI now, and it is the least of the three.

## Options

| Change | Calls per paper | Cost |
|---|---|---|
| Today | ~55 (up to 186) | — |
| Batch questions 8 per call | **~10** | Contradicts CLAUDE.md §6 |
| …and critique in batches too | **~7** | Weaker per-question critique |
| Question bank (`QUESTION_BANK_DESIGN_NOTE.md`) | **~0 per paper** | A build, not a fix |
| Paid tier, no code change | ~55 | Money |

**Batching question generation is the single biggest lever.** Eight questions per
call turns 31 calls into 4. The risks are known and manageable: within-batch
sameness is mitigated the same way the current per-question path does it, by
passing the scenario-domain exclusion list into the prompt. The real cost is that
a failed batch loses eight questions rather than one, which the resumable runner
already handles — it keeps what succeeded and retries the rest.

It does contradict the specification, which is why it is a recommendation and not
a commit.

## What I would do, in order

1. **Unblock**: a paid tier, or wait for the quota to reset, and prove the
   pipeline end to end once. Everything above is inference until a paper
   completes. This is the only step that needs a decision today.
2. **Set reasoning effort explicitly** per stage and re-measure. `effort: "high"`
   on every question is likely both the cost and the latency driver, and nothing
   has ever measured what `medium` or `low` costs in quality here.
3. **Batch question generation** to ~10 calls per paper. This is what makes a
   free tier viable at all.
4. **Then the question bank**, which removes per-paper generation cost entirely
   and is the only option that makes repeat sittings cheap.

## What I got wrong along the way

Worth recording, because it shaped how long this took.

The resumable state machine was the right shape, but I shipped it with four
defects that each cost a live run to find: a retry loop with no backoff, a batch
that discarded work it had paid for, a failure path that erased its own
diagnostics, and a stall sweep that killed papers while they were working.

More to the point, I diagnosed from error strings for far too long. The three
probes at the top of this document took about a minute and answered more than the
previous several attempts combined. A `pnpm ai:smoke` that exercised what
generation actually sends — which it now does — would have found the schema
refusal on day one.
