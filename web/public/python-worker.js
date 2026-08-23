/*
 * Pyodide execution worker (CLAUDE.md §11).
 *
 * Student code runs here, in a Web Worker in the browser, never on the server.
 * The worker has no access to the host filesystem and no credentials, and the
 * obvious escape routes are removed below.
 *
 * An infinite loop cannot be interrupted from inside a worker, so the page
 * terminates the whole worker on timeout and starts a fresh one. Nothing here
 * keeps state that matters across runs.
 *
 * This is a module worker (`new Worker(url, { type: "module" })`) — classic
 * workers are not supported by the bundler — and it is served straight from
 * public/, so it is never bundled and uses plain JavaScript.
 */

import { loadPyodide } from "/pyodide/pyodide.mjs";

const HARDENING = `
import builtins

_blocked = (
    "urllib", "http", "socket", "requests", "ftplib", "smtplib",
    "telnetlib", "webbrowser", "subprocess", "multiprocessing",
    "ctypes", "pyodide_js", "js", "pyodide_http",
)

_real_import = builtins.__import__

def _guarded_import(name, *args, **kwargs):
    if name in _blocked or name.split(".")[0] in _blocked:
        raise ImportError(f"'{name}' is not available in the examination environment")
    return _real_import(name, *args, **kwargs)

def _no_input(*args, **kwargs):
    raise RuntimeError(
        "input() is not available; the examination provides test data directly"
    )

builtins.__import__ = _guarded_import
builtins.input = _no_input
`;

let pyodideReady = null;

function getPyodide() {
  if (!pyodideReady) {
    pyodideReady = (async () => {
      const pyodide = await loadPyodide({ indexURL: "/pyodide/" });
      pyodide.runPython(HARDENING);
      return pyodide;
    })();
  }
  return pyodideReady;
}

/** Runs one program, capturing stdout and stderr without leaking across runs. */
async function run(pyodide, code) {
  const stdout = [];
  const stderr = [];
  pyodide.setStdout({ batched: (line) => stdout.push(line) });
  pyodide.setStderr({ batched: (line) => stderr.push(line) });

  let error = null;
  try {
    // A fresh namespace per run: nothing a student defines survives into the
    // next run, so a passing test cannot depend on a previous one.
    const namespace = pyodide.toPy({});
    try {
      await pyodide.runPythonAsync(code, { globals: namespace });
    } finally {
      namespace.destroy();
    }
  } catch (cause) {
    error = String(cause && cause.message ? cause.message : cause);
  } finally {
    pyodide.setStdout({});
    pyodide.setStderr({});
  }

  return { stdout: stdout.join("\n"), stderr: stderr.join("\n"), error };
}

self.onmessage = async (event) => {
  const { id, kind, code } = event.data ?? {};

  try {
    const pyodide = await getPyodide();

    if (kind === "warmup") {
      self.postMessage({ id, ok: true, stdout: "", stderr: "", error: null });
      return;
    }

    const result = await run(pyodide, code ?? "");
    self.postMessage({ id, ok: result.error === null, ...result });
  } catch (cause) {
    self.postMessage({
      id,
      ok: false,
      stdout: "",
      stderr: "",
      error: String(cause && cause.message ? cause.message : cause),
    });
  }
};
