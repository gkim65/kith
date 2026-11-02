// Chat logs: the log form with @mentions, each person's chat list, and connections implied by chats.

import { todayISO } from './data.js';
import { createSuggest, escapeHtml, formatDate, personSuggestions } from './html.js';

/**
 * logLinks(logs, links) -> link[]
 *
 * Connections implied by chats: people in the same chat, then people mentioned alongside those
 * present. Pairs already joined by an explicit link are left out.
 *
 *   - `logs`  — chat logs `{ with, mentions }` (person ids)
 *   - `links` — explicit connections `{ source, target }`
 *
 * Returns links `{ source, target, label, kind: 'log' }`.
 */
export function logLinks(logs, links) {
  const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const seen = new Set(links.map((l) => key(l.source, l.target)));
  const out = [];
  const add = (a, b, label) => {
    if (a === b || seen.has(key(a, b))) return;
    seen.add(key(a, b));
    out.push({ source: a, target: b, label, kind: 'log' });
  };
  logs.forEach((log) => log.with.forEach((a, i) => log.with.slice(i + 1).forEach((b) => add(a, b, 'in a chat together'))));
  logs.forEach((log) => log.with.forEach((a) => log.mentions.forEach((m) => add(a, m, 'came up in a chat'))));
  return out;
}

/**
 * logText(logs) -> Map<string, string>
 *
 * All chat notes each person appears in (present or mentioned), for search.
 *
 *   - `logs` — chat logs
 *
 * Returns concatenated note text by person id.
 */
export function logText(logs) {
  const text = new Map();
  logs.forEach((log) => [...log.with, ...log.mentions].forEach((id) => text.set(id, `${text.get(id) || ''} ${log.note}`)));
  return text;
}

/**
 * noteHtml(note, mentionIds, people) -> string
 *
 * Escape a chat note and turn each `@Name` of a mentioned person into a clickable link.
 *
 *   - `note`       — note text as typed
 *   - `mentionIds` — ids of the people mentioned in it
 *   - `people`     — everyone, for names
 *
 * Returns an HTML string.
 */
function noteHtml(note, mentionIds, people) {
  const named = mentionIds.map((id) => people.find((p) => p.id === id)).filter(Boolean)
    .sort((a, b) => b.name.length - a.name.length);
  // Swap mentions for placeholders first so a short name cannot match inside a longer one.
  let html = escapeHtml(note);
  named.forEach((p, i) => { html = html.split(escapeHtml(`@${p.name}`)).join(`\u0000${i}\u0000`); });
  return html.replace(/\u0000(\d+)\u0000/g, (_, i) => {
    const p = named[Number(i)];
    return `<button class="mention" data-id="${escapeHtml(p.id)}">@${escapeHtml(p.name)}</button>`;
  });
}

/**
 * logListHtml(logs, personId, people) -> string
 *
 * The chats a person was in or mentioned in, newest first.
 *
 *   - `logs`     — all chat logs
 *   - `personId` — whose chats to list
 *   - `people`   — everyone, for names
 *
 * Returns `<li>` items as an HTML string ('' when there are none).
 */
export function logListHtml(logs, personId, people) {
  const nameOf = (id) => (people.find((p) => p.id === id) || { name: '?' }).name;
  return logs
    .filter((l) => l.with.includes(personId) || l.mentions.includes(personId))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((log) => {
      const present = log.with.includes(personId);
      const others = log.with.filter((id) => id !== personId).map(nameOf);
      const who = present ? (others.length ? `with ${others.join(', ')}` : '') : `mentioned · with ${others.join(', ')}`;
      return `<li class="log">
        <div class="log-head"><span class="log-date">${formatDate(log.date)}</span>
          <span class="rel">${escapeHtml(who)}</span>
          <button class="mini log-edit" data-log="${escapeHtml(log.id)}">edit</button></div>
        ${log.note ? `<p class="log-note">${noteHtml(log.note, log.mentions, people)}</p>` : ''}
      </li>`;
    }).join('');
}

/**
 * renderLogForm(inner, { log, people, presetIds }, { onSave, onCancel, onDelete })
 *
 * Fill the panel with the chat form. People are chosen by typing; a name nobody has yet is added
 * as someone new when the chat is saved. Typing @ in the note suggests people to mention.
 *
 *   - `inner`     — the panel content element
 *   - `log`       — the chat to edit, or null for a new one
 *   - `people`    — everyone
 *   - `presetIds` — people to start a new chat with (e.g. whoever's panel was open)
 *   - `onSave`    — called with `{ id, date, note, with, mentions }`, where `with` and `mentions`
 *                   are `{ id, name }` entries and `id` is null for someone new
 *   - `onCancel`  — called when the form is abandoned
 *   - `onDelete`  — called with the chat id after the delete is confirmed
 */
