import { PlatformShell } from "@/components/platform/shell";
import { PendingButton } from "@/components/settings/pending-button";
import { estimatePaperCost, formatTokens } from "@/lib/ai/paper-cost";
import { MODEL_STAGES, readEnvEndpointConfig, type ModelStage } from "@/lib/ai/endpoint";
import { resolveGenerationProvider, resolveMarkingProvider } from "@/lib/ai/provider";
import { readStoredSettings, resolveEndpointConfig } from "@/lib/ai/settings";
import { requireAdmin } from "@/lib/auth/current-user";

import { saveSettingsAction, testConnectionAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Where an administrator points the application at a model.
 *
 * The screen describes a wire format and nothing else — a base URL, a key and
 * model names — so no service is named here any more than in the code. Anything
 * implementing the widely used chat-completions shape works.
 */

const STAGE_HELP: Record<Exclude<ModelStage, "smoke">, string> = {
  blueprint: "Plans the 100-mark paper in one call. The largest single response.",
  question: "Writes each question group. Around 30 calls per paper.",
  critic: "Reviews each question for difficulty and syllabus fit.",
  marking: "Marks written responses. The stage a weaker model hurts most.",
  moderation: "Second opinion on high-mark and borderline responses.",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ problem?: string; saved?: string; tested?: string }>;
}) {
  await requireAdmin("/settings");
  const { problem, saved, tested } = await searchParams;

  const stored = await readStoredSettings();
  const env = readEnvEndpointConfig();
  const resolved = await resolveEndpointConfig();
  const lastTest = stored.lastTest;

  return (
    <PlatformShell active="settings">
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-800">
          Model settings
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          The application speaks one wire format — the widely implemented
          chat-completions shape — and needs only a base URL, a key and a model
          name. Any service exposing that format will work. What you set here
          overrides the environment.
        </p>

        {problem && <Banner tone="danger">{problem}</Banner>}
        {saved && <Banner tone="ok">Settings saved.</Banner>}
        {tested && !lastTest && <Banner tone="danger">The test did not complete.</Banner>}

        <Status resolved={resolved !== null} stored={stored.baseUrl !== null} env={env !== null} />

        <form action={saveSettingsAction} className="mt-8 space-y-8">
          <Section
            title="Endpoint"
            description="The base URL is the address the chat-completions path hangs off, usually ending in /v1."
          >
            <Field
              label="Base URL"
              name="baseUrl"
              defaultValue={stored.baseUrl ?? ""}
              placeholder={env?.baseUrl ?? "https://example.com/v1"}
              hint={
                env?.baseUrl && !stored.baseUrl
                  ? `Currently coming from the environment: ${env.baseUrl}`
                  : undefined
              }
            />
            <Field
              label="Model"
              name="model"
              defaultValue={stored.model ?? ""}
              placeholder={env?.model ?? "model-name"}
              hint={
                env?.model && !stored.model
                  ? `Currently coming from the environment: ${env.model}`
                  : undefined
              }
            />

            <div>
              <label htmlFor="field-apiKey" className="block text-sm font-medium">
                API key
              </label>
              <input
                id="field-apiKey"
                name="apiKey"
                type="password"
                autoComplete="off"
                placeholder={stored.apiKey ? "A key is saved — leave blank to keep it" : "Leave blank if the endpoint needs no key"}
                className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-navy-600"
              />
              <p className="mt-1 text-xs text-ink-muted">
                {stored.apiKey
                  ? "A key is saved. It is never shown again, and never sent to the browser."
                  : env?.apiKey
                    ? "A key is currently coming from the environment."
                    : "No key is set."}
              </p>
              {stored.apiKey && (
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" name="removeKey" className="size-4" />
                  Remove the saved key
                </label>
              )}
            </div>
          </Section>

          <PaperCost />

          <Section
            title="What uses the model"
            description="Generation and marking are separate decisions. Generating a paper is around a hundred calls; marking one is around thirty small ones, and is the half a model is genuinely irreplaceable for."
          >
            <Choice
              label="Generating papers"
              name="generationProvider"
              value={stored.generationProvider}
              resolved={await resolveGenerationProvider()}
              options={[
                { value: "sample", label: "Built-in sample paper (no calls, no cost)" },
                { value: "model", label: "Generate with the model" },
              ]}
            />
            <Choice
              label="Marking written responses"
              name="markingProvider"
              value={stored.markingProvider}
              resolved={await resolveMarkingProvider()}
              options={[
                { value: "model", label: "Mark with the model" },
                {
                  value: "none",
                  label: "Leave written responses unmarked, showing the guideline instead",
                },
              ]}
            />
          </Section>

          <Section
            title="Model per stage"
            description="Optional. Leave a stage blank to use the model above. Useful for spending more on marking than on drafting."
          >
            {MODEL_STAGES.filter((stage) => stage !== "smoke").map((stage) => (
              <Field
                key={stage}
                label={stage[0]!.toUpperCase() + stage.slice(1)}
                name={`model_${stage}`}
                defaultValue={stored.modelByStage[stage] ?? ""}
                placeholder={stored.model ?? env?.model ?? "same as above"}
                hint={STAGE_HELP[stage as Exclude<ModelStage, "smoke">]}
              />
            ))}
          </Section>

          <div className="flex items-center gap-3 border-t border-line pt-6">
            <PendingButton pendingLabel="Saving…">Save settings</PendingButton>
          </div>
        </form>

        <section className="mt-10 rounded-lg border border-line bg-white p-6">
          <h2 className="text-base font-semibold text-navy-800">Test connection</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            Asks the endpoint one small structured question and reports what came
            back: whether it is reachable, which JSON mode it supports, and
            whether the answer validated. Generating a paper is around a hundred
            calls — finding out on call seventy is an expensive way to learn this.
          </p>

          {lastTest && (
            <div
              className={`mt-4 rounded border p-4 text-sm ${
                lastTest.ok
                  ? "border-ok/40 bg-ok/5"
                  : "border-danger/40 bg-danger/5"
              }`}
            >
              <p className="font-medium">
                {lastTest.ok ? "Working" : "Failed"}
                {lastTest.jsonMode ? ` — ${describeMode(lastTest.jsonMode)}` : ""}
              </p>
              <p className="mt-1 leading-relaxed text-ink-muted">
                {lastTest.problem ?? lastTest.summary}
              </p>
              <p className="mt-2 text-xs text-ink-muted">
                Last tested {new Date(lastTest.at).toLocaleString()}
              </p>
            </div>
          )}

          <form action={testConnectionAction} className="mt-4">
            <PendingButton variant="secondary" pendingLabel="Testing…">
              Test connection
            </PendingButton>
          </form>
        </section>
      </main>
    </PlatformShell>
  );
}

