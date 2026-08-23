/**
 * Side-effecting entry point: import this first in any script that needs the
 * environment `.env.local` describes. The reader itself lives in
 * `src/lib/env-file.ts`, where it can be tested without loading anything.
 */
import { APP_ROOT } from "../src/lib/paths";
import { loadEnvFiles } from "../src/lib/env-file";

loadEnvFiles(APP_ROOT);
