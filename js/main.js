// Entry point: wires the saved data, graph, and UI together.

import { makeSample } from './sample.js';
import { matchesQuery, pickReachOut, tagList, todayISO } from './data.js';
import { renderConstellation } from './graph.js';
import { loadStore, newId, saveStore, stubPerson } from './store.js';
import { createSync } from './sync.js';
import { sheetUrl } from './sheet.js';
import { renderEditor } from './editor.js';
import { logLinks, logText, renderLogForm } from './logs.js';
import {
  askName, askYesNo, initAbout, initThemeToggle, openPanel, renderLegend, renderPeopleList, renderReachOut,
  renderTagList, showPerson, showSyncStatus, showToast,
} from './ui.js';

const data = loadStore();
let tags = tagList(data.people);
let allLinks = data.links.concat(logLinks(data.logs, data.links));

const sky = document.getElementById('sky');
const panel = document.getElementById('panel');
const legend = document.getElementById('legend');
const tagListEl = document.getElementById('tag-list');
const peopleListEl = document.getElementById('people-list');
const peopleCount = document.getElementById('people-count');
const search = document.getElementById('search');
const clearTagsBtn = document.getElementById('clear-tags');
const reachEl = document.getElementById('reach-list');
const emptySky = document.getElementById('empty-sky');
const nameDialog = document.getElementById('name-dialog');
const askDialog = document.getElementById('ask-dialog');
const syncBtn = document.getElementById('sync-status');
const syncMenu = document.getElementById('sync-menu');
const phone = window.matchMedia('(max-width: 700px)');

// `editing` is set while a form is open (a person id, 'new', or 'log'); clicks elsewhere wait until it closes.
const state = { selectedId: null, litTags: new Set(), query: '', shuffles: 0, editing: null };
let graph;

// Today's suggestions stay put all day; "shuffle" rerolls them.
const reachPicks = () => pickReachOut(data.people, `${todayISO()}|${state.shuffles}`);
let reach = reachPicks();

/** Save in this browser and redraw. */
function persist() {
  if (!saveStore(data)) showToast('could not save in this browser; changes will be lost on reload');
  tags = tagList(data.people);
  allLinks = data.links.concat(logLinks(data.logs, data.links));
  reach = reachPicks();
  draw();
}

/** After any change to people, connections, or chats: save here first, then let sync carry it to the sheet. */
function commit() {
  persist();
  sync.changed();
}

const sync = createSync({
  getData: () => data,
  // A merge from the sheet: take it, save it here, and refresh whatever is open.
  applyData: (merged) => {
    data.me = merged.me;
    data.people = merged.people;
    data.links = merged.links;
    data.logs = merged.logs;
    persist();
    if (state.selectedId && !data.people.some((p) => p.id === state.selectedId)) {
      state.selectedId = null;
      if (!state.editing) panel.classList.remove('open');
    } else if (state.selectedId && !state.editing) {
      pick(state.selectedId);
    }
  },
  onStatus: (status) => showSyncStatus(syncBtn, status),
  ask: (message) => askYesNo(askDialog, message),
  notify: showToast,
});

/** Size of the sky hidden behind the open panel, so the camera centres in what is left. */
function obstruction() {
  if (!panel.classList.contains('open')) return { right: 0, bottom: 0 };
  return phone.matches ? { right: 0, bottom: panel.offsetHeight } : { right: panel.offsetWidth, bottom: 0 };
}

function refresh() {
  const chatText = logText(data.logs);
  const shown = data.people.filter((p) => matchesQuery(p, state.query, chatText.get(p.id))
    && (state.litTags.size === 0 || p.tags.some((t) => state.litTags.has(t))));
  const matches = state.query.trim() ? new Set(shown.map((p) => p.id)) : null;
  graph.highlight({ selectedId: state.selectedId, litTags: state.litTags, matches });
  renderTagList(tagListEl, data.people, tags, state.litTags, setTag);
  clearTagsBtn.hidden = state.litTags.size === 0;
  renderReachOut(reachEl, reach, state.selectedId, pick);
  renderPeopleList(peopleListEl, shown, state.selectedId, pick);
  peopleCount.textContent = shown.length === data.people.length
    ? data.people.length : `${shown.length} of ${data.people.length}`;
  emptySky.hidden = data.people.length > 0;
}

