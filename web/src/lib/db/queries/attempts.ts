import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import { READING_MINUTES, workingMinutesFor } from "@/lib/config";
import { db } from "@/lib/db/client";
import {
  attemptFlags,
  attempts,
  exams,
  highlights,
  questionGroups,
  questionParts,
  responses,
} from "@/lib/db/schema";
import type { ResponsePayload } from "@/lib/schemas/renderers";

/**
 * Attempt state.
 *
 * Timestamps are authoritative and server-side (CLAUDE.md §10.7): remaining
 * time is always derived from `working_expires_at`, never from a client
 * countdown, so refreshing grants no extra time and closing the laptop does not
 * pause the clock.
 */

export type AttemptTiming = {
  status: "not_started" | "reading" | "working" | "submitted" | "marked";
  serverNow: number;
  readingEndsAt: number | null;
  workingExpiresAt: number | null;
  /** Milliseconds left in the current phase; null before the attempt starts. */
  remainingMs: number | null;
};

export function createAttempt(examId: string): string {
  const id = randomUUID();
  db.insert(attempts)
    .values({ id, examId, status: "not_started", createdAt: new Date() })
    .run();
  return id;
}

export function getAttempt(attemptId: string) {
  return db.select().from(attempts).where(eq(attempts.id, attemptId)).get();
}

export function getLatestAttempt(examId: string) {
  return db
    .select()
    .from(attempts)
    .where(eq(attempts.examId, examId))
    .orderBy(desc(attempts.createdAt))
    .get();
}

/** Starts reading time. Idempotent — a second call does not restart the clock. */
export function beginReading(attemptId: string): void {
  const attempt = getAttempt(attemptId);
  if (!attempt || attempt.readingStartedAt) return;
  db.update(attempts)
    .set({ status: "reading", readingStartedAt: new Date() })
    .where(eq(attempts.id, attemptId))
    .run();
}

/**
 * Moves into working time and fixes the expiry. Idempotent, so a refresh at the
 * moment of transition cannot extend the paper.
 */
export function beginWorking(attemptId: string): void {
  const attempt = getAttempt(attemptId);
  if (!attempt || attempt.workingStartedAt) return;

  const exam = db.select().from(exams).where(eq(exams.id, attempt.examId)).get();
  const minutes = workingMinutesFor(exam?.totalMarks ?? 100);
  const now = new Date();

  db.update(attempts)
    .set({
      status: "working",
      workingStartedAt: now,
      workingExpiresAt: new Date(now.getTime() + minutes * 60_000),
      ...(attempt.readingStartedAt ? {} : { readingStartedAt: now }),
    })
    .where(eq(attempts.id, attemptId))
    .run();
}

export function computeTiming(attemptId: string): AttemptTiming | null {
  const attempt = getAttempt(attemptId);
  if (!attempt) return null;

  const now = Date.now();
  const readingEndsAt = attempt.readingStartedAt
    ? attempt.readingStartedAt.getTime() + READING_MINUTES * 60_000
    : null;
  const workingExpiresAt = attempt.workingExpiresAt?.getTime() ?? null;

  let remainingMs: number | null = null;
  if (attempt.status === "reading" && readingEndsAt !== null) {
    remainingMs = Math.max(0, readingEndsAt - now);
  } else if (attempt.status === "working" && workingExpiresAt !== null) {
    remainingMs = Math.max(0, workingExpiresAt - now);
  }

  return {
    status: attempt.status,
    serverNow: now,
    readingEndsAt,
    workingExpiresAt,
    remainingMs,
  };
}

/**
 * Advances the attempt if a deadline has passed. Called on every state read so
 * the phase is correct even if the browser was closed across the boundary.
 */
export function reconcileAttemptPhase(attemptId: string): void {
  const attempt = getAttempt(attemptId);
  if (!attempt) return;
  const now = Date.now();

  if (
    attempt.status === "reading" &&
    attempt.readingStartedAt &&
    now >= attempt.readingStartedAt.getTime() + READING_MINUTES * 60_000
  ) {
    beginWorking(attemptId);
    return;
  }

  if (
    attempt.status === "working" &&
    attempt.workingExpiresAt &&
    now >= attempt.workingExpiresAt.getTime()
  ) {
    submitAttempt(attemptId);
  }
}

