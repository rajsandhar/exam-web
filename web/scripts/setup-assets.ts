/**
 * Copies the Pyodide runtime, the Monaco editor and the sql.js wasm binary into
 * `public/` so the exam runs entirely offline (CLAUDE.md §11, §12, §22).
 *
 *   pnpm setup:assets
 *
 * Both directories are gitignored: they are build outputs of `node_modules`,
 * not source. Serving them locally rather than from a CDN also means a student
 * sitting a paper cannot be interrupted by a network failure, and no request
 * leaves the machine mid-examination.
 */
import fs from "node:fs";
import path from "node:path";

import { APP_ROOT } from "../src/lib/paths";

const PUBLIC_DIR = path.join(APP_ROOT, "public");

/** Files Pyodide does not need at runtime. */
const PYODIDE_SKIP = /\.(map|html|md)$/i;

function copyDir(from: string, to: string, skip?: RegExp): number {
  fs.mkdirSync(to, { recursive: true });
  let copied = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copied += copyDir(source, target, skip);
    } else if (!skip?.test(entry.name)) {
      fs.copyFileSync(source, target);
      copied += 1;
    }
  }
  return copied;
}

function resolvePackageDir(packageName: string, marker: string): string {
  // `require.resolve` from the app root finds the pnpm-linked location.
  const start = path.join(APP_ROOT, "node_modules", packageName);
  if (fs.existsSync(path.join(start, marker))) return start;
  throw new Error(
    `Could not find ${packageName} (looked for ${marker} in ${start}). Run pnpm install first.`,
  );
}

function main(): void {
  const pyodideSource = resolvePackageDir("pyodide", "pyodide.asm.wasm");
  const pyodideTarget = path.join(PUBLIC_DIR, "pyodide");
  fs.rmSync(pyodideTarget, { recursive: true, force: true });
  const pyodideFiles = copyDir(pyodideSource, pyodideTarget, PYODIDE_SKIP);

  const sqlJsSource = path.join(
    resolvePackageDir("sql.js", "package.json"),
    "dist",
  );
  const sqlJsTarget = path.join(PUBLIC_DIR, "sqljs");
  fs.rmSync(sqlJsTarget, { recursive: true, force: true });
  fs.mkdirSync(sqlJsTarget, { recursive: true });
  // Both the default and the browser build are copied: bundlers resolve
  // `sql.js` to the browser entry, which asks for `sql-wasm-browser.wasm`.
  // The asm.js fallbacks are several megabytes and are not copied.
  let sqlJsFiles = 0;
  for (const file of [
    "sql-wasm.wasm",
    "sql-wasm.js",
    "sql-wasm-browser.wasm",
    "sql-wasm-browser.js",
  ]) {
    fs.copyFileSync(path.join(sqlJsSource, file), path.join(sqlJsTarget, file));
    sqlJsFiles += 1;
  }

  const monacoSource = path.join(
    resolvePackageDir("monaco-editor", "package.json"),
    "min",
    "vs",
  );
  const monacoTarget = path.join(PUBLIC_DIR, "monaco", "vs");
  fs.rmSync(path.join(PUBLIC_DIR, "monaco"), { recursive: true, force: true });
  const monacoFiles = copyDir(monacoSource, monacoTarget);

  process.stdout.write(
    `Copied ${pyodideFiles} Pyodide file(s) to public/pyodide, ` +
      `${monacoFiles} Monaco file(s) to public/monaco/vs and ` +
      `${sqlJsFiles} sql.js file(s) to public/sqljs.\n`,
  );
}

main();
