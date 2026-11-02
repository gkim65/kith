// Constellation view: people are stars, connections are faint lines (d3-force).

import { driftRatio } from './data.js';

const d3 = window.d3;

/** Zoom level above which every name is shown, not just on hover. */
const LABEL_ZOOM = 1.4;

/**
 * recencyColor(ratio) -> string
 *
 * Star colour for a drift ratio, interpolated between the theme's `--star-*` CSS tokens.
 *
 *   - `ratio` — days since last chat divided by cadence (dimensionless)
 *
 * Returns a CSS colour string.
 */
export function recencyColor(ratio) {
  const css = getComputedStyle(document.documentElement);
  const stops = ['--star-fresh', '--star-due', '--star-overdue', '--star-lost']
    .map((v) => css.getPropertyValue(v).trim());
  return d3.scaleLinear()
    .domain([0, 1, 2, 4])
    .range(stops)
    .interpolate(d3.interpolateRgb)
    .clamp(true)(ratio);
}

/**
 * starRadius(ratio) -> number
 *
 * Stars shrink as someone drifts, so recent friends read as the bright ones.
 *
 *   - `ratio` — drift ratio (dimensionless)
 *
 * Returns the core radius (px).
 */
function starRadius(ratio) {
  return 4 + 4 * Math.max(0, 1 - Math.min(ratio, 4) / 4);
}

/**
 * renderConstellation(svgEl, people, links, { onSelect }) -> { select, recolor }
 *
 * Draw the force-directed constellation into an SVG and keep it live.
 *
 *   - `svgEl`    — the `<svg>` element to draw into
 *   - `people`   — person objects with `id`, `name`, `tags`, `lastChat`, `cadenceDays`
 *   - `links`    — `{ source, target, label }` with person ids
 *   - `onSelect` — called with a person (or null) when a star or empty sky is clicked
 *
 * Returns handles: `select(id|null)` highlights a person and their neighbours,
 * `recolor()` re-reads the theme colours after a theme switch.
 */
export function renderConstellation(svgEl, people, links, { onSelect = () => {} } = {}) {
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();
  const { width, height } = svgEl.parentElement.getBoundingClientRect();

  const nodes = people.map((p) => ({ ...p, ratio: driftRatio(p) }));
  const edges = links.map((l) => ({ ...l }));
  const neighbours = new Map(nodes.map((n) => [n.id, new Set()]));
  edges.forEach((e) => { neighbours.get(e.source).add(e.target); neighbours.get(e.target).add(e.source); });

  // Faint background stars, purely decorative (hidden in light theme).
  const bg = svg.append('g');
  const rand = d3.randomLcg(3);
  for (let i = 0; i < 160; i++) {
    bg.append('circle').attr('class', 'bg-star')
      .attr('cx', rand() * width).attr('cy', rand() * height)
      .attr('r', rand() * 1.1 + 0.2).attr('opacity', rand() * 0.5 + 0.1);
  }

  const world = svg.append('g');
  const linkSel = world.append('g').selectAll('line').data(edges).join('line').attr('class', 'link');
  const nodeSel = world.append('g').selectAll('g').data(nodes, (d) => d.id).join('g').attr('class', 'node');
  nodeSel.append('circle').attr('class', 'halo');
  nodeSel.append('circle').attr('class', 'core');
  nodeSel.append('text').attr('class', 'label').attr('dy', -12).attr('text-anchor', 'middle').text((d) => d.name);

  function recolor() {
    nodeSel.select('.halo').attr('r', (d) => starRadius(d.ratio) * 2.6).attr('fill', (d) => recencyColor(d.ratio));
    nodeSel.select('.core').attr('r', (d) => starRadius(d.ratio)).attr('fill', (d) => recencyColor(d.ratio));
  }
  recolor();

  // Each person's first tag pulls them toward an anchor on a ring, so circles of friends cluster.
  const tags = [...new Set(nodes.map((n) => n.tags[0]))];
  const ring = Math.min(width, height) * 0.28;
  const anchor = (d) => {
    const a = (tags.indexOf(d.tags[0]) / tags.length) * 2 * Math.PI;
    return [width / 2 + ring * Math.cos(a), height / 2 + ring * Math.sin(a)];
  };

  // Start each star near its anchor and settle the layout before the first paint.
  nodes.forEach((d) => { const [x, y] = anchor(d); d.x = x + (rand() - 0.5) * 60; d.y = y + (rand() - 0.5) * 60; });
  const draw = () => {
    linkSel.attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
    nodeSel.attr('transform', (d) => `translate(${d.x},${d.y})`);
  };
  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(edges).id((d) => d.id).distance(50).strength(0.5))
    .force('charge', d3.forceManyBody().strength(-120))
    .force('x', d3.forceX((d) => anchor(d)[0]).strength(0.06))
    .force('y', d3.forceY((d) => anchor(d)[1]).strength(0.06))
    .force('collide', d3.forceCollide(14))
    .stop()
    .tick(300)
    .on('tick', draw);
  draw();

  nodeSel.call(d3.drag()
    .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.2).restart(); d.fx = d.x; d.fy = d.y; })
    .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
    .on('end', (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

  const zoom = d3.zoom().scaleExtent([0.3, 4]).on('zoom', (event) => {
    world.attr('transform', event.transform);
    svgEl.classList.toggle('zoomed', event.transform.k >= LABEL_ZOOM);
  });
  svg.call(zoom);

  // Shrink to fit when the settled constellation is bigger than the screen (phones).
  const pad = 30;
  const [x0, x1] = d3.extent(nodes, (d) => d.x);
  const [y0, y1] = d3.extent(nodes, (d) => d.y);
  const k = Math.min(1, (width - 2 * pad) / (x1 - x0), (height - 2 * pad) / (y1 - y0));
  svg.call(zoom.transform, d3.zoomIdentity
    .translate(width / 2, height / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));

  function select(id) {
    const near = id ? neighbours.get(id) : null;
    nodeSel.classed('selected', (d) => d.id === id)
      .classed('neighbour', (d) => !!near && near.has(d.id))
      .classed('dim', (d) => !!id && d.id !== id && !near.has(d.id));
    linkSel.classed('dim', (d) => !!id && d.source.id !== id && d.target.id !== id);
  }

  nodeSel.on('click', (event, d) => { event.stopPropagation(); select(d.id); onSelect(d); });
  svg.on('click', () => { select(null); onSelect(null); });

  return { select, recolor };
}
