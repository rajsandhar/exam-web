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
  const exam = getExamFor(examId, user.id);
  if (!exam) notFound();

  return (
    <PlatformShell>
      <main className="mx-auto w-full max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-800">
          Generating your trial
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          A fresh 100-mark paper is being built from the content you selected.
          You can leave this page — the paper will be waiting in your history.
        </p>
        <div className="mt-8">
          <GenerationProgressView examId={examId} initialStatus={exam.status} />
        </div>
      </main>
    </PlatformShell>
  );
}
