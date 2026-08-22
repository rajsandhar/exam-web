# MASTER BUILD PROMPT — NSW HSC SOFTWARE ENGINEERING AI TRIAL EXAM PLATFORM

You are the lead engineer and product designer for this project. Build the product described below end-to-end. Do not turn it into a generic quiz app. Do not stop after scaffolding. Work incrementally, validate as you go, and keep the application runnable throughout.

If this repository already contains code, inspect it first and preserve useful existing work. If it is empty, initialise the project yourself.

Before coding, read every file in `reference/` that is practical to inspect, starting with:

1. `reference/SOURCE_MAP.md`
2. `reference/syllabus/SYLLABUS_SOURCE.md`
3. the UI screenshots in `reference/ui/`
4. `reference/past-papers/Binder_V2_0.pdf`
5. the Year 12 notes in `reference/notes/`

The reference files are source material. Do not modify or delete them.

After inspecting the repository and sources, write a concise implementation plan to `docs/IMPLEMENTATION_PLAN.md`, then begin implementation immediately. Do not wait for approval unless you are blocked by a secret, account credential, or permission that cannot be supplied programmatically.

---

# 1. PRODUCT DEFINITION

Build a local-first, hostable web application for NSW Year 12 Software Engineering students that generates and runs **100-mark trial examinations** in a computer-based format closely modelled on the NESA Software Engineering online examination experience.

The platform must:

- display the **exact official Year 12 NESA syllabus hierarchy and wording**
- allow every selectable Year 12 syllabus dot point / leaf item to be individually selected or deselected
- generate a new **100-mark trial paper** from only the selected syllabus content
- use the supplied Year 12 notes as the primary factual knowledge source
- use the supplied Binder as the main assessment-style and marking-style source
- create questions at **trial/HSC-marker difficulty by default**; there is no easy/medium/hard control
- prefer applied, stimulus-driven, multi-stage and integrative questions over simple recall questions
- render questions using interactive formats similar to those seen in the NESA familiarisation environment
- support executable Python questions
- automatically mark the entire paper
- mark written responses as an HSC marker would, using generated marking guidelines grounded in the supplied notes and NESA-style expectations
- show a detailed results/review screen and map performance back to exact syllabus items

The platform is not a chatbot. The core experience is:

**Select syllabus content → Generate 100-mark trial → Sit exam → Automatic marking → Review results**

---

# 2. NON-NEGOTIABLE PRODUCT RULES

## 2.1 Year 12 only

The selectable syllabus must contain only the Year 12 focus areas:

- Secure Software Architecture
- Programming for the Web
- Software Automation
- Software Engineering Project

Year 11 may be assumed background where unavoidable, particularly Python/programming fundamentals, but the generated marks must assess only selected Year 12 content.

## 2.2 Exact syllabus wording

Do not paraphrase syllabus items in the selector.

Before shipping the selector, verify the exact Year 12 wording and hierarchy against the official NESA syllabus source described in `reference/syllabus/SYLLABUS_SOURCE.md`.

Preserve:

- focus-area names
- subtopic names
- dot-point wording
- nested bullet hierarchy
- original terminology and abbreviations

Parent checkboxes must support select-all / deselect-all of descendants and an indeterminate state.

## 2.3 Always 100 marks

Every generated trial is exactly **100 marks**.

The official HSC source is 80 marks; this application deliberately creates a 100-mark trial while preserving the same assessment character. Target approximately:

- **25 marks objective / interactive response**
- **75 marks short-answer / constructed response**

This is a target rather than a rigid per-question formula. The exam planner may vary a few marks where needed, but total marks must equal 100 exactly.

## 2.4 Always trial/HSC level

Do not expose a difficulty selector.

Generated questions should resemble strong school trial / HSC examination questions that discriminate between levels of understanding. Direct definition/recall questions are allowed only where they genuinely fit a 1-mark or low-value objective item.

For medium/high-mark items, prefer:

- application to unfamiliar scenarios
- interpretation of code, data, tables or diagrams
- integration of multiple selected syllabus points
- debugging/correction
- transformation from one representation to another
- justification/evaluation
- construction of algorithms, diagrams, SQL or code
- multi-part questions using shared stimulus

## 2.5 Do not copy past-paper questions

The Binder is a style and assessment-pattern source, not a question bank to reproduce.

