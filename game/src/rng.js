'use strict';
/* Deterministic pseudo-random helpers for Sky Courier: Ring Run.
   Every scatter in the world (clouds, trees, villages) comes from a seeded
   generator so the island looks the same on every machine and every run. */

function makeRng(seed) {
  let state = (seed >>> 0) || 1;
  function next() {
    // xorshift32: tiny, fast, and identical across browsers.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  }
  function range(lo, hi) {
    return lo + next() * (hi - lo);
  }
  function pick(list) {
    return list[Math.floor(next() * list.length) % list.length];
  }
  return { next, range, pick };
}

/* A stable 2D hash used to jitter terrain detail without storing a grid. */
function hash2(x, z) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* Smooth value noise: bilinear interpolation of hashed lattice points. */
function valueNoise(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const sx = xf * xf * (3 - 2 * xf);
  const sz = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi);
  const b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1);
  const d = hash2(xi + 1, zi + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function angleDelta(from, to) {
  return wrapAngle(to - from);
}
