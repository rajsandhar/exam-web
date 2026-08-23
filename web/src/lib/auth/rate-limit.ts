/**
 * Sign-in throttling.
 *
 * In-memory and per-process, which is right for a single-process local
 * application and honest about its limits: restarting clears it. Its job is to
 * make an online guessing attack impractical, not to survive a determined
 * attacker with restart access.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

type Bucket = { count: number; firstAt: number };

const buckets = new Map<string, Bucket>();

export type ThrottleState = { allowed: boolean; retryAfterSeconds: number };

export function checkSignInAllowed(key: string): ThrottleState {
  const bucket = buckets.get(key);
  const now = Date.now();

  if (!bucket || now - bucket.firstAt > WINDOW_MS) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (bucket.count < MAX_ATTEMPTS) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.ceil((bucket.firstAt + WINDOW_MS - now) / 1000),
  };
}

export function recordFailedSignIn(key: string): void {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.firstAt > WINDOW_MS) {
    buckets.set(key, { count: 1, firstAt: now });
    return;
  }
  bucket.count += 1;
}

export function clearSignInAttempts(key: string): void {
  buckets.delete(key);
}

/** Test seam. */
export function __resetRateLimits(): void {
  buckets.clear();
}
