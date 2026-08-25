import Link from "next/link";

import { SyllabusSelector } from "@/components/build/syllabus-selector";
import { PlatformShell } from "@/components/platform/shell";
import { resolveGenerationProvider } from "@/lib/ai/provider";
import { requireUser } from "@/lib/auth/current-user";
import { READING_MINUTES, TOTAL_MARKS, WORKING_MINUTES } from "@/lib/config";
import { estimatePaperCost, formatTokens } from "@/lib/ai/paper-cost";
import { getSyllabusTree } from "@/lib/db/queries/syllabus";

export const dynamic = "force-dynamic";

export default async function BuildPage() {
  const user = await requireUser("/build");
  const tree = await getSyllabusTree();
  // Said before generating, not after: a selection that will not actually be
  // used should not be a surprise discovered on the instructions screen.
  const usingSamplePaper = await resolveGenerationProvider() === "sample";
  const showUnverifiedMarkers = process.env.NODE_ENV !== "production";

  const paperCost = estimatePaperCost();

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

        {usingSamplePaper && (
          <p className="mt-6 max-w-3xl rounded border-l-4 border-flag bg-surface-2 px-4 py-3 text-sm leading-relaxed">
            <strong>No model endpoint is in use.</strong> Generating will serve
            the built-in sample paper — a fixed set of questions covering its own
            syllabus content, not the content you select below.{" "}
            {user.role === "admin" ? (
              <>
                Set an endpoint on{" "}
                <Link href="/settings" className="font-medium text-navy-700 underline">
                  model settings
                </Link>{" "}
                and switch paper generation to the model.
              </>
            ) : (
              "Ask an administrator to configure one."
            )}
          </p>
        )}

        {!usingSamplePaper && (
          // What this is about to spend, on the screen where it is spent. A
          // failed paper cost 73 dollars and nothing in the application had
          // ever said a paper cost anything at all.
          <p className="mt-6 max-w-3xl rounded border-l-4 border-flag bg-surface-2 px-4 py-3 text-sm leading-relaxed">
            <strong>Generating uses the model.</strong> A paper is around{" "}
            {paperCost.calls.typical} calls and{" "}
            {formatTokens(paperCost.outputTokens.typical)} output tokens, and up
            to {paperCost.calls.most} calls if every question has to be retried.
            It stops at {paperCost.ceiling.calls} calls.{" "}
            {user.role === "admin" ? (
              <Link href="/settings" className="font-medium text-navy-700 underline">
                What one paper costs
              </Link>
            ) : null}
          </p>
        )}

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
