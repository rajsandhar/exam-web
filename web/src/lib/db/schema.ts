import { relations, sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ---------------------------------------------------------------------------
 * People
 * ------------------------------------------------------------------------- */

/**
 * Accounts. There is no sign-up: the first account is created on first run and
 * is an administrator, and every later account is created by an administrator.
 * A study tool with open registration would be a different product.
 */
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    /** Lower-cased username, so logins are case-insensitive but display is not. */
    usernameLower: text("username_lower").notNull(),
    displayName: text("display_name"),
    /** scrypt, salted per user. Never leaves the server. */
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["admin", "student"] }).notNull().default("student"),
    disabled: boolean("disabled").notNull().default(false),
    /** Forces a change at next sign-in after an administrator reset. */
    mustChangePassword: boolean("must_change_password")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    lastSignedInAt: timestamp("last_signed_in_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [uniqueIndex("users_username_lower_idx").on(t.usernameLower)],
);

/**
 * Sessions hold a hash of the cookie token, never the token itself, so reading
 * the database does not hand someone a working session.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_idx").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
  ],
);

/* ---------------------------------------------------------------------------
 * Media assets
 * ------------------------------------------------------------------------- */

/**
 * Images and video an administrator uploads, for questions that need a stimulus
 * no model can produce.
 *
 * `description` is not a nicety. Neither the question writer nor the marker can
 * see the file — both work from this text — so it is the examinable content and
 * the question is only as good as it is. `altText` serves screen readers, and
 * for video `description` holds the transcript.
 *
 * The file itself lives in `data/assets/`, named by id. Nothing is written to
 * `public/`: an uploaded file should not be readable by anyone who can reach
 * the port.
 */
export const assets = pgTable(
  "assets",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: ["image", "video"] }).notNull(),
    mimeType: text("mime_type").notNull(),
    /** As uploaded; shown to administrators, never used to resolve the file. */
    originalFilename: text("original_filename").notNull(),
    byteSize: integer("byte_size").notNull(),
    title: text("title").notNull(),
    /** What the file shows. Used to write the question and to mark it. */
    description: text("description").notNull(),
    altText: text("alt_text").notNull(),
    /** Required by CLAUDE.md §28 — a school will upload things it should not. */
    licence: text("licence").notNull(),
    /** WebVTT captions for a video, stored beside it. */
    captionsExtension: text("captions_extension"),
    uploadedByUserId: text("uploaded_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [index("assets_kind_idx").on(t.kind)],
);

/** Which syllabus items an asset suits, so generation only offers relevant ones. */
export const assetSyllabusItems = pgTable(
  "asset_syllabus_items",
  {
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    syllabusItemId: text("syllabus_item_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.assetId, t.syllabusItemId] })],
);

/* ---------------------------------------------------------------------------
 * Model endpoint settings
 * ------------------------------------------------------------------------- */

/**
 * The model endpoint, editable by an administrator instead of by editing files.
 *
 * Exactly one row, id `default`. The columns describe a wire format and nothing
 * else — a base URL, a key and model names — so no provider is named here any
 * more than it is in the code.
 *
 * The key is stored as given: this is a local-first SQLite file and encrypting
 * it with a key kept beside it would only look like protection. `data/app.db`
 * should be treated as holding a credential, which the README says plainly.
 */
export const aiSettings = pgTable("ai_settings", {
  id: text("id").primaryKey(),
  baseUrl: text("base_url"),
  apiKey: text("api_key"),
  model: text("model"),
  /** Per-stage overrides, `{ marking: "…" }`. Absent stages use `model`. */
  modelByStageJson: jsonb("model_by_stage_json")
    .$type<Record<string, string>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  generationProvider: text("generation_provider", { enum: ["sample", "model"] }),
  markingProvider: text("marking_provider", { enum: ["model", "none"] }),
  /** What the last Test connection found, so the screen can show it again. */
  lastTestJson: jsonb("last_test_json")
    .$type<Record<string, unknown> | null>()
    .default(sql`'null'::jsonb`),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }),
  updatedByUserId: text("updated_by_user_id").references(() => users.id),
});

/* ---------------------------------------------------------------------------
 * Syllabus
 * ------------------------------------------------------------------------- */

/**
 * Flat table holding focus areas, subtopics and dot points. `selectable` is
 * true only for dot points — the 73 leaves the student can tick.
 *
 * `exactText` is copied verbatim from the supplied seed. It is never trimmed,
 * sentence-cased or otherwise tidied.
 */
