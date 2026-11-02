// Saving and loading your sky in this browser (localStorage). Google Sheets sync replaces this later.

import { DEFAULT_CADENCE_DAYS } from './data.js';

const KEY = 'kith_data';

/**
 * emptyStore() -> object
 *
 * A fresh, empty sky.
 *
 * Returns `{ version, me: { name }, people: [], links: [], logs: [] }`.
 */
export function emptyStore() {
  return { version: 1, me: { name: '' }, people: [], links: [], logs: [] };
}

/**
 * newId() -> string
 *
 * A unique id for a new person or chat.
 *
 * Returns a random id string.
 */
export function newId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * stubPerson(name) -> object
 *
 * A new person with only a name, for someone first mentioned in a chat or a connection.
 *
 *   - `name` — their name
 *
 * Returns a person with default fields and no last-talked date.
 */
export function stubPerson(name) {
  return { id: newId(), name, tags: [], howMet: '', notes: '', cadenceDays: DEFAULT_CADENCE_DAYS, lastChat: '' };
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
 * normalizeData(d) -> object
 *
 * Coerce a whole sky into the expected shape: people cleaned up, and connections and chats that
 * point at people who no longer exist dropped (a chat with nobody left in it goes too).
 *
 *   - `d` — sky-like object (from storage, the sheet, or a merge)
 *
 * Returns the sky in `emptyStore` shape.
 */
export function normalizeData(d) {
  const people = (Array.isArray(d.people) ? d.people : []).filter((p) => p && p.id != null && p.id !== '').map(normalizePerson);
  const ids = new Set(people.map((p) => p.id));
  const links = (Array.isArray(d.links) ? d.links : [])
    .filter((l) => l && ids.has(String(l.source)) && ids.has(String(l.target)) && String(l.source) !== String(l.target))
    .map((l) => ({ source: String(l.source), target: String(l.target), label: String(l.label ?? '') }));
  const logs = (Array.isArray(d.logs) ? d.logs : [])
    .filter((l) => l && /^\d{4}-\d{2}-\d{2}$/.test(l.date ?? ''))
    .map((l) => ({
      id: String(l.id ?? newId()),
      date: l.date,
      with: (Array.isArray(l.with) ? l.with : []).map(String).filter((id) => ids.has(id)),
      mentions: (Array.isArray(l.mentions) ? l.mentions : []).map(String).filter((id) => ids.has(id)),
      note: String(l.note ?? ''),
    }))
    .filter((l) => l.with.length > 0);
  return { version: 1, me: { name: String(d.me?.name ?? '') }, people, links, logs };
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
    return normalizeData(d);
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
