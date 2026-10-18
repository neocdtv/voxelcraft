import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { HOTBAR } from './config.js';
import { createWorld  } from './world.js';
import { pick, breakBlock, placeBlock } from './interact.js';
import { createPlayer } from './player.js';
import * as ui         from './ui.js';

/* ============================== scene =============================== */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc8ff);
scene.fog = new THREE.Fog(0x8fc8ff, 45, 130);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 300);
scene.add(camera);

scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x5c6b46, 0.95));
const sun = new THREE.DirectionalLight(0xfff1cf, 1.7);
sun.position.set(38, 62, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 10, far: 150 });
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);

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
const world  = createWorld(scene);     // blocks Map + InstancedMesh + highlight
const player = createPlayer(world);    // physics, starts at island center via respawn()

/* ============================ input & UI ============================= */
const controls = new PointerLockControls(camera, renderer.domElement);
ui.onLockRequested(() => controls.lock());
controls.addEventListener('lock',   () => ui.setLocked(true));
controls.addEventListener('unlock', () => { ui.setLocked(false); world.setHighlight(null); });

/* active keys (e.code -> bool), passed into the physics step each frame */
const keys = Object.create(null);
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  const d = e.code.match(/^Digit([1-4])$/);
  if (d) ui.selectSlot(+d[1] - 1);
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('wheel', e => ui.selectSlot((ui.getSelected() + (e.deltaY > 0 ? 1 : 3)) % 4));

renderer.domElement.addEventListener('mousedown', e => {
  if (!controls.isLocked) return;
  const hit = pick(camera, world);
  if (!hit) return;
  if (e.button === 0) breakBlock(hit, world);
  else if (e.button === 2) placeBlock(hit, HOTBAR[ui.getSelected()], world, player);
});
addEventListener('contextmenu', e => e.preventDefault());

/* ============================ main loop ============================== */
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.033);

  if (controls.isLocked) {
    player.step(dt, keys, camera);
    world.setHighlight(pick(camera, world));        // null hides the target box
  }

  for (const c of clouds) { c.position.x += dt * 1.1; if (c.position.x > 80) c.position.x = -80; }

  camera.position.set(player.pos.x, player.pos.y + player.eye, player.pos.z);
  ui.setHud(
    `blocks ${world.count}  ·  x ${player.pos.x.toFixed(1)}  y ${player.pos.y.toFixed(1)}  z ${player.pos.z.toFixed(1)}`);
  renderer.render(scene, camera);
});

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

