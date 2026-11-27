'use strict';
/* The island of Vesper Cay: a deterministic heightfield with a runway,
   a ring course, scattered trees and drifting clouds.
   World axes: x east, z south, y up. Sea level is y = 0. */

const WORLD = {
  islandRadius: 5200,      // metres from centre to open sea
  peakHeight: 620,         // highest summit, metres
  runway: {
    x: 0,                  // centreline x
    zStart: -520,          // threshold (south end)
    zEnd: 520,             // far end (north end)
    halfWidth: 23,         // 46 m wide strip
    elevation: 14,         // the airfield plateau sits 14 m above the sea
  },
  ringRadius: 62,          // fly-through hoop radius, metres
};

/* Smoothstep helper for shaping coasts and the airfield plateau. */
function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/* Raw island height before the airfield flattening is applied. */
function islandHeight(x, z) {
  const dist = Math.hypot(x, z);
  const falloff = 1 - smoothstep(WORLD.islandRadius * 0.55, WORLD.islandRadius, dist);
  if (falloff <= 0) return -30; // open sea floor, well under the surface
  const broad = valueNoise(x / 1500 + 11.3, z / 1500 + 4.7);
  const ridge = valueNoise(x / 620 + 2.1, z / 620 + 8.9);
  const detail = valueNoise(x / 180 + 5.5, z / 180 + 1.2);
  let h = broad * 0.62 + ridge * 0.3 + detail * 0.08;
  h = Math.pow(h, 1.55);
  // A spine of high ground running north-west keeps the course interesting.
  const spine = Math.exp(-Math.pow((x + z * 0.45 + 900) / 1300, 2)) * 0.34;
  h += spine * broad;
  return (h * WORLD.peakHeight - 26) * falloff - 4 * (1 - falloff);
}

/* Final terrain height: island plus a flattened airfield plateau. */
function terrainHeight(x, z) {
  let h = islandHeight(x, z);
  const r = WORLD.runway;
  const dx = Math.abs(x - r.x);
  const dz = Math.max(r.zStart - 260 - z, 0, z - (r.zEnd + 260));
  const nearField = 1 - smoothstep(90, 420, Math.max(dx - 60, 0) + dz);
  if (nearField > 0) h = lerp(h, r.elevation, nearField);
  return h;
}

function isOnRunway(x, z) {
  const r = WORLD.runway;
  return Math.abs(x - r.x) <= r.halfWidth && z >= r.zStart && z <= r.zEnd;
}

function groundBelow(x, z) {
  return isOnRunway(x, z) ? WORLD.runway.elevation : terrainHeight(x, z);
}

/* Colour of a terrain cell from its height and slope. */
function terrainColour(h, slope) {
  if (h < 0.6) return '#2563a0';                    // sea
  if (h < 3.2) return '#d9c48f';                    // beach sand
  if (slope > 1.7) return '#8a8378';                // bare rock faces
  if (h < 120) return '#5d9b4a';                    // lowland grass
  if (h < 260) return '#4a7d3c';                    // forest green
  if (h < 430) return '#7d7a6a';                    // high scrub and stone
  return '#eef2f5';                                 // snow caps
}

/* The ring course: eight hoops over coast, ridge and harbour, then home. */
const RINGS = [
  { x: 0,     y: 390, z: -1500, name: 'Departure Gate' },
  { x: -1250, y: 230, z: -2300, name: 'West Coast Hoop' },
  { x: -2100, y: 420, z: -900,  name: 'Spine Saddle' },
  { x: -1500, y: 520, z: 700,   name: 'Summit Ring' },
  { x: -300,  y: 340, z: 1900,  name: 'Harbour Turn' },
  { x: 1200,  y: 210, z: 1500,  name: 'East Fields' },
  { x: 1900,  y: 480, z: 200,   name: 'Lighthouse Loop' },
  { x: 700,   y: 240, z: -1100, name: 'Homeward Gate' },
];

/* Scattered scenery, generated once from a fixed seed. */
function buildScenery() {
  const rng = makeRng(20261126);
  const trees = [];
  for (let i = 0; i < 900; i++) {
    const x = rng.range(-4200, 4200);
    const z = rng.range(-4200, 4200);
    const h = terrainHeight(x, z);
    if (h > 6 && h < 300 && !isOnRunway(x, z)) {
      trees.push({ x, z, y: h, s: rng.range(7, 15) });
    }
  }
  const clouds = [];
  for (let i = 0; i < 46; i++) {
    clouds.push({
      x: rng.range(-6000, 6000),
      z: rng.range(-6000, 6000),
      y: rng.range(720, 1050),
      s: rng.range(180, 460),
      drift: rng.range(2, 6),
    });
  }
  const houses = [];
  for (let i = 0; i < 60; i++) {
    const x = rng.range(-900, 900) + 1500;
    const z = rng.range(-700, 700) + 1500;
    const h = terrainHeight(x, z);
    if (h > 4 && h < 90) houses.push({ x, z, y: h, s: rng.range(9, 16), rot: rng.range(0, Math.PI) });
  }
  return { trees, clouds, houses };
}

const SCENERY = buildScenery();