A generated question must be genuinely new. It may reuse an assessment archetype, cognitive demand, command verb, mark value or interaction pattern, but not the distinctive wording, scenario, data or answer structure of a source question.

## 2.6 Selected content is a hard boundary

Every question must map to one or more selected syllabus items.

A generated answer must not require knowledge from a deselected Year 12 syllabus item to earn marks.

Cross-topic integration is encouraged only when all required items are selected.

---

# 3. SOURCE AUTHORITY AND GROUNDING

Use this hierarchy:

1. Official NESA Year 12 syllabus / course specifications
2. Official NESA-style examination and marking material in the Binder
3. Supplied Year 12 notes
4. General model knowledge

Interpret sources as follows:

## Syllabus
Defines **what is allowed to be assessed**.

## Notes
Define **the expected course knowledge, terminology, examples and depth**.

## Binder / past papers
Define **how knowledge is turned into assessment tasks**, including question wording, mark allocation, interactive forms, use of stimulus, command verbs and marking-guideline style.

## General model knowledge
May be used to create realistic fictional contexts, names, sample datasets and distractors, but must not introduce examinable facts outside the selected syllabus / supplied notes.

Keep provenance metadata for every generated question:

- syllabus item IDs
- note chunk IDs used
- past-paper archetype IDs used
- generated marking-guideline source references

Do not show raw internal prompts to the student.

---

# 4. PRIMARY USER FLOW

The application should have three main areas:

1. **Build Trial**
2. **Exam Mode**
3. **Results / Review**

Keep the surrounding platform modern, clean and simple. The actual exam-taking environment should deliberately resemble the NESA online exam interaction model shown in the screenshots.

---

# 5. BUILD TRIAL SCREEN

This screen should be simple enough that a student can create a paper in seconds.

## Required UI

Show the full Year 12 syllabus in expandable sections.

Example interaction only — use official wording, not this placeholder wording:

```text
Secure Software Architecture                 [Select all]
  ▼ Designing software
      ☑ exact syllabus item...
      ☑ exact syllabus item...
  ▼ Developing secure code
      ☑ exact syllabus item...

Programming for the Web                      [Select all]
  ...

Software Automation                          [Select all]
  ...

Software Engineering Project                 [Select all]
  ...
```

Requirements:

- all content initially selectable
- topic-level select all / clear
- global select all / clear all
- parent/child checkbox behaviour
- indeterminate checkbox state
- search syllabus text
- show selected leaf count
- preserve exact wording in the visible UI
- selected state persists locally between visits

The main CTA should simply be:

**Generate 100-mark Trial**

Do not clutter this screen with difficulty, style or question-count controls. The platform itself decides the most HSC-authentic question mix.

If no items are selected, generation is disabled.

If only a very narrow amount of content is selected, allow generation but show a brief warning that a 100-mark paper from very few dot points may necessarily revisit concepts from different angles.

---

# 6. EXAM BLUEPRINT ENGINE

Do not ask the LLM to jump directly from syllabus selection to a full paper.

Generation must occur in stages.

## Stage A — coverage plan

Given selected syllabus items, determine a defensible mark allocation across them.

Rules:

- every selected leaf item should be assessed at least once where reasonably possible
- no deselected item should be deliberately assessed
- marks should not be distributed perfectly evenly if some concepts naturally suit greater depth
- higher-order/integrated questions may cover multiple selected items
- avoid repeatedly testing the same knowledge statement in slightly different wording

## Stage B — paper blueprint

Construct a 100-mark blueprint before writing any question.

The blueprint should specify for every question group:

- question number
- total marks
- parts and marks per part
- selected syllabus item IDs
- assessment purpose
- cognitive demand
- command verb where relevant
- response / renderer type
- planned stimulus type
- whether it integrates multiple syllabus items
- intended marking structure

Aim for an HSC-like mix scaled to 100 marks:

- approximately 25 marks objective / interactive
- approximately 75 marks short-answer / constructed response
- multiple questions may share stimulus
- several questions should be worth 4–8 marks
- total number of question groups should feel like a realistic trial, not 100 one-mark questions

Do not enforce a single identical structure every time. Different generated trials should vary naturally.

## Stage C — question generation

Generate each question group separately from the approved blueprint.

## Stage D — deterministic validation

Validate:

