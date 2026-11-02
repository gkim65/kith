// Fake people for trying the interface before any real data is connected.

import { seededRandom } from './data.js';

const FIRST = ['Ava', 'Ben', 'Chloe', 'Dev', 'Elena', 'Felix', 'Grace', 'Hiro', 'Isla', 'Jonah',
  'Kai', 'Lena', 'Mateo', 'Nora', 'Omar', 'Priya', 'Quinn', 'Rosa', 'Sam', 'Theo',
  'Uma', 'Victor', 'Wren', 'Xavier', 'Yara', 'Zane', 'Amir', 'Bea', 'Cyrus', 'Dana',
  'Eli', 'Fern', 'Gus', 'Hana', 'Ivan', 'June', 'Kofi', 'Lux', 'Mina', 'Nico'];
const LAST = ['Park', 'Lee', 'Okafor', 'Nguyen', 'Silva', 'Rossi', 'Chen', 'Kumar', 'Haddad', 'Moreno'];

const CIRCLES = [
  { tag: 'lab', howMet: 'research group', notes: 'Works on orbit determination. Loves bad puns.' },
  { tag: 'climbing', howMet: 'bouldering gym', notes: 'Projecting a V5. Always has spare tape.' },
  { tag: 'high school', howMet: 'high school', notes: 'Moved to Seattle. Has a cat named Tofu.' },
  { tag: 'conference', howMet: 'AAS conference', notes: 'Poster on cislunar navigation.' },
  { tag: 'roommates', howMet: 'first-year dorm', notes: 'Makes excellent dumplings.' },
  { tag: 'family', howMet: 'family', notes: 'Birthday in March.' },
];

/**
 * makeSample(today) -> { people, links }
 *
 * Build 40 fake people in six friend circles, with "introduced by" links inside each circle
 * and a few bridges between circles.
 *
 *   - `today` — reference date (Date) that `lastChat` dates are counted back from
 *
 * Returns people (`id, name, tags, howMet, notes, cadenceDays, lastChat`) and
 * links (`source, target, label`) referring to people by id.
 */
export function makeSample(today = new Date()) {
  const rand = seededRandom(7);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const people = FIRST.map((first, i) => {
    const circle = CIRCLES[i % CIRCLES.length];
    // Skewed so most people are recent and a long tail is drifting away.
    const days = Math.floor(Math.pow(rand(), 2.2) * 200);
    const last = new Date(today.getTime() - days * 86400000);
    const tags = [circle.tag];
    if (rand() < 0.25) tags.push(pick(CIRCLES).tag);
    if (circle.tag === 'conference') tags.push(rand() < 0.5 ? 'AAS 2026' : 'IAC 2026');
    return {
      id: `p${i}`,
      name: `${first} ${pick(LAST)}`,
      tags: [...new Set(tags)],
      howMet: circle.howMet,
      notes: circle.notes,
      cadenceDays: circle.tag === 'family' ? 14 : 30,
      lastChat: last.toISOString().slice(0, 10),
    };
  });

  const links = [];
  CIRCLES.forEach((circle, c) => {
    const members = people.filter((_, i) => i % CIRCLES.length === c);
    members.slice(1).forEach((p, j) => {
      links.push({ source: members[Math.floor(rand() * (j + 1))].id, target: p.id, label: 'introduced by' });
    });
  });
  for (let k = 0; k < 5; k++) {
    const a = pick(people), b = pick(people);
    const exists = links.some((l) => (l.source === a.id && l.target === b.id) || (l.source === b.id && l.target === a.id));
    if (a.id !== b.id && !exists) links.push({ source: a.id, target: b.id, label: 'friends' });
  }
  return { people, links };
}
