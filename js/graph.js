// Constellation view: you at the center, friends orbiting at a distance set by time since you talked.

import { driftRatio } from './data.js';

const d3 = window.d3;

/** Zoom level above which every name is shown, not just on hover. */
const LABEL_ZOOM = 1.4;

/** Zoom level the camera glides to when a person is selected. */
const FOCUS_ZOOM = 1.3;

/** Duration of camera glides and nebula fades (ms). */
const GLIDE_MS = 700;

/** Tag colours, chosen to read on both the dark and the light sky. */
const TAG_PALETTE = ['#e07a9b', '#4fb6a8', '#9b7be0', '#5c9ee0', '#7cbf5a', '#d9705a', '#b38fd6', '#6f86d6'];

/**
 * tagColor(tag, tags) -> string
 *
 * Stable colour for a tag, from its position in the sorted list of all tags.
 *
 *   - `tag`  — tag name
 *   - `tags` — every tag in use, from `tagList`
 *
 * Returns a CSS colour string.
 */
export function tagColor(tag, tags) {
  return TAG_PALETTE[Math.max(0, tags.indexOf(tag)) % TAG_PALETTE.length];
}

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
 * orbitRadius(ratio, maxRadius) -> number
 *
 * Distance from the center for a drift ratio: due sits at 45% of the sky, overdue at 70%.
 *
 *   - `ratio`     — drift ratio (dimensionless)
 *   - `maxRadius` — radius of the whole sky (px)
 *
 * Returns the orbit radius (px).
 */
