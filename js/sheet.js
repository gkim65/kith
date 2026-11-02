// The Kith Google Sheet: finding or creating it, and reading and writing the whole sky.

import { todayISO } from './data.js';
import { gfetch } from './google.js';
import { newId, normalizeData } from './store.js';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const SHEET_KEY = 'kith_sheet_id';

/** Columns Kith owns on each tab, in the order it writes them. Name columns are for reading only. */
const COLUMNS = {
  People: ['id', 'name', 'tags', 'how_met', 'notes', 'check_in_days', 'last_talked'],
  Chats: ['id', 'date', 'with_ids', 'mention_ids', 'note', 'with (names)', 'mentions (names)'],
  Connections: ['from_id', 'to_id', 'label', 'from (name)', 'to (name)'],
  Settings: ['key', 'value'],
};
const TABS = Object.keys(COLUMNS);

/** Column letter for a 0-based index (A–Z, then AA…). */
const colLetter = (i) => (i < 26 ? String.fromCharCode(65 + i) : colLetter(Math.floor(i / 26) - 1) + colLetter(i % 26));

/**
 * parseDateCell(text) -> string
 *
 * Read a date typed into the sheet in any common form.
 *
 *   - `text` — cell text, e.g. "2026-11-01" or "11/1/2026"
 *
 * Returns `YYYY-MM-DD`, or '' when the text is not a recognisable date.
 */
function parseDateCell(text) {
  const t = String(text ?? '').trim();
  if (!t) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? '' : todayISO(d);
}

const splitList = (text) => String(text ?? '').split(',').map((x) => x.trim()).filter(Boolean);

/**
 * ensureSheet() -> Promise<string>
 *
 * Find this user's Kith sheet (remembered id, else a search of the files Kith created), or create
 * one if there truly is none.
 *
 * Returns the spreadsheet id.
 *
 * NOTE: a new sheet is only created after Google confirms none exists; a failed request throws
 * instead, so a network hiccup can never start a second, empty sheet.
 */
export async function ensureSheet() {
  let id = null;
  try { id = localStorage.getItem(SHEET_KEY); } catch (e) {}
  if (id) {
    try {
      const f = await gfetch(`${DRIVE}/${encodeURIComponent(id)}?fields=id,trashed`);
      if (f && !f.trashed) return id;
    } catch (e) {
      if (e.status !== 404 && e.status !== 403) throw e;
    }
  }
  const q = encodeURIComponent("appProperties has { key='kith' and value='1' } and trashed=false");
  const found = await gfetch(`${DRIVE}?q=${q}&orderBy=modifiedTime desc&fields=files(id)&pageSize=10`);
  id = found.files && found.files.length ? found.files[0].id : await createSheet();
  try { localStorage.setItem(SHEET_KEY, id); } catch (e) {}
  await ensureTabs(id);
  return id;
}

/** Sheets whose tabs were already checked during this page visit. */
const tabsChecked = new Set();

/**
 * ensureTabs(id) -> Promise<void>
 *
 * Add any of Kith's tabs that are missing, e.g. when creating the sheet was interrupted. Existing
 * tabs, including ones you made yourself, are never renamed or removed.
 *
 *   - `id` — spreadsheet id
 */
async function ensureTabs(id) {
  if (tabsChecked.has(id)) return;
  const book = await gfetch(`${SHEETS}/${id}?fields=sheets.properties.title`);
  const titles = book.sheets.map((s) => s.properties.title);
  const missing = TABS.filter((t) => !titles.includes(t));
  if (missing.length) {
    await gfetch(`${SHEETS}/${id}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests: missing.map((title) => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } })) }),
    });
  }
  tabsChecked.add(id);
}

/** Create the Kith spreadsheet with its four tabs and frozen header rows. Returns its id. */
async function createSheet() {
  const file = await gfetch(DRIVE, {
    method: 'POST',
    body: JSON.stringify({ name: 'Kith', mimeType: 'application/vnd.google-apps.spreadsheet', appProperties: { kith: '1' } }),
  });
  const book = await gfetch(`${SHEETS}/${file.id}?fields=sheets.properties.sheetId`);
  const firstId = book.sheets[0].properties.sheetId;
  const frozen = { frozenRowCount: 1 };
  await gfetch(`${SHEETS}/${file.id}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [
        { updateSheetProperties: { properties: { sheetId: firstId, title: 'People', gridProperties: frozen }, fields: 'title,gridProperties.frozenRowCount' } },
        ...TABS.slice(1).map((title) => ({ addSheet: { properties: { title, gridProperties: frozen } } })),
      ],
    }),
  });
  return file.id;
}

