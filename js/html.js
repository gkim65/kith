// Small HTML helpers shared by the page modules.

/**
 * escapeHtml(text) -> string
 *
 * Escape user-written text before it goes into `innerHTML`.
 *
 *   - `text` — any value; null and undefined become ''
 *
 * Returns HTML-safe text.
 */
export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * formatDate(isoDate) -> string
 *
 * Friendly calendar date, e.g. "Nov 1, 2026", in the viewer's locale.
 *
 *   - `isoDate` — `YYYY-MM-DD`
 *
 * Returns the formatted date, or '' when `isoDate` is empty.
 */
export function formatDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * createSuggest(anchor) -> { show, hide, key }
 *
 * A dropdown of suggestions placed right after `anchor`, driven by the field that owns it.
 *
 *   - `anchor` — element the list is inserted after (its parent should be `position: relative`)
 *
 * Returns handles: `show(items, onChoose)` lists `{ label }` items and calls `onChoose(item)` on a
 * pick; `hide()`; `key(event)` handles arrow keys, Enter, Tab and Escape while the list is open
 * and returns true when it consumed the key.
 */
export function createSuggest(anchor) {
  const box = document.createElement('ul');
  box.className = 'suggest';
  box.hidden = true;
  anchor.after(box);
  let items = [];
  let active = 0;
  let choose = () => {};

  const draw = () => {
    box.innerHTML = items.map((it, i) => `<li class="${i === active ? 'active' : ''}${it.isNew ? ' new' : ''}" `
      + `data-i="${i}">${escapeHtml(it.label)}</li>`).join('');
  };
  function hide() { box.hidden = true; items = []; }
  function pick(i) { const it = items[i]; hide(); choose(it); }
  function show(list, onChoose) {
    items = list;
    active = 0;
    choose = onChoose;
    box.hidden = items.length === 0;
    draw();
  }
  function key(e) {
    if (box.hidden) return false;
    if (e.key === 'ArrowDown') { active = (active + 1) % items.length; draw(); }
    else if (e.key === 'ArrowUp') { active = (active - 1 + items.length) % items.length; draw(); }
    else if (e.key === 'Enter' || e.key === 'Tab') pick(active);
    else if (e.key === 'Escape') hide();
    else return false;
    e.preventDefault();
    e.stopPropagation();
    return true;
  }
  // mousedown, not click, so the pick lands before the field loses focus.
  box.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    e.preventDefault();
    pick(Number(li.dataset.i));
  });
  return { show, hide, key };
}

/**
 * personSuggestions(people, query, excludeIds) -> item[]
 *
 * People whose name contains `query` (names starting with it first), plus an "add as someone new"
 * item when the query is not already someone's exact name.
 *
 *   - `people`     — everyone
 *   - `query`      — typed text
 *   - `excludeIds` — ids already chosen, left out of the list
 *
 * Returns up to 7 items `{ label, id, name, isNew }`.
 */
export function personSuggestions(people, query, excludeIds = []) {
  const q = query.trim().toLowerCase();
  const found = people
    .filter((p) => !excludeIds.includes(p.id) && p.name.toLowerCase().includes(q))
    .sort((a, b) => (b.name.toLowerCase().startsWith(q) - a.name.toLowerCase().startsWith(q))
      || a.name.localeCompare(b.name))
    .slice(0, 6)
    .map((p) => ({ label: p.name, id: p.id, name: p.name, isNew: false }));
  const exact = people.some((p) => p.name.toLowerCase() === q);
  if (q.length >= 2 && !exact) found.push({ label: `add "${query.trim()}" as someone new`, id: null, name: query.trim(), isNew: true });
  return found;
}
