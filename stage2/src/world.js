import * as THREE from 'three';
import { WORLD, TYPES, MAX_INSTANCES } from './config.js';
import { hash2, terrainHeight } from './noise.js';

/**
 * Owns the block Map and its single InstancedMesh (one draw call for the whole world).
 * Every mutation is atomic: data + mesh stay in sync.
 */
export function createWorld(scene) {
  const blocks = new Map();                          // "x,y,z" -> type name
  const key = (x, y, z) => x + ',' + y + ',' + z;

  /* ---- deterministic initial terrain fill ---- */
  for (let x = 0; x < WORLD; x++)
    for (let z = 0; z < WORLD; z++) {
      const h = terrainHeight(x, z);
      for (let y = 0; y <= h; y++) {
        blocks.set(key(x, y, z),
          y === h     ? (h <= 2 ? 'sand' : 'grass')
          : y >= h - 2 ? 'dirt'
          :              'stone');
      }
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
  rebuild();

  /* block-target highlight */
  const highlight = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)),
    new THREE.LineBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.85 }));
  highlight.visible = false;

  scene.add(mesh, highlight);

  return {
    mesh,                                             // raycast target for interact.js
    get count() { return mesh.count; },               // HUD block counter
    keyOf(i)     { return instanceKeys[i]; },         // instanceId -> "x,y,z" | undefined
    has(x, y, z) { return blocks.has(key(x, y, z)); },

    /** Add a block. False if the world is at its instance budget and the cell was empty. */
    set(x, y, z, t) {
      const k = key(x, y, z);
      if (!blocks.has(k) && blocks.size >= MAX_INSTANCES) return false;  // keep buffers in bounds
      blocks.set(k, t);
      rebuild();
      return true;
    },

    remove(x, y, z) {
      if (!blocks.delete(key(x, y, z))) return false;
      rebuild();
      return true;
    },

    /** Show the target box on `hit` ({x,y,z} from interact.pick); null hides it. */
    setHighlight(hit) {
      highlight.visible = !!hit;
      if (hit) highlight.position.set(hit.x + .5, hit.y + .5, hit.z + .5);
    }
  };
}

