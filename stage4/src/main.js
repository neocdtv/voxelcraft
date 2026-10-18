import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { HOTBAR, TYPES, DAY_LENGTH } from './config.js';
import { createWorld  } from './world.js';
import { pick, breakBlock, placeBlock } from './interact.js';
import { createPlayer } from './player.js';
import * as ui         from './ui.js';
import { createFx     } from './fx.js';

/* ============================== scene =============================== */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc8ff);           // live-updated by the sky system below
scene.fog = new THREE.Fog(0x8fc8ff, 45, 130);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 300);
scene.add(camera);

/* ========================= lights: day/night ======================== */
const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5c6b46, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1cf, 1.7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
/* wider frustum + island center: with the sun orbiting, the old ±30 box clipped corners */
Object.assign(sun.shadow.camera, { left: -46, right: 46, top: 46, bottom: -46, near: 5, far: 200 });
sun.target.position.set(16, 0, 16);
scene.add(sun, sun.target);

/* ---- visible sky bodies -------------------------------------------- */
const ISLE_C = new THREE.Vector3(16, 0, 16);            // orbit center: island middle
const SKY_R  = 200;                                     // past fog far (130), inside camera.far (300)
const _dir   = new THREE.Vector3();

/* basic materials + toneMapped:false → crisp discs that don't wash out under ACES */
const sunDiscMat  = new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true,               toneMapped: false, fog: false });
const moonDiscMat = new THREE.MeshBasicMaterial({ color: 0xdfe9ff, transparent: true, opacity: 0,   toneMapped: false, fog: false });
const sunDisc  = new THREE.Mesh(new THREE.SphereGeometry(7,   20, 14), sunDiscMat);
const moonDisc = new THREE.Mesh(new THREE.SphereGeometry(5.5, 20, 14), moonDiscMat);
scene.add(sunDisc, moonDisc);

/* sky palette + reused temp color (no per-frame allocations) */
const SKY_DAY   = new THREE.Color(0x8fc8ff), SKY_NIGHT = new THREE.Color(0x0f1d45), COL_DUSK  = new THREE.Color(0xff8c42);
const HEM_SKY_D = new THREE.Color(0xcfe8ff), HEM_SKY_N = new THREE.Color(0x2e3f66);
const HEM_GND_D = new THREE.Color(0x5c6b46), HEM_GND_N = new THREE.Color(0x141c2b);
const SUN_NOON  = new THREE.Color(0xfff1cf), SUN_WARM  = new THREE.Color(0xffa04d);
const _sky = new THREE.Color();
scene.background = _sky;                                 // live Color instance, lerped every frame

let dayT = 0.06;                                        // start at ~7:30 (t=0 is sunrise, t=.25 noon)

function updateSky(t) {
  const ang  = t * Math.PI * 2;                         // sun orbits a vertical plane over the island
  const hgt  = Math.sin(ang);                           // -1 midnight … +1 noon
  const dL   = THREE.MathUtils.smoothstep(hgt, -0.12, 0.35);             // daylight ramp across horizon
  const dusk = Math.pow(THREE.MathUtils.clamp(1 - Math.abs(hgt) / 0.22, 0, 1), 2);   // band at the horizon

  _sky.copy(SKY_NIGHT).lerp(SKY_DAY, dL).lerp(COL_DUSK, dusk * .7);
  scene.fog.color.copy(_sky);                           // fog always matches the sky

  sun.position.set(16 + Math.cos(ang) * 42, hgt * 55, 26);
  sun.intensity = 1.7 * dL;                             // fades out just before going under the horizon
  sun.color.copy(SUN_WARM).lerp(SUN_NOON, THREE.MathUtils.smoothstep(hgt, -0.05, .5));   // warm at low angles

  /* sky bodies: sun where the light shines from, moon on its exact opposite */
  _dir.copy(sun.position).sub(ISLE_C).normalize();
  sunDisc.position.copy(ISLE_C).addScaledVector(_dir, SKY_R);
  moonDisc.position.copy(ISLE_C).addScaledVector(_dir, -SKY_R);         // rises as the sun sets
  sunDiscMat.opacity = Math.min(1, dL * 4);                            // fades in just after the horizon
  sunDisc.visible    = dL > 0;                                         // light under ground → no disc either
  moonDiscMat.opacity = 1 - dL;                                        // full at midnight, gone by morning
  moonDisc.visible    = (1 - dL) > 0.02;

  hemi.intensity       = .16 + .79 * dL;                   // dim blue floor at night — moonlight, not void
  hemi.color.copy(HEM_SKY_N).lerp(HEM_SKY_D, dL);
  hemi.groundColor.copy(HEM_GND_N).lerp(HEM_GND_D, dL);
}

