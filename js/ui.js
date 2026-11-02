// Page chrome: theme toggle, legend, sidebar lists, and the person detail panel.

import { DEFAULT_CADENCE_DAYS, daysSince, driftRatio, lastNameKey } from './data.js';
import { recencyColor, tagColor } from './graph.js';
import { escapeHtml, formatDate } from './html.js';
import { logListHtml } from './logs.js';

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


/**
 * showPerson(panel, person, { people, links, tags, logs }, { onPick, onTag, onCadence, onEdit, onLog, onEditLog })
 *
 * Slide the side panel open with one person's details, or slide it closed when `person` is null.
 *
 *   - `panel`  — the `<aside>` element
 *   - `person` — the selected person, or null
 *   - `people` — all people, used to name connections
 *   - `links`  — every connection `{ source, target, label, kind }` (person ids), chat ones included
 *   - `tags`   — every tag in use, for chip colours
 *   - `logs`   — all chat logs
 *   - `onPick` — called with a person id (or null to close) when a connection's name is clicked
 *   - `onTag`  — called with a tag name when one of their tags is clicked
 *   - `onCadence` — called with (person id, days) when their check-in cadence is changed
 *   - `onEdit` — called with the person id when the pencil button is clicked
 *   - `onLog`  — called with the person id to start a new chat with them
 *   - `onEditLog` — called with a chat id when its edit link is clicked
 */
export function showPerson(panel, person, { people, links, tags, logs }, { onPick, onTag, onCadence, onEdit, onLog, onEditLog }) {
  if (!person) { panel.classList.remove('open'); return; }
  const byId = new Map(people.map((p) => [p.id, p]));
  const conns = links
    .filter((l) => l.source === person.id || l.target === person.id)
    .map((l) => ({ other: byId.get(l.source === person.id ? l.target : l.source), label: l.label, kind: l.kind }));
  const chats = logListHtml(logs, person.id, people);

  const inner = panel.querySelector('.panel-inner');
  inner.innerHTML = `
    <button class="btn btn-ghost close" aria-label="Close">close</button>
    <h2>${escapeHtml(person.name)}</h2>
    <div class="when">last talked ${agoText(daysSince(person.lastChat))}${person.lastChat ? ` · ${formatDate(person.lastChat)}` : ''}</div>
    <div class="when cadence-row">check in every
      <input class="cadence-num" type="number" min="1" step="1" inputmode="numeric" aria-label="Check-in every how many" />
      <select class="cadence-unit" aria-label="Check-in unit" title="a month counts as 30 days">
        <option value="1">days</option><option value="7">weeks</option><option value="30">months</option>
      </select></div>
    <div class="hint" hidden>use a whole number, from 1 day up to 2 years</div>
    <div class="chips">${person.tags.map((t) => tagChip(t, tags, false)).join('')}</div>
    ${person.howMet ? `<h3>How you know them</h3><p>${escapeHtml(person.howMet)}</p>` : ''}
    ${person.notes ? `<h3>Notes</h3><p class="notes">${escapeHtml(person.notes)}</p>` : ''}
    <h3>Connected to</h3>
    <ul>${conns.map((c) => `<li><button class="linkish" data-id="${escapeHtml(c.other.id)}">${escapeHtml(c.other.name)}</button>
      <span class="rel">· ${escapeHtml(c.label)}</span></li>`).join('') || '<li class="rel">no one yet</li>'}</ul>
    <h3>Chats <button class="mini log-new">+ log a chat</button></h3>
    <ul class="log-list">${chats || '<li class="rel">no chats logged yet</li>'}</ul>`;
  inner.querySelectorAll('.mention').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.id)));
  inner.querySelectorAll('.log-edit').forEach((b) => b.addEventListener('click', () => onEditLog(b.dataset.log)));
  inner.querySelector('.log-new').addEventListener('click', () => onLog(person.id));
  const editBtn = panel.querySelector('.edit-btn');
  editBtn.hidden = false;
  editBtn.setAttribute('aria-label', `Edit ${person.name}`);
  editBtn.onclick = () => onEdit(person.id);
  inner.querySelector('.close').addEventListener('click', () => onPick(null));
  inner.querySelectorAll('.linkish').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.id)));
  inner.querySelectorAll('.tag-chip').forEach((b) => b.addEventListener('click', () => onTag(b.dataset.tag)));
  wireCadence(inner, person, onCadence);

  openPanel(panel);
}


/** Longest allowed check-in cadence (days). */
export const MAX_CADENCE_DAYS = 730;

/**
 * splitCadence(days) -> [number, number]
 *
 * Express a cadence in the largest unit that divides it evenly (months of 30 days, weeks, days).
 *
 *   - `days` — cadence (days)
 *
 * Returns [count, unit length in days].
 */
