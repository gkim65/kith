// Constellation view: you at the center, friends orbiting at a distance set by time since you talked.

import { driftRatio } from './data.js';

const d3 = window.d3;

/** Zoom level above which every name is shown, not just on hover. */
const LABEL_ZOOM = 1.4;

/** On-screen size of star names (px), held constant while zooming. */
const LABEL_PX = 13;

/** Zoom level the camera glides to when a person is selected. */
const FOCUS_ZOOM = 1.3;

/** Duration of camera glides and nebula fades (ms). */
const GLIDE_MS = 700;

/** Core radius of every friend's star (px); colour alone carries recency. */
const STAR_R = 4.5;

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
 * Distance from the center for a drift ratio: due sits at 55% of the sky, overdue at 78%.
 *
 *   - `ratio`     — drift ratio (dimensionless)
 *   - `maxRadius` — radius of the whole sky (px)
 *
 * Returns the orbit radius (px).
 */
function orbitRadius(ratio, maxRadius) {
  return maxRadius * d3.scaleLinear().domain([0, 1, 2, 4]).range([0.3, 0.55, 0.78, 0.97]).clamp(true)(ratio);
}

/**
 * angularOrder(friends, edges) -> Map<string, number>
 *
 * Give each friend an angle around you so people linked to each other sit side by side,
 * which keeps connection lines short and mostly uncrossed. Friends are walked depth-first
 * through their connections, one connected group after another.
 *
 *   - `friends` — person nodes
 *   - `edges`   — links whose `source` and `target` are person nodes
 *
 * Returns the angle (radians, 0 at the top, clockwise) for each person id.
 */
function angularOrder(friends, edges) {
  const adj = new Map(friends.map((f) => [f.id, []]));
  edges.forEach((e) => { adj.get(e.source.id).push(e.target.id); adj.get(e.target.id).push(e.source.id); });

  const seen = new Set();
  const groups = [];
  const visit = (id, order) => {
    seen.add(id);
    order.push(id);
    adj.get(id).forEach((n) => { if (!seen.has(n)) visit(n, order); });
  };
  [...friends]
    .sort((a, b) => adj.get(b.id).length - adj.get(a.id).length)
    .forEach((f) => { if (!seen.has(f.id)) { const order = []; visit(f.id, order); groups.push(order); } });

  // One empty slot between groups so separate friend circles read as separate.
  const slots = groups.reduce((n, g) => n + g.length + 1, 0);
  let angle = new Map();
  let i = 0;
  groups.forEach((g) => {
    g.forEach((id) => angle.set(id, (i++ / slots) * 2 * Math.PI));
    i++;
  });

  // Smooth: pull each person toward the circular mean of their connections, then re-space
  // everyone evenly in that order. This shortens the chords a depth-first walk leaves behind.
  for (let pass = 0; pass < 40; pass++) {
    const wanted = friends.map((f) => {
      const around = [f.id, ...adj.get(f.id)].map((id) => angle.get(id));
      const sx = around.reduce((s, a) => s + Math.cos(a), 0);
      const sy = around.reduce((s, a) => s + Math.sin(a), 0);
      return { id: f.id, a: Math.hypot(sx, sy) < 1e-9 ? angle.get(f.id) : Math.atan2(sy, sx) };
    });
    wanted.sort((p, q) => p.a - q.a);
    angle = new Map(wanted.map((w, k) => [w.id, (k / wanted.length) * 2 * Math.PI]));
  }
  return new Map([...angle].map(([id, a]) => [id, a - Math.PI / 2]));
}

/**
 * renderConstellation(svgEl, people, links, tags, { meName, onSelect, onMe, obstruction }) -> { highlight, focus, recolor }
 *
 * Draw the orbit constellation into an SVG and keep it live.
 *
 *   - `svgEl`       — the `<svg>` element to draw into
 *   - `people`      — person objects with `id`, `name`, `tags`, `lastChat`, `cadenceDays`
 *   - `links`       — `{ source, target, label, kind }` with person ids; `kind: 'log'` draws dotted
 *   - `tags`        — every tag in use, from `tagList` (fixes nebula colours)
 *   - `meName`      — label for the center star (your first name), default 'you'
 *   - `onSelect`    — called with a person (or null) when a star or empty sky is clicked
 *   - `onMe`        — called when the center star is clicked
 *   - `obstruction` — returns `{ right, bottom }` (px) of the sky covered by the side panel
 *
 * Returns handles: `highlight({ selectedId, litTags, matches })` lights a person and their
 * neighbours, or everyone with any of the lit tags and/or in the `matches` id set; `focus(id|null)` glides
 * the camera to a person or back home; `recolor()` re-reads the theme colours.
 */