function describeMode(mode: string): string {
  return mode === "json_schema"
    ? "schema-constrained output, the reliable path"
    : "plain JSON output, so the schema is sent in the prompt";
}

function Status({
  resolved,
  stored,
  env,
}: {
  resolved: boolean;
  stored: boolean;
  env: boolean;
}) {
  if (resolved) {
    return (
      <p className="mt-6 rounded border border-line bg-surface-2 p-3 text-sm">
        An endpoint is configured
        {stored ? " on this screen" : env ? " in the environment" : ""}.
      </p>
    );
  }
  return (
    <p className="mt-6 rounded border border-line bg-surface-2 p-3 text-sm">
      No endpoint is configured. The application still works: papers come from
      the built-in sample, and written responses are shown with their marking
      guideline instead of a score.
    </p>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "ok" | "danger";
  children: React.ReactNode;
}) {
  return (
    <p
      role="alert"
      className={`mt-6 rounded border p-3 text-sm ${
        tone === "ok"
          ? "border-ok/40 bg-ok/5"
          : "border-danger/40 bg-danger/5 text-danger"
      }`}
    >
      {children}
    </p>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-white p-6">
      <h2 className="text-base font-semibold text-navy-800">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{description}</p>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  hint,
}: {
  label: string;
  name: string;
  defaultValue: string;
  placeholder?: string;
  hint?: string;
}) {
  const id = `field-${name}`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 font-mono text-sm outline-none focus:border-navy-600"
      />
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

function Choice({
  label,
  name,
  value,
  resolved,
  options,
}: {
  label: string;
  name: string;
  value: string | null;
  resolved: string;
  options: Array<{ value: string; label: string }>;
}) {
  const id = `field-${name}`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={value ?? ""}
        className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-navy-600"
      >
        <option value="">Decide automatically (currently: {resolved})</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * What a paper costs, on the screen where the model is chosen.
 *
 * A generation that failed cost 73 dollars across 788 requests, and nothing
 * here had ever said what one was going to cost — the first anyone knew was the
 * provider's billing page. The spread between a clean run and a retried one is
 * shown rather than a single figure, because the gap is most of the story.
 */
function PaperCost() {
  const estimate = estimatePaperCost();

  return (
    <section className="mt-6 rounded-lg border border-line bg-white p-6">
      <h2 className="text-base font-semibold text-navy-800">What one paper costs</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">
        Generating a 100-mark paper with the model. Token figures are output
        ceilings — a reasoning model bills what it generates, including reasoning
        it does not show, so treat these as the shape of the bill rather than the
        bill. Input tokens are extra and much cheaper.
      </p>

      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
            <th scope="col" className="py-2 pr-4 font-semibold">Per paper</th>
            <th scope="col" className="py-2 pr-4 font-semibold">Typical</th>
            <th scope="col" className="py-2 font-semibold">Every question retried</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          <tr className="border-b border-line/70">
            <td className="py-2 pr-4">Questions</td>
            <td className="py-2 pr-4">{estimate.questions.typical}</td>
            <td className="py-2">{estimate.questions.most}</td>
          </tr>
          <tr className="border-b border-line/70">
            <td className="py-2 pr-4">Model calls</td>
            <td className="py-2 pr-4">{estimate.calls.typical}</td>
            <td className="py-2">{estimate.calls.most}</td>
          </tr>
          <tr>
            <td className="py-2 pr-4">Output tokens</td>
            <td className="py-2 pr-4">{formatTokens(estimate.outputTokens.typical)}</td>
            <td className="py-2">{formatTokens(estimate.outputTokens.most)}</td>
          </tr>
        </tbody>
      </table>

      <p className="mt-4 text-sm leading-relaxed">
        A paper is abandoned once it passes{" "}
        <strong>{estimate.ceiling.calls} calls</strong> or{" "}
        <strong>{formatTokens(estimate.ceiling.tokens)} tokens</strong>, so a run
        that goes wrong stops rather than keeps spending. Marking is separate and
        far smaller — around thirty short calls for a whole paper.
      </p>

      <p className="mt-3 text-xs leading-relaxed text-ink-muted">
        Set a hard spend limit with your provider as well. Nothing here can stop
        a bill that is already being run up somewhere else.
      </p>
    </section>
  );
}
