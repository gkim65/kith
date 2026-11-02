// Saving and loading your sky in this browser (localStorage). Google Sheets sync replaces this later.

import { DEFAULT_CADENCE_DAYS } from './data.js';

const KEY = 'kith_data';

/**
 * emptyStore() -> object
 *
 * A fresh, empty sky.
 *
 * Returns `{ version, me: { name }, people: [], links: [] }`.
 */
export function emptyStore() {
  return { version: 1, me: { name: '' }, people: [], links: [] };
}

/**
 * newId() -> string
 *
 * A unique id for a new person.
 *
 * Returns a random id string.
 */
export function newId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * normalizePerson(p) -> object
 *
 * Coerce a stored person into the expected shape, filling anything missing with defaults.
 *
 *   - `p` — person-like object read from storage
 *
 * Returns `{ id, name, tags, howMet, notes, cadenceDays, lastChat }`.
 */
function normalizePerson(p) {
  const cadence = Number(p.cadenceDays);
  return {
    id: String(p.id),
    name: String(p.name ?? '').trim() || 'unnamed',
    tags: Array.isArray(p.tags) ? p.tags.map(String).filter(Boolean) : [],
    howMet: String(p.howMet ?? ''),
    notes: String(p.notes ?? ''),
    cadenceDays: Number.isInteger(cadence) && cadence > 0 ? cadence : DEFAULT_CADENCE_DAYS,
    lastChat: /^\d{4}-\d{2}-\d{2}$/.test(p.lastChat ?? '') ? p.lastChat : '',
  };
}

/**
 * loadStore() -> object
 *
 * Read the saved sky from this browser.
 *
 * Returns the stored data in `emptyStore` shape, or an empty sky when nothing is saved.
 *
 * NOTE: unreadable saved data is copied to `kith_data_unreadable` before an empty sky is returned,
 * so the next save cannot silently destroy it.
 */
export function loadStore() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { return emptyStore(); }
  if (!raw) return emptyStore();
  try {
    const d = JSON.parse(raw);
    if (!d || !Array.isArray(d.people) || !Array.isArray(d.links)) throw new Error('bad shape');
    const people = d.people.filter((p) => p && p.id != null).map(normalizePerson);
    const ids = new Set(people.map((p) => p.id));
    const links = d.links
      .filter((l) => l && ids.has(String(l.source)) && ids.has(String(l.target)))
      .map((l) => ({ source: String(l.source), target: String(l.target), label: String(l.label ?? '') }));
    return { version: 1, me: { name: String(d.me?.name ?? '') }, people, links };
  } catch (e) {
    try { localStorage.setItem(`${KEY}_unreadable`, raw); } catch (e2) {}
    return emptyStore();
  }
}

/**
 * saveStore(data) -> boolean
 *
 * Write the whole sky to this browser.
 *
 *   - `data` — the sky in `emptyStore` shape
 *
 * Returns whether the save succeeded (false when storage is full or blocked).
 */
export function saveStore(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}
