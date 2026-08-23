import { notFound } from "next/navigation";

import { StartExamButton } from "@/components/exam/start-exam-button";
import { READING_MINUTES, TOTAL_MARKS, WORKING_MINUTES } from "@/lib/config";
import { requireUser } from "@/lib/auth/current-user";
import { getExamFor } from "@/lib/db/queries/exams";
import { getPaperSummary } from "@/lib/db/queries/student";

export const dynamic = "force-dynamic";

/**
 * Instructions / start screen (CLAUDE.md §10.2), following the structure of the
 * supplied screenshot: general instructions on the left, a summary panel and a
 * single START control on the right.
 */
export default async function InstructionsPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = await params;
  const user = await requireUser(`/exam/${examId}/instructions`);
  const exam = getExamFor(examId, user.id);
  if (!exam || exam.status !== "ready") notFound();

  const summary = getPaperSummary(examId);
  const generatedByMock =
    (exam.generationMetadataJson as { provider?: string }).provider === "mock";
  const hours = Math.floor(WORKING_MINUTES / 60);
  const minutes = WORKING_MINUTES % 60;

  return (
    <div data-exam-theme="default" data-exam-font="m" className="flex min-h-screen flex-col">
      <header className="bg-[var(--exam-header-bg)] px-6 py-4 text-[var(--exam-header-fg)]">
        <h1 className="text-[1.05em] font-bold tracking-tight">{exam.title}</h1>
      </header>

      <div className="border-b border-[var(--exam-line)] bg-[var(--exam-toolbar-bg)] px-6 py-2.5">
        <p className="text-[0.85em] text-[var(--exam-muted)]">
          Read these instructions before you begin.
        </p>
      </div>

      <main className="grid flex-1 gap-10 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <section className="max-w-3xl">
          <h2 className="text-[1.7em] font-bold text-[var(--exam-accent)]">
            General Instructions
          </h2>

          <h3 className="mt-6 text-[1.15em] font-bold text-[var(--exam-accent)]">
            Reading time
          </h3>
          <p className="mt-2 leading-relaxed">
            You are given {READING_MINUTES} minutes reading time. During reading
            time you will not be able to answer questions, and exiting the exam
            is not possible without confirming that you want working time to
            begin. You can move freely between the questions, and you can flag
            questions. Highlighting of text is also permitted.
          </p>

          <h3 className="mt-6 text-[1.15em] font-bold text-[var(--exam-accent)]">
            Working time
          </h3>
          <p className="mt-2 leading-relaxed">
            You are given {hours} hours {minutes} minutes to attempt the
            questions. The clock runs from the moment working time begins and is
            kept by the application, so closing or refreshing the page does not
            pause it or return time to you.
          </p>

          <h3 className="mt-6 text-[1.15em] font-bold text-[var(--exam-accent)]">
            Permitted equipment
          </h3>
          <ul className="ml-5 mt-2 list-disc space-y-1.5 leading-relaxed">
            <li>Pen and paper are permitted for planning.</li>
            <li>
              No other resources may be used. This is a practice paper, so the
              conditions are yours to enforce.
            </li>
          </ul>
          <p className="mt-3 font-semibold leading-relaxed">
            The number of words that is provided for each short-answer item gives
            an indication of the length of response.
          </p>

          <h3 className="mt-6 text-[1.15em] font-bold text-[var(--exam-accent)]">
            Exam navigation and tool bar functionality
          </h3>
          <p className="mt-2 leading-relaxed">
            During reading and working time you can access information about the
            exam, navigation and tools by selecting the Info button at the top
            right-hand side of the screen. Answers are saved automatically as you
            work.
          </p>

          <h3 className="mt-6 text-[1.15em] font-bold text-[var(--exam-accent)]">
            About this paper
          </h3>
          {generatedByMock ? (
            <p className="mt-2 border-l-4 border-[var(--flag)] bg-[var(--exam-panel-bg)] px-4 py-3 leading-relaxed">
              This is the built-in <strong>sample paper</strong>, not a paper
              generated from the content you selected. It is a fixed set of
              questions used to run the application without a model endpoint, so
              it covers its own syllabus content rather than yours. To generate a
              paper from your selection, configure an endpoint and set{" "}
              <code className="font-mono">GENERATION_PROVIDER=model</code>.
            </p>
          ) : (
            <p className="mt-2 leading-relaxed">
              This is an independently generated practice paper covering the Year
              12 content you selected. It is not a NESA examination and the mark
              it produces is an estimate in the style of HSC marking.
            </p>
          )}
        </section>

        <aside>
          <div className="bg-[#d7edef] p-6 text-[#16181d]">
            <h2 className="text-[1.35em] font-bold">Total marks: {TOTAL_MARKS}</h2>
            <ul className="ml-5 mt-3 list-disc space-y-1.5 leading-relaxed">
              <li>There are {summary.questionCount} questions.</li>
              <li>
                {summary.multipartCount > 0
                  ? "Some questions have multiple parts."
                  : "Each question has one part."}
              </li>
              <li>
                Objective-response items total {summary.objectiveMarks} marks.
              </li>
              <li>
                Short-answer items total {summary.constructedMarks} marks.
              </li>
            </ul>
          </div>

          <StartExamButton examId={examId} />
        </aside>
      </main>

      <footer className="border-t border-[var(--exam-line)] px-6 py-4 text-[0.8em] text-[var(--exam-muted)]">
        Independent practice tool. Not affiliated with, or endorsed by, the NSW
        Education Standards Authority.
      </footer>
    </div>
  );
}
