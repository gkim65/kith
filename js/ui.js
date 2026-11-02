// Page chrome: theme toggle, legend, sidebar lists, and the person detail panel.

import { DEFAULT_CADENCE_DAYS, daysSince, driftRatio, lastNameKey } from './data.js';
import { recencyColor, tagColor } from './graph.js';

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
 * agoText(days) -> string
 *
 * Short human phrase for days since the last chat.
 *
 *   - `days` — whole days (Infinity when never logged)
 *
 * Returns text such as "today", "1 day ago", "12 days ago" or "never".
 */
function agoText(days) {
  if (!Number.isFinite(days)) return 'never';
  if (days === 0) return 'today';
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * initThemeToggle(button, onChange)
 *
 * Wire the light/dark button; the choice is remembered in this browser.
 *
 *   - `button`   — the toggle `<button>`
 *   - `onChange` — called after the theme switches, so colours can be re-read
 */
export function initThemeToggle(button, onChange) {
  const root = document.documentElement;
  const paint = () => { button.textContent = root.dataset.theme === 'dark' ? 'light' : 'dark'; };
  paint();
  button.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('kith_theme', root.dataset.theme); } catch (e) {}
    paint();
    onChange();
  });
}

/**
 * renderLegend(el)
 *
 * Fill the legend bar with the four recency colours for the current theme.
 *
 *   - `el` — the legend container
 */
export function renderLegend(el) {
  const items = [
    [0, 'just talked'],
    [1, 'due for a chat'],
    [2, 'overdue'],
    [4, 'drifting out of orbit'],
  ];
  el.innerHTML = items
    .map(([r, label]) => `<span><span class="dot" style="background:${recencyColor(r)}"></span>${label}</span>`)
    .join('') + '<span class="legend-note">closer to you means you talked more recently</span>';
}

/**
 * tagChip(tag, tags, active, extra) -> string
 *
 * HTML for one clickable tag with its colour dot.
 *
 *   - `tag`    — tag name
 *   - `tags`   — every tag in use, for the colour
 *   - `active` — whether this tag is currently lit
 *   - `extra`  — trusted HTML appended inside the button (e.g. a count), default ''
 *
 * Returns an HTML string.
 */
function tagChip(tag, tags, active, extra = '') {
  return `<button class="tag-chip${active ? ' active' : ''}" data-tag="${escapeHtml(tag)}">`
    + `<span class="tag-name"><span class="dot" style="background:${tagColor(tag, tags)}"></span>${escapeHtml(tag)}</span>${extra}</button>`;
}

/**
 * renderTagList(el, people, tags, litTags, onTag)
 *
 * List every tag, most-used first; clicking one toggles that group's light. A vertical list in the
 * desktop sidebar and a scrolling chip row on phones (layout is in style.css).
 *
 *   - `el`        — the tag list container
 *   - `people`    — all people, for the counts
 *   - `tags`      — every tag in use, from `tagList`
 *   - `litTags`   — Set of the tags currently lit
 *   - `onTag`     — called with a tag name when one is clicked
 */
export function renderTagList(el, people, tags, litTags, onTag) {
  const count = (t) => people.filter((p) => p.tags.includes(t)).length;
  const sorted = [...tags].sort((a, b) => count(b) - count(a) || a.localeCompare(b));
  el.innerHTML = sorted
    .map((t) => tagChip(t, tags, litTags.has(t), `<span class="count">${count(t)}</span>`)).join('');
  el.querySelectorAll('.tag-chip').forEach((b) => b.addEventListener('click', () => onTag(b.dataset.tag)));
}

/**
 * personRow(p, selectedId) -> string
 *
 * HTML for one clickable person row: recency dot, name, and time since the last chat.
 *
 *   - `p`          — person object
 *   - `selectedId` — the open person's id, or null
 *
 * Returns an HTML string.
 */
function personRow(p, selectedId) {
  return `
    <li><button class="person-row${p.id === selectedId ? ' active' : ''}" data-id="${escapeHtml(p.id)}">
      <span class="tag-name"><span class="dot" style="background:${recencyColor(driftRatio(p))}"></span>${escapeHtml(p.name)}</span>
      <span class="count">${agoText(daysSince(p.lastChat))}</span>
    </button></li>`;
}

/** People-list groups folded away by the viewer, remembered in this browser. */
const collapsed = new Set((() => {
  try { return JSON.parse(localStorage.getItem('kith_collapsed') || '[]'); } catch (e) { return []; }
})());

/**
 * renderPeopleList(el, people, selectedId, onPick)
 *
 * List people in two foldable groups: overdue (most days past due first), then everyone else
 * by last name.
 *
 *   - `el`         — the `<ul>` to fill
 *   - `people`     — the people to show (already filtered by search and tag)
 *   - `selectedId` — the open person's id, or null
 *   - `onPick`     — called with a person id when a row is clicked
 */
