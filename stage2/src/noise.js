/* Deterministic value-noise terrain — pure math, no imports */

function hash2(x, z) {
  let n = (Math.imul(x, 374761393) + Math.imul(z, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const u = x - xi, v = z - zi;
  const sm = t => t * t * (3 - 2 * t);
  const a = hash2(xi, zi),     b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  const su = sm(u), sv = sm(v);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
}

/** Terrain surface height for column (x, z): 1..10 */
export function terrainHeight(x, z) {
  const n = valueNoise(x * 0.13 + 37, z * 0.13 + 91) * 0.65
          + valueNoise(x * 0.37 + 7,  z * 0.37 + 13) * 0.35;
  return Math.max(1, Math.round(1 + n * 9));        // 1..10
}

/* also used by world.js for per-instance color jitter */
export { hash2 };

