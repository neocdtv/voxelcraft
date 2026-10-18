/* Deterministic value-noise terrain — pure math, no imports */

function hash2(x, z) {
  let n = (Math.imul(x, 374761393) + Math.imul(z, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function hash3(x, y, z) {
  let n = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function valueNoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const u = x - xi, v = z - zi;
  const smt = t => t * t * (3 - 2 * t);
  const a = hash2(xi, zi),     b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  const su = smt(u), sv = smt(v);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
}

export function valueNoise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = x - xi, v = y - yi, w = z - zi;
  const smt = t => t * t * (3 - 2 * t);
  const su = smt(u), sv = smt(v), sw = smt(w);
  const lerp = (a, b, t) => a + (b - a) * t;
  return lerp(
    lerp(lerp(hash3(xi   , yi   , zi   ), hash3(xi+1, yi   , zi   ), su),
         lerp(hash3(xi   , yi   , zi+1 ), hash3(xi+1, yi   , zi+1 ), su), sv),
    lerp(lerp(hash3(xi   , yi+1 , zi   ), hash3(xi+1, yi+1 , zi   ), su),
         lerp(hash3(xi   , yi+1 , zi+1 ), hash3(xi+1, yi+1 , zi+1 ), su), sv),
    sw);
}

/** Terrain surface height for column (x,z): 0..~12 — basin floors up to snowy peaks.
 *  The exponent deepens low areas below the waterline and sharpens high ones above SNOW_H */
export function terrainHeight(x, z) {
  const n = valueNoise(x * .13 + 37, z * .13 + 91) * .65
          + valueNoise(x * .37 + 7,  z * .37 + 13) * .35;      // bell-shaped around ~.4–.6
  const s = Math.min(1, n);                                    // safety clamp to [0,1]
  return Math.max(0, Math.round(Math.pow(s, 1.7) * 12));
}

/* also consumed by world.js: color jitter + ore / feature placement rolls */
export { hash2, hash3 };

