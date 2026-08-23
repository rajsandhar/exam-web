/**
 * Client-side controller for the Pyodide worker (CLAUDE.md §11).
 *
 * The worker cannot be interrupted from inside — a `while True:` loop never
 * yields — so a timeout terminates the worker outright and the next run starts
 * a fresh one. Callers therefore never see a hung editor, and a student who
 * writes an infinite loop just gets a clear message.
 */

export type PythonResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  error: string | null;
  timedOut: boolean;
  /** Wall-clock milliseconds, for the hidden-test report. */
  durationMs: number;
};

export const PYTHON_TIMEOUT_MS = 10_000;
/** The first run also loads the ~14 MB runtime. */
export const PYTHON_STARTUP_TIMEOUT_MS = 45_000;

type PendingRun = {
  resolve: (result: PythonResult) => void;
  timer: number;
  startedAt: number;
};

export class PythonRunner {
  private worker: Worker | null = null;
  private pending = new Map<number, PendingRun>();
  private nextId = 1;
  private warmedUp = false;

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;

    // A module worker: classic workers are not supported by the bundler, and
    // Pyodide's own entry point is an ES module.
    const worker = new Worker("/python-worker.js", { type: "module" });
    worker.onmessage = (event: MessageEvent) => {
      const data = event.data as {
        id?: number;
        ok?: boolean;
        stdout?: string;
        stderr?: string;
        error?: string | null;
      };
      if (typeof data.id !== "number") return;

      const run = this.pending.get(data.id);
      if (!run) return;
      this.pending.delete(data.id);
      window.clearTimeout(run.timer);

      run.resolve({
        ok: data.ok ?? false,
        stdout: data.stdout ?? "",
        stderr: data.stderr ?? "",
        error: data.error ?? null,
        timedOut: false,
        durationMs: Date.now() - run.startedAt,
      });
    };

    worker.onerror = () => this.failAll("The Python environment could not start.");
    this.worker = worker;
    return worker;
  }

  /** Loads the runtime ahead of the student's first Run. */
  async warmUp(): Promise<void> {
    if (this.warmedUp) return;
    const result = await this.post("warmup", "", PYTHON_STARTUP_TIMEOUT_MS);
    // Only treat the runtime as warm if it genuinely started. Marking it warm
    // after a failed or timed-out warmup would give the student's first real
    // run the short timeout while the 14 MB runtime was still downloading.
    this.warmedUp = result.ok;
  }

  async run(code: string): Promise<PythonResult> {
    const timeout = this.warmedUp ? PYTHON_TIMEOUT_MS : PYTHON_STARTUP_TIMEOUT_MS;
    const result = await this.post("run", code, timeout);
    if (!result.timedOut) this.warmedUp = true;
    return result;
  }

  private post(kind: string, code: string, timeoutMs: number): Promise<PythonResult> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    const startedAt = Date.now();

    return new Promise<PythonResult>((resolve) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        // The only way to stop a runaway loop is to end the worker.
        this.terminate();
        resolve({
          ok: false,
          stdout: "",
          stderr: "",
          error:
            "Your code was stopped after " +
            `${Math.round(timeoutMs / 1000)} seconds. Check for a loop that never ends.`,
          timedOut: true,
          durationMs: Date.now() - startedAt,
        });
      }, timeoutMs);

      this.pending.set(id, { resolve, timer, startedAt });
      worker.postMessage({ id, kind, code });
    });
  }

  private failAll(message: string): void {
    for (const [id, run] of this.pending) {
      window.clearTimeout(run.timer);
      this.pending.delete(id);
      run.resolve({
        ok: false,
        stdout: "",
        stderr: "",
        error: message,
        timedOut: false,
        durationMs: Date.now() - run.startedAt,
      });
    }
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.warmedUp = false;
    this.failAll("The Python environment was restarted.");
  }
}

/**
 * Builds the program that runs one hidden test.
 *
 * Hidden tests never reach the browser during the attempt — this is used at
 * marking time only (CLAUDE.md §11).
 */
export function buildHiddenTestProgram(studentCode: string, call: string): string {
  return [
    studentCode,
    "",
    "# --- assessment harness ---",
    "import json as __json",
    "try:",
    `    __result = ${call}`,
    "    print('__RESULT__' + __json.dumps(__result, default=str))",
    "except Exception as __exc:",
    "    print('__ERROR__' + type(__exc).__name__ + ': ' + str(__exc))",
  ].join("\n");
}

export function parseHiddenTestOutput(stdout: string): {
  value: string | null;
  error: string | null;
} {
  for (const line of stdout.split("\n")) {
    if (line.startsWith("__RESULT__")) {
      return { value: line.slice("__RESULT__".length), error: null };
    }
    if (line.startsWith("__ERROR__")) {
      return { value: null, error: line.slice("__ERROR__".length) };
    }
  }
  return { value: null, error: "The test produced no result." };
}