export const syllabusItems = pgTable(
  "syllabus_items",
  {
    id: text("id").primaryKey(),
    parentId: text("parent_id"),
    level: text("level", { enum: ["focus_area", "subtopic", "dot_point"] }).notNull(),
    focusArea: text("focus_area").notNull(),
    exactText: text("exact_text").notNull(),
    /** `including:` sub-items, stored on the parent. Not separately selectable. */
    includingJson: jsonb("including_json")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    sortOrder: integer("sort_order").notNull(),
    selectable: boolean("selectable").notNull().default(false),
    verified: boolean("verified").notNull().default(true),
    note: text("note"),
    sourceUrl: text("source_url"),
  },
  (t) => [
    index("syllabus_items_parent_idx").on(t.parentId),
    index("syllabus_items_focus_idx").on(t.focusArea),
  ],
);

/* ---------------------------------------------------------------------------
 * Reference corpus
 * ------------------------------------------------------------------------- */

export const referenceSources = pgTable(
  "reference_sources",
  {
    id: text("id").primaryKey(),
    type: text("type", {
      enum: ["notes", "past_paper", "marking_guide", "syllabus", "ui_reference"],
    }).notNull(),
    filePath: text("file_path").notNull(),
    title: text("title").notNull(),
    focusArea: text("focus_area"),
    ingestedAt: timestamp("ingested_at", { withTimezone: true, mode: "date" }).notNull(),
    byteSize: integer("byte_size"),
    contentHash: text("content_hash"),
  },
  (t) => [uniqueIndex("reference_sources_path_idx").on(t.filePath)],
);

export const referenceChunks = pgTable(
  "reference_chunks",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => referenceSources.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    pageOrSlide: text("page_or_slide"),
    focusArea: text("focus_area"),
    content: text("content").notNull(),
    metadataJson: jsonb("metadata_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (t) => [
    index("reference_chunks_source_idx").on(t.sourceId),
    index("reference_chunks_focus_idx").on(t.focusArea),
  ],
);

export const chunkSyllabusItems = pgTable(
  "chunk_syllabus_items",
  {
    chunkId: text("chunk_id")
      .notNull()
      .references(() => referenceChunks.id, { onDelete: "cascade" }),
    syllabusItemId: text("syllabus_item_id")
      .notNull()
      .references(() => syllabusItems.id, { onDelete: "cascade" }),
    /** Lexical confidence from the tagging pass, 0–1. */
    weight: doublePrecision("weight").notNull().default(1),
  },
  (t) => [
    primaryKey({ columns: [t.chunkId, t.syllabusItemId] }),
    index("chunk_syllabus_item_idx").on(t.syllabusItemId),
  ],
);

/**
 * Assessment grammar derived from the Binder (CLAUDE.md §17).
 * Never stores source question wording.
 */
export const archetypes = pgTable("archetypes", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  rendererType: text("renderer_type").notNull(),
  stimulusType: text("stimulus_type"),
  typicalMarksJson: jsonb("typical_marks_json")
    .$type<number[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  commandVerbsJson: jsonb("command_verbs_json")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  cognitiveDemand: text("cognitive_demand").notNull(),
  multipart: boolean("multipart").notNull().default(false),
  transformationPattern: text("transformation_pattern"),
  markingStructure: text("marking_structure"),
  topicSuitabilityJson: jsonb("topic_suitability_json")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  observedCount: integer("observed_count").notNull().default(0),
});

/* ---------------------------------------------------------------------------
 * Exams
 * ------------------------------------------------------------------------- */

export const exams = pgTable("exams", {
  id: text("id").primaryKey(),
  /**
   * Null only for papers generated before accounts existed. Those are claimed
   * by the first administrator when they are created, so nothing is orphaned.
   *
   * No `onDelete` action: SQLite cannot attach one to a column added by
   * `ALTER TABLE`, so declaring it here would describe something the database
   * does not enforce. Accounts are disabled rather than deleted, which keeps a
   * student's papers and results intact.
   */
  userId: text("user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  title: text("title").notNull(),
  totalMarks: integer("total_marks").notNull().default(100),
  status: text("status", {
    enum: ["generating", "ready", "failed"],
  })
    .notNull()
    .default("generating"),
  /** Stage-based progress for the generating screen (CLAUDE.md §27). */
  progressJson: jsonb("progress_json")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  blueprintJson: jsonb("blueprint_json")
    .$type<Record<string, unknown> | null>()
    .default(sql`'null'::jsonb`),
  generationMetadataJson: jsonb("generation_metadata_json")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  /** Selected leaves this paper did not manage to assess (SPEC_ADDENDUM §2). */
  unassessedItemsJson: jsonb("unassessed_items_json")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  error: text("error"),
});

export const examSyllabusItems = pgTable(
  "exam_syllabus_items",
  {
    examId: text("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    syllabusItemId: text("syllabus_item_id")
      .notNull()
      .references(() => syllabusItems.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.examId, t.syllabusItemId] })],
);