- marks sum to 100
- every question maps to selected syllabus items
- all renderer payloads satisfy schemas
- objective questions have clear correct answers
- marking-criteria marks sum correctly
- generated SQL/code/algorithms are syntactically or logically valid where intended
- no duplicate or near-duplicate generated items
- no source question is copied verbatim or too closely

## Stage E — AI critic / moderation pass

A separate critic prompt must inspect each question and the whole paper for:

- syllabus alignment
- trial/HSC difficulty
- appropriateness of command verb to marks
- adequacy and clarity of stimulus
- whether the question can actually be answered from supplied course knowledge
- whether the expected answer matches the question
- whether marks are defensible
- whether distractors are plausible without being ambiguous
- whether the question is too direct/simple when a more applied form would be appropriate
- whether the question accidentally requires unselected content
- whether a diagram/table/code stimulus is internally consistent
- whether the question resembles but does not copy the Binder

Regenerate only invalid questions rather than discarding a good entire paper.

---

# 7. QUESTION-DESIGN PHILOSOPHY

A major quality requirement is that the program should not just ask text questions.

For every planned question, consider whether the knowledge can be assessed more authentically through a stimulus or interaction before falling back to a plain text prompt.

For medium/high-value questions, ask:

> How would a strong HSC/trial setter make the student DO something with this knowledge rather than merely repeat it?

Prefer patterns such as:

### Interpret → Apply
Provide data/code/diagram → identify/interpret → apply to a new condition.

### Inspect → Correct
Provide flawed code/algorithm/design → locate problem → modify/correct → explain.

### Representation → Transformation
Provide structure chart/decision tree/table → convert or implement as pseudocode/Python/SQL.

### Scenario → Analyse/Judge
Provide realistic software scenario → analyse consequences → justify/evaluate an approach.

### Data → Construct
Provide relational tables/results → construct SQL/query/schema/test data.

### Code → Predict/Debug/Optimise
Provide code → trace it, correct it, improve it or explain its behaviour.

### Shared stimulus multipart
One stimulus can support objective and written parts, as seen in real computer-based exams.

Keep direct recall relatively limited. As a broad quality target, most marks should require application, interpretation, construction, explanation, analysis or evaluation rather than isolated definition recall.

---

# 8. QUESTION RENDERER SYSTEM

Do not have the AI generate arbitrary HTML.

The AI generates a validated **question specification JSON**. The frontend renders it through a stable component library.

Create a discriminated union for question/part types with Zod validation.

Support at least these renderers:

1. `single_choice`
   - radio buttons
   - exactly one correct response

2. `multi_select`
   - checkbox list
   - multiple correct responses

3. `ordering`
   - drag/reorder items
   - accessible keyboard fallback

4. `matching_matrix`
   - row/column matrix similar to protocol matching questions

5. `dropdown_completion`
   - one or more dropdowns embedded in structured text/code/query layout

6. `table_response`
   - generated table with editable cells
   - useful for test data, expected output, SQL result sets, trace tables

7. `short_text`
   - single-line or compact answer where appropriate

8. `rich_text_response`
   - HSC-style response editor
   - formatting toolbar
   - visible word-count guide, not a hard cap unless explicitly set

9. `code_stimulus`
   - read-only code with line numbers and syntax highlighting
   - paired with another response renderer

10. `pseudocode_editor`
    - monospace editor for algorithm/pseudocode answers

11. `python_editor`
    - editable Python code
    - Run button
    - stdout/stderr panel
    - starter code support

12. `sql_editor`
    - SQL editor with generated relational table stimulus
    - optional preview/result execution against an in-memory database when appropriate

13. `diagram_viewer`
    - deterministic SVG/canvas renderer for structure charts, decision trees, class diagrams, flowcharts or related system diagrams

14. `diagram_builder`
    - interactive construction area for class diagrams / structure charts / decision trees / flowchart-style responses
    - save structured scene data, not just pixels
    - allow full-screen/reset/undo/redo

15. `multipart_group`
    - shared stimulus with heterogeneous parts, e.g. MC + short answer + Python editor

The renderer architecture must be extensible so additional NESA-style interactions can be added later.

---

# 9. STIMULUS GENERATION

Generate stimulus as structured, deterministic data wherever possible.

## Do not use AI image generation for text-heavy diagrams or tables

For SQL tables, database schemas, structure charts, decision trees, class diagrams, flowcharts and trace tables, have the model generate structured JSON and render it programmatically as HTML/SVG/canvas.

This prevents spelling errors and keeps the stimulus crisp and markable.