export function renderConstellation(svgEl, people, links, tags, {
  meName = 'you',
  onSelect = () => {},
  onMe = () => {},
  obstruction = () => ({ right: 0, bottom: 0 }),
} = {}) {
  const svg = d3.select(svgEl);
  // Stop any camera glide from the previous drawing before its stars are removed.
  svg.interrupt();
  svg.selectAll('*').remove();
  const { width, height } = svgEl.parentElement.getBoundingClientRect();
  const cx = width / 2;
  const cy = height / 2;
  const sky = Math.max(140, Math.min(width, height) / 2 - 30);
  const rand = d3.randomLcg(3);

  const me = { id: 'me', name: meName || 'you', isMe: true, tags: [], x: cx, y: cy, fx: cx, fy: cy };
  const friends = people.map((p) => ({ ...p, ratio: driftRatio(p) }));
  // An empty sky shows no rings and no center star until the first person arrives.
  const nodes = friends.length ? [me, ...friends] : [];
  const byId = new Map(friends.map((f) => [f.id, f]));
  const edges = links.map((l) => ({ ...l, source: byId.get(l.source), target: byId.get(l.target) }));
  const neighbours = new Map(friends.map((n) => [n.id, new Set()]));
  edges.forEach((e) => { neighbours.get(e.source.id).add(e.target.id); neighbours.get(e.target.id).add(e.source.id); });

  svg.append('defs').append('filter').attr('id', 'nebula-blur')
    .attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%')
    .append('feGaussianBlur').attr('stdDeviation', 16);

  // Faint background stars, purely decorative (hidden in light theme).
  const bg = svg.append('g');
  for (let i = 0; i < 160; i++) {
    bg.append('circle').attr('class', 'bg-star')
      .attr('cx', rand() * width).attr('cy', rand() * height)
      .attr('r', rand() * 1.1 + 0.2).attr('opacity', rand() * 0.5 + 0.1);
  }

  const world = svg.append('g');

  const rings = world.append('g');
  (friends.length ? [[1, 'due'], [2, 'overdue']] : []).forEach(([ratio, label]) => {
    const r = orbitRadius(ratio, sky);
    rings.append('circle').attr('class', 'ring').attr('cx', cx).attr('cy', cy).attr('r', r);
    rings.append('text').attr('class', 'ring-label').attr('x', cx).attr('y', cy - r - 6)
      .attr('text-anchor', 'middle').text(label);
  });

  const nebula = world.append('g').attr('class', 'nebula').attr('filter', 'url(#nebula-blur)');
  const linkSel = world.append('g').selectAll('line').data(edges).join('line')
    .attr('class', (d) => (d.kind === 'log' ? 'link log' : 'link'));
  const nodeSel = world.append('g').selectAll('g').data(nodes, (d) => d.id).join('g')
    .attr('class', (d) => (d.isMe ? 'node me' : 'node'));
  nodeSel.append('circle').attr('class', 'halo').attr('r', (d) => (d.isMe ? 16 : STAR_R * 2.4));
  nodeSel.append('circle').attr('class', 'core').attr('r', (d) => (d.isMe ? 7 : STAR_R));
  const labelSel = nodeSel.append('text').attr('class', 'label').text((d) => d.name);

  function recolor() {
    nodeSel.filter((d) => !d.isMe).selectAll('.halo, .core').attr('fill', (d) => recencyColor(d.ratio));
  }
  recolor();

  // Each friend's home spot: orbit radius from recency, angle from who they are connected to.
  const angle = angularOrder(friends, edges);
  friends.forEach((d) => {
    const r = orbitRadius(d.ratio, sky);
    d.tx = cx + r * Math.cos(angle.get(d.id));
    d.ty = cy + r * Math.sin(angle.get(d.id));
    d.x = d.tx;
    d.y = d.ty;
  });
  me.tx = cx;
  me.ty = cy;

  // Names sit beside each star on the side facing away from you; yours sits above.
  labelSel
    .attr('text-anchor', (d) => (d.isMe ? 'middle' : d.tx >= cx ? 'start' : 'end'))
    .attr('dx', (d) => (d.isMe ? 0 : d.tx >= cx ? 9 : -9))
    .attr('dy', (d) => (d.isMe ? -13 : 4));

  // Labels keep a constant on-screen size, so zooming in makes room to show more names.
  let zoomK = 1;
  const sizeLabels = () => labelSel.attr('font-size', LABEL_PX / zoomK).attr('stroke-width', 3 / zoomK);
  sizeLabels();

  /**
   * declutter()
   *
   * Hide any visible name that would overlap a higher-priority one (it still shows on hover).
   * Priority: you, the selected person, their neighbours, lit tag or search matches, everyone else.
   */
  function declutter() {
    // A late call from a drawing that has since been replaced has nothing left to measure.
    if (nodeSel.empty() || !nodeSel.node().isConnected) return;
    const zoomed = svgEl.classList.contains('zoomed');
    const rank = (g) => (g.classList.contains('me') ? 0 : g.classList.contains('selected') ? 1
      : g.classList.contains('neighbour') ? 2 : g.classList.contains('tagged') ? 3 : zoomed ? 4 : null);
    const kept = [];
    nodeSel.classed('crowded', false);
    nodeSel.nodes()
      .map((g) => ({ g, r: rank(g) }))
      .filter((o) => o.r !== null && !o.g.classList.contains('dim'))
      .sort((a, b) => a.r - b.r)
      .forEach(({ g }) => {
        const d = d3.select(g).datum();
        const b = g.querySelector('.label').getBBox();
        const box = { x0: d.x + b.x, y0: d.y + b.y, x1: d.x + b.x + b.width, y1: d.y + b.y + b.height };
        const hit = kept.some((k) => box.x0 < k.x1 && box.x1 > k.x0 && box.y0 < k.y1 && box.y1 > k.y0);
        if (hit) g.classList.add('crowded');
        else kept.push(box);
      });
  }

  const draw = () => {
    linkSel.attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
    nodeSel.attr('transform', (d) => `translate(${d.x},${d.y})`);
    nebula.selectAll('circle').attr('cx', (n) => n.d.x).attr('cy', (n) => n.d.y);
  };
  const sim = d3.forceSimulation(nodes)
    .force('x', d3.forceX((d) => d.tx).strength(0.3))
    .force('y', d3.forceY((d) => d.ty).strength(0.3))
    .force('collide', d3.forceCollide(12))
    .stop()
    .tick(200)
    .on('tick', draw);
  draw();

  nodeSel.filter((d) => !d.isMe).call(d3.drag()
    .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.2).restart(); d.fx = d.x; d.fy = d.y; })
    .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
    .on('end', (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; setTimeout(declutter, 600); }));

  const zoom = d3.zoom().scaleExtent([0.3, 4])
    .on('zoom', (event) => {
      world.attr('transform', event.transform);
      svgEl.classList.toggle('zoomed', event.transform.k >= LABEL_ZOOM);
      if (event.transform.k !== zoomK) { zoomK = event.transform.k; sizeLabels(); }
    })
    .on('end', declutter);
  svg.call(zoom);

  // Home view: the whole sky fits on screen (shrinks on phones, never enlarges).
  const reach = Math.max(sky * 0.97, ...friends.map((d) => Math.hypot(d.x - cx, d.y - cy))) + 24;
  const homeK = Math.min(1, (Math.min(width, height) / 2) / reach);
  const home = d3.zoomIdentity.translate(cx, cy).scale(homeK).translate(-cx, -cy);
  svg.call(zoom.transform, home);

  function highlight({ selectedId = null, litTags = new Set(), matches = null } = {}) {
    const near = selectedId ? neighbours.get(selectedId) : null;
    const inTag = (d) => d.tags.some((t) => litTags.has(t));
    const filtering = litTags.size > 0 || !!matches;
    const passes = (d) => (litTags.size === 0 || inTag(d)) && (!matches || matches.has(d.id));
    const lit = (d) => {
      if (d.isMe) return true;
      if (selectedId) return d.id === selectedId || near.has(d.id);
      return !filtering || passes(d);
    };
    nodeSel.classed('selected', (d) => d.id === selectedId)
      .classed('neighbour', (d) => !!near && near.has(d.id))
      .classed('tagged', (d) => !selectedId && filtering && !d.isMe && passes(d))
      .classed('dim', (d) => !lit(d));
    linkSel.classed('dim', (d) => {
      if (selectedId) return d.source.id !== selectedId && d.target.id !== selectedId;
      return filtering && !(passes(d.source) && passes(d.target));
    });

    // One glow per (person, lit tag), so someone in two lit tags blends both colours.
    const glows = friends.flatMap((d) => d.tags.filter((t) => litTags.has(t)).map((t) => ({ d, t })));
    nebula.selectAll('circle').data(glows, (n) => `${n.d.id}|${n.t}`).join(
      (enter) => enter.append('circle').attr('cx', (n) => n.d.x).attr('cy', (n) => n.d.y)
        .attr('r', 0).attr('fill', (n) => tagColor(n.t, tags))
        .call((e) => e.transition().duration(GLIDE_MS).attr('r', 36)),
      (update) => update,
      (exit) => exit.transition().duration(GLIDE_MS / 2).attr('r', 0).remove(),
    );
    declutter();
  }

  function focus(id) {
    const d = id ? byId.get(id) : null;
    let target = home;
    if (d) {
      const { right, bottom } = obstruction();
      target = d3.zoomIdentity.translate((width - right) / 2, (height - bottom) / 2)
        .scale(FOCUS_ZOOM).translate(-d.x, -d.y);
    }
    svg.transition().duration(GLIDE_MS).ease(d3.easeCubicInOut).call(zoom.transform, target);
  }

  nodeSel.on('click', (event, d) => {
    event.stopPropagation();
    if (d.isMe) onMe();
    else onSelect(d);
  });
  svg.on('click', () => onSelect(null));

  return { highlight, focus, recolor };
}
