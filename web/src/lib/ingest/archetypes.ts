import type { RendererType } from "@/lib/schemas/renderers";

/**
 * The question archetype library (CLAUDE.md §17).
 *
 * These describe *assessment grammar*: what the student is given, what they are
 * asked to do with it, how many marks that is usually worth and how it is
 * marked. They are derived from the patterns observed in the Binder and listed
 * in `reference/SOURCE_MAP.md`.
 *
 * CLAUDE.md §2.5 is absolute: no source question's wording, scenario, data or
 * answer structure is stored here, and nothing in this file is a template for
 * substitution. `signals` exist only to count how often a pattern occurs in the
 * corpus so the planner can weight towards patterns the examiners actually use;
 * they are matched against the corpus and then discarded.
 */

/**
 * An archetype may describe a whole multipart question group rather than one
 * renderer, which is why this is wider than `RendererType`.
 */
export type ArchetypeRenderer = RendererType | "multipart_group";

export type ArchetypeDefinition = {
  id: string;
  label: string;
  rendererType: ArchetypeRenderer;
  stimulusType:
    | "none"
    | "text"
    | "code"
    | "table"
    | "table_set"
    | "diagram"
    | "list";
  typicalMarks: number[];
  commandVerbs: string[];
  cognitiveDemand:
    | "recall"
    | "comprehension"
    | "application"
    | "analysis"
    | "synthesis"
    | "evaluation";
  multipart: boolean;
  transformationPattern: string | null;
  markingStructure: string;
  topicSuitability: string[];
  /** Lexical cues used to count occurrences in the corpus. Never stored. */
  signals: string[];
};