/**
 * sheetUrl(id) -> string
 *
 * Link for opening the sheet in Google Sheets.
 *
 *   - `id` — spreadsheet id
 */
export function sheetUrl(id) {
  return `https://docs.google.com/spreadsheets/d/${id}`;
}

/**
 * rememberedSheetId() -> string|null
 *
 * The sheet id this browser last synced with, if any.
 */
export function rememberedSheetId() {
  try { return localStorage.getItem(SHEET_KEY); } catch (e) { return null; }
}

/**
 * readSheet(id) -> Promise<{ data, layout, needsWrite }>
 *
 * Read every tab. Columns are matched by their header, so reordering columns in Google Sheets is
 * safe; columns Kith does not know are kept in `layout` and written back untouched.
 *
 *   - `id` — spreadsheet id
 *
 * Returns the sky (`normalizeData` shape); `layout` with each tab's row count, row order, and any
 * extra columns; and `needsWrite`, true when rows typed in by hand were given ids or repaired.
 */
export async function readSheet(id) {
  const ranges = TABS.map((t) => `ranges=${encodeURIComponent(`${t}!A1:ZZ`)}`).join('&');
  const reply = await gfetch(`${SHEETS}/${id}/values:batchGet?${ranges}&valueRenderOption=FORMATTED_VALUE`);
  const layout = {};
  let needsWrite = false;

  const tabs = {};
  reply.valueRanges.forEach((vr, i) => {
    const tab = TABS[i];
    const rows = vr.values || [];
    const header = (rows[0] || []).map((h) => String(h).trim().toLowerCase());
    const known = COLUMNS[tab];
    // Where each known column sits; a sheet without headers is read in Kith's own order.
    const pos = known.map((c, k) => (header.length ? header.indexOf(c) : k));
    const extraCols = header.map((h, k) => ({ h: (rows[0] || [])[k], k })).filter(({ h, k }) => h && !known.includes(header[k]));
    const body = rows.slice(1);
    tabs[tab] = body.map((r) => {
      const rec = {};
      known.forEach((c, k) => { rec[c] = pos[k] >= 0 ? String(r[pos[k]] ?? '').trim() : ''; });
      rec.extra = Object.fromEntries(extraCols.map(({ h, k }) => [h, r[k] ?? '']));
      return rec;
    });
    layout[tab] = { rows: body.length, extraHeaders: extraCols.map(({ h }) => h), extras: new Map(), order: [] };
  });

  const people = [];
  tabs.People.forEach((r) => {
    if (!r.id && !r.name) return;
    if (!r.id) { r.id = newId(); needsWrite = true; }
    let notes = r.notes;
    let lastChat = parseDateCell(r.last_talked);
    // An unreadable date is kept in the notes rather than lost.
    if (r.last_talked && !lastChat) { notes = `${notes}${notes ? '\n' : ''}(last talked: ${r.last_talked})`; needsWrite = true; }
    people.push({ id: r.id, name: r.name, tags: splitList(r.tags), howMet: r.how_met, notes, cadenceDays: Number(r.check_in_days), lastChat });
    layout.People.extras.set(r.id, r.extra);
    layout.People.order.push(r.id);
  });

  // Chats and connections typed by hand may name people instead of giving ids: match the name,
  // or add the person, so the row is never dropped.
  const ids = new Set(people.map((p) => p.id));
  const toId = (token) => {
    if (ids.has(token)) return token;
    const known = people.find((p) => p.name.toLowerCase() === token.toLowerCase());
    if (known) { needsWrite = true; return known.id; }
    const added = { id: newId(), name: token, tags: [], howMet: '', notes: '', cadenceDays: 0, lastChat: '' };
    people.push(added);
    ids.add(added.id);
    needsWrite = true;
    return added.id;
  };

  const logs = [];
  tabs.Chats.forEach((r) => {
    if (!r.id && !r.note && !r.with_ids) return;
    if (!r.id) { r.id = newId(); needsWrite = true; }
    let date = parseDateCell(r.date);
    let note = r.note;
    if (!date) { note = `${r.date ? `(date: ${r.date}) ` : ''}${note}`; date = todayISO(); needsWrite = true; }
    logs.push({ id: r.id, date, with: splitList(r.with_ids).map(toId), mentions: splitList(r.mention_ids).map(toId), note });
    layout.Chats.extras.set(r.id, r.extra);
    layout.Chats.order.push(r.id);
  });

  const links = tabs.Connections.filter((r) => r.from_id && r.to_id)
    .map((r) => ({ source: toId(r.from_id), target: toId(r.to_id), label: r.label }));

  const settings = Object.fromEntries(tabs.Settings.map((r) => [r.key, r.value]));
  return {
    data: normalizeData({ me: { name: settings.me_name || '' }, people, links, logs }),
    layout,
    needsWrite,
  };
}

