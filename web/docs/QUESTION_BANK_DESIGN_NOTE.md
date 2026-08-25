# Phase 2 — a question bank

**Status: design note only. Nothing here is built, and nothing in the resumable
generation work forecloses it.**

Author questions in batches per subtopic ahead of time, store them, and assemble
a paper by selecting from the bank rather than generating one on demand.

The attraction is not cost, though the marginal cost of a paper falls to the
marking. It is that authoring has nobody waiting, so it is immune to
request-duration limits entirely — the constraint that the resumable state
machine works around rather than removes. Assembly becomes a database query.

## Three things that must be specified before anyone builds it

### 1. Composition targets

Assembling exactly 100 marks from a bank is constrained subset-sum. A bank that
is merely large does not help: without enough 1- and 2-mark items, no valid
subset exists at all.

The bank therefore needs targets per subtopic **and per mark value**, and the
solver needs a defined fallback. It must report what the bank lacks — "no
2-mark item for `pwa.2.14`" — and never ship an invalid paper. Falling back to
generating the missing item on demand is the obvious escape hatch, and it drags
the request-duration problem back in, so it must be a deliberate decision rather
than an accident.

### 2. Novelty and the seen-set

Novelty control (SPEC_ADDENDUM.md §3) moves from generation time to authoring
time, where it gets better rather than worse: scenario domains can be
diversified across the whole bank instead of within one paper.

Add per-student seen-set weighting so repeat sittings deprioritise questions
already sat. Note this is a different guarantee from today's — currently a
student cannot see a repeat because every paper is new; with a bank they can,
and the weighting is the only thing preventing it.

### 3. Question lifecycle

A flawed question currently costs one paper. In a bank it persists and
resurfaces. That needs `draft` / `approved` / `retired` states, and a way to
retire a question from the results screen — the moment a flaw is most visible is
when a student is looking at it.

## Batching risk

Authoring 8–10 questions per call raises within-batch sameness: the same
scenario, lightly reskinned. Pass the scenario-domain exclusion list into each
batch prompt and require distinct domains within the batch, the same way the
per-question path does today.

## Schema implication

Questions become first-class rows, and papers reference them through a join
table rather than owning them. The `QuestionPartForStudent` /
`QuestionPartForMarking` split (SPEC_ADDENDUM.md §7) must survive that refactor
intact — it is what keeps answer keys out of the exam-page payload, and a join
table is exactly the kind of change that quietly reintroduces them.

## Relationship to the current design

The resumable runner splits generation into `planPaper`, `generateGroup` and
`assemble`. A bank reuses `generateGroup` unchanged as its authoring call, and
replaces `planPaper` + `assemble` with selection and a solver. That is the
reason the split is worth having beyond the timeout it was written for.
