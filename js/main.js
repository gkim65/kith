// Entry point: wires the data layer, graph, and UI together.

import { makeSample } from './sample.js';
import { matchesQuery, tagList } from './data.js';
import { renderConstellation } from './graph.js';
import { initThemeToggle, renderLegend, renderPeopleList, renderTagList, showPerson } from './ui.js';

const { people, links } = makeSample();
const tags = tagList(people);
const sky = document.getElementById('sky');
const panel = document.getElementById('panel');
const legend = document.getElementById('legend');
const tagListEl = document.getElementById('tag-list');
const peopleListEl = document.getElementById('people-list');
const peopleCount = document.getElementById('people-count');
const search = document.getElementById('search');
const clearTagsBtn = document.getElementById('clear-tags');
const phone = window.matchMedia('(max-width: 700px)');

const state = { selectedId: null, litTags: new Set(), query: '' };
let graph;

/** Size of the sky hidden behind the open panel, so the camera centres in what is left. */
function obstruction() {
  if (!panel.classList.contains('open')) return { right: 0, bottom: 0 };
  return phone.matches ? { right: 0, bottom: panel.offsetHeight } : { right: panel.offsetWidth, bottom: 0 };
}

function refresh() {
  const shown = people.filter((p) => matchesQuery(p, state.query)
    && (state.litTags.size === 0 || p.tags.some((t) => state.litTags.has(t))));
  const matches = state.query.trim() ? new Set(shown.map((p) => p.id)) : null;
  graph.highlight({ selectedId: state.selectedId, litTags: state.litTags, matches });
  renderTagList(tagListEl, people, tags, state.litTags, setTag);
  clearTagsBtn.hidden = state.litTags.size === 0;
  renderPeopleList(peopleListEl, shown, state.selectedId, pick);
  peopleCount.textContent = shown.length === people.length ? people.length : `${shown.length} of ${people.length}`;
}

function pick(id) {
  const person = people.find((p) => p.id === id) || null;
  state.selectedId = person ? person.id : null;
  showPerson(panel, person, people, links, tags, { onPick: pick, onTag: setTag });
  refresh();
  graph.focus(state.selectedId);
}

/** Toggle one tag on or off; several can be lit at once. */
function setTag(tag) {
  if (state.litTags.has(tag)) state.litTags.delete(tag);
  else state.litTags.add(tag);
  if (state.selectedId) pick(null);
  else refresh();
}

function clearTags() {
  state.litTags.clear();
  refresh();
}

function draw() {
  graph = renderConstellation(sky, people, links, tags, {
    // Clicking empty sky closes the person first, then clears the lit tags.
    onSelect: (p) => (p || state.selectedId ? pick(p ? p.id : null) : clearTags()),
    obstruction,
  });
  refresh();
  if (state.selectedId) graph.focus(state.selectedId);
}

draw();
renderLegend(legend);
initThemeToggle(document.getElementById('theme-toggle'), () => { graph.recolor(); renderLegend(legend); refresh(); });

search.addEventListener('input', () => {
  state.query = search.value;
  if (state.selectedId) pick(null);
  else refresh();
});

clearTagsBtn.addEventListener('click', clearTags);

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') pick(null); });

let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(draw, 200); });