/**
 * writeSheet(id, data, layout) -> Promise<void>
 *
 * Replace every tab's contents with `data` in one request. Rows keep the order they had in the
 * sheet (new ones go at the end), leftover rows below are blanked, and extra columns are kept.
 *
 *   - `id`     — spreadsheet id
 *   - `data`   — the sky to write
 *   - `layout` — from the `readSheet` call made just before this write
 */
export async function writeSheet(id, data, layout) {
  const nameOf = (pid) => (data.people.find((p) => p.id === pid) || { name: '' }).name;
  const ordered = (list, order) => {
    const at = new Map(order.map((x, i) => [x, i]));
    return [...list].sort((a, b) => (at.has(a.id) ? at.get(a.id) : 1e9) - (at.has(b.id) ? at.get(b.id) : 1e9));
  };
  const rowsFor = {
    People: ordered(data.people, layout.People.order).map((p) => ({
      id: p.id,
      cells: [p.id, p.name, p.tags.join(', '), p.howMet, p.notes, String(p.cadenceDays), p.lastChat],
    })),
    Chats: ordered(data.logs, layout.Chats.order).map((l) => ({
      id: l.id,
      cells: [l.id, l.date, l.with.join(', '), l.mentions.join(', '), l.note,
        l.with.map(nameOf).join(', '), l.mentions.map(nameOf).join(', ')],
    })),
    Connections: data.links.map((l) => ({ cells: [l.source, l.target, l.label, nameOf(l.source), nameOf(l.target)] })),
    Settings: [{ cells: ['me_name', data.me.name] }, { cells: ['format_version', '1'] }],
  };

  const body = TABS.map((tab) => {
    const extraHeaders = layout[tab]?.extraHeaders || [];
    const extras = layout[tab]?.extras || new Map();
    const width = COLUMNS[tab].length + extraHeaders.length;
    const rows = rowsFor[tab].map((r) => [...r.cells, ...extraHeaders.map((h) => (extras.get(r.id) || {})[h] ?? '')]);
    // Blank out rows left over from a longer previous version, in the same request.
    const blanks = Math.max(0, (layout[tab]?.rows || 0) - rows.length);
    for (let i = 0; i < blanks; i++) rows.push(new Array(width).fill(''));
    return { range: `${tab}!A1:${colLetter(width - 1)}${rows.length + 1}`, values: [[...COLUMNS[tab], ...extraHeaders], ...rows] };
  });

  await gfetch(`${SHEETS}/${id}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'RAW', data: body }),
  });
}

/**
 * appendBackups(id, rows) -> Promise<void>
 *
 * Add rows to the sheet's Backups tab, creating the tab the first time anything needs keeping.
 *
 *   - `id`   — spreadsheet id
 *   - `rows` — `[saved_at, kind, what, details]` rows to append
 */
export async function appendBackups(id, rows) {
  const append = () => gfetch(`${SHEETS}/${id}/values/${encodeURIComponent('Backups!A1')}:append`
    + '?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { method: 'POST', body: JSON.stringify({ values: rows }) });
  try {
    await append();
  } catch (e) {
    if (e.status !== 400) throw e;
    await gfetch(`${SHEETS}/${id}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: 'Backups', gridProperties: { frozenRowCount: 1 } } } }] }),
    });
    await gfetch(`${SHEETS}/${id}/values/${encodeURIComponent('Backups!A1:D1')}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ values: [['saved_at', 'kind', 'what', 'details']] }),
    });
    await append();
  }
}
