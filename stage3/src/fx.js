import * as THREE from 'three';

/* Block-break particle bursts. One pooled InstancedMesh → a single extra draw call total. */
const MAX_PARTICLES = 80;
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);   // zero-scale matrix hides an instance
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export function createFx(scene) {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.12),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    MAX_PARTICLES);
  mesh.frustumCulled = false;                            // tiny bits fly behind the camera constantly
  scene.add(mesh);

  const P = Array.from({ length: MAX_PARTICLES }, () => ({
    alive: false, x: 0, y: -10, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1 }));
  let cursor = 0;

  /** Burst of `count` debris cubes around cell center (cx,cy,cz), tinted by block color. */
  function burst(cx, cy, cz, hex, count = 14) {
    for (let i = 0; i < count; i++) {
      const id = cursor;                                 // this particle's instance slot
      cursor = (id + 1) % MAX_PARTICLES;                 // round robin: steals oldest when full — fine
      const p = P[id];
      const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 3;
      p.alive   = true;
      p.x       = cx + (Math.random() - .5) * .7;        // start inside the broken cell
      p.y       = cy + (Math.random() - .5) * .7;
      p.z       = cz + (Math.random() - .5) * .7;
      p.vx      = Math.cos(a) * sp;
      p.vz      = Math.sin(a) * sp;
      p.vy      = 2 + Math.random() * 3.5;               // upward bias — debris pops out of the hole
      p.maxLife = p.life = .4 + Math.random() * .4;
      _c.setHex(hex).offsetHSL(0, 0, (Math.random() - .5) * .16);   // slight per-bit tint variation
      mesh.setColorAt(id, _c);
    }
  }

  function step(dt) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = P[i];
      if (!p.alive) { mesh.setMatrixAt(i, HIDDEN); continue; }
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; mesh.setMatrixAt(i, HIDDEN); continue; }
      p.vy -= 18 * dt;                                   // lighter gravity than the player — debris feel
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = .4 + .6 * (p.life / p.maxLife);          // shrink toward end of life
      _m.compose(_p.set(p.x, p.y, p.z), _q, _s.setScalar(k));
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;   // 80 colors — negligible to re-upload
  }

  return { burst, step };
}

