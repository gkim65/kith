// Data model helpers: derived values computed from people and chats.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Default number of days between chats before someone counts as overdue. */
export const DEFAULT_CADENCE_DAYS = 30;

/**
 * daysSince(isoDate, today) -> number
 *
 * Whole days elapsed between a calendar date and today.
 *
 *   - `isoDate` — date of the last chat, `YYYY-MM-DD`
 *   - `today`   — reference date (Date), defaults to now
 *
 * Returns days (integer, >= 0), or Infinity when `isoDate` is empty.
 */
export function daysSince(isoDate, today = new Date()) {
  if (!isoDate) return Infinity;
  const [y, m, d] = isoDate.split('-').map(Number);
  const then = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.round((now - then) / MS_PER_DAY));
}

/**
 * driftRatio(person, today) -> number
 *
 * How far through their check-in cadence someone is: 0 just talked, 1 due now, >1 overdue.
 *
 *   - `person` — object with `lastChat` (`YYYY-MM-DD`) and optional `cadenceDays` (days)
 *   - `today`  — reference date (Date), defaults to now
 *
 * Returns a dimensionless ratio (Infinity if they have never been logged).
 */
export function driftRatio(person, today = new Date()) {
  const cadence = person.cadenceDays || DEFAULT_CADENCE_DAYS;
  return daysSince(person.lastChat, today) / cadence;
}

/**
 * tagList(people) -> string[]
 *
 * Every tag used by anyone, sorted alphabetically (the order fixes each tag's colour).
 *
 *   - `people` — person objects with a `tags` array
 *
 * Returns unique tag names.
 */
export function tagList(people) {
  return [...new Set(people.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b));
}
