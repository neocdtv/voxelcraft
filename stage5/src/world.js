import * as THREE from 'three';
import { WORLD, TYPES, MAX_INSTANCES, TREE_CHANCE, CACTUS_CHANCE, CAVE_CUT, ORE_CHANCE, SEA, SNOW_H, DRY_C }
  from './config.js';
import { hash2, hash3, valueNoise, valueNoise3, terrainHeight } from './noise.js';

/**
 * Owns the block Map and its single InstancedMesh (one draw call for the whole world),
 * plus a derived translucent water layer. Every mutation is atomic: data + meshes stay in sync.
 */
export function createWorld(scene) {
  const blocks = new Map();                          // "x,y,z" -> type name
  const key = (x, y, z) => x + ',' + y + ',' + z;
  const setIfEmpty = (x, y, z, t) => { const k = key(x, y, z); if (!blocks.has(k)) blocks.set(k, t); };

  /* ---- terrain fill with biome tinting: deserts where the low-freq field is dry, snow on peaks */
  for (let x = 0; x < WORLD; x++)
    for (let z = 0; z < WORLD; z++) {
      const h   = terrainHeight(x, z);
      const dry = valueNoise(x * .09 + 513, z * .09 + 77) >= DRY_C;     // biome field: desert or not
      for (let y = 0; y <= h; y++) {
        let t;
        if (y === h)              t = dry ? 'sand' : h <= SEA + 1 ? 'sand' : h >= SNOW_H ? 'snow' : 'grass';
        else if (y >= h - 2)      t = 'dirt';
        else                      t = 'stone';
        blocks.set(key(x, y, z), t);
      }
    }

  /* ---- caves: carve pockets where 3D noise crosses the threshold.
     The top block and bedrock are never touched → no floating slabs, spawn area stays solid */
  for (let x = 0; x < WORLD; x++)
    for (let z = 0; z < WORLD; z++) {
      const h = terrainHeight(x, z);
      if ((x - 16) * (x - 16) + (z - 16) * (z - 16) <= 9) continue;     // keep the spawn area solid
      for (let y = 1; y < h; y++) {                                     // surface layer protected, so roofs stay walkable... 
        const n = valueNoise3((x + 917) * .30, (y + 509) * .18, (z + 461) * .30);   // stretched vertically → room-like
        if (n > CAVE_CUT) blocks.delete(key(x, y, z));                  // holes are just missing map entries — physics already handles them
      }
    }

  /* ---- ores: hash-gated type swaps inside the surviving stone */
  const oreSwap = [];
  for (const [k, t] of blocks) {
    if (t !== 'stone') continue;
    const [x, y, z] = k.split(',').map(Number);
    const r = hash3(x * 7 + 911, y * 13 + 401, z * 17 + 26);
    if (r < ORE_CHANCE) {
      const q = hash3(x * 5 + 77, y * 3 + 991, z * 11 + 13);
      oreSwap.push([k, q < .45 ? 'coal' : q < .85 ? 'iron' : 'gold']);   // gold is the rare one
    }
  }
  for (const [k, t] of oreSwap) blocks.set(k, t);

  /* ---- trees: hash-gated on grass-topped columns only (deserts & snowlines get none automatically) */
  for (let x = 2; x < WORLD - 2; x++)                // margin so canopies fit on the island
    for (let z = 2; z < WORLD - 2; z++) {
      if (x === 16 && z === 16) continue;            // keep the spawn column clear
      const h = terrainHeight(x, z);
      if (blocks.get(key(x, h, z)) !== 'grass') continue;              // no trees on sand/dirt tops
      if (hash2(x * 3 + 7, z * 5 + 11) > TREE_CHANCE) continue;

      const t = 4 + (hash2(x * 13 + 5, z * 7 + 3) < .5 ? 0 : 1);        // trunk height 4–5
      for (let y = h + 1; y <= h + t; y++) setIfEmpty(x, y, z, 'wood');

      /* two wide octagon layers on top of the trunk */
      for (let ly = 0; ly < 2; ly++) {
        const y = h + t + ly;
        for (let dx = -2; dx <= 2; dx++)
          for (let dz = -2; dz <= 2; dz++)
            if (Math.abs(dx) + Math.abs(dz) <= 3) setIfEmpty(x + dx, y, z + dz, 'leaves');
      }
      /* small plus-shaped cap */
      const yTop = h + t + 2;
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++)
          if (Math.abs(dx) + Math.abs(dz) <= 1) setIfEmpty(x + dx, yTop, z + dz, 'leaves');
    }

  /* ---- cacti: two-block verticals on the dry sandy flats */
  for (let x = 0; x < WORLD; x++)
    for (let z = 0; z < WORLD; z++) {
      const h   = terrainHeight(x, z);
      const dry = valueNoise(x * .09 + 513, z * .09 + 77) >= DRY_C;
      if (!dry || blocks.get(key(x, h, z)) !== 'sand') continue;
      if (hash2(x * 11 + 3, z * 7 + 9) > CACTUS_CHANCE) continue;
      setIfEmpty(x, h + 1, z, 'cactus');
      setIfEmpty(x, h + 2, z, 'cactus');
    }

  /* one InstancedMesh holds the whole world — single draw call */
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    MAX_INSTANCES);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  const instanceKeys = new Array(MAX_INSTANCES);     // instanceId -> block key
  const _m = new THREE.Matrix4();
  const _c = new THREE.Color();

  function rebuild() {
    let i = 0;
    for (const [k, t] of blocks) {
      const [x, y, z] = k.split(',').map(Number);
      _m.makeTranslation(x + 0.5, y + 0.5, z + 0.5);
      mesh.setMatrixAt(i, _m);
      _c.setHex(TYPES[t]).offsetHSL(0, 0, (hash2(x * 7 + y * 131, z * 13 + y * 17) - 0.5) * 0.05);
      mesh.setColorAt(i, _c);
      instanceKeys[i] = k;
      i++;
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /* ---- water: a derived fluid, not stored in `blocks`.
     Rule: every empty cell at/below SEA is water → basins fill on their own, digging deep makes pools,
     building into a lake drains that cell. Drawn cells are only those touching non-water (no ghost faces). */
  const waterMesh = new THREE.InstancedMesh(
    /* .9-tall box: top face sits just below the block line → crisp waterline at shores, no z-fighting */
    new THREE.BoxGeometry(1, 0.9, 1),
    new THREE.MeshLambertMaterial({ color: 0x3d86c8, transparent: true, opacity: 0.5 }),
    WORLD * WORLD * (SEA + 1));                      // exact maximum — can never overflow
  waterMesh.frustumCulled = false;                   // player swims inside it

  let rawWater = new Set();                          // logical water cells → inWater() queries
  function rebuildWater() {
    const next = new Set();
    for (let y = 0; y <= SEA; y++)
      for (let x = 0; x < WORLD; x++)
        for (let z = 0; z < WORLD; z++)
          if (!blocks.has(key(x, y, z))) next.add(key(x, y, z));

    let i = 0;
    for (const k of next) {
      const [x, y, z] = k.split(',').map(Number);
      const exposed = !next.has(key(x + 1, y, z)) || !next.has(key(x - 1, y, z)) ||
                      !next.has(key(x, y + 1, z)) || !next.has(key(x, y - 1, z)) ||
                      !next.has(key(x, y, z + 1)) || !next.has(key(x, y, z - 1));
      if (!exposed) continue;                        // buried volume → skip (avoids interior ghost faces)
      _m.makeTranslation(x + 0.5, y + 0.5, z + 0.5);
      waterMesh.setMatrixAt(i++, _m);
    }
    waterMesh.count = i;
    waterMesh.instanceMatrix.needsUpdate = true;
    rawWater = next;
  }

  function afterChange() { rebuild(); rebuildWater(); }   // one mutation → both meshes refresh together
  afterChange();                                           // initial build (terrain + trees + first lake fill)

  /* block-target highlight */
  const highlight = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)),
    new THREE.LineBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.85 }));
  highlight.visible = false;

  /* voxel DDA march — distance from (ox,oy,oz) along unit dir to the first solid block's face, up to maxT.
     Null if clear. A few dozen map lookups worst case → cheap enough to run every frame */
  function rayDist(ox, oy, oz, dx, dy, dz, maxT) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const tDX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tMX = dx !== 0 ? (dx > 0 ? x + 1 - ox : ox - x) * tDX : Infinity;
    let tMY = dy !== 0 ? (dy > 0 ? y + 1 - oy : oy - y) * tDY : Infinity;
    let tMZ = dz !== 0 ? (dz > 0 ? z + 1 - oz : oz - z) * tDZ : Infinity;

    for (;;) {
      let t;
      if (tMX < tMY && tMX < tMZ)  { t = tMX; x += stepX; tMX += tDX; }
      else if (tMY < tMZ)          { t = tMY; y += stepY; tMY += tDY; }
      else                         { t = tMZ; z += stepZ; tMZ += tDZ; }
      if (t > maxT) return null;                          // walked the whole range, nothing solid ahead
      if (blocks.has(key(x, y, z))) return t;             // distance to the face we're about to enter
    }
  }

  scene.add(mesh, waterMesh, highlight);

  return {
    mesh,                                             // raycast target for interact.js (water is NOT pickable — you aim at the bed)
    get count()   { return mesh.count; },             // HUD block counter
    get watern()  { return rawWater.size; },          // HUD water counter
    keyOf(i)     { return instanceKeys[i]; },         // instanceId -> "x,y,z" | undefined
    has(x, y, z) { return blocks.has(key(x, y, z)); },
    get(x, y, z) { return blocks.get(key(x, y, z)); },// type name | undefined

    /** True if the point (world coords, floats ok) is submerged. */
    inWater(fx, fy, fz) { return rawWater.has(key(Math.floor(fx), Math.floor(fy), Math.floor(fz))); },

    rayDist,                                          // third-person camera uses this to keep out of walls

    /** Add a block. False if the world is at its instance budget and the cell was empty. */
    set(x, y, z, t) {
      const k = key(x, y, z);
      if (!blocks.has(k) && blocks.size >= MAX_INSTANCES) return false;  // keep buffers in bounds
      blocks.set(k, t);
      afterChange();                                   // also drains any water cell you built into
      return true;
    },

    remove(x, y, z) {
      if (!blocks.delete(key(x, y, z))) return false;
      afterChange();                                   // a dug-out hole below sea level fills itself with water
      return true;
    },

    /** Show the target box on `hit` ({x,y,z} from interact.pick); null hides it. */
    setHighlight(hit) {
      highlight.visible = !!hit;
      if (hit) highlight.position.set(hit.x + .5, hit.y + .5, hit.z + .5);
    }
  };
}

