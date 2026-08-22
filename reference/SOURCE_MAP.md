# Reference Source Map

Read this before implementing generation or marking.

## 1. Past-paper / assessment style authority

`reference/past-papers/Binder_V2_0.pdf`

Use this to understand:
- NESA Software Engineering familiarisation question formats
- sample examination structure
- 2025 HSC question style
- official marking-guideline style
- command verbs and expected response depth
- use of shared stimulus, diagrams, tables, code and data
- how questions combine objective and constructed-response parts

Do not copy or lightly paraphrase past questions. Extract assessment patterns and create genuinely new questions.

Observed interaction/archetype examples include:
- drag-to-order sequences
- inline/dropdown completion, including SQL
- matrix matching / multiple checkbox selection
- multi-select interpretation of structure charts
- test-data tables requiring expected output and reasons
- scenario-based short response
- decision-tree interpretation followed by redraw/simplification
- broken pseudocode/algorithm correction
- interface-design construction plus Python implementation
- HTML/source-code stimulus followed by optimisation explanation
- security-vulnerability stimulus with objective + written multipart response
- database/table stimuli
- array/code tracing with dropdown responses
- class-diagram construction on a drawing canvas
- extended response based on media/stimulus

The Binder states the official HSC is computer-based, 80 marks, and uses approximately a 20:60 objective-to-short-answer split. **This project deliberately generates 100-mark trial papers**, so preserve the HSC assessment character while scaling the mark mix to approximately 25:75.

## 2. Knowledge authority

`reference/notes/`

Use supplied Year 12 notes as the primary factual/content grounding for question generation, expected answers and marking. Relevant folders/files cover:
- Secure Software Architecture
- Programming for the Web
- Software Automation
- Software Engineering Project / testing / evaluation / project theory

Do not test obscure external facts simply because the model knows them. General model knowledge may be used to create realistic contexts or distractors only when it does not introduce ungrounded examinable content.

## 3. Syllabus authority

`reference/syllabus/SYLLABUS_SOURCE.md`

The official NESA Year 12 syllabus controls what can be assessed. Every generated question must map to one or more selected Year 12 syllabus leaf items. Deselected content must not be required for marks.

## 4. UI authority

`reference/ui/`

Screenshots are the primary visual/interaction reference for exam mode:
- `01_instructions_screen.png`
- `02_multiple_choice_screen.png`
- `03_dropdown_split_screen.png`
- `04_diagram_canvas_screen.png`
- `05_extended_response_screen.png`

Reproduce the interaction model and visual hierarchy closely without copying NESA logos or protected branding.

## Source precedence when something conflicts

1. Official NESA syllabus wording / official course specifications
2. Official marking guidelines and examination specifications in the Binder
3. Supplied teacher/student notes
4. General model knowledge

Never silently resolve a conflict by inventing content. Prefer the higher-authority source and keep source provenance in generated question metadata.
