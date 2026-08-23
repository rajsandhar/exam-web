import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadEnvFiles, parseEnvFile } from "@/lib/env-file";

/**
 * `.env.local` is how a connection string reaches `pnpm db:migrate`, so what
 * this reader does with a line — and what it refuses to do to a variable the
 * shell already set — decides which database a migration lands in.
 */

const directories: string[] = [];

function withEnvFiles(files: Record<string, string>): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "env-file-"));
  directories.push(directory);
  for (const [name, contents] of Object.entries(files)) {
    fs.writeFileSync(path.join(directory, name), contents);
  }
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("parseEnvFile", () => {
  it("reads assignments, and ignores comments and blank lines", () => {
    expect(
      parseEnvFile(
        ["# a comment", "", "DATABASE_URL=./data/local-pg", "export AI_MODEL=some-model"].join(
          "\n",
        ),
      ),
    ).toEqual({ DATABASE_URL: "./data/local-pg", AI_MODEL: "some-model" });
  });

  it("keeps a connection string intact", () => {
    // '#' and '=' both appear in generated passwords, and neither ends a value.
    const url = "postgresql://postgres:pa#ss=word@db.example:6543/postgres?sslmode=require";
    expect(parseEnvFile(`DIRECT_DATABASE_URL="${url}"`)).toEqual({ DIRECT_DATABASE_URL: url });
  });

  it("drops a trailing comment from an unquoted value", () => {
    expect(parseEnvFile("GENERATION_PROVIDER=sample # the default")).toEqual({
      GENERATION_PROVIDER: "sample",
    });
  });
});

describe("loadEnvFiles", () => {
  it("never overrides what the shell exported", () => {
    const directory = withEnvFiles({ ".env.local": "DATABASE_URL=./data/local-pg" });
    const env = { DATABASE_URL: "postgresql://user:pw@db.example:5432/postgres" };

    expect(loadEnvFiles(directory, env)).toEqual([]);
    expect(env.DATABASE_URL).toBe("postgresql://user:pw@db.example:5432/postgres");
  });

  it("prefers .env.local over .env, and sets what is missing", () => {
    const directory = withEnvFiles({
      ".env.local": "DATABASE_URL=./data/local-pg",
      ".env": "DATABASE_URL=./data/committed\nAI_MODEL=some-model",
    });
    const env: Record<string, string | undefined> = {};

    expect(loadEnvFiles(directory, env).sort()).toEqual(["AI_MODEL", "DATABASE_URL"]);
    expect(env.DATABASE_URL).toBe("./data/local-pg");
  });

  it("does nothing when there is no env file", () => {
    const env: Record<string, string | undefined> = {};
    expect(loadEnvFiles(withEnvFiles({}), env)).toEqual([]);
    expect(env).toEqual({});
  });
});