export function splitCadence(days) {
  if (days % 30 === 0) return [days / 30, 30];
  if (days % 7 === 0) return [days / 7, 7];
  return [days, 1];
}

/**
 * wireCadence(inner, person, onCadence)
 *
 * Fill and wire the "check in every [n] [unit]" editor. Anything that is not a whole number
 * between 1 day and 2 years is rejected: the old value comes back and a hint shows.
 *
 *   - `inner`     — panel content element holding the editor
 *   - `person`    — the person being shown
 *   - `onCadence` — called with (person id, days) when a valid new cadence is entered
 */
function wireCadence(inner, person, onCadence) {
  const num = inner.querySelector('.cadence-num');
  const unit = inner.querySelector('.cadence-unit');
  const hint = inner.querySelector('.hint');
  const names = { 1: 'day', 7: 'week', 30: 'month' };
  const plural = () => {
    const one = Number(num.value) === 1;
    [...unit.options].forEach((o) => { o.text = names[o.value] + (one ? '' : 's'); });
  };
  const show = (days) => { const [n, u] = splitCadence(days); num.value = n; unit.value = u; plural(); };
  show(person.cadenceDays);
  const commit = () => {
    const n = Number(num.value);
    const days = n * Number(unit.value);
    const ok = Number.isInteger(n) && n >= 1 && days <= MAX_CADENCE_DAYS;
    hint.hidden = ok;
    if (!ok) { show(person.cadenceDays); return; }
    if (days !== person.cadenceDays) onCadence(person.id, days);
  };
  num.addEventListener('input', plural);
  num.addEventListener('change', commit);
  num.addEventListener('keydown', (e) => { if (e.key === 'Enter') num.blur(); });
  unit.addEventListener('change', commit);
}

/**
 * initAbout(openBtn, dialog)
 *
 * Wire the about dialog: the header button opens it; the close button, Esc, or a click on the
 * backdrop closes it.
 *
 *   - `openBtn` — the header "about" button
 *   - `dialog`  — the `<dialog>` element
 */
export function initAbout(openBtn, dialog) {
  openBtn.addEventListener('click', () => dialog.showModal());
  dialog.querySelector('.close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
}

/**
 * openPanel(panel)
 *
 * Slide the side panel open, fading its content in when it was already open.
 *
 *   - `panel` — the `<aside>` element
 */
export function openPanel(panel) {
  if (panel.classList.contains('open')) {
    panel.querySelector('.panel-inner').animate(
      [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
      { duration: 280, easing: 'ease-out' });
  }
  panel.classList.add('open');
}

/**
 * showToast(message)
 *
 * Show a short message at the bottom of the screen for a few seconds.
 *
 *   - `message` — plain text to show
 */
export function showToast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.classList.remove('show'), 2800);
}

/**
 * askName(dialog, current) -> Promise<string|null>
 *
 * Ask for your first name in the name dialog.
 *
 *   - `dialog`  — the name `<dialog>`
 *   - `current` — the name to prefill, or ''
 *
 * Resolves to the trimmed name, or null if the dialog was dismissed.
 */
export function askName(dialog, current) {
  const input = dialog.querySelector('input');
  input.value = current;
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      const name = input.value.trim();
      resolve(dialog.returnValue === 'save' && name ? name : null);
    }, { once: true });
  });
}

/**
 * askYesNo(dialog, message, yes, no) -> Promise<boolean>
 *
 * Ask a yes/no question in the question dialog.
 *
 *   - `dialog`  — the question `<dialog>`
 *   - `message` — the question, plain text
 *   - `yes`     — label for the yes button, default 'yes'
 *   - `no`      — label for the no button, default 'no'
 *
 * Resolves to true for yes, false for no or a dismissed dialog.
 */
export function askYesNo(dialog, message, yes = 'yes', no = 'no') {
  dialog.querySelector('.ask-message').textContent = message;
  dialog.querySelector('button[value="yes"]').textContent = yes;
  dialog.querySelector('button[value="no"]').textContent = no;
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), { once: true });
  });
}

/** What the sync button says for each sync status, and whether clicking it does anything. */
const SYNC_LABELS = {
  local: 'connect Google Sheets',
  reconnect: 'reconnect to sync',
  syncing: 'syncing…',
  synced: 'synced',
  offline: 'offline · saved here',
  paused: 'sync paused',
};

/**
 * showSyncStatus(button, status)
 *
 * Update the header sync button for a status from `createSync`.
 *
 *   - `button` — the sync status `<button>`
 *   - `status` — 'local', 'reconnect', 'syncing', 'synced', 'offline' or 'paused'
 */
export function showSyncStatus(button, status) {
  button.dataset.status = status;
  button.querySelector('.sync-label').textContent = SYNC_LABELS[status] || status;
  button.title = status === 'synced' ? `synced at ${new Date().toLocaleTimeString()}` : '';
}
