import * as THREE from 'three';
import { WORLD, MAX_Y, REACH } from './config.js';
import { sfx } from './audio.js';

/* raycast from the screen center (where the crosshair sits) */
const raycaster = new THREE.Raycaster();
raycaster.far = REACH;
const _ndc = new THREE.Vector2(0, 0);

/** Block under the crosshair → {x,y,z,nx,ny,nz} | null (n* = aimed face normal) */
export function pick(camera, world) {
  raycaster.setFromCamera(_ndc, camera);
  const hits = raycaster.intersectObject(world.mesh);
  if (!hits.length) return null;
  const h = hits[0];
  const k = world.keyOf(h.instanceId);
  if (k === undefined) return null;
  const [x, y, z] = k.split(',').map(Number);
  return { x, y, z,
    nx: Math.round(h.face.normal.x),
    ny: Math.round(h.face.normal.y),
    nz: Math.round(h.face.normal.z) };
}

/* left click — dig. The bottom layer is bedrock */
export function breakBlock(hit, world) {
  if (hit.y === 0) return;
  if (world.remove(hit.x, hit.y, hit.z)) sfx('dig');
}

/* right click — place `type` on the aimed face.
   Refuses out-of-bounds cells, occupied cells, and any cell inside the player's AABB */
export function placeBlock(hit, type, world, player) {
  const x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
  if (x < 0 || x >= WORLD || z < 0 || z >= WORLD || y < 0 || y >= MAX_Y) return;
  if (world.has(x, y, z)) return;

  const p = player.pos, w = player.halfW;             // don't place inside the player
  if (x + 1 > p.x - w && x < p.x + w &&
      z + 1 > p.z - w && z < p.z + w &&
      y + 1 > p.y   && y < p.y + player.height) return;

  if (!world.set(x, y, z, type)) return;              // world at its instance budget
  sfx('place');
}

