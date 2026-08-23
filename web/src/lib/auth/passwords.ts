import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Password hashing with scrypt from the standard library.
 *
 * No dependency: bcrypt and argon2 bindings both need a native build, which on
 * Windows means Visual Studio Build Tools — the single most likely thing to
 * derail setting this project up. scrypt is memory-hard, in Node itself, and
 * strong enough for a study tool that never exposes a login to the internet.
 *
 * Stored form is `scrypt$N$r$p$salt$hash`, so the parameters travel with the
 * hash and can be raised later without invalidating existing passwords.
 */

/**
 * `promisify` drops the overload that accepts cost parameters, so this wraps
 * the callback form directly rather than losing them.
 */
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

/** Cost parameters. 16384 × 8 needs ~16 MB, comfortably inside Node's default. */
const N = 16_384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export const MIN_PASSWORD_LENGTH = 10;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(password.normalize("NFKC"), salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
  });

  return [
    "scrypt",
    N,
    R,
    P,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * Constant-time comparison. Returns false rather than throwing on a malformed
 * stored value, so a corrupt row cannot be told apart from a wrong password.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  try {
    const [scheme, n, r, p, saltB64, hashB64] = stored.split("$");
    if (scheme !== "scrypt" || !n || !r || !p || !saltB64 || !hashB64) return false;

    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");

    const derived = await scryptAsync(password.normalize("NFKC"), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });

    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * Rejects passwords that are trivially guessable. Deliberately short of a full
 * policy: length is what actually helps, and rules that force a symbol mostly
 * produce `Password1!`.
 */
export function describePasswordProblem(password: string): string | null {
  const value = password.normalize("NFKC");

  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (value.length > 200) {
    return "That is longer than 200 characters.";
  }
  if (value.trim() === "") {
    return "A password cannot be only spaces.";
  }
  if (COMMON_PASSWORDS.has(value.toLowerCase())) {
    return "That password is too common. Choose something less predictable.";
  }
  if (/^(.)\1+$/.test(value)) {
    return "That is the same character repeated. Choose something less predictable.";
  }
  return null;
}

/** Not a real breach list — just the handful worth blocking outright. */
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password12",
  "password123",
  "passw0rd123",
  "1234567890",
  "12345678901",
  "123456789012",
  "qwertyuiop",
  "letmein123",
  "welcome123",
  "admin12345",
  "administrator",
  "changeme123",
  "iloveyou123",
]);
