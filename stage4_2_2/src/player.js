import * as THREE from 'three';
import { WORLD, GRAVITY, JUMP, WALK, SPRINT, SEA } from './config.js';
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
    /* never start underwater: at least a full body above the waterline */
    player.pos.set(x + 0.5, Math.max(terrainHeight(x, z) + 1.01, SEA + 2), z + 0.5);
    player.vel.set(0, 0, 0);
  };

  /** One physics tick. `keys` is main.js's active-key map; `camera` supplies the look yaw. */
  player.step = (dt, keys, camera) => {
    // desired horizontal velocity from camera yaw
    camera.getWorldDirection(_fwd); _fwd.y = 0; _fwd.normalize();
    _right.crossVectors(_fwd, UP);
    const f = (keys.ArrowUp ? 1 : 0)   - (keys.ArrowDown ? 1 : 0);    // forth / back... 
    const s = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);   // strafe right / left


    /* swimming state: body center submerged */
    const inWater = world.inWater(player.pos.x, player.pos.y + .9, player.pos.z);

    _wish.set(0, 0, 0).addScaledVector(_fwd, f).addScaledVector(_right, s);
    if (_wish.lengthSq() > 0)
      _wish.normalize().multiplyScalar((keys.ShiftLeft || keys.ShiftRight ? SPRINT : WALK) * (inWater ? .6 : 1));

    const blend = 1 - Math.exp(-14 * dt);
    player.vel.x += (_wish.x - player.vel.x) * blend;
    player.vel.z += (_wish.z - player.vel.z) * blend;

    /* vertical: a grounded jump works at full strength — dry or submerged.
       Mid-water (not on ground): SPACE ramps up to rise speed, release sinks gently */
    if (keys.Space && player.onGround) {
      player.vel.y = JUMP;
      player.onGround = false;
      sfx('jump');
    } else if (inWater) {
      if (keys.Space) player.vel.y = Math.min(player.vel.y + 28 * dt, 4);                 // smooth ramp to rise speed... 
      else           player.vel.y = Math.max(player.vel.y - GRAVITY * .45 * dt, -3.5);    // gentle sink floor
    } else {
      player.vel.y = Math.max(player.vel.y - GRAVITY * dt, -18);                          // gravity + terminal velocity
    }

    const p = player.pos, w = player.halfW;

    // X axis: move, then clamp out of any block we hit
    let nx = p.x + player.vel.x * dt;
    if (collides(nx, p.y, p.z)) {
      nx = player.vel.x > 0
        ? Math.floor(nx + w) - w - 1e-4
        : Math.floor(nx - w) + 1 + w + 1e-4;
      if (collides(nx, p.y, p.z)) nx = p.x;                       // corner case → don't move this frame
      player.vel.x = 0;
    }
    p.x = nx;

    // Z axis: same treatment
    let nz = p.z + player.vel.z * dt;
    if (collides(p.x, p.y, nz)) {
      nz = player.vel.z > 0
        ? Math.floor(nz + w) - w - 1e-4
        : Math.floor(nz - w) + 1 + w + 1e-4;
      if (collides(p.x, p.y, nz)) nz = p.z;                       // corner case → don't move this frame
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

    // keep on the island, respawn if you fall out of a cave floor into the void
    p.x = THREE.MathUtils.clamp(p.x, 0.4, WORLD - 0.4);
    p.z = THREE.MathUtils.clamp(p.z, 0.4, WORLD - 0.4);
    if (p.y < -24) player.respawn();
  };

  player.respawn();
  return player;
}

