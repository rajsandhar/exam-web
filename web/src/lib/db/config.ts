/**
 * Which connection string the application uses, and where it came from.
 *
 * There are two sets of names for the same two connections. The repository has
 * always used `DATABASE_URL` and `DIRECT_DATABASE_URL`; Vercel's Supabase
 * integration injects its own — `POSTGRES_URL` for the pooled connection and
 * `POSTGRES_URL_NON_POOLING` for the direct one — and those are managed by the
 * integration, so they cannot be renamed to match. Both are accepted, ours
 * first, and every place that opens a database goes through here so the
 * application, the migration script and drizzle-kit cannot disagree about what
 * they are pointing at.
 */

/** A connection string, and the variable it was read from. */
export interface ResolvedDatabaseUrl {
  readonly url: string;
  /** For error messages: naming the wrong variable is what makes one fixable. */
  readonly variable: string;
}

/** What the application queries through — the pooled connection on a pooled host. */
export const DATABASE_URL_VARIABLES = ["DATABASE_URL", "POSTGRES_URL"] as const;

/**
 * What migrations run through.
 *
 * A pooler runs in transaction mode and cannot hold the advisory locks and
 * multi-statement DDL a migration needs, so the direct connection is preferred —
 * falling back to the pooled names for a database that has no pooler, where the
 * two are the same thing.
 */
export const DIRECT_DATABASE_URL_VARIABLES = [
  "DIRECT_DATABASE_URL",
  "POSTGRES_URL_NON_POOLING",
  ...DATABASE_URL_VARIABLES,
] as const;

export type Environment = Record<string, string | undefined>;

/** True on a serverless host, where only the temporary directory is writable. */
export function isReadOnlyHost(env: Environment = process.env): boolean {
  return Boolean(env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME);
}

/** A hosted database, rather than a directory for PGlite to write into. */
export function isPostgresUrl(url: string): boolean {
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

function resolve(variables: readonly string[], env: Environment): ResolvedDatabaseUrl | null {
  const present = variables
    .map((variable) => ({ variable, url: env[variable]?.trim() ?? "" }))
    .filter((candidate) => candidate.url.length > 0);

  // A host with no writable filesystem cannot use a local path at all, so a
  // stale one is stepped over in favour of a hosted connection string further
  // down the chain — which is exactly the state a project is left in when
  // `DATABASE_URL` was set by hand before the database was provisioned.
  //
  // Anywhere with a filesystem, order alone decides. Preferring a hosted
  // connection there would mean a developer who has pulled the deployment's
  // environment silently runs migrations and tests against production.
  if (isReadOnlyHost(env)) {
    const hosted = present.find((candidate) => isPostgresUrl(candidate.url));
    if (hosted) return hosted;
  }

  return present[0] ?? null;
}

export function resolveDatabaseUrl(env: Environment = process.env): ResolvedDatabaseUrl | null {
  return resolve(DATABASE_URL_VARIABLES, env);
}

export function resolveDirectDatabaseUrl(
  env: Environment = process.env,
): ResolvedDatabaseUrl | null {
  return resolve(DIRECT_DATABASE_URL_VARIABLES, env);
}

/** Both spellings of a variable, for a message that has to name what to set. */
function bothNames([ours, theirs]: readonly string[]): string {
  return `${ours} (or ${theirs}, which Vercel's Supabase integration sets)`;
}

export const NOTHING_CONFIGURED_MESSAGE =
  `DATABASE_URL is not set, and neither is POSTGRES_URL. Use a postgres:// ` +
  `connection string for a hosted database, or a directory path to run PGlite ` +
  `in-process.`;

/**
 * Why a local database cannot be used here, and what to set instead.
 *
 * PGlite writes to disk. On a read-only filesystem it fails deep inside the
 * WebAssembly runtime with nothing that names the cause, which is how the
 * original SQLite crash presented. Say it plainly instead.
 */
export function readOnlyHostMessage(resolved: ResolvedDatabaseUrl): string {
  return (
    `${resolved.variable} is "${resolved.url}", which runs PGlite against the ` +
    `local filesystem. This host has no writable filesystem, so it needs a ` +
    `hosted database: set ${bothNames(DATABASE_URL_VARIABLES)} to the pooled ` +
    `postgres:// connection string, and ` +
    `${bothNames(DIRECT_DATABASE_URL_VARIABLES)} to the direct one for migrations.`
  );
}
