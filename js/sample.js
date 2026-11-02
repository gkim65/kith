// Fake people for trying the interface before any real data is connected.

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
 * mulberry32(seed) -> () => number
 *
 * Small seeded random generator so the sample constellation looks the same on every reload.
 *
 *   - `seed` — integer seed
 *
 * Returns a function producing floats in [0, 1).
 */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
  const rand = mulberry32(7);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const people = FIRST.map((first, i) => {
    const circle = CIRCLES[i % CIRCLES.length];
    // Skewed so most people are recent and a long tail is drifting away.
    const days = Math.floor(Math.pow(rand(), 2.2) * 200);
    const last = new Date(today.getTime() - days * 86400000);
    const tags = [circle.tag];
    if (rand() < 0.25) tags.push(pick(CIRCLES).tag);
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
    if (a.id !== b.id) links.push({ source: a.id, target: b.id, label: 'friends' });
  }
  return { people, links };
}