function orbitRadius(ratio, maxRadius) {
  return maxRadius * d3.scaleLinear().domain([0, 1, 2, 4]).range([0.24, 0.45, 0.7, 0.95]).clamp(true)(ratio);
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
 * renderConstellation(svgEl, people, links, tags, { onSelect, obstruction }) -> { highlight, focus, recolor }
 *
 * Draw the orbit constellation into an SVG and keep it live.
 *
 *   - `svgEl`       — the `<svg>` element to draw into
 *   - `people`      — person objects with `id`, `name`, `tags`, `lastChat`, `cadenceDays`
 *   - `links`       — `{ source, target, label }` with person ids
 *   - `tags`        — every tag in use, from `tagList` (fixes nebula colours)
 *   - `onSelect`    — called with a person (or null) when a star or empty sky is clicked
 *   - `obstruction` — returns `{ right, bottom }` (px) of the sky covered by the side panel
 *
 * Returns handles: `highlight({ selectedId, tag })` lights a person and their neighbours,
 * or everyone with a tag; `focus(id|null)` glides the camera to a person or back home;
 * `recolor()` re-reads the theme colours after a theme switch.
 */
export function renderConstellation(svgEl, people, links, tags, {
  onSelect = () => {},
  obstruction = () => ({ right: 0, bottom: 0 }),
} = {}) {
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();
  const { width, height } = svgEl.parentElement.getBoundingClientRect();
  const cx = width / 2;
  const cy = height / 2;
  const sky = Math.max(140, Math.min(width, height) / 2 - 30);
  const rand = d3.randomLcg(3);

  const me = { id: 'me', name: 'you', isMe: true, tags: [], x: cx, y: cy, fx: cx, fy: cy };
  const friends = people.map((p) => ({ ...p, ratio: driftRatio(p) }));
  const nodes = [me, ...friends];
  const edges = links.map((l) => ({ ...l }));
  const neighbours = new Map(friends.map((n) => [n.id, new Set()]));
  edges.forEach((e) => { neighbours.get(e.source).add(e.target); neighbours.get(e.target).add(e.source); });

  svg.append('defs').append('filter').attr('id', 'nebula-blur')
    .attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%')
    .append('feGaussianBlur').attr('stdDeviation', 18);

  // Faint background stars, purely decorative (hidden in light theme).
  const bg = svg.append('g');
  for (let i = 0; i < 160; i++) {
    bg.append('circle').attr('class', 'bg-star')
      .attr('cx', rand() * width).attr('cy', rand() * height)
      .attr('r', rand() * 1.1 + 0.2).attr('opacity', rand() * 0.5 + 0.1);
  }

  const world = svg.append('g');

  const rings = world.append('g');
  [[1, 'due'], [2, 'overdue']].forEach(([ratio, label]) => {
    const r = orbitRadius(ratio, sky);
    rings.append('circle').attr('class', 'ring').attr('cx', cx).attr('cy', cy).attr('r', r);
    rings.append('text').attr('class', 'ring-label').attr('x', cx).attr('y', cy - r - 6)
      .attr('text-anchor', 'middle').text(label);
  });

  const nebula = world.append('g').attr('class', 'nebula').attr('filter', 'url(#nebula-blur)');
  const linkSel = world.append('g').selectAll('line').data(edges).join('line').attr('class', 'link');
  const nodeSel = world.append('g').selectAll('g').data(nodes, (d) => d.id).join('g')
    .attr('class', (d) => (d.isMe ? 'node me' : 'node'));
  nodeSel.append('circle').attr('class', 'halo');
  nodeSel.append('circle').attr('class', 'core');
  nodeSel.append('text').attr('class', 'label').attr('dy', -14).attr('text-anchor', 'middle').text((d) => d.name);

  function recolor() {
    nodeSel.select('.halo').attr('r', (d) => (d.isMe ? 22 : starRadius(d.ratio) * 2.6))
      .attr('fill', (d) => (d.isMe ? null : recencyColor(d.ratio)));
    nodeSel.select('.core').attr('r', (d) => (d.isMe ? 9 : starRadius(d.ratio)))
      .attr('fill', (d) => (d.isMe ? null : recencyColor(d.ratio)));
  }
  recolor();

  // Start each friend on their orbit and settle the layout before the first paint.
  friends.forEach((d) => {
    const a = rand() * 2 * Math.PI;
    const r = orbitRadius(d.ratio, sky);
    d.x = cx + r * Math.cos(a);
    d.y = cy + r * Math.sin(a);
  });
  const draw = () => {
    linkSel.attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
    nodeSel.attr('transform', (d) => `translate(${d.x},${d.y})`);
    nebula.selectAll('circle').attr('cx', (d) => d.x).attr('cy', (d) => d.y);
  };
  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(edges).id((d) => d.id).distance(40).strength(0.1))
    .force('charge', d3.forceManyBody().strength(-50).distanceMax(200))
    .force('orbit', d3.forceRadial((d) => (d.isMe ? 0 : orbitRadius(d.ratio, sky)), cx, cy)
      .strength((d) => (d.isMe ? 0 : 0.9)))
    .force('collide', d3.forceCollide(17))
    .stop()
    .tick(300)
    .on('tick', draw);
  draw();

  nodeSel.filter((d) => !d.isMe).call(d3.drag()
    .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.2).restart(); d.fx = d.x; d.fy = d.y; })
    .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
    .on('end', (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

  const zoom = d3.zoom().scaleExtent([0.3, 4]).on('zoom', (event) => {
    world.attr('transform', event.transform);
    svgEl.classList.toggle('zoomed', event.transform.k >= LABEL_ZOOM);
  });
  svg.call(zoom);

  // Home view: the whole sky fits on screen (shrinks on phones, never enlarges).
  const reach = Math.max(sky * 0.95, ...friends.map((d) => Math.hypot(d.x - cx, d.y - cy))) + 24;
  const homeK = Math.min(1, (Math.min(width, height) / 2) / reach);
  const home = d3.zoomIdentity.translate(cx, cy).scale(homeK).translate(-cx, -cy);
  svg.call(zoom.transform, home);

  function highlight({ selectedId = null, tag = null } = {}) {
    const near = selectedId ? neighbours.get(selectedId) : null;
    const inTag = (d) => !!tag && d.tags.includes(tag);
    const lit = (d) => {
      if (d.isMe) return true;
      if (selectedId) return d.id === selectedId || near.has(d.id);
      return tag ? inTag(d) : true;
    };
    nodeSel.classed('selected', (d) => d.id === selectedId)
      .classed('neighbour', (d) => !!near && near.has(d.id))
      .classed('tagged', (d) => !selectedId && inTag(d))
      .classed('dim', (d) => !lit(d));
    linkSel.classed('dim', (d) => {
      if (selectedId) return d.source.id !== selectedId && d.target.id !== selectedId;
      return !!tag && !(inTag(d.source) && inTag(d.target));
    });

    const color = tag ? tagColor(tag, tags) : null;
    nebula.selectAll('circle').data(friends.filter(inTag), (d) => d.id).join(
      (enter) => enter.append('circle').attr('cx', (d) => d.x).attr('cy', (d) => d.y)
        .attr('r', 0).attr('fill', color)
        .call((e) => e.transition().duration(GLIDE_MS).attr('r', 44)),
      (update) => update.attr('fill', color),
      (exit) => exit.transition().duration(GLIDE_MS / 2).attr('r', 0).remove(),
    );
  }

  function focus(id) {
    const d = id ? friends.find((n) => n.id === id) : null;
    let target = home;
    if (d) {
      const { right, bottom } = obstruction();
      target = d3.zoomIdentity.translate((width - right) / 2, (height - bottom) / 2)
        .scale(FOCUS_ZOOM).translate(-d.x, -d.y);
    }
    svg.transition().duration(GLIDE_MS).ease(d3.easeCubicInOut).call(zoom.transform, target);
  }

  nodeSel.on('click', (event, d) => { event.stopPropagation(); onSelect(d.isMe ? null : d); });
  svg.on('click', () => onSelect(null));

  return { highlight, focus, recolor };
}
