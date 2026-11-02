// Page chrome: theme toggle, legend, and the person detail panel.

import { daysSince } from './data.js';
import { recencyColor } from './graph.js';

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
    .join('') + '<span class="legend-note">size and colour: time since last chat</span>';
}

/**
 * showPerson(panel, person, people, links, onPick)
 *
 * Show one person's details in the side panel, or hide the panel when `person` is null.
 *
 *   - `panel`  — the `<aside>` element
 *   - `person` — the selected person, or null
 *   - `people` — all people, used to name connections
 *   - `links`  — `{ source, target, label }` with person ids
 *   - `onPick` — called with a person id when a connection's name is clicked
 */
export function showPerson(panel, person, people, links, onPick) {
  if (!person) { panel.hidden = true; return; }
  const byId = new Map(people.map((p) => [p.id, p]));
  const days = daysSince(person.lastChat);
  const conns = links
    .filter((l) => l.source === person.id || l.target === person.id)
    .map((l) => ({ other: byId.get(l.source === person.id ? l.target : l.source), label: l.label }));

  panel.innerHTML = `
    <button class="btn btn-ghost close" aria-label="Close">close</button>
    <h2>${escapeHtml(person.name)}</h2>
    <div class="when">last talked ${days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`}
      · check in every ${person.cadenceDays} days</div>
    <div class="chips">${person.tags.map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join('')}</div>
    <h3>How you know them</h3>
    <p>${escapeHtml(person.howMet)}</p>
    <h3>Notes</h3>
    <p>${escapeHtml(person.notes)}</p>
    <h3>Connections</h3>
    <ul>${conns.map((c) => `<li><button class="linkish" data-id="${escapeHtml(c.other.id)}">${escapeHtml(c.other.name)}</button>
      <span class="rel">· ${escapeHtml(c.label)}</span></li>`).join('') || '<li class="rel">none yet</li>'}</ul>`;
  panel.hidden = false;
  panel.querySelector('.close').addEventListener('click', () => onPick(null));
  panel.querySelectorAll('.linkish').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.id)));
}