Examples:

### Relational table specification

```json
{
  "columns": ["CustomerID", "CustomerName", "State"],
  "rows": [
    ["C001", "Alex Chen", "NSW"],
    ["C002", "Priya Singh", "VIC"]
  ]
}
```

### Decision tree specification

```json
{
  "type": "decision_tree",
  "nodes": [...],
  "edges": [...]
}
```

### Structure chart specification

Represent modules, hierarchy, data couples, control couples, iteration/selection annotations and labels as structured graph data.

Render these in a restrained examination style similar to the supplied examples.

The model must generate both stimulus data and the internally consistent answer/marking logic. Validate them together before publishing the question.

---

# 10. EXAM MODE UX — MATCH NESA INTERACTION MODEL

The supplied UI screenshots are the primary reference.

Do not redesign exam mode into a flashy dashboard, card grid, gamified quiz or chat UI.

It should feel like sitting a serious computer-based examination.

## 10.1 General appearance

Use:

- dark navy top header
- restrained white/grey content area
- strong navy accents
- clear sans-serif typography
- very limited decorative styling
- high readability and information density

Do not use NESA logos or protected branding.

## 10.2 Instructions/start screen

Before an attempt, show a screen similar in structure to the supplied screenshot:

- exam title
- general instructions
- reading time information
- working time information
- permitted equipment / exam notes where relevant
- exam summary panel
- total marks: 100
- number of question groups
- objective-response marks
- short-answer/constructed-response marks
- Start button

## 10.3 Reading time

Default to 10 minutes reading time.

During reading time:

- student can navigate freely
- flagging/highlighting can work
- answer controls are disabled
- exiting should require a confirmation

Provide a clear transition into working time.

Keep reading/working durations in configuration constants so they can be changed later without code rewrites.

For the 100-mark trial, use a sensible default working time of 3 hours unless a better timing rule is evident from the project references; keep it configurable.

## 10.4 Question navigation

Match the screenshots closely:

- horizontal numbered question navigator near the top
- previous/next pagination when there are too many numbers to fit
- current question strongly highlighted
- answered / unanswered / flagged states visually distinguishable
- Previous question and Next question buttons at bottom
- final question offers Exit/Submit exam

## 10.5 Exam tools

Implement:

- Flag
- text Highlight tool
- Font size control
- Colour/accessibility theme control
- Info/help control

Persist these choices during the attempt.

## 10.6 Adaptive question layout

Choose layout based on the question.

Examples:

- simple MC → wide single panel
- code/table stimulus + answer → split screen
- SQL tables left + query/dropdowns right → split screen
- structure chart left + pseudocode answer right → split screen
- diagram construction → instructions/stimulus left + large canvas right
- extended-response/media stimulus → stimulus left + rich text editor right

Do not force every question into the same card width.

## 10.7 Autosave and resilience

Autosave all responses and UI state locally/database-backed.

A browser refresh must not destroy an attempt.

Store authoritative attempt timestamps so refreshing does not reset reading/working time.

Before final submission, show:

- answered count
- unanswered count
- flagged count
- confirmation warning

---

# 11. PYTHON EXECUTION ENGINE

Python execution is a first-class feature.

Use **Pyodide in a Web Worker** for the initial implementation so arbitrary student code runs client-side rather than on the application server.

Requirements:

- Monaco or equivalent code editor
- syntax highlighting
- line numbers
- Run button
- Reset starter code
- captured stdout
- captured stderr / traceback
- execution timeout / worker termination for infinite loops
- isolated execution per question or resettable session
- no backend `exec()` of arbitrary user code
- no network access from student code
- no unrestricted host filesystem access

For programming questions:

- the student may run code and inspect stdout during the exam
- hidden assessment tests remain invisible
- hidden tests run at marking/submission
- generated reference solutions must pass all hidden tests before the question is accepted

Marking can combine:

- deterministic hidden-test score
- rubric-based quality marks where the question rewards algorithm choice, structure, readability or explanation

Do not award all marks solely because a few visible examples happen to work.

---

# 12. SQL EXECUTION / DATABASE QUESTIONS

For SQL questions, generate an actual temporary database dataset from structured table definitions.

Support questions that ask students to:

- predict query output
- fill a result table
- complete a query with dropdowns
- write/modify SQL
- create/manipulate tables where syllabus-appropriate
- reason about relationships / keys / joins

