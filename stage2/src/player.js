import * as THREE from 'three';
import { WORLD, GRAVITY, JUMP, WALK, SPRINT } from './config.js';
import { terrainHeight } from './noise.js';
import { sfx } from './audio.js';

const UP = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _wish = new THREE.Vector3();

/** Player physics: AABB-vs-block-grid movement with per-axis collision resolution. */
export function createPlayer(world) {
  const player = {
    pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    onGround: false, halfW: 0.3, height: 1.8, eye: 1.62,
  };

  /* AABB-vs-block-grid collision */
  function collides(px, py, pz) {
    const x0 = Math.floor(px - player.halfW), x1 = Math.floor(px + player.halfW);
    const y0 = Math.floor(py),                 y1 = Math.floor(py + player.height);
    const z0 = Math.floor(pz - player.halfW), z1 = Math.floor(pz + player.halfW);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++)
          if (world.has(x, y, z)) return true;
    return false;
  }

  player.respawn = () => {
    const x = 16, z = 16;
    player.pos.set(x + 0.5, terrainHeight(x, z) + 1.01, z + 0.5);
    player.vel.set(0, 0, 0);
  };

  /** One physics tick. `keys` is main.js's active-key map; `camera` supplies the look yaw. */
  player.step = (dt, keys, camera) => {
    // desired horizontal velocity from camera yaw
    camera.getWorldDirection(_fwd); _fwd.y = 0; _fwd.normalize();
    _right.crossVectors(_fwd, UP);
    const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    const s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    _wish.set(0, 0, 0).addScaledVector(_fwd, f).addScaledVector(_right, s);
    if (_wish.lengthSq() > 0)
      _wish.normalize().multiplyScalar(keys.ShiftLeft || keys.ShiftRight ? SPRINT : WALK);

    const blend = 1 - Math.exp(-14 * dt);
    player.vel.x += (_wish.x - player.vel.x) * blend;
    player.vel.z += (_wish.z - player.vel.z) * blend;
    player.vel.y = Math.max(player.vel.y - GRAVITY * dt, -18);   // gravity + terminal velocity

    if (keys.Space && player.onGround) {
      player.vel.y = JUMP; player.onGround = false; sfx('jump');
    }

    const p = player.pos, w = player.halfW;

    // X axis: move, then clamp out of any block we hit
    let nx = p.x + player.vel.x * dt;
    if (collides(nx, p.y, p.z)) {
      nx = player.vel.x > 0
        ? Math.floor(nx + w) - w - 1e-4
        : Math.floor(nx - w) + 1 + w + 1e-4;
      if (collides(nx, p.y, p.z)) nx = p.x;
      player.vel.x = 0;
    }
    p.x = nx;

    // Z axis
    let nz = p.z + player.vel.z * dt;
    if (collides(p.x, p.y, nz)) {
      nz = player.vel.z > 0
        ? Math.floor(nz + w) - w - 1e-4
        : Math.floor(nz - w) + 1 + w + 1e-4;
      if (collides(p.x, p.y, nz)) nz = p.z;
      player.vel.z = 0;
    }
    p.z = nz;

    // Y axis: land on / bonk against blocks
    let ny = p.y + player.vel.y * dt;
    if (collides(p.x, ny, p.z)) {
      if (player.vel.y <= 0) { ny = Math.floor(ny) + 1 + 1e-4; player.onGround = true; }
      else { ny = Math.floor(ny + player.height) - player.height - 1e-4; }
      player.vel.y = 0;
    } else {
      player.onGround = false;
    }
    p.y = ny;

    // keep on the island, respawn if the floor got dug out
    p.x = THREE.MathUtils.clamp(p.x, 0.4, WORLD - 0.4);
    p.z = THREE.MathUtils.clamp(p.z, 0.4, WORLD - 0.4);
    if (p.y < -24) player.respawn();
  };

  player.respawn();
  return player;
}

