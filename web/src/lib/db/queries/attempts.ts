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

export async function createAttempt(examId: string, userId: string): Promise<string> {
  const id = randomUUID();
  await db.insert(attempts)
    .values({ id, examId, userId, status: "not_started", createdAt: new Date() });
  return id;
}

export async function getAttempt(attemptId: string) {
  const [row] = await db.select().from(attempts).where(eq(attempts.id, attemptId)).limit(1);
  return row;
}

/**
 * An attempt the given user owns. Everything that reads or writes an attempt
 * goes through this rather than `getAttempt`, so knowing an attempt id is not
 * enough to read somebody's paper or submit on their behalf.
 */
export async function getAttemptFor(attemptId: string, userId: string) {
  const attempt = await getAttempt(attemptId);
  if (!attempt) return undefined;
  return attempt.userId === userId ? attempt : undefined;
}

export async function getLatestAttempt(examId: string) {
  const [row] = await db
    .select()
    .from(attempts)
    .where(eq(attempts.examId, examId))
    .orderBy(desc(attempts.createdAt))
    .limit(1);
  return row;
}

/** Starts reading time. Idempotent — a second call does not restart the clock. */
export async function beginReading(attemptId: string): Promise<void> {
  const attempt = await getAttempt(attemptId);
  if (!attempt || attempt.readingStartedAt) return;
  await db.update(attempts)
    .set({ status: "reading", readingStartedAt: new Date() })
    .where(eq(attempts.id, attemptId));
}

/**
 * Moves into working time and fixes the expiry. Idempotent, so a refresh at the
 * moment of transition cannot extend the paper.
 */
export async function beginWorking(attemptId: string): Promise<void> {
  const attempt = await getAttempt(attemptId);
  if (!attempt || attempt.workingStartedAt) return;

  const [exam] = await db.select().from(exams).where(eq(exams.id, attempt.examId)).limit(1);
  const minutes = workingMinutesFor(exam?.totalMarks ?? 100);
  const now = new Date();

  await db.update(attempts)
    .set({
      status: "working",
      workingStartedAt: now,
      workingExpiresAt: new Date(now.getTime() + minutes * 60_000),
      ...(attempt.readingStartedAt ? {} : { readingStartedAt: now }),
    })
    .where(eq(attempts.id, attemptId));
}

export async function computeTiming(attemptId: string): Promise<AttemptTiming | null> {
  const attempt = await getAttempt(attemptId);
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
export async function reconcileAttemptPhase(attemptId: string): Promise<void> {
  const attempt = await getAttempt(attemptId);
  if (!attempt) return;
  const now = Date.now();

  if (
    attempt.status === "reading" &&
    attempt.readingStartedAt &&
    now >= attempt.readingStartedAt.getTime() + READING_MINUTES * 60_000
  ) {
    await beginWorking(attemptId);
    return;
  }

  if (
    attempt.status === "working" &&
    attempt.workingExpiresAt &&
    now >= attempt.workingExpiresAt.getTime()
  ) {
    await submitAttempt(attemptId);
  }
}

export async function saveResponse(
  attemptId: string,
  questionPartId: string,
  payload: ResponsePayload | null,
): Promise<void> {
  const [existing] = await db
    .select({ id: responses.id })
    .from(responses)
    .where(
      and(
        eq(responses.attemptId, attemptId),
        eq(responses.questionPartId, questionPartId),
      ),
    )
    .limit(1);

  if (existing) {
    await db.update(responses)
      .set({ responseJson: payload, updatedAt: new Date() })
      .where(eq(responses.id, existing.id));
    return;
  }

  await db.insert(responses)
    .values({
      id: randomUUID(),
      attemptId,
      questionPartId,
      responseJson: payload,
      updatedAt: new Date(),
    });
}

export async function getResponses(
  attemptId: string,
): Promise<Record<string, ResponsePayload | null>> {
  const rows = await db
    .select({
      questionPartId: responses.questionPartId,
      responseJson: responses.responseJson,
    })
    .from(responses)
    .where(eq(responses.attemptId, attemptId));

  const out: Record<string, ResponsePayload | null> = {};
  for (const row of rows) {
    out[row.questionPartId] = (row.responseJson as ResponsePayload | null) ?? null;
  }
  return out;
}

export async function setFlag(attemptId: string, questionGroupId: string, on: boolean): Promise<void> {
  if (on) {
    await db.insert(attemptFlags)
      .values({ attemptId, questionGroupId })
      .onConflictDoNothing();
    return;
  }
  await db.delete(attemptFlags)
    .where(
      and(
        eq(attemptFlags.attemptId, attemptId),
        eq(attemptFlags.questionGroupId, questionGroupId),
      ),
    );
}

export async function getFlags(attemptId: string): Promise<string[]> {
  const rows = await db
    .select({ questionGroupId: attemptFlags.questionGroupId })
    .from(attemptFlags)
    .where(eq(attemptFlags.attemptId, attemptId));
  return rows.map((r) => r.questionGroupId);
}

export type HighlightRecord = {
  id: string;
  questionGroupId: string;
  region: string;
  text: string;
  occurrence: number;
  colour: string;
};

export async function addHighlight(
  attemptId: string,
  highlight: Omit<HighlightRecord, "id">,
): Promise<string> {
  const id = randomUUID();
  await db.insert(highlights)
    .values({ id, attemptId, ...highlight, createdAt: new Date() });
  return id;
}

export async function removeHighlight(attemptId: string, highlightId: string): Promise<void> {
  await db.delete(highlights)
    .where(and(eq(highlights.attemptId, attemptId), eq(highlights.id, highlightId)));
}

export async function getHighlights(attemptId: string): Promise<HighlightRecord[]> {
  const rows = await db
    .select({
      id: highlights.id,
      questionGroupId: highlights.questionGroupId,
      region: highlights.region,
      text: highlights.text,
      occurrence: highlights.occurrence,
      colour: highlights.colour,
    })
    .from(highlights)
    .where(eq(highlights.attemptId, attemptId));
  return rows;
}

export type ExamUiState = {
  fontSize?: string;
  colourTheme?: string;
  lastQuestion?: number;
  highlightMode?: boolean;
};

export async function saveUiState(attemptId: string, state: ExamUiState): Promise<void> {
  const attempt = await getAttempt(attemptId);
  if (!attempt) return;
  await db.update(attempts)
    .set({ uiStateJson: { ...(attempt.uiStateJson as ExamUiState), ...state } })
    .where(eq(attempts.id, attemptId));
}

export async function submitAttempt(attemptId: string): Promise<void> {
  const attempt = await getAttempt(attemptId);
  if (!attempt || attempt.submittedAt) return;
  await db.update(attempts)
    .set({ status: "submitted", submittedAt: new Date(), markingStatus: "pending" })
    .where(eq(attempts.id, attemptId));
}

/** Answered / unanswered / flagged counts for the submit confirmation. */
export async function getAttemptProgress(attemptId: string, examId: string) {
  const groups = await db
    .select({ id: questionGroups.id })
    .from(questionGroups)
    .where(eq(questionGroups.examId, examId));
  const groupIds = new Set(groups.map((g) => g.id));

  const allParts = await db
    .select({
      id: questionParts.id,
      questionGroupId: questionParts.questionGroupId,
      marks: questionParts.marks,
    })
    .from(questionParts);
  const parts = allParts.filter(
    (p) => groupIds.has(p.questionGroupId) && p.marks > 0,
  );

  return {
    parts,
    flags: await getFlags(attemptId),
    responses: await getResponses(attemptId),
  };
}