export const ARCHETYPES: ArchetypeDefinition[] = [
  {
    id: "objective-scenario-classify",
    label: "Scenario then classify against a taxonomy",
    rendererType: "single_choice",
    stimulusType: "none",
    typicalMarks: [1],
    commandVerbs: ["identify"],
    cognitiveDemand: "application",
    multipart: false,
    transformationPattern: "scenario → category",
    markingStructure: "single correct response",
    topicSuitability: ["ssa", "pwa", "auto", "proj"],
    signals: ["which implementation method", "which of the following best", "which term"],
  },
  {
    id: "objective-code-trace",
    label: "Read a code fragment and predict its effect",
    rendererType: "single_choice",
    stimulusType: "code",
    typicalMarks: [1, 2],
    commandVerbs: ["predict", "identify"],
    cognitiveDemand: "analysis",
    multipart: false,
    transformationPattern: "code → output",
    markingStructure: "single correct response",
    topicSuitability: ["ssa", "pwa", "auto"],
    signals: ["consider this code fragment", "after the code is run", "what is the output"],
  },
  {
    id: "objective-multi-select-judgement",
    label: "Select the responses supported by the stimulus",
    rendererType: "multi_select",
    stimulusType: "text",
    typicalMarks: [2],
    commandVerbs: ["identify"],
    cognitiveDemand: "analysis",
    multipart: false,
    transformationPattern: "stimulus → supported claims",
    markingStructure: "net scoring; over-selection scores zero",
    topicSuitability: ["ssa", "pwa", "auto", "proj"],
    signals: ["select two", "select all that apply", "tick the"],
  },
  {
    id: "ordering-process-stages",
    label: "Place the stages of a process in order",
    rendererType: "ordering",
    stimulusType: "none",
    typicalMarks: [1, 2],
    commandVerbs: ["construct"],
    cognitiveDemand: "comprehension",
    multipart: false,
    transformationPattern: "unordered stages → sequence",
    markingStructure: "proportion of items in the correct position",
    topicSuitability: ["proj", "pwa", "ssa"],
    signals: ["place the following in order", "drag the", "correct order"],
  },
  {
    id: "matching-concepts-to-features",
    label: "Match concepts against protocols, ports or features",
    rendererType: "matching_matrix",
    stimulusType: "none",
    typicalMarks: [2, 3],
    commandVerbs: ["identify"],
    cognitiveDemand: "comprehension",
    multipart: false,
    transformationPattern: "concept ↔ property",
    markingStructure: "proportion of rows matched exactly",
    topicSuitability: ["pwa", "ssa"],
    signals: ["match each", "matching", "select the correct row"],
  },
  {
    id: "sql-dropdown-reconstruction",
    label: "Complete a query from source and result tables",
    rendererType: "dropdown_completion",
    stimulusType: "table_set",
    typicalMarks: [2, 3],
    commandVerbs: ["construct"],
    cognitiveDemand: "application",
    multipart: false,
    transformationPattern: "result table → query",
    markingStructure: "proportion of blanks correct",
    topicSuitability: ["pwa"],
    signals: ["select the correct item from each dropdown", "complete the sql", "the query below"],
  },
  {
    id: "trace-table-completion",
    label: "Complete a trace or test-data table",
    rendererType: "table_response",
    stimulusType: "code",
    typicalMarks: [2, 3, 4],
    commandVerbs: ["predict", "construct"],
    cognitiveDemand: "analysis",
    multipart: false,
    transformationPattern: "algorithm → expected output",
    markingStructure: "proportion of editable cells correct",
    topicSuitability: ["auto", "proj", "pwa"],
    signals: ["expected output", "test data", "complete the table"],
  },
  {
    id: "diagram-interpretation-multi",
    label: "Interpret a structure chart or decision tree",
    rendererType: "diagram_viewer",
    stimulusType: "diagram",
    typicalMarks: [2, 3],
    commandVerbs: ["interpret", "identify"],
    cognitiveDemand: "analysis",
    multipart: true,
    transformationPattern: "diagram → statements about it",
    markingStructure: "one mark per correct judgement",
    topicSuitability: ["proj", "auto"],
    signals: ["structure chart", "decision tree", "the diagram shows"],
  },
  {
    id: "faulty-algorithm-correction",
    label: "Locate and correct a fault in an algorithm",
    rendererType: "pseudocode_editor",
    stimulusType: "code",
    typicalMarks: [3, 4],
    commandVerbs: ["identify", "construct"],
    cognitiveDemand: "synthesis",
    multipart: true,
    transformationPattern: "faulty algorithm → corrected algorithm + reason",
    markingStructure: "marks for locating the fault and for a correct repair",
    topicSuitability: ["proj", "auto", "ssa"],
    signals: ["does not work as intended", "correct the error", "the algorithm below"],
  },
  {
    id: "vulnerability-stimulus-multipart",
    label: "Security vulnerability stimulus with objective and written parts",
    rendererType: "multipart_group",
    stimulusType: "code",
    typicalMarks: [6, 7, 8],
    commandVerbs: ["identify", "explain", "evaluate"],
    cognitiveDemand: "evaluation",
    multipart: true,
    transformationPattern: "flawed code → identification → remediation → judgement",
    markingStructure: "bands; the top band requires a supported judgement",
    topicSuitability: ["ssa"],
    signals: ["vulnerability", "security flaw", "mitigate"],
  },
  {
    id: "code-optimisation-explanation",
    label: "Explain the cost of code and propose an optimisation",
    rendererType: "rich_text_response",
    stimulusType: "code",
    typicalMarks: [3, 4, 5],
    commandVerbs: ["explain", "recommend"],
    cognitiveDemand: "analysis",
    multipart: false,
    transformationPattern: "code → performance analysis → optimisation",
    markingStructure: "bands; the top band requires cause and remedy",
    topicSuitability: ["proj", "pwa", "auto"],
    signals: ["optimisation", "execution time", "more efficient"],
  },
  {
    id: "ui-design-plus-implementation",
    label: "Interface or data design followed by a code implementation",
    rendererType: "multipart_group",
    stimulusType: "text",
    typicalMarks: [5, 6, 7],
    commandVerbs: ["design", "construct"],
    cognitiveDemand: "synthesis",
    multipart: true,
    transformationPattern: "requirement → design → validation code",
    markingStructure: "marks split between design decisions and working code",
    topicSuitability: ["proj", "pwa", "ssa"],
    signals: ["design an interface", "validation function", "write a function"],
  },
  {
    id: "dataset-model-evaluation",
    label: "Evaluate a machine learning dataset or model choice",
    rendererType: "rich_text_response",
    stimulusType: "table",
    typicalMarks: [4, 5, 6],
    commandVerbs: ["analyse", "evaluate", "justify"],
    cognitiveDemand: "evaluation",
    multipart: true,
    transformationPattern: "dataset → model choice → evaluation method",
    markingStructure: "bands; the top band requires a supported judgement",
    topicSuitability: ["auto"],
    signals: ["training data", "machine learning model", "bias"],
  },
  {
    id: "scenario-extended-response",
    label: "Extended response to a realistic project scenario",
    rendererType: "rich_text_response",
    stimulusType: "text",
    typicalMarks: [5, 6, 7, 8],
    commandVerbs: ["assess", "evaluate", "discuss", "justify"],
    cognitiveDemand: "evaluation",
    multipart: false,
    transformationPattern: "scenario → analysis → supported judgement",
    markingStructure: "bands; the top band requires a sustained judgement",
    topicSuitability: ["proj", "ssa", "auto", "pwa"],
    signals: ["with reference to", "justify your", "evaluate the effectiveness"],
  },
  {
    id: "request-response-analysis",
    label: "Interpret a captured request/response exchange",
    rendererType: "multipart_group",
    stimulusType: "table",
    typicalMarks: [4, 5],
    commandVerbs: ["state", "explain"],
    cognitiveDemand: "analysis",
    multipart: true,
    transformationPattern: "network trace → explanation of the back-end process",
    markingStructure: "marks for reading the trace and for the explanation",
    topicSuitability: ["pwa"],
    signals: ["status code", "http", "request"],
  },
  {
    id: "class-diagram-construction",
    label: "Construct a class diagram or structure chart",
    rendererType: "diagram_builder",
    stimulusType: "table_set",
    typicalMarks: [3, 4],
    commandVerbs: ["construct"],
    cognitiveDemand: "synthesis",
    multipart: false,
    transformationPattern: "attribute lists → inheritance hierarchy",
    markingStructure: "marks for correct structure, not for neatness",
    topicSuitability: ["proj", "auto"],
    signals: ["class diagram", "inheritance", "construct a diagram"],
  },
];

/** Counts how often each archetype's cues appear, without storing the text. */
export function countArchetypeSignals(corpus: string): Map<string, number> {
  const haystack = corpus.toLowerCase();
  const counts = new Map<string, number>();
  for (const archetype of ARCHETYPES) {
    let total = 0;
    for (const signal of archetype.signals) {
      let index = haystack.indexOf(signal);
      while (index !== -1) {
        total += 1;
        index = haystack.indexOf(signal, index + signal.length);
      }
    }
    counts.set(archetype.id, total);
  }
  return counts;
}

/** Archetypes the app can currently display end to end. */
export function archetypesForRenderers(
  available: readonly RendererType[],
): ArchetypeDefinition[] {
  const set = new Set<string>(available);
  return ARCHETYPES.filter(
    (archetype) =>
      set.has(archetype.rendererType) || archetype.rendererType === "multipart_group",
  );
}