Use an in-browser SQL engine such as `sql.js` or another safe SQLite/WASM option when execution benefits the question.

The generated dataset, expected query output and answer key must be validated programmatically before the question is accepted.

Visually render source tables as proper examination stimulus tables similar to those in the Binder, not plain markdown text.

---

# 13. DIAGRAMS AND CONSTRUCTION QUESTIONS

Support both diagram interpretation and diagram construction.

## Interpretation

Render generated diagrams deterministically from structured data:

- structure charts
- decision trees
- class diagrams
- flowcharts where syllabus-relevant
- database/schema representations

## Construction

For questions such as class-diagram or structure-chart construction, provide a large canvas similar to the NESA screenshot.

Prefer a mature library such as tldraw / React Flow / Excalidraw if it suits the required interactions, but keep the resulting scene serialisable.

For structured diagram tasks, capture semantic node/edge data whenever possible.

At marking time, provide the marker with:

- question
- expected structural requirements
- serialized diagram scene / semantic graph
- optionally a generated snapshot image for visual moderation

AI marking should assess the construction against rubric criteria rather than visual neatness.

---

# 14. QUESTION SPECIFICATION SCHEMA

Define a robust typed schema rather than free-form model output.

A question group should conceptually contain:

```ts
interface QuestionGroup {
  id: string;
  position: number;
  totalMarks: number;
  syllabusItemIds: string[];
  sourceReferences: SourceReference[];
  cognitiveDemand: string;
  stimulus?: StimulusSpec;
  parts: QuestionPart[];
  generationMetadata: GenerationMetadata;
}
```

Each `QuestionPart` should include:

- label (`a`, `b`, etc where applicable)
- marks
- renderer type
- prompt
- response configuration
- answer key / expected response data hidden from student
- marking guideline hidden from student
- mapped syllabus items

Use Zod to validate all AI output.

No unvalidated model JSON should reach the UI or database.

---

# 15. AI GENERATION ARCHITECTURE

Use the Anthropic SDK server-side.

Do not hardcode an API key or expose it to the browser.

Use environment variables:

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL`

Use a currently supported stable general-purpose Claude model selected through configuration rather than scattering a model name throughout the code.

Create an AI service layer such as:

```text
src/lib/ai/
  client.ts
  schemas.ts
  planner.ts
  generate-question.ts
  validate-question.ts
  critic.ts
  marker.ts
  moderator.ts
  prompts/
