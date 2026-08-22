import { defineConfig } from "drizzle-kit";

import { resolveDatabaseFile } from "./src/lib/paths";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: resolveDatabaseFile() },
  strict: true,
  verbose: false,
});