export function renderPeopleList(el, people, selectedId, onPick) {
  const pastDue = (p) => daysSince(p.lastChat) - (p.cadenceDays || DEFAULT_CADENCE_DAYS);
  const overdue = people.filter((p) => driftRatio(p) > 1).sort((a, b) => pastDue(b) - pastDue(a));
  const rest = people.filter((p) => driftRatio(p) <= 1)
    .sort((a, b) => lastNameKey(a.name).localeCompare(lastNameKey(b.name)));
  const group = (key, label, list) => {
    if (!list.length) return '';
    const open = !collapsed.has(key);
    return `<li class="group-label"><button class="group-toggle${open ? ' open' : ''}" data-group="${key}" aria-expanded="${open}">`
      + `<span class="chev"></span>${label} <span class="count">${list.length}</span></button></li>`
      + (open ? list.map((p) => personRow(p, selectedId)).join('') : '');
  };
  el.innerHTML = (group('overdue', 'overdue', overdue) + group('rest', 'everyone else', rest))
    || '<li class="empty">no one matches</li>';
  el.querySelectorAll('.person-row').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.id)));
  el.querySelectorAll('.group-toggle').forEach((b) => b.addEventListener('click', () => {
    if (collapsed.has(b.dataset.group)) collapsed.delete(b.dataset.group);
    else collapsed.add(b.dataset.group);
    try { localStorage.setItem('kith_collapsed', JSON.stringify([...collapsed])); } catch (e) {}
    renderPeopleList(el, people, selectedId, onPick);
  }));
}

/**
 * renderReachOut(el, picks, selectedId, onPick)
 *
 * Fill the "reach out today" list.
 *
 *   - `el`         — the `<ul>` to fill
 *   - `picks`      — people from `pickReachOut`
 *   - `selectedId` — the open person's id, or null
 *   - `onPick`     — called with a person id when a row is clicked
 */
export function renderReachOut(el, picks, selectedId, onPick) {
  el.innerHTML = picks.map((p) => personRow(p, selectedId)).join('') || '<li class="empty">everyone is up to date</li>';
  el.querySelectorAll('.person-row').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.id)));
}

/** Check-in cadence choices offered in the person panel: [days, label]. */
const CADENCES = [[7, 'week'], [14, '2 weeks'], [30, 'month'], [60, '2 months'], [90, '3 months'], [180, '6 months'], [365, 'year']];

/**
 * showPerson(panel, person, people, links, tags, { onPick, onTag, onCadence })
 *
 * Slide the side panel open with one person's details, or slide it closed when `person` is null.
 *
 *   - `panel`  — the `<aside>` element
 *   - `person` — the selected person, or null
 *   - `people` — all people, used to name connections
 *   - `links`  — `{ source, target, label }` with person ids
 *   - `tags`   — every tag in use, for chip colours
 *   - `onPick` — called with a person id (or null to close) when a connection's name is clicked
 *   - `onTag`  — called with a tag name when one of their tags is clicked
 *   - `onCadence` — called with (person id, days) when their check-in cadence is changed
 */
export function showPerson(panel, person, people, links, tags, { onPick, onTag, onCadence }) {
  if (!person) { panel.classList.remove('open'); return; }
  const byId = new Map(people.map((p) => [p.id, p]));
  const conns = links
    .filter((l) => l.source === person.id || l.target === person.id)
    .map((l) => ({ other: byId.get(l.source === person.id ? l.target : l.source), label: l.label }));

  const inner = panel.querySelector('.panel-inner');
  inner.innerHTML = `
    <button class="btn btn-ghost close" aria-label="Close">close</button>
    <h2>${escapeHtml(person.name)}</h2>
    <div class="when">last talked ${agoText(daysSince(person.lastChat))}</div>
    <label class="when">check in every
      <select class="cadence" aria-label="Check-in cadence">${cadenceOptions(person.cadenceDays)}</select></label>
    <div class="chips">${person.tags.map((t) => tagChip(t, tags, false)).join('')}</div>
    <h3>How you know them</h3>
    <p>${escapeHtml(person.howMet)}</p>
    <h3>Notes</h3>
    <p>${escapeHtml(person.notes)}</p>
    <h3>Connected to</h3>
    <ul>${conns.map((c) => `<li><button class="linkish" data-id="${escapeHtml(c.other.id)}">${escapeHtml(c.other.name)}</button>
      <span class="rel">· ${escapeHtml(c.label)}</span></li>`).join('') || '<li class="rel">no one yet</li>'}</ul>`;
  inner.querySelector('.close').addEventListener('click', () => onPick(null));
  inner.querySelectorAll('.linkish').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.id)));
  inner.querySelectorAll('.tag-chip').forEach((b) => b.addEventListener('click', () => onTag(b.dataset.tag)));
  inner.querySelector('.cadence').addEventListener('change', (e) => onCadence(person.id, Number(e.target.value)));

  if (panel.classList.contains('open')) {
    inner.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
      { duration: 280, easing: 'ease-out' });
  }
  panel.classList.add('open');
}

/**
 * cadenceOptions(current) -> string
 *
 * `<option>` list for the cadence picker; a non-preset current value is kept as its own option.
 *
 *   - `current` — the person's cadence (days)
 *
 * Returns an HTML string.
 */
function cadenceOptions(current) {
  const list = CADENCES.some(([d]) => d === current) ? CADENCES : [...CADENCES, [current, `${current} days`]]
    .sort((a, b) => a[0] - b[0]);
  return list.map(([d, label]) => `<option value="${d}"${d === current ? ' selected' : ''}>${label}</option>`).join('');
}
