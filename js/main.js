// Entry point: wires the data layer, graph, and UI together.

import { makeSample } from './sample.js';
import { tagList } from './data.js';
import { renderConstellation } from './graph.js';
import { initFontPicker, initThemeToggle, renderLegend, renderTagBar, showPerson } from './ui.js';

const { people, links } = makeSample();
const tags = tagList(people);
const sky = document.getElementById('sky');
const panel = document.getElementById('panel');
const legend = document.getElementById('legend');
const tagbar = document.getElementById('tagbar');
const phone = window.matchMedia('(max-width: 700px)');

const state = { selectedId: null, tag: null };
let graph;

/** Size of the sky hidden behind the open panel, so the camera centres in what is left. */
function obstruction() {
  if (!panel.classList.contains('open')) return { right: 0, bottom: 0 };
  return phone.matches ? { right: 0, bottom: panel.offsetHeight } : { right: panel.offsetWidth, bottom: 0 };
}

function refresh() {
  graph.highlight(state);
  renderTagBar(tagbar, people, tags, state.tag, setTag);
}

function pick(id) {
  const person = people.find((p) => p.id === id) || null;
  state.selectedId = person ? person.id : null;
  showPerson(panel, person, people, links, tags, { onPick: pick, onTag: setTag });
  refresh();
  graph.focus(state.selectedId);
}

function setTag(tag) {
  state.tag = state.tag === tag ? null : tag;
  if (state.selectedId) pick(null);
  else refresh();
}

function draw() {
  graph = renderConstellation(sky, people, links, tags, {
    // Clicking empty sky closes the person first, then clears the lit tag.
    onSelect: (p) => (p || state.selectedId ? pick(p ? p.id : null) : setTag(state.tag)),
    obstruction,
  });
  refresh();
  if (state.selectedId) graph.focus(state.selectedId);
}

draw();
renderLegend(legend);
initFontPicker(document.getElementById('font-pick'));
initThemeToggle(document.getElementById('theme-toggle'), () => { graph.recolor(); renderLegend(legend); refresh(); });

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') pick(null); });

let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(draw, 200); });