export const questionGroups = pgTable(
  "question_groups",
  {
    id: text("id").primaryKey(),
    examId: text("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    totalMarks: integer("total_marks").notNull(),
    /** "objective" or "constructed" — drives the instructions-screen summary. */
    section: text("section", { enum: ["objective", "constructed"] }).notNull(),
    stimulusJson: jsonb("stimulus_json")
      .$type<Record<string, unknown> | null>()
      .default(sql`'null'::jsonb`),
    /** Layout hint: "single" | "split" (CLAUDE.md §10.6). */
    layout: text("layout", { enum: ["single", "split"] }).notNull().default("single"),
    cognitiveDemand: text("cognitive_demand"),
    metadataJson: jsonb("metadata_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (t) => [
    index("question_groups_exam_idx").on(t.examId),
    uniqueIndex("question_groups_position_idx").on(t.examId, t.position),
  ],
);

/**
 * `answerKeyJson` and `markingGuidelineJson` must never be selected by a
 * student-facing query. See `src/lib/db/queries/student.ts`.
 */
export const questionParts = pgTable(
  "question_parts",
  {
    id: text("id").primaryKey(),
    questionGroupId: text("question_group_id")
      .notNull()
      .references(() => questionGroups.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    label: text("label"),
    rendererType: text("renderer_type").notNull(),
    marks: integer("marks").notNull(),
    prompt: text("prompt").notNull(),
    configJson: jsonb("config_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    answerKeyJson: jsonb("answer_key_json")
      .$type<Record<string, unknown> | null>()
      .default(sql`'null'::jsonb`),
    markingGuidelineJson: jsonb("marking_guideline_json")
      .$type<Record<string, unknown> | null>()
      .default(sql`'null'::jsonb`),
  },
  (t) => [
    index("question_parts_group_idx").on(t.questionGroupId),
    uniqueIndex("question_parts_position_idx").on(t.questionGroupId, t.position),
  ],
);

export const questionPartSyllabusItems = pgTable(
  "question_part_syllabus_items",
  {
    questionPartId: text("question_part_id")
      .notNull()
      .references(() => questionParts.id, { onDelete: "cascade" }),
    syllabusItemId: text("syllabus_item_id")
      .notNull()
      .references(() => syllabusItems.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.questionPartId, t.syllabusItemId] }),
    index("question_part_syllabus_item_idx").on(t.syllabusItemId),
  ],
);

/* ---------------------------------------------------------------------------
 * Attempts
 * ------------------------------------------------------------------------- */

export const attempts = pgTable(
  "attempts",
  {
    id: text("id").primaryKey(),
    examId: text("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    /** See `exams.userId` for why this is nullable and has no delete action. */
    userId: text("user_id").references(() => users.id),
    status: text("status", {
      enum: ["not_started", "reading", "working", "submitted", "marked"],
    })
      .notNull()
      .default("not_started"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    readingStartedAt: timestamp("reading_started_at", { withTimezone: true, mode: "date" }),
    workingStartedAt: timestamp("working_started_at", { withTimezone: true, mode: "date" }),
    workingExpiresAt: timestamp("working_expires_at", { withTimezone: true, mode: "date" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "date" }),
    finalScore: integer("final_score"),
    markingStatus: text("marking_status", {
      enum: ["pending", "running", "complete", "failed"],
    })
      .notNull()
      .default("pending"),
    markingError: text("marking_error"),
    /** Font size, colour theme, last visited question. */
    uiStateJson: jsonb("ui_state_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (t) => [index("attempts_exam_idx").on(t.examId)],
);

export const responses = pgTable(
  "responses",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    questionPartId: text("question_part_id")
      .notNull()
      .references(() => questionParts.id, { onDelete: "cascade" }),
    responseJson: jsonb("response_json")
      .$type<unknown>()
      .default(sql`'null'::jsonb`),
    flagged: boolean("flagged").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    awardedMarks: integer("awarded_marks"),
    markingJson: jsonb("marking_json")
      .$type<Record<string, unknown> | null>()
      .default(sql`'null'::jsonb`),
  },
  (t) => [
    uniqueIndex("responses_attempt_part_idx").on(t.attemptId, t.questionPartId),
    index("responses_attempt_idx").on(t.attemptId),
  ],
);

/** Question-level flagging is per question group, not per part. */
export const attemptFlags = pgTable(
  "attempt_flags",
  {
    attemptId: text("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    questionGroupId: text("question_group_id")
      .notNull()
      .references(() => questionGroups.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.attemptId, t.questionGroupId] })],
);

/**
 * Highlights are stored semantically (text + occurrence index within a named
 * region) rather than as DOM ranges, so they survive re-render and reload.
 */
export const highlights = pgTable(
  "highlights",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    questionGroupId: text("question_group_id")
      .notNull()
      .references(() => questionGroups.id, { onDelete: "cascade" }),
    region: text("region").notNull(),
    text: text("text").notNull(),
    occurrence: integer("occurrence").notNull().default(0),
    colour: text("colour").notNull().default("yellow"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [index("highlights_attempt_idx").on(t.attemptId, t.questionGroupId)],
);

/* ---------------------------------------------------------------------------
 * Generation history — novelty and coverage weighting (SPEC_ADDENDUM §2, §3)
 * ------------------------------------------------------------------------- */

export const questionFingerprints = pgTable(
  "question_fingerprints",
  {
    id: text("id").primaryKey(),
    examId: text("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    questionGroupId: text("question_group_id").notNull(),
    archetypeId: text("archetype_id"),
    scenarioDomain: text("scenario_domain").notNull(),
    syllabusItemIdsJson: jsonb("syllabus_item_ids_json")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [index("question_fingerprints_created_idx").on(t.createdAt)],
);

export const coverageHistory = pgTable(
  "coverage_history",
  {
    syllabusItemId: text("syllabus_item_id")
      .primaryKey()
      .references(() => syllabusItems.id, { onDelete: "cascade" }),
    timesAssessed: integer("times_assessed").notNull().default(0),
    timesSelected: integer("times_selected").notNull().default(0),
    lastAssessedAt: timestamp("last_assessed_at", { withTimezone: true, mode: "date" }),
  },
);

/* ---------------------------------------------------------------------------
 * Relations
 * ------------------------------------------------------------------------- */

export const examRelations = relations(exams, ({ many }) => ({
  questionGroups: many(questionGroups),
  attempts: many(attempts),
  selectedItems: many(examSyllabusItems),
}));

export const questionGroupRelations = relations(
  questionGroups,
  ({ one, many }) => ({
    exam: one(exams, {
      fields: [questionGroups.examId],
      references: [exams.id],
    }),
    parts: many(questionParts),
  }),
);

export const questionPartRelations = relations(
  questionParts,
  ({ one, many }) => ({
    group: one(questionGroups, {
      fields: [questionParts.questionGroupId],
      references: [questionGroups.id],
    }),
    syllabusItems: many(questionPartSyllabusItems),
    responses: many(responses),
  }),
);

export const attemptRelations = relations(attempts, ({ one, many }) => ({
  exam: one(exams, { fields: [attempts.examId], references: [exams.id] }),
  responses: many(responses),
  highlights: many(highlights),
  flags: many(attemptFlags),
}));

export const responseRelations = relations(responses, ({ one }) => ({
  attempt: one(attempts, {
    fields: [responses.attemptId],
    references: [attempts.id],
  }),
  part: one(questionParts, {
    fields: [responses.questionPartId],
    references: [questionParts.id],
  }),
}));

export type UserRow = typeof users.$inferSelect;
export type AiSettingsRow = typeof aiSettings.$inferSelect;
export type AssetRow = typeof assets.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type SyllabusItemRow = typeof syllabusItems.$inferSelect;
export type ExamRow = typeof exams.$inferSelect;
export type QuestionGroupRow = typeof questionGroups.$inferSelect;
export type QuestionPartRow = typeof questionParts.$inferSelect;
export type AttemptRow = typeof attempts.$inferSelect;
export type ResponseRow = typeof responses.$inferSelect;
export type HighlightRow = typeof highlights.$inferSelect;
export type ArchetypeRow = typeof archetypes.$inferSelect;
export type ReferenceChunkRow = typeof referenceChunks.$inferSelect;
