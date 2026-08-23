import fs from "node:fs";
import path from "node:path";

/**
 * Clears the suite's database before any test process starts.
 *
 * Runs as a *global* setup, in the main process, so it completes before a
 * worker opens the store. Wiping from a setup file instead deleted the
 * directory out from under test files that were already using it.
 */
const DATA_DIR = path.resolve(process.cwd(), "data");
const TEST_DATA_DIR = path.resolve(DATA_DIR, "unit-test-pg");

export default function reset(): void {
  if (!path.basename(TEST_DATA_DIR).includes("test")) {
    throw new Error('Refusing to reset a directory without "test" in its name.');
  }
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.rmSync(`${TEST_DATA_DIR}-assets`, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