/** True (with a reminder) while the editor is open, so its draft is not lost to a stray click. */
function busyEditing() {
  if (state.editing) showToast('save or cancel your edit first');
  return !!state.editing;
}

function pick(id) {
  if (busyEditing()) return;
  const person = data.people.find((p) => p.id === id) || null;
  state.selectedId = person ? person.id : null;
  showPerson(panel, person, { people: data.people, links: allLinks, tags, logs: data.logs },
    { onPick: pick, onTag: setTag, onCadence: setCadence, onEdit: edit, onLog: (pid) => logChat(null, [pid]), onEditLog: (lid) => logChat(lid) });
  refresh();
  graph.focus(state.selectedId);
}

/** Open the editor for a person, or for someone new when `id` is null. */
function edit(id) {
  const person = id ? data.people.find((p) => p.id === id) : null;
  state.editing = id || 'new';
  panel.querySelector('.edit-btn').hidden = true;
  renderEditor(panel.querySelector('.panel-inner'), { person, people: data.people, links: data.links, tags }, {
    onSave: savePerson,
    onCancel: () => { state.editing = null; pick(id); },
    onDelete: deletePerson,
  });
  openPanel(panel);
}

/**
 * Find someone by exact name (ignoring case), or add them as a new person with just that name.
 * Names of anyone added are pushed onto `created`.
 */
function resolvePerson(entry, created) {
  if (entry.id) return entry.id;
  const known = data.people.find((p) => p.name.toLowerCase() === entry.name.toLowerCase());
  if (known) return known.id;
  const p = stubPerson(entry.name);
  data.people.push(p);
  created.push(p.name);
  return p.id;
}

/** Join names as "A", "A and B", or "A, B and C". */
const listNames = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

function savePerson(person, personLinks) {
  const isNew = !person.id;
  if (isNew) person.id = newId();
  if (isNew) data.people.push(person);
  else data.people[data.people.findIndex((p) => p.id === person.id)] = person;
  const created = [];
  const fixed = personLinks.map((l) => ({
    source: l.source || person.id,
    target: l.newName ? resolvePerson({ id: null, name: l.newName }, created) : (l.target || person.id),
    label: l.label,
  }));
  data.links = data.links.filter((l) => l.source !== person.id && l.target !== person.id).concat(fixed);
  state.editing = null;
  state.selectedId = person.id;
  commit();
  pick(person.id);
  const also = created.length ? ` · also added ${listNames(created)}` : '';
  showToast(`${isNew ? `added ${person.name}` : 'saved'}${also}`);
}

/** Open the chat form: a new chat with `presetIds`, or the existing chat `logId`. */
function logChat(logId, presetIds = []) {
  if (busyEditing()) return;
  const log = logId ? data.logs.find((l) => l.id === logId) : null;
  const returnTo = state.selectedId;
  state.editing = 'log';
  panel.querySelector('.edit-btn').hidden = true;
  renderLogForm(panel.querySelector('.panel-inner'), { log, people: data.people, presetIds }, {
    onSave: (draft) => saveLog(draft, returnTo),
    onCancel: () => { state.editing = null; pick(returnTo); },
    onDelete: (id) => {
      data.logs = data.logs.filter((l) => l.id !== id);
      state.editing = null;
      commit();
      pick(returnTo);
      showToast('chat deleted');
    },
  });
  openPanel(panel);
}

function saveLog(draft, returnTo) {
  const created = [];
  const withIds = [...new Set(draft.with.map((w) => resolvePerson(w, created)))];
  const mentionIds = [...new Set(draft.mentions.map((m) => resolvePerson(m, created)))].filter((id) => !withIds.includes(id));
  const log = { id: draft.id || newId(), date: draft.date, with: withIds, mentions: mentionIds, note: draft.note };
  const at = data.logs.findIndex((l) => l.id === log.id);
  if (at >= 0) data.logs[at] = log;
  else data.logs.push(log);

  // A chat moves "last talked" forward for everyone in it, never backward.
  const bumped = [];
  withIds.forEach((id) => {
    const p = data.people.find((x) => x.id === id);
    if (!p.lastChat || p.lastChat < log.date) { p.lastChat = log.date; bumped.push(p.name.split(/\s+/)[0]); }
  });

  state.editing = null;
  commit();
  pick(withIds.includes(returnTo) ? returnTo : withIds[0]);
  const parts = ['chat saved'];
  if (bumped.length) parts.push(`last talked updated for ${listNames(bumped)}`);
  if (created.length) parts.push(`added ${listNames(created)}`);
  showToast(parts.join(' · '));
}

