// Entry point: wires the data layer, graph, and UI together.

import { makeSample } from './sample.js';
import { renderConstellation } from './graph.js';
import { initThemeToggle, renderLegend, showPerson } from './ui.js';

const { people, links } = makeSample();
const sky = document.getElementById('sky');
const panel = document.getElementById('panel');
const legend = document.getElementById('legend');

let graph;

function pick(id) {
  const person = people.find((p) => p.id === id) || null;
  graph.select(person ? person.id : null);
  showPerson(panel, person, people, links, pick);
}

function draw() {
  graph = renderConstellation(sky, people, links, { onSelect: (p) => pick(p ? p.id : null) });
}

draw();
renderLegend(legend);
initThemeToggle(document.getElementById('theme-toggle'), () => { graph.recolor(); renderLegend(legend); });

let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(draw, 200); });
