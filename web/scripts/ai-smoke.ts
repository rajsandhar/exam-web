/**
 * Checks the configured model endpoint.
 *
 *   pnpm ai:smoke
 *
 * Answers, in one small call: is it reachable, does it support
 * schema-constrained JSON, did the output validate, and how slow is it.
 */
import { runSmokeTest } from "../src/lib/ai/smoke-test";

async function main(): Promise<void> {
  const result = await runSmokeTest();

  process.stdout.write(`\n  Endpoint   ${result.endpoint}\n`);
  process.stdout.write(`  Reachable  ${result.ok ? "yes" : "no"}\n`);

  if (result.jsonMode) {
    process.stdout.write(
      `  JSON mode  ${result.jsonMode}${result.repaired ? " (needed a correction)" : ""}\n`,
    );
  }
  if (result.usage) {
    process.stdout.write(
      `  Tokens     ${result.usage.inputTokens} in, ${result.usage.outputTokens} out\n`,
    );
  }
  process.stdout.write(`  Latency    ${(result.latencyMs / 1000).toFixed(1)}s\n`);
  process.stdout.write(`\n  ${result.summary}\n`);

  if (result.problem) {
    process.stdout.write(`\n  Problem: ${result.problem}\n`);
    process.exitCode = 1;
  }
  process.stdout.write("\n");
}

main().catch((cause: unknown) => {
  process.stderr.write(`${cause instanceof Error ? cause.stack : String(cause)}\n`);
  process.exitCode = 1;
});
