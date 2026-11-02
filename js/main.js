// Entry point: wires the saved data, graph, and UI together.

import { makeSample } from './sample.js';
import { matchesQuery, pickReachOut, tagList, todayISO } from './data.js';
import { renderConstellation } from './graph.js';
import { loadStore, newId, saveStore } from './store.js';
import { renderEditor } from './editor.js';
import {
  askName, initAbout, initThemeToggle, openPanel, renderLegend, renderPeopleList, renderReachOut,
  renderTagList, showPerson, showToast,
} from './ui.js';

const data = loadStore();
let tags = tagList(data.people);

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
const phone = window.matchMedia('(max-width: 700px)');

// `editing` is the open editor's person id ('new' when adding); clicks elsewhere wait until it closes.
const state = { selectedId: null, litTags: new Set(), query: '', shuffles: 0, editing: null };
let graph;

// Today's suggestions stay put all day; "shuffle" rerolls them.
const reachPicks = () => pickReachOut(data.people, `${todayISO()}|${state.shuffles}`);
let reach = reachPicks();

/** Save everything and redraw after any change to people or connections. */
function commit() {
  if (!saveStore(data)) showToast('could not save in this browser; changes will be lost on reload');
  tags = tagList(data.people);
  reach = reachPicks();
  draw();
}

/** Size of the sky hidden behind the open panel, so the camera centres in what is left. */
function obstruction() {
  if (!panel.classList.contains('open')) return { right: 0, bottom: 0 };
  return phone.matches ? { right: 0, bottom: panel.offsetHeight } : { right: panel.offsetWidth, bottom: 0 };
}

function refresh() {
  const shown = data.people.filter((p) => matchesQuery(p, state.query)
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
  showPerson(panel, person, data.people, data.links, tags,
    { onPick: pick, onTag: setTag, onCadence: setCadence, onEdit: edit });
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

function savePerson(person, personLinks) {
  const isNew = !person.id;
  if (isNew) person.id = newId();
  const fixed = personLinks.map((l) => ({
    source: l.source || person.id,
    target: l.target || person.id,
    label: l.label,
  }));
  if (isNew) data.people.push(person);
  else data.people[data.people.findIndex((p) => p.id === person.id)] = person;
  data.links = data.links.filter((l) => l.source !== person.id && l.target !== person.id).concat(fixed);
  state.editing = null;
  state.selectedId = person.id;
  commit();
  pick(person.id);
  showToast(isNew ? `added ${person.name}` : 'saved');
}

function deletePerson(id) {
  const gone = data.people.find((p) => p.id === id);
  data.people = data.people.filter((p) => p.id !== id);
  data.links = data.links.filter((l) => l.source !== id && l.target !== id);
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
  graph = renderConstellation(sky, data.people, data.links, tags, {
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
