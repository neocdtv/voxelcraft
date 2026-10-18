import * as THREE from 'three';
import { WORLD, TYPES, MAX_INSTANCES, SEA } from './config.js';
import { hash2 } from './noise.js';

/**
 * Owns the block Map and its single InstancedMesh (one draw call for the whole world),
 * plus a derived translucent water layer. Every mutation is atomic: data + meshes stay in sync.
 */
export function createWorld(scene) {
  const blocks = new Map();                          // "x,y,z" -> type name
  const key = (x, y, z) => x + ',' + y + ',' + z;

  /* ---- Flat floor for GLTF loading ---- */
  for (let x = 0; x < WORLD; x++) {
    for (let z = 0; z < WORLD; z++) {
      // Create a single layer of grass at the very bottom so you don't fall into the void
      blocks.set(key(x, 0, z), 'grass');
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
  const keyToInstance = new Map();                   // block key -> instanceId
  const _m = new THREE.Matrix4();
  const _c = new THREE.Color();

  function rebuild() {
    let i = 0;
    keyToInstance.clear();
    for (const [k, t] of blocks) {
      const [x, y, z] = k.split(',').map(Number);
      _m.makeTranslation(x + 0.5, y + 0.5, z + 0.5);
      mesh.setMatrixAt(i, _m);
      _c.setHex(TYPES[t]).offsetHSL(0, 0, (hash2(x * 7 + y * 131, z * 13 + y * 17) - 0.5) * 0.05);
      mesh.setColorAt(i, _c);
      
      instanceKeys[i] = k;
      keyToInstance.set(k, i);
      i++;
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /* ---- water: a derived fluid, not stored in `blocks`. */
  const waterMesh = new THREE.InstancedMesh(
    /* .9-tall box: top face sits just below the block line → crisp waterline at shores, no z-fighting */
    new THREE.BoxGeometry(1, 0.9, 1),
    new THREE.MeshLambertMaterial({ color: 0x3d86c8, transparent: true, opacity: 0.5 }),
    WORLD * WORLD * (SEA + 1));                      // exact maximum — can never overflow
  waterMesh.frustumCulled = false;                   // player swims inside it

  const waterKeys = new Array(WORLD * WORLD * (SEA + 1));
  const waterKeyToInstance = new Map();
  let rawWater = new Set();                          // logical water cells → inWater() queries
  
  function rebuildWater() {
    rawWater.clear();
    waterKeyToInstance.clear();
    
    for (let y = 0; y <= SEA; y++)
      for (let x = 0; x < WORLD; x++)
        for (let z = 0; z < WORLD; z++)
          if (!blocks.has(key(x, y, z))) rawWater.add(key(x, y, z));

    let i = 0;
    for (const k of rawWater) {
      const [x, y, z] = k.split(',').map(Number);
      const exposed = !rawWater.has(key(x + 1, y, z)) || !rawWater.has(key(x - 1, y, z)) ||
                      !rawWater.has(key(x, y + 1, z)) || !rawWater.has(key(x, y - 1, z)) ||
                      !rawWater.has(key(x, y, z + 1)) || !rawWater.has(key(x, y, z - 1));
      if (!exposed) continue;                        // buried volume → skip (avoids interior ghost faces)
      
      _m.makeTranslation(x + 0.5, y + 0.5, z + 0.5);
      waterMesh.setMatrixAt(i, _m);
      waterKeys[i] = k;
      waterKeyToInstance.set(k, i);
      i++;
    }
    waterMesh.count = i;
    waterMesh.instanceMatrix.needsUpdate = true;
  }

  function updateLocalWater(x, y, z) {
    // 1. Update logical water state
    if (y <= SEA) {
      const k = key(x, y, z);
      if (blocks.has(k)) rawWater.delete(k);
      else rawWater.add(k);
    }

    // 2. Helper to refresh a specific coordinate
    const refresh = (wx, wy, wz) => {
      if (wy > SEA || wx < 0 || wx >= WORLD || wz < 0 || wz >= WORLD) return;
      
      const k = key(wx, wy, wz);
      const isWater = rawWater.has(k);
      
      let exposed = false;
      if (isWater) {
         exposed = !rawWater.has(key(wx + 1, wy, wz)) || !rawWater.has(key(wx - 1, wy, wz)) ||
                   !rawWater.has(key(wx, wy + 1, wz)) || !rawWater.has(key(wx, wy - 1, wz)) ||
                   !rawWater.has(key(wx, wy, wz + 1)) || !rawWater.has(key(wx, wy, wz - 1));
      }
      
      const currentlyRendered = waterKeyToInstance.has(k);
      
      if (exposed && !currentlyRendered) {
         const id = waterMesh.count;
         _m.makeTranslation(wx + 0.5, wy + 0.5, wz + 0.5);
         waterMesh.setMatrixAt(id, _m);
         waterKeys[id] = k;
         waterKeyToInstance.set(k, id);
         waterMesh.count++;
         waterMesh.instanceMatrix.needsUpdate = true;
         
      } else if (!exposed && currentlyRendered) {
         const id = waterKeyToInstance.get(k);
         const lastId = waterMesh.count - 1;
         
         if (id !== lastId) {
            const lastKey = waterKeys[lastId];
            waterMesh.getMatrixAt(lastId, _m);
            waterMesh.setMatrixAt(id, _m);
            waterKeys[id] = lastKey;
            waterKeyToInstance.set(lastKey, id);
         }
         
         waterKeyToInstance.delete(k);
         waterMesh.count--;
         waterMesh.instanceMatrix.needsUpdate = true;
      }
    };

    // 3. Evaluate the target block and its 6 neighbors
    refresh(x, y, z);
    refresh(x + 1, y, z);
    refresh(x - 1, y, z);
    refresh(x, y + 1, z);
    refresh(x, y - 1, z);
    refresh(x, y, z + 1);
    refresh(x, y, z - 1);
  }

  /* one mutation → both meshes refresh together (used only for initial setup now) */
  function afterChange() { rebuild(); rebuildWater(); }   
  afterChange();                                           

  /* block-target highlight */
  const highlight = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)),
    new THREE.LineBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.85 }));
  highlight.visible = false;

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

    /** Add a block in O(1) */
    set(x, y, z, t) {
      const k = key(x, y, z);
      if (blocks.has(k)) return false; 
      if (mesh.count >= MAX_INSTANCES) return false;

      blocks.set(k, t);

      // Append to the end of the active instances
      const id = mesh.count;
      _m.makeTranslation(x + 0.5, y + 0.5, z + 0.5);
      mesh.setMatrixAt(id, _m);
      _c.setHex(TYPES[t]).offsetHSL(0, 0, (hash2(x * 7 + y * 131, z * 13 + y * 17) - 0.5) * 0.05);
      mesh.setColorAt(id, _c);

      instanceKeys[id] = k;
      keyToInstance.set(k, id);
      
      mesh.count++;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      
      updateLocalWater(x, y, z);
      return true;
    },

    /** Remove a block in O(1) */
    remove(x, y, z) {
      const k = key(x, y, z);
      if (!blocks.has(k)) return false;

      const id = keyToInstance.get(k);
      const lastId = mesh.count - 1;
      
      // Swap the deleted element with the last active element
      if (id !== lastId) {
        const lastKey = instanceKeys[lastId];
        
        mesh.getMatrixAt(lastId, _m);
        mesh.setMatrixAt(id, _m);
        mesh.getColorAt(lastId, _c);
        mesh.setColorAt(id, _c);
        
        instanceKeys[id] = lastKey;
        keyToInstance.set(lastKey, id);
      }

      blocks.delete(k);
      keyToInstance.delete(k);
      
      mesh.count--;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

      updateLocalWater(x, y, z);
      return true;
    },

    /** Show the target box on `hit` ({x,y,z} from interact.pick); null hides it. */
    setHighlight(hit) {
      highlight.visible = !!hit;
      if (hit) highlight.position.set(hit.x + .5, hit.y + .5, hit.z + .5);
    }
  };
}
