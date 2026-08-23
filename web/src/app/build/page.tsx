import { SyllabusSelector } from "@/components/build/syllabus-selector";
import { PlatformShell } from "@/components/platform/shell";
import { requireUser } from "@/lib/auth/current-user";
import { READING_MINUTES, TOTAL_MARKS, WORKING_MINUTES } from "@/lib/config";
import { getSyllabusTree } from "@/lib/db/queries/syllabus";

export const dynamic = "force-dynamic";

export default async function BuildPage() {
  await requireUser("/build");
  const tree = getSyllabusTree();
  const showUnverifiedMarkers = process.env.NODE_ENV !== "production";

  return (
    <PlatformShell active="build">
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-800">
          Build a {TOTAL_MARKS}-mark trial
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">
          Choose the Year 12 content to be examined. Wording below is the exact
          NESA Software Engineering 11–12 (2022) Year 12 syllabus text. Every
          generated paper is exactly {TOTAL_MARKS} marks, with{" "}
          {READING_MINUTES} minutes reading time and {WORKING_MINUTES} minutes
          working time.
        </p>

        <div className="mt-8">
          <SyllabusSelector
            tree={tree}
            showUnverifiedMarkers={showUnverifiedMarkers}
          />
        </div>
      </main>
    </PlatformShell>
  );
}