function deletePerson(id) {
  const gone = data.people.find((p) => p.id === id);
  data.people = data.people.filter((p) => p.id !== id);
  data.links = data.links.filter((l) => l.source !== id && l.target !== id);
  // Chats keep everyone else; a chat left with no one in it goes too.
  data.logs = data.logs
    .map((l) => ({ ...l, with: l.with.filter((x) => x !== id), mentions: l.mentions.filter((x) => x !== id) }))
    .filter((l) => l.with.length > 0);
  state.editing = null;
  state.selectedId = null;
  panel.classList.remove('open');
  commit();
  showToast(`removed ${gone ? gone.name : 'them'}`);
}

/** Toggle one tag on or off; several can be lit at once. */
function setTag(tag) {
  if (busyEditing()) return;
  if (state.litTags.has(tag)) state.litTags.delete(tag);
  else state.litTags.add(tag);
  if (state.selectedId) pick(null);
  else refresh();
}

/** Change someone's check-in cadence; their star moves to its new orbit. */
function setCadence(id, days) {
  data.people.find((p) => p.id === id).cadenceDays = days;
  commit();
}

function clearTags() {
  state.litTags.clear();
  refresh();
}

async function renameMe() {
  if (busyEditing()) return;
  const name = await askName(nameDialog, data.me.name);
  if (name) { data.me.name = name; commit(); }
}

function draw() {
  graph = renderConstellation(sky, data.people, allLinks, tags, {
    meName: data.me.name,
    // Clicking empty sky closes the person first, then clears the lit tags.
    onSelect: (p) => {
      if (state.editing) return;
      if (p || state.selectedId) pick(p ? p.id : null);
      else clearTags();
    },
    onMe: renameMe,
    obstruction,
  });
  refresh();
  if (state.selectedId && !state.editing) graph.focus(state.selectedId);
}

draw();
renderLegend(legend);
sync.start();

syncBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const status = syncBtn.dataset.status;
  if (status === 'local' || status === 'reconnect') sync.connectNow();
  else if (status === 'offline' || status === 'paused') sync.syncNow();
  else if (status === 'synced') {
    syncMenu.querySelector('#open-sheet').href = sheetUrl(sync.sheetId());
    syncMenu.hidden = !syncMenu.hidden;
  }
});
document.addEventListener('click', (e) => { if (!syncMenu.contains(e.target)) syncMenu.hidden = true; });
document.getElementById('sync-now').addEventListener('click', () => { syncMenu.hidden = true; sync.syncNow(); });
document.getElementById('sync-off').addEventListener('click', async () => {
  syncMenu.hidden = true;
  const ok = await askYesNo(askDialog, 'Disconnect from Google? Your people stay in this browser and in your sheet.', 'disconnect', 'cancel');
  if (ok) sync.stop();
});
initAbout(document.getElementById('about-open'), document.getElementById('about'));
initThemeToggle(document.getElementById('theme-toggle'), () => { graph.recolor(); renderLegend(legend); refresh(); });

search.addEventListener('input', () => {
  state.query = search.value;
  if (state.selectedId && !state.editing) pick(null);
  else refresh();
});

clearTagsBtn.addEventListener('click', clearTags);
document.getElementById('reach-shuffle').addEventListener('click', () => {
  state.shuffles += 1;
  reach = reachPicks();
  refresh();
});
document.getElementById('log-chat').addEventListener('click', () => {
  logChat(null, state.selectedId ? [state.selectedId] : []);
});
document.getElementById('add-person').addEventListener('click', () => {
  if (!busyEditing()) edit(null);
});

// Sample people for trying Kith out; to be removed before launch.
document.getElementById('load-sample').addEventListener('click', () => {
  const { people, links } = makeSample();
  data.people = people;
  data.links = links;
  commit();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !state.editing && !document.querySelector('dialog[open]')) pick(null);
});

let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(draw, 200); });

if (!data.me.name) renameMe();
