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

/**
 * matchesQuery(person, query, extra) -> boolean
 *
 * Case-insensitive search over a person's name, tags, how you met, notes, and any extra text.
 *
 *   - `person` — person object
 *   - `query`  — search text; blank matches everyone
 *   - `extra`  — more text to search, e.g. their chat notes, default ''
 *
 * Returns whether the person matches.
 */
export function matchesQuery(person, query, extra = '') {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [person.name, person.howMet, person.notes, extra, ...person.tags]
    .some((field) => String(field ?? '').toLowerCase().includes(q));
}

/**
 * seededRandom(seed) -> () => number
 *
 * Small deterministic random generator (mulberry32), so a given seed always gives the same picks.
 *
 *   - `seed` — integer seed
 *
 * Returns a function producing floats in [0, 1).
 */
export function seededRandom(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * hashString(text) -> number
 *
 * Turn text into a 32-bit integer seed (FNV-1a).
 *
 *   - `text` — any string
 *
 * Returns an unsigned 32-bit integer.
 */
export function hashString(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/**
 * lastNameKey(name) -> string
 *
 * Sort key that orders people by last name, then first name. The last word counts as the last name.
 *
 *   - `name` — full display name
 *
 * Returns a lowercase key.
 */
export function lastNameKey(name) {
  const parts = String(name).trim().split(/\s+/);
  return [parts[parts.length - 1], ...parts.slice(0, -1)].join(' ').toLowerCase();
}

/**
 * pickReachOut(people, seedText, count) -> person[]
 *
 * Choose people to suggest reaching out to: mostly overdue (the further someone has drifted, the
 * likelier they are picked) plus one person who is nearly or just due.
 *
 *   - `people`   — all people
 *   - `seedText` — seed string; the same text gives the same picks (e.g. today's date)
 *   - `count`    — how many to pick, default 5
 *
 * Returns up to `count` people, overdue picks first and the due pick last.
 */
export function pickReachOut(people, seedText, count = 5) {
  const rand = seededRandom(hashString(seedText));
  const ratio = new Map(people.map((p) => [p.id, driftRatio(p)]));
  const due = people.filter((p) => ratio.get(p.id) > 0.6 && ratio.get(p.id) <= 1);
  const pool = people.filter((p) => ratio.get(p.id) > 1);
  const picks = [];
  while (picks.length < count - (due.length ? 1 : 0) && pool.length) {
    const weights = pool.map((p) => Math.min(ratio.get(p.id), 6));
    let r = rand() * weights.reduce((a, b) => a + b, 0);
    let k = 0;
    while (k < pool.length - 1 && (r -= weights[k]) > 0) k++;
    picks.push(pool.splice(k, 1)[0]);
  }
  if (due.length) picks.push(due[Math.floor(rand() * due.length)]);
  // Too few overdue people: top up with whoever is closest to due.
  const rest = people.filter((p) => !picks.includes(p)).sort((a, b) => ratio.get(b.id) - ratio.get(a.id));
  while (picks.length < count && rest.length) picks.push(rest.shift());
  return picks;
}

/**
 * todayISO(today) -> string
 *
 * Local calendar date as `YYYY-MM-DD`.
 *
 *   - `today` — reference date (Date), defaults to now
 *
 * Returns the date string.
 */
export function todayISO(today = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}