function dayClock(t) {                                     // in-world time: t=0 → 06:00
  const h24 = (t * 24 + 6) % 24;
  return `${String(Math.floor(h24)).padStart(2, '0')}:${String(Math.floor((h24 % 1) * 60)).padStart(2, '0')}`;
}

/* drifting clouds */
const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
const clouds = [];
for (let i = 0; i < 9; i++) {
  const g = new THREE.Group();
  const puffs = 3 + (i % 3);
  for (let j = 0; j < puffs; j++) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(3 + Math.random() * 5, 0.9, 2.5 + Math.random() * 3.5), cloudMat);
    m.position.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 5);
    g.add(m);
  }
  g.position.set(Math.random() * 140 - 70, 26 + Math.random() * 8, Math.random() * 140 - 70);
  scene.add(g);
  clouds.push(g);
}

/* ============================== systems ============================= */
const world  = createWorld(scene);                      // blocks Map + InstancedMesh (+ trees) + highlight
const player = createPlayer(world);                     // physics, spawns at island center
const fx     = createFx(scene);                         // particle pool for block-break bursts

updateSky(dayT);                                       // paint the first frame's sky immediately

/* ============================ input & UI ============================= */
const controls = new PointerLockControls(camera, renderer.domElement);
ui.onLockRequested(() => controls.lock());
controls.addEventListener('lock',   () => ui.setLocked(true));
controls.addEventListener('unlock', () => { ui.setLocked(false); world.setHighlight(null); });

/* active keys (e.code -> bool), passed into the physics step each frame */
const keys = Object.create(null);
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  const d = e.code.match(/^Digit([1-9])$/);
  if (d && +d[1] - 1 < HOTBAR.length) ui.selectSlot(+d[1] - 1);
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('wheel', e => ui.selectSlot((ui.getSelected() + (e.deltaY > 0 ? 1 : HOTBAR.length - 1)) % HOTBAR.length));

renderer.domElement.addEventListener('mousedown', e => {
  if (!controls.isLocked) return;
  const hit = pick(camera, world);
  if (!hit) return;
  if (e.button === 0) {
    const r = breakBlock(hit, world);
    if (r) fx.burst(r.x + .5, r.y + .5, r.z + .5, TYPES[r.type]);   // debris in the block's color
  } else if (e.button === 2) placeBlock(hit, HOTBAR[ui.getSelected()], world, player);
});
addEventListener('contextmenu', e => e.preventDefault());

/* ============================ main loop ============================== */
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.033);

  dayT = (dayT + dt / DAY_LENGTH) % 1;                 // the sky keeps moving while paused — world stays alive
  updateSky(dayT);

  if (controls.isLocked) {
    player.step(dt, keys, camera);
    world.setHighlight(pick(camera, world));           // null hides the target box
  }

  for (const c of clouds) { c.position.x += dt * 1.1; if (c.position.x > 80) c.position.x = -80; }
  fx.step(dt);                                         // let in-flight debris finish even on pause

  camera.position.set(player.pos.x, player.pos.y + player.eye, player.pos.z);
  ui.setHud(
    `blocks ${world.count}  ·  water ${world.watern}  ·  x ${player.pos.x.toFixed(1)}  y ${player.pos.y.toFixed(1)}  z ${player.pos.z.toFixed(1)}  ·  ${dayClock(dayT)}`);

  renderer.render(scene, camera);
});

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