export function renderLogForm(inner, { log, people, presetIds = [] }, { onSave, onCancel, onDelete }) {
  const entry = (id) => ({ id, name: (people.find((p) => p.id === id) || { name: '?' }).name });
  const draft = log
    ? { id: log.id, date: log.date, note: log.note, with: log.with.map(entry), mentions: log.mentions.map(entry) }
    : { id: null, date: todayISO(), note: '', with: presetIds.map(entry), mentions: [] };

  inner.innerHTML = `
    <form class="editor log-form" novalidate>
      <h2>${log ? 'Edit chat' : 'Log a chat'}</h2>
      <label class="field"><span>Date</span>
        <input name="date" type="date" max="${todayISO()}" value="${draft.date}" /></label>
      <div class="field"><span>Who you talked with</span>
        <div class="tag-editor with-editor">
          <span class="tag-chips"></span>
          <input class="with-input" placeholder="type a name…" autocomplete="off" />
        </div></div>
      <div class="field-error" data-for="with" hidden>add at least one person</div>
      <div class="field"><span>Note</span>
        <textarea name="note" rows="6" placeholder="what did you talk about? type @ to mention someone">${escapeHtml(draft.note)}</textarea></div>
      <p class="form-hint">Saving updates "last talked" for everyone you talked with, unless they already have a later date.</p>
      <div class="editor-actions">
        ${log ? '<button type="button" class="btn btn-danger delete">delete</button>' : ''}
        <span class="spacer"></span>
        <button type="button" class="btn btn-ghost cancel">cancel</button>
        <button type="submit" class="btn btn-primary">save</button>
      </div>
    </form>`;

  const form = inner.querySelector('form');
  const chips = inner.querySelector('.with-editor .tag-chips');
  const withInput = inner.querySelector('.with-input');
  const note = form.elements.note;
  const withSuggest = createSuggest(inner.querySelector('.with-editor'));
  const noteSuggest = createSuggest(note);

  function drawWith() {
    chips.innerHTML = draft.with.map((w, i) => `<span class="edit-chip${w.id ? '' : ' new'}">${escapeHtml(w.name)}`
      + `${w.id ? '' : ' <em>new</em>'}<button type="button" data-i="${i}" aria-label="Remove ${escapeHtml(w.name)}">×</button></span>`).join('');
    chips.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      draft.with.splice(Number(b.dataset.i), 1);
      drawWith();
    }));
  }

  const chosenIds = () => draft.with.map((w) => w.id).filter(Boolean);
  function addWith(item) {
    const known = item.id ? item : people.find((p) => p.name.toLowerCase() === item.name.toLowerCase());
    const add = known ? { id: known.id, name: known.name } : { id: null, name: item.name };
    const dup = draft.with.some((w) => (add.id ? w.id === add.id : w.name.toLowerCase() === add.name.toLowerCase()));
    if (!dup && add.name) draft.with.push(add);
    withInput.value = '';
    withSuggest.hide();
    drawWith();
  }

  withInput.addEventListener('input', () => {
    const q = withInput.value.trim();
    if (q) withSuggest.show(personSuggestions(people, q, chosenIds()), addWith);
    else withSuggest.hide();
  });
  withInput.addEventListener('keydown', (e) => {
    if (withSuggest.key(e)) return;
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (withInput.value.trim()) addWith({ id: null, name: withInput.value.trim() });
    }
    if (e.key === 'Backspace' && !withInput.value && draft.with.length) { draft.with.pop(); drawWith(); }
  });
  withInput.addEventListener('blur', () => setTimeout(() => withSuggest.hide(), 100));

  // The @word just before the caret, if the caret is inside one.
  const mentionAtCaret = () => {
    const before = note.value.slice(0, note.selectionStart);
    const m = before.match(/@([^@\n]{0,40})$/);
    return m && !m[1].startsWith(' ') ? m : null;
  };
  function mention(item) {
    const m = mentionAtCaret();
    if (!m) return;
    const start = note.selectionStart - m[0].length;
    const text = `@${item.name} `;
    note.value = note.value.slice(0, start) + text + note.value.slice(note.selectionStart);
    note.selectionStart = note.selectionEnd = start + text.length;
    const dup = draft.mentions.some((x) => (item.id ? x.id === item.id : x.name.toLowerCase() === item.name.toLowerCase()));
    if (!dup) draft.mentions.push({ id: item.id, name: item.name });
    note.focus();
  }
  const updateMentions = () => {
    const m = mentionAtCaret();
    if (m) noteSuggest.show(personSuggestions(people, m[1]), mention);
    else noteSuggest.hide();
  };
  note.addEventListener('input', updateMentions);
  note.addEventListener('click', updateMentions);
  note.addEventListener('keydown', (e) => { noteSuggest.key(e); });
  note.addEventListener('blur', () => setTimeout(() => noteSuggest.hide(), 100));

  drawWith();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (withInput.value.trim()) addWith({ id: null, name: withInput.value.trim() });
    inner.querySelector('[data-for="with"]').hidden = draft.with.length > 0;
    if (!draft.with.length) return;
    const text = note.value.trim();
    // Keep only mentions whose @Name is still in the note and who were not in the chat itself.
    const mentions = draft.mentions.filter((m) => text.includes(`@${m.name}`)
      && !draft.with.some((w) => (m.id ? w.id === m.id : w.name.toLowerCase() === m.name.toLowerCase())));
    onSave({ id: draft.id, date: form.elements.date.value || todayISO(), note: text, with: draft.with, mentions });
  });

  inner.querySelector('.cancel').addEventListener('click', onCancel);
  const del = inner.querySelector('.delete');
  if (del) {
    del.addEventListener('click', () => {
      if (window.confirm('Delete this chat? Last talked dates stay as they are; change them in edit if needed.')) onDelete(log.id);
    });
  }

  if (draft.with.length) note.focus();
  else withInput.focus();
}
