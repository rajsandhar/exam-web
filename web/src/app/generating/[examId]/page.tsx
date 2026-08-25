import { notFound } from "next/navigation";

import { GenerationProgressView } from "@/components/build/generation-progress";
import { PlatformShell } from "@/components/platform/shell";
import { requireUser } from "@/lib/auth/current-user";
import { getExamFor } from "@/lib/db/queries/exams";

export const dynamic = "force-dynamic";

export default async function GeneratingPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = await params;
  const user = await requireUser(`/generating/${examId}`);
  const exam = await getExamFor(examId, user.id);
  if (!exam) notFound();

  return (
    <PlatformShell>
      <main className="mx-auto w-full max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-800">
          Generating your trial
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          A fresh 100-mark paper is being built from the content you selected.
          {/* This used to say the page could be left. It cannot: the work
              advances while this screen is open, so saying otherwise left
              papers sitting at "generating" for ever in the history list. */}
          Keep this page open while it builds. If you close it, generation
          pauses — reopen the paper from your history and it carries on from
          where it stopped.
        </p>
        <div className="mt-8">
          <GenerationProgressView examId={examId} initialStatus={exam.status} />
        </div>
      </main>
    </PlatformShell>
  );
}
