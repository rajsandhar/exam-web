import Link from "next/link";
import { notFound } from "next/navigation";

import { PlatformShell } from "@/components/platform/shell";
import { QuestionReview } from "@/components/results/question-review";
import { SyllabusPerformanceTable } from "@/components/results/syllabus-performance";
import { buildResults } from "@/lib/results/build-results";

export const dynamic = "force-dynamic";

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const results = buildResults(attemptId);
  if (!results) notFound();

  const marksCounted = results.markedMarksAvailable;
  const percentage =
    marksCounted > 0 ? Math.round((results.awardedMarks / marksCounted) * 100) : null;

  return (
    <PlatformShell>
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <p className="text-sm text-ink-muted">{results.title}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-navy-800">
          Estimated HSC-style mark
        </h1>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Mark"
            value={`${results.awardedMarks} / ${results.totalMarks}`}
            emphasis
          />
          <Stat
            label={
              results.awaitingMarking > 0
                ? "Percentage of marked items"
                : "Percentage"
            }
            value={percentage === null ? "—" : `${percentage}%`}
          />
          <Stat
            label="Objective response"
            value={`${results.objective.earned} / ${results.objective.available}`}
          />
          <Stat
            label="Short answer"
            value={`${results.constructed.earned} / ${results.constructed.available}`}
          />
        </div>

        <p className="mt-4 text-xs leading-relaxed text-ink-muted">
          This is an estimate produced in the style of HSC marking. It is not a
          NESA mark.
          {results.timeUsedMs !== null && (
            <> Working time used: {formatDuration(results.timeUsedMs)}.</>
          )}
        </p>

        {results.awaitingMarking > 0 && (
          <p className="mt-4 rounded border border-flag/40 bg-flag/5 p-4 text-sm leading-relaxed">
            <strong>{results.awaitingMarking} marks</strong> of written response
            are not included in the mark above. Objective items were marked
            automatically; written responses need the rubric marker, which turns
            on once a model endpoint is configured.
          </p>
        )}

        <section className="mt-12">
          <h2 className="text-lg font-semibold text-navy-800">
            Performance by syllabus dot point
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Exact NESA Year 12 wording. A percentage is shown only where enough
            marks were available to mean anything.
          </p>
          <SyllabusPerformanceTable
            rows={results.syllabusPerformance}
            examId={results.examId}
          />

          {results.notAssessed.length > 0 && (
            <div className="mt-8 rounded-lg border border-line bg-surface-2 p-5">
              <h3 className="font-semibold text-navy-800">
                Selected content this paper did not assess
              </h3>
              <p className="mt-1 text-sm text-ink-muted">
                A 100-mark paper cannot reach every dot point. Generate another
                trial to cover these — later papers are weighted towards content
                earlier papers skipped.
              </p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {results.notAssessed.map((item) => (
                  <li key={item.id} className="flex gap-2">
                    <span className="font-mono text-xs text-ink-muted">{item.id}</span>
                    <span>{item.exactText}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/build"
                className="mt-4 inline-block rounded-md border border-navy-700 px-4 py-2 text-sm font-medium text-navy-700 hover:bg-navy-700 hover:text-white"
              >
                Build a trial covering these
              </Link>
            </div>
          )}
        </section>

        <section className="mt-14">
          <h2 className="text-lg font-semibold text-navy-800">Question review</h2>
          <div className="mt-4 space-y-5">
            {results.groups.map((group) => (
              <QuestionReview key={group.id} group={group} />
            ))}
          </div>
        </section>
      </main>
    </PlatformShell>
  );
}

function Stat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-white p-5">
      <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
      <p
        className={`mt-1 font-semibold tabular-nums ${
          emphasis ? "text-3xl text-navy-800" : "text-xl"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours} h ${rest} min` : `${rest} min`;
}
