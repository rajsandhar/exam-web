/**
 * The Build Trial selection, persisted in `localStorage`.
 *
 * `localStorage` is the source of truth rather than React state, so the
 * selector can read it through `useSyncExternalStore`. That removes the
 * rehydrate-then-setState effect that would otherwise run on every mount, and
 * it means the results screen's "Practise this" link can write a selection that
 * an already-open Build Trial tab picks up immediately.
 */

const STORAGE_KEY = "hsc-se.selected-syllabus-items.v1";
const CHANGE_EVENT = "hsc-se:selection-changed";

const EMPTY = "[]";

export function subscribeToSelection(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  // `storage` fires for changes made in other tabs.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Raw snapshot. Returning the stored string keeps the value referentially stable. */
export function selectionSnapshot(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? EMPTY;
  } catch {
    return EMPTY;
  }
}

/** The server has no storage, so it always renders an empty selection. */
export function selectionServerSnapshot(): string {
  return EMPTY;
}

export function parseSelection(raw: string, valid?: ReadonlySet<string>): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (value): value is string =>
        typeof value === "string" && (valid === undefined || valid.has(value)),
    );
  } catch {
    return [];
  }
}

export function writeSelection(ids: readonly string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Private browsing or a full quota: the selection simply is not remembered.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
