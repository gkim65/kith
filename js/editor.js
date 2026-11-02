// Person editor: the form the side panel switches to when adding or editing someone.

import { DEFAULT_CADENCE_DAYS, todayISO } from './data.js';
import { escapeHtml } from './html.js';
import { MAX_CADENCE_DAYS, splitCadence } from './ui.js';

/** Suggested labels for a connection between two people. */
const LINK_LABELS = ['introduced by', 'met through', 'friends', 'family', 'roommates', 'coworkers', 'classmates'];

/**
 * renderEditor(inner, { person, people, links, tags }, { onSave, onCancel, onDelete })
 *
 * Fill the panel with an add/edit form. Nothing changes until Save; Cancel throws the draft away.
 * A connection to a name nobody has yet is saved as `{ newName }` and becomes a new person.
 *
 *   - `inner`    — the panel content element
 *   - `person`   — the person to edit, or null to add someone new
 *   - `people`   — everyone, for the connection picker
 *   - `links`    — all connections `{ source, target, label }` (person ids)
 *   - `tags`     — every tag in use, offered as suggestions
 *   - `onSave`   — called with (person, their connections) after validation passes
 *   - `onCancel` — called when the edit is abandoned
 *   - `onDelete` — called with the person id after the delete is confirmed
 */
export function renderEditor(inner, { person, people, links, tags }, { onSave, onCancel, onDelete }) {
  const isNew = !person;
  const draft = person
    ? { ...person, tags: [...person.tags] }
    : { id: null, name: '', tags: [], howMet: '', notes: '', cadenceDays: DEFAULT_CADENCE_DAYS, lastChat: todayISO() };
  const draftLinks = person
    ? links.filter((l) => l.source === person.id || l.target === person.id).map((l) => ({ ...l }))
    : [];
  const others = people.filter((p) => !person || p.id !== person.id);
  const nameOf = (id) => (people.find((p) => p.id === id) || { name: '?' }).name;
  const [cadN, cadU] = splitCadence(draft.cadenceDays);

  inner.innerHTML = `
    <form class="editor" novalidate>
      <h2>${isNew ? 'Add someone' : 'Edit'}</h2>
      <label class="field"><span>Name</span>
        <input name="name" autocomplete="off" maxlength="80" value="${escapeHtml(draft.name)}" /></label>
      <div class="field-error" data-for="name" hidden>add a name</div>

      <label class="field"><span>Last talked</span>
        <input name="lastChat" type="date" max="${todayISO()}" value="${escapeHtml(draft.lastChat)}" /></label>

      <div class="field"><span>Check in every</span>
        <div class="inline">
          <input name="cadN" class="short" type="number" min="1" step="1" inputmode="numeric" value="${cadN}" />
          <select name="cadU" title="a month counts as 30 days">
            <option value="1"${cadU === 1 ? ' selected' : ''}>days</option>
            <option value="7"${cadU === 7 ? ' selected' : ''}>weeks</option>
            <option value="30"${cadU === 30 ? ' selected' : ''}>months</option>
          </select>
        </div></div>
      <div class="field-error" data-for="cadence" hidden>use a whole number, from 1 day up to 2 years</div>

      <div class="field"><span>Tags</span>
        <div class="tag-editor">
          <span class="tag-chips"></span>
          <input class="tag-input" list="tag-options" placeholder="add a tag…" autocomplete="off" />
        </div>
        <datalist id="tag-options">${tags.map((t) => `<option value="${escapeHtml(t)}"></option>`).join('')}</datalist>
      </div>

      <label class="field"><span>How you know them</span>
        <input name="howMet" autocomplete="off" value="${escapeHtml(draft.howMet)}" /></label>

      <label class="field"><span>Notes</span>
        <textarea name="notes" rows="4">${escapeHtml(draft.notes)}</textarea></label>

      <div class="field"><span>Connected to</span>
        <ul class="conn-list"></ul>
        <div class="inline conn-add">
          <input class="conn-person" list="conn-people" placeholder="someone's name…" autocomplete="off" aria-label="Person to connect" />
          <datalist id="conn-people">${others.map((p) => `<option value="${escapeHtml(p.name)}"></option>`).join('')}</datalist>
          <input class="conn-label" list="link-labels" value="introduced by" aria-label="How they are connected" />
          <button type="button" class="btn conn-add-btn">add</button>
        </div>
        <datalist id="link-labels">${LINK_LABELS.map((l) => `<option value="${l}"></option>`).join('')}</datalist>
      </div>

      <div class="editor-actions">
        ${isNew ? '' : '<button type="button" class="btn btn-danger delete">delete</button>'}
        <span class="spacer"></span>
        <button type="button" class="btn btn-ghost cancel">cancel</button>
        <button type="submit" class="btn btn-primary">save</button>
      </div>
    </form>`;

  const form = inner.querySelector('form');
  const chipsEl = inner.querySelector('.tag-chips');
  const tagInput = inner.querySelector('.tag-input');
  const connList = inner.querySelector('.conn-list');

  function drawTags() {
    chipsEl.innerHTML = draft.tags.map((t, i) => `<span class="edit-chip">${escapeHtml(t)}`
      + `<button type="button" data-i="${i}" aria-label="Remove ${escapeHtml(t)}">×</button></span>`).join('');
    chipsEl.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      draft.tags.splice(Number(b.dataset.i), 1);
      drawTags();
    }));
  }

  // A typed tag reuses an existing tag's spelling when it matches ignoring case.
  function addTag() {
    const typed = tagInput.value.replace(/,/g, ' ').trim();
    tagInput.value = '';
    if (!typed) return;
    const tag = tags.find((t) => t.toLowerCase() === typed.toLowerCase()) || typed;
    if (!draft.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) draft.tags.push(tag);
    drawTags();
  }

  tagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
    if (e.key === 'Backspace' && !tagInput.value && draft.tags.length) { draft.tags.pop(); drawTags(); }
  });
  tagInput.addEventListener('change', addTag);

  function drawConns() {
    connList.innerHTML = draftLinks.map((l, i) => {
      const other = l.source === draft.id ? l.target : l.source;
      const name = l.newName ? `${escapeHtml(l.newName)} <em class="rel">new</em>` : escapeHtml(nameOf(other));
      return `<li>${name} <span class="rel">· ${escapeHtml(l.label)}</span>`
        + `<button type="button" class="mini" data-i="${i}">remove</button></li>`;
    }).join('') || '<li class="rel">no one yet</li>';
    connList.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      draftLinks.splice(Number(b.dataset.i), 1);
      drawConns();
    }));
  }

  inner.querySelector('.conn-add-btn').addEventListener('click', () => {
    const typed = inner.querySelector('.conn-person').value.trim();
    const label = inner.querySelector('.conn-label').value.trim() || 'friends';
    if (!typed) return;
    const known = others.find((p) => p.name.toLowerCase() === typed.toLowerCase());
    const dup = known
      ? draftLinks.some((l) => l.source === known.id || l.target === known.id)
      : draftLinks.some((l) => l.newName && l.newName.toLowerCase() === typed.toLowerCase());
    if (!dup) draftLinks.push(known ? { source: draft.id, target: known.id, label } : { source: draft.id, target: null, newName: typed, label });
    inner.querySelector('.conn-person').value = '';
    drawConns();
  });

  drawTags();
  drawConns();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    addTag();
    const f = form.elements;
    const name = f.name.value.trim();
    const n = Number(f.cadN.value);
    const days = n * Number(f.cadU.value);
    const cadenceOk = Number.isInteger(n) && n >= 1 && days <= MAX_CADENCE_DAYS;
    inner.querySelector('[data-for="name"]').hidden = !!name;
    inner.querySelector('[data-for="cadence"]').hidden = cadenceOk;
    if (!name || !cadenceOk) return;
    onSave({
      ...draft,
      name,
      lastChat: f.lastChat.value,
      cadenceDays: days,
      howMet: f.howMet.value.trim(),
      notes: f.notes.value.trim(),
    }, draftLinks);
  });

  inner.querySelector('.cancel').addEventListener('click', onCancel);
  const del = inner.querySelector('.delete');
  if (del) {
    del.addEventListener('click', () => {
      const msg = `Delete ${person.name}? This removes them, their connections, and any chat where they were the only one.`;
      if (window.confirm(msg)) onDelete(person.id);
    });
  }

  form.elements.name.focus();
}
