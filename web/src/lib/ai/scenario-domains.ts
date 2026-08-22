/**
 * Fixed vocabulary of scenario domains (SPEC_ADDENDUM.md §3).
 *
 * The generator must pick from this list rather than inventing a tag. If the
 * model were free to invent them, the exclusion list passed into later
 * generations would stop matching and would silently do nothing — the paper
 * would keep repeating the same hospital breach and the same login form while
 * the novelty machinery reported success.
 */

export const SCENARIO_DOMAINS = [
  "healthcare-records",
  "school-timetabling",
  "retail-inventory",
  "public-transport",
  "local-government-services",
  "banking-payments",
  "agriculture-environment",
  "energy-utilities",
  "logistics-warehouse",
  "manufacturing-plant",
  "community-sport",
  "emergency-services",
  "libraries-archives",
  "tourism-accommodation",
  "media-streaming",
  "charity-volunteering",
  "veterinary-animal-care",
  "construction-trades",
  "recruitment-workforce",
  "research-laboratory",
] as const;

export type ScenarioDomain = (typeof SCENARIO_DOMAINS)[number];

export function isScenarioDomain(value: string): value is ScenarioDomain {
  return (SCENARIO_DOMAINS as readonly string[]).includes(value);
}

/**
 * Domains to steer away from, given recent fingerprints. Returns the least
 * recently used domains first so a caller can suggest fresh ground rather than
 * only forbidding old ground.
 */
export function freshDomains(
  recentlyUsed: readonly string[],
  count = 8,
): ScenarioDomain[] {
  const lastSeen = new Map<string, number>();
  recentlyUsed.forEach((domain, index) => {
    if (!lastSeen.has(domain)) lastSeen.set(domain, index);
  });

  return [...SCENARIO_DOMAINS]
    .sort((a, b) => {
      const aSeen = lastSeen.get(a) ?? Number.POSITIVE_INFINITY;
      const bSeen = lastSeen.get(b) ?? Number.POSITIVE_INFINITY;
      return bSeen - aSeen;
    })
    .slice(0, count);
}