export function saveResponse(
  attemptId: string,
  questionPartId: string,
  payload: ResponsePayload | null,
): void {
  const existing = db
    .select({ id: responses.id })
    .from(responses)
    .where(
      and(
        eq(responses.attemptId, attemptId),
        eq(responses.questionPartId, questionPartId),
      ),
    )
    .get();

  if (existing) {
    db.update(responses)
      .set({ responseJson: payload, updatedAt: new Date() })
      .where(eq(responses.id, existing.id))
      .run();
    return;
  }

  db.insert(responses)
    .values({
      id: randomUUID(),
      attemptId,
      questionPartId,
      responseJson: payload,
      updatedAt: new Date(),
    })
    .run();
}

export function getResponses(attemptId: string): Record<string, ResponsePayload | null> {
  const rows = db
    .select({
      questionPartId: responses.questionPartId,
      responseJson: responses.responseJson,
    })
    .from(responses)
    .where(eq(responses.attemptId, attemptId))
    .all();

  const out: Record<string, ResponsePayload | null> = {};
  for (const row of rows) {
    out[row.questionPartId] = (row.responseJson as ResponsePayload | null) ?? null;
  }
  return out;
}

export function setFlag(attemptId: string, questionGroupId: string, on: boolean): void {
  if (on) {
    db.insert(attemptFlags)
      .values({ attemptId, questionGroupId })
      .onConflictDoNothing()
      .run();
    return;
  }
  db.delete(attemptFlags)
    .where(
      and(
        eq(attemptFlags.attemptId, attemptId),
        eq(attemptFlags.questionGroupId, questionGroupId),
      ),
    )
    .run();
}

export function getFlags(attemptId: string): string[] {
  return db
    .select({ questionGroupId: attemptFlags.questionGroupId })
    .from(attemptFlags)
    .where(eq(attemptFlags.attemptId, attemptId))
    .all()
    .map((r) => r.questionGroupId);
}

export type HighlightRecord = {
  id: string;
  questionGroupId: string;
  region: string;
  text: string;
  occurrence: number;
  colour: string;
};

export function addHighlight(
  attemptId: string,
  highlight: Omit<HighlightRecord, "id">,
): string {
  const id = randomUUID();
  db.insert(highlights)
    .values({ id, attemptId, ...highlight, createdAt: new Date() })
    .run();
  return id;
}

export function removeHighlight(attemptId: string, highlightId: string): void {
  db.delete(highlights)
    .where(and(eq(highlights.attemptId, attemptId), eq(highlights.id, highlightId)))
    .run();
}

export function getHighlights(attemptId: string): HighlightRecord[] {
  return db
    .select({
      id: highlights.id,
      questionGroupId: highlights.questionGroupId,
      region: highlights.region,
      text: highlights.text,
      occurrence: highlights.occurrence,
      colour: highlights.colour,
    })
    .from(highlights)
    .where(eq(highlights.attemptId, attemptId))
    .all();
}

export type ExamUiState = {
  fontSize?: string;
  colourTheme?: string;
  lastQuestion?: number;
  highlightMode?: boolean;
};

export function saveUiState(attemptId: string, state: ExamUiState): void {
  const attempt = getAttempt(attemptId);
  if (!attempt) return;
  db.update(attempts)
    .set({ uiStateJson: { ...(attempt.uiStateJson as ExamUiState), ...state } })
    .where(eq(attempts.id, attemptId))
    .run();
}

export function submitAttempt(attemptId: string): void {
  const attempt = getAttempt(attemptId);
  if (!attempt || attempt.submittedAt) return;
  db.update(attempts)
    .set({ status: "submitted", submittedAt: new Date(), markingStatus: "pending" })
    .where(eq(attempts.id, attemptId))
    .run();
}

/** Answered / unanswered / flagged counts for the submit confirmation. */
export function getAttemptProgress(attemptId: string, examId: string) {
  const groups = db
    .select({ id: questionGroups.id })
    .from(questionGroups)
    .where(eq(questionGroups.examId, examId))
    .all();
  const groupIds = new Set(groups.map((g) => g.id));

  const parts = db
    .select({
      id: questionParts.id,
      questionGroupId: questionParts.questionGroupId,
      marks: questionParts.marks,
    })
    .from(questionParts)
    .all()
    .filter((p) => groupIds.has(p.questionGroupId) && p.marks > 0);

  return { parts, flags: getFlags(attemptId), responses: getResponses(attemptId) };
}
