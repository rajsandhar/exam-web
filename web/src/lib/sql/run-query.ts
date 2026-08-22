import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";

import type { TableSpec } from "@/lib/schemas/stimulus";

/**
 * In-browser SQL execution (CLAUDE.md §12).
 *
 * A temporary SQLite database is built from the question's structured table
 * definitions, the student's query runs against it, and the database is thrown
 * away. Nothing touches the server, and the question's own dataset is the only
 * data present.
 */

export type SqlTableDefinition = { name: string; table: TableSpec };

export type SqlResult = {
  ok: boolean;
  columns: string[];
  rows: string[][];
  error: string | null;
  /** True when the statement changed data rather than returning rows. */
  mutating: boolean;
};

let sqlJs: SqlJsStatic | null = null;

async function getSqlJs(): Promise<SqlJsStatic> {
  if (sqlJs) return sqlJs;
  // The wasm binary is copied into public/ by `pnpm setup:assets` equivalents;
  // sql.js resolves it relative to this locateFile result.
  sqlJs = await initSqlJs({ locateFile: (file) => `/sqljs/${file}` });
  return sqlJs;
}

/** Builds the question's dataset. Column types are inferred from the values. */
export function buildSchemaSql(tables: SqlTableDefinition[]): string {
  const statements: string[] = [];

  for (const { name, table } of tables) {
    const columns = table.columns.map((column, index) => {
      const values = table.rows.map((row) => row[index] ?? "");
      const numeric =
        values.length > 0 &&
        values.every((value) => value.trim() !== "" && !Number.isNaN(Number(value)));
      return `${quoteIdentifier(column)} ${numeric ? "NUMERIC" : "TEXT"}`;
    });

    statements.push(
      `CREATE TABLE ${quoteIdentifier(name)} (${columns.join(", ")});`,
    );

    for (const row of table.rows) {
      const values = table.columns.map((_, index) => quoteLiteral(row[index] ?? ""));
      statements.push(
        `INSERT INTO ${quoteIdentifier(name)} VALUES (${values.join(", ")});`,
      );
    }
  }

  return statements.join("\n");
}

export async function runQuery(
  tables: SqlTableDefinition[],
  query: string,
): Promise<SqlResult> {
  const SQL = await getSqlJs();
  let db: Database | null = null;

  try {
    db = new SQL.Database();
    db.run(buildSchemaSql(tables));

    const results = db.exec(query);
    if (results.length === 0) {
      // A statement that returns nothing — INSERT, UPDATE, CREATE.
      return { ok: true, columns: [], rows: [], error: null, mutating: true };
    }

    // Only the last result set is shown, matching how a SQL client behaves.
    const last = results[results.length - 1]!;
    return {
      ok: true,
      columns: last.columns,
      rows: last.values.map((row) => row.map((cell) => formatCell(cell))),
      error: null,
      mutating: false,
    };
  } catch (cause) {
    return {
      ok: false,
      columns: [],
      rows: [],
      error: cause instanceof Error ? cause.message : String(cause),
      mutating: false,
    };
  } finally {
    db?.close();
  }
}

/**
 * Compares a student's result against the expected one.
 *
 * Column order and row order matter only when the question says they do —
 * an `ORDER BY` question is order-sensitive, a plain `SELECT` is not.
 */
export function compareResults(
  actual: { columns: string[]; rows: string[][] },
  expected: TableSpec,
  orderSensitive: boolean,
): { matches: boolean; detail: string } {
  if (actual.columns.length !== expected.columns.length) {
    return {
      matches: false,
      detail: `Returned ${actual.columns.length} column(s); ${expected.columns.length} expected.`,
    };
  }
  if (actual.rows.length !== expected.rows.length) {
    return {
      matches: false,
      detail: `Returned ${actual.rows.length} row(s); ${expected.rows.length} expected.`,
    };
  }

  const normalise = (rows: string[][]) => {
    const mapped = rows.map((row) => row.map((cell) => cell.trim()).join(""));
    return orderSensitive ? mapped : [...mapped].sort();
  };

  const actualRows = normalise(actual.rows);
  const expectedRows = normalise(expected.rows);

  for (let index = 0; index < actualRows.length; index += 1) {
    if (actualRows[index] !== expectedRows[index]) {
      return {
        matches: false,
        detail: orderSensitive
          ? `Row ${index + 1} does not match the expected result.`
          : "The returned rows do not match the expected result.",
      };
    }
  }

  return { matches: true, detail: "The result matches the expected output." };
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Uint8Array) return "<binary>";
  return String(value);
}

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