```

All AI prompts should be versioned in source control.

Use low randomness for marking and validation. Question generation may use moderate variation but must remain constrained by schemas and the blueprint.

---

# 16. REFERENCE INGESTION / RETRIEVAL

The source corpus is supplied in `reference/` and should be ingested locally.

Build a repeatable script such as:

```text
pnpm ingest:references
```

It should process:

- PDF
- DOCX
- PPTX

into normalized text chunks with metadata.

Store:

- source file
- source type (`notes`, `past_paper`, `marking_guide`, `syllabus`, `ui_reference`)
- page/slide/section where available
- focus area
- mapped syllabus item IDs where possible
- chunk text

Because the corpus is small and domain-specific, begin with deterministic/hybrid retrieval rather than introducing unnecessary infrastructure.

A good initial approach is:

- SQLite FTS5 / BM25 lexical search
- explicit syllabus tagging
- metadata filtering by selected syllabus IDs

Design the retrieval interface so embeddings can be added later if needed, but do not make a vector database a prerequisite for the first working build.

Generation should retrieve only relevant chunks rather than dumping all notes into every prompt.

---

# 17. PAST-PAPER STYLE MODEL

During ingestion, derive a reusable **question archetype library** from the Binder.

The archetype representation can include:

- renderer type
- stimulus type
- typical marks
- common command verbs
- cognitive demand
- whether multipart
- common transformation pattern, e.g. diagram → pseudocode
- typical marking structure
- topic suitability

Examples of archetypes to support from the supplied sources:

- ordering process stages
- SQL dropdown reconstruction from source/result tables
- matching concepts against protocols/features
- structure chart + true/false/multi-select interpretation
- algorithm + test-data table
- applied security scenario + written discussion
- decision tree + classify + simplify/redraw
- faulty algorithm + correction
- UI design + Python validation function
- code stimulus + performance/optimisation explanation
- vulnerability stimulus + identify + mitigation explanation
- code trace + dropdown output
- class diagram construction
- extended response to stimulus

Do not store source wording as templates for direct substitution. Store the **assessment grammar**, not the copied question.

---

# 18. AUTOMATIC MARKING

The student experience should be “fully automatically marked”, but internally use the most reliable mechanism for each response type.

## Deterministic marking

Use application logic for:

- single choice
- multi-select
- ordering
- matching
- dropdowns
- exact structured table cells where appropriate
- deterministic SQL output
- hidden Python tests

Do not waste an LLM call on something a deterministic checker can mark reliably.

## AI rubric marking

Use Claude for:

- short responses
- extended responses
- open-ended pseudocode where multiple valid approaches exist
- diagram constructions
- programming quality/explanation marks
- complex table justifications

The marker receives:

- exact question and stimulus
- maximum marks
- hidden marking guideline generated before the exam
- expected concepts / model answer
- relevant syllabus wording
- relevant note chunks
- student response
- deterministic evidence (e.g. Python tests passed) where applicable

The marker must return structured JSON including:

- awarded marks as integer or allowed half-mark only if the exam policy explicitly supports it; default to integer marks
- maximum marks
- criterion-level judgement
- brief evidence from the student's response
- missing elements
- concise explanation of why the mark was awarded
- confidence score/category
- an improved/full-mark response for review after submission

## Marking philosophy

Mark as an HSC marker would:

- reward demonstrated knowledge, understanding and application
- do not require exact wording if the response is technically correct
- do not award marks merely for mentioning buzzwords
- apply command verbs appropriately
- require causal reasoning for `explain`
- require judgement supported by evidence for `assess/evaluate`
- credit valid alternative solutions
- do not penalise minor grammar/spelling unless meaning is unclear
- never invent evidence that the student did not provide

Use the Binder marking guidelines as the stylistic model.

## Moderation pass

For written responses worth 4+ marks, or whenever marker confidence is low / the response is near a boundary, run a second moderation pass.

The moderator should not simply repeat the first mark. It receives the rubric, answer and proposed mark and determines whether that mark is defensible. Resolve disagreement conservatively and record moderation metadata.

Never present the AI mark as an official NESA mark. In the UI, wording such as `Estimated HSC-style mark` is acceptable while still giving a single usable score out of 100.

---

# 19. RESULTS AND REVIEW

After submission and marking, show:

## Summary

- score out of 100
- percentage
- marks by question
- objective marks
- constructed-response marks
- time used

## Question review

For each question/part show:

- original stimulus and question
- student's response
- awarded mark / maximum mark
- marking criteria
- what was done well
- missing/weak elements
- concise marker reasoning
- improved/full-mark example response where relevant
- mapped exact syllabus dot points

For objective items, show correct answer and explanation after submission.

For Python:

- hidden test summary after submission
- failed-case explanation where safe/useful
- AI quality feedback if rubric marks exist

## Syllabus performance

Aggregate marks back to exact selected syllabus items.

Show:

- marks earned / available per syllabus item
- percentage where enough evidence exists
- number of questions contributing
- avoid declaring mastery from a single tiny item

Allow a student to click a weak syllabus item and return to Build Trial with that item selected, but the main product still generates a 100-mark trial.

---

# 20. DATA MODEL

Use a clean persistence model. An initial implementation may be single-user/local-first, but keep IDs and ownership boundaries clean enough to add accounts later.

Suggested entities:

### syllabus_items
- id
- parent_id
- focus_area
- title/exact_text
- sort_order
- selectable
- source_url

### reference_sources
- id
- type
- file_path
- title

### reference_chunks
- id
- source_id
- chunk_index
- page_or_slide
- content
- metadata_json

### chunk_syllabus_items
- chunk_id
- syllabus_item_id

### exams
- id
- created_at
- total_marks (always 100)
- blueprint_json
- generation_metadata_json

### exam_syllabus_items
- exam_id
- syllabus_item_id

### question_groups
- id
- exam_id
- position
- total_marks
- stimulus_json
- metadata_json

### question_parts
- id
- question_group_id
- label
- renderer_type
- marks
- prompt
- config_json
- answer_key_json
- marking_guideline_json

### question_part_syllabus_items
- question_part_id
- syllabus_item_id

### attempts
- id
- exam_id
- status
- reading_started_at
- working_started_at
- submitted_at
- working_expires_at
- final_score
- marking_status

### responses
- id
- attempt_id
- question_part_id
- response_json
- flagged
- updated_at
- awarded_marks
- marking_json

### highlights
- attempt_id
- question_group_id
- selection data
- colour

Keep generated answer keys and marking guidelines strictly hidden from the exam-taking client until after submission.

---

# 21. TECH STACK

Use a pragmatic local-first stack that can later be hosted without rewriting the product.

Recommended:

- Next.js (current stable) + App Router
- TypeScript strict mode
- React
- Tailwind CSS
- shadcn/ui only where it helps outside exam mode; do not let it make exam mode look generic
- Zod
- Drizzle ORM
- SQLite for local-first persistence
- FTS5 for reference retrieval
- Anthropic SDK
- Monaco Editor for Python/SQL/pseudocode
- Pyodide in Web Worker for Python
- sql.js or equivalent SQLite/WASM for safe in-browser SQL execution
- a mature serializable canvas/graph library for diagram construction

Do not introduce microservices, Kubernetes, Redis, queues or vector databases unless a concrete need emerges.

Provide a Dockerfile / simple production deployment path once the core application works. Local development should be straightforward.

---

# 22. LOCAL-FIRST / HOSTABLE REQUIREMENT

The app must run locally with a small number of commands.

Aim for something like:

```bash
pnpm install
pnpm ingest:references
pnpm db:migrate
pnpm dev
```

Document exact steps in `README.md`.

Use `.env.example` with no secrets committed.

At minimum:

```env
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
DATABASE_URL=
```

If SQLite is used locally, provide a sensible default local database path so the user only needs the Anthropic key to get started.

For hosting, document a realistic container/Node deployment route and any required persistent database/storage changes. Do not block the local product on cloud setup.

---

# 23. EXAM SECURITY / INTEGRITY

This is a study platform, not a high-stakes official exam, but still implement sane boundaries:

- never expose Anthropic key client-side
- never backend-execute arbitrary Python directly
- sanitise rendered rich text
- validate all server inputs
- validate all AI outputs
- ensure hidden answer keys/marking guidelines are not included in exam-page payloads before submission
- protect against prompt injection from student answers by clearly separating student content from system/rubric instructions in marker prompts
- treat uploaded/reference text as untrusted data during ingestion

---

# 24. ACCESSIBILITY / EXAM TOOLS

The NESA-style exam tools are part of the product, not decorative buttons.

Implement:

- keyboard navigation
- appropriate labels / ARIA
- font-size changes
- alternate colour themes/high contrast options
- text highlighting
- flagging
- focus states
- diagram builder keyboard support where feasible

The exam must remain usable at common laptop resolutions similar to the supplied screenshots.

---

# 25. QUALITY RULES FOR GENERATED QUESTIONS

Reject/regenerate any question that has one or more of these problems:

- tests content outside selected syllabus
- is materially easier than trial/HSC level without being an intentional low-mark objective item
- is a pure definition question when an applied version would clearly be more authentic
- has ambiguous correct objective answers
- uses implausible distractors
- contains data/table/diagram inconsistencies
- asks for more reasoning than the marks justify
- asks too little for the marks
- uses a command verb inconsistently with expected depth
- requires facts not supported by selected syllabus/notes
- copies or closely paraphrases a source question
- has a marking guideline that does not match the prompt
- has a model Python/SQL answer that fails its own tests/data
- includes a stimulus that is irrelevant to answering the question

---

# 26. TESTING REQUIREMENTS

Add automated tests for core logic, especially:

- exact mark total = 100
- selected/deselected syllabus enforcement
- blueprint validation
- renderer schema parsing
- deterministic objective marking
- ordering/matching/dropdown marking
- Python worker timeout and output capture
- hidden Python test runner
- SQL dataset/query validation
- timer persistence across reload
- autosave
- answer-key secrecy before submission
- results aggregation back to syllabus items

Use Playwright or equivalent for key end-to-end flows:

1. select syllabus items
2. generate trial (mock AI allowed in CI)
3. start exam
4. answer several renderer types
5. refresh and confirm persistence
6. submit
7. mark
8. view results

Create deterministic AI mocks/fixtures so tests do not require paid API calls.

---

# 27. DESIGN DETAILS OUTSIDE EXAM MODE

Outside the test-taking screen, use a polished modern interface, but keep it restrained.

Suggested pages:

- `/` or `/build` — syllabus selector and Generate button
- `/generating/[id]` — generation progress
- `/exam/[id]/instructions`
- `/exam/[id]/attempt/[attemptId]`
- `/results/[attemptId]`
- `/history` — previous generated trials/attempts

Generation progress can show meaningful stages:

- Planning 100-mark paper
- Mapping syllabus coverage
- Creating stimuli
- Generating questions
- Validating code/SQL
- Reviewing HSC difficulty
- Finalising marking guidelines

Do not fake progress percentages if no real progress data exists; stage-based progress is enough.

---

# 28. COPYRIGHT / BRANDING BOUNDARIES

Use the supplied Binder and screenshots for educational reference and assessment-pattern analysis.

Do not:

- use NESA logos
- present the product as official NESA software
- copy large blocks of source exam text into generated exams
- reproduce source questions verbatim

Use original generated scenarios and data.

A small footer/disclaimer can state that the platform is an independent practice tool and is not affiliated with NESA.

---

# 29. IMPLEMENTATION ORDER

Work in the following order, keeping the app runnable after each stage.

## Phase 1 — repository + source inspection

- inspect repository
- inspect references
- create `docs/IMPLEMENTATION_PLAN.md`
- create architecture and data model
- initialise project if needed

## Phase 2 — syllabus + ingestion foundation

- exact Year 12 syllabus seed
- reference ingestion pipeline
- normalized source/chunk database
- retrieval by syllabus item

## Phase 3 — Build Trial UI

- exact syllabus tree
- selection behaviour
- persisted selection
- Generate button

## Phase 4 — exam data model + renderer library

- typed question schemas
- core renderers
- multipart/shared stimulus
- NESA-style exam shell

## Phase 5 — Python / SQL / diagrams

- Pyodide worker
- SQL WASM runner
- deterministic diagram viewers
- serializable construction canvas

## Phase 6 — AI blueprint + question generation

- planning prompt
- retrieval
- per-question generation
- critic
- validators
- exam persistence

## Phase 7 — attempt engine

- instructions
- reading time
- working time
- navigation
- flag/highlight/accessibility controls
- autosave
- submit flow

## Phase 8 — marking

- deterministic markers
- AI rubric marker
- moderation
- code/diagram integration

## Phase 9 — results

- out-of-100 result
- question review
- syllabus analysis
- history

## Phase 10 — quality pass

- test the entire workflow
- compare exam UI to supplied screenshots
- remove generic SaaS-looking elements from exam mode
- improve responsive behaviour
- resolve TypeScript/lint/test issues
- update README

Do not prematurely spend time on user accounts, subscriptions, class management, leaderboards or social features.

---

# 30. DEFINITION OF DONE

A working build is complete when a user can:

1. launch the app locally
2. see the exact Year 12 Software Engineering syllabus hierarchy
3. select/deselect individual syllabus items
4. press **Generate 100-mark Trial**
5. receive a newly generated 100-mark paper grounded in the selected syllabus, supplied notes and Binder assessment style
6. encounter a varied mix of authentic interactive question formats rather than mostly text prompts
7. see generated tables/diagrams/code as proper stimuli
8. run Python safely inside programming questions
9. complete the paper in a NESA-like computer-based exam interface
10. flag/highlight/navigate/change font/colour and have answers autosave
11. submit the paper
12. have objective, code, SQL, written and diagram responses automatically marked using the appropriate method
13. receive a single estimated HSC-style score out of 100
14. review every question with defensible feedback and marking logic
15. see results mapped back to the exact selected syllabus items
16. reload the app later and retain exam history/results

The result should feel like an **AI-powered Software Engineering trial-exam engine**, not an LLM wrapper.

---

# 31. FIRST ACTION NOW

Do the following now:

1. inspect the repository tree
2. read `reference/SOURCE_MAP.md`
3. inspect the supplied UI screenshots
4. inspect the Binder's examination overview, familiarisation questions, sample examination, 2025 HSC examination and marking-guideline sections
5. inspect the Year 12 notes by focus area
6. verify or retrieve the exact official Year 12 syllabus wording
7. write `docs/IMPLEMENTATION_PLAN.md`
8. start Phase 1 and continue into implementation without waiting for another prompt

When making an implementation choice that is not explicitly specified, choose the simplest robust solution that preserves the non-negotiable product behaviour above. Prioritise **question quality, assessment authenticity, reliable marking and exam UX** over decorative features.
