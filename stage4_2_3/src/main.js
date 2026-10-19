import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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
scene.background = new THREE.Color(0x8fc8ff);           
scene.fog = new THREE.Fog(0x8fc8ff, 45, 130);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 300);
scene.add(camera);

/* ========================= lights: day/night ======================== */
const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5c6b46, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1cf, 1.7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -46, right: 46, top: 46, bottom: -46, near: 5, far: 200 });
sun.target.position.set(16, 0, 16);
scene.add(sun, sun.target);

/* ---- visible sky bodies -------------------------------------------- */
const ISLE_C = new THREE.Vector3(16, 0, 16);            
const SKY_R  = 200;                                     
const _dir   = new THREE.Vector3();

const sunDiscMat  = new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true,               toneMapped: false, fog: false });
const moonDiscMat = new THREE.MeshBasicMaterial({ color: 0xdfe9ff, transparent: true, opacity: 0,   toneMapped: false, fog: false });
const sunDisc  = new THREE.Mesh(new THREE.SphereGeometry(7,   20, 14), sunDiscMat);
const moonDisc = new THREE.Mesh(new THREE.SphereGeometry(5.5, 20, 14), moonDiscMat);
scene.add(sunDisc, moonDisc);

const SKY_DAY   = new THREE.Color(0x8fc8ff), SKY_NIGHT = new THREE.Color(0x0f1d45), COL_DUSK  = new THREE.Color(0xff8c42);
const HEM_SKY_D = new THREE.Color(0xcfe8ff), HEM_SKY_N = new THREE.Color(0x2e3f66);
const HEM_GND_D = new THREE.Color(0x5c6b46), HEM_GND_N = new THREE.Color(0x141c2b);
const SUN_NOON  = new THREE.Color(0xfff1cf), SUN_WARM  = new THREE.Color(0xffa04d);
const _sky = new THREE.Color();
scene.background = _sky;                                 

let dayT = 0.06;                                        

function updateSky(t) {
  const ang  = t * Math.PI * 2;                         
  const hgt  = Math.sin(ang);                           
  const dL   = THREE.MathUtils.smoothstep(hgt, -0.12, 0.35);             
  const dusk = Math.pow(THREE.MathUtils.clamp(1 - Math.abs(hgt) / 0.22, 0, 1), 2);   

  _sky.copy(SKY_NIGHT).lerp(SKY_DAY, dL).lerp(COL_DUSK, dusk * .7);
  scene.fog.color.copy(_sky);                           

  sun.position.set(16 + Math.cos(ang) * 42, hgt * 55, 26);
  sun.intensity = 1.7 * dL;                             
  sun.color.copy(SUN_WARM).lerp(SUN_NOON, THREE.MathUtils.smoothstep(hgt, -0.05, .5));   

  _dir.copy(sun.position).sub(ISLE_C).normalize();
  sunDisc.position.copy(ISLE_C).addScaledVector(_dir, SKY_R);
  moonDisc.position.copy(ISLE_C).addScaledVector(_dir, -SKY_R);         
  sunDiscMat.opacity = Math.min(1, dL * 4);                            
  sunDisc.visible    = dL > 0;                                         
  moonDiscMat.opacity = 1 - dL;                                        
  moonDisc.visible    = (1 - dL) > 0.02;

  hemi.intensity       = .16 + .79 * dL;                   
  hemi.color.copy(HEM_SKY_N).lerp(HEM_SKY_D, dL);
  hemi.groundColor.copy(HEM_GND_N).lerp(HEM_GND_D, dL);
}

function dayClock(t) {                                     
  const h24 = (t * 24 + 6) % 24;
  return `${String(Math.floor(h24)).padStart(2, '0')}:${String(Math.floor((h24 % 1) * 60)).padStart(2, '0')}`;
}

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
const world  = createWorld(scene);                      
const player = createPlayer(world);                     
const fx     = createFx(scene);                         

updateSky(dayT);                                       

/* ========================= GLTF Voxelizer =========================== */
function voxelizeTriangle(a, b, c, world, type) {
  const distAB = a.distanceTo(b);
  const distBC = b.distanceTo(c);
  const distCA = c.distanceTo(a);

  const maxEdge = Math.max(distAB, distBC, distCA);

  // Subdivide until the triangle fits inside half a voxel
  if (maxEdge < 0.4) {
    const center = new THREE.Vector3().copy(a).add(b).add(c).divideScalar(3);
    const x = Math.floor(center.x);
    const y = Math.floor(center.y);
    const z = Math.floor(center.z);
    
    // Bounds check to ensure we don't build into the skybox or void
    if (y >= 0 && y < 128) { 
      world.set(x, y, z, type);
    }
    return;
  }

  const m = new THREE.Vector3();
  if (maxEdge === distAB) {
    m.copy(a).lerp(b, 0.5);
    voxelizeTriangle(a, m, c, world, type);
    voxelizeTriangle(m, b, c, world, type);
  } else if (maxEdge === distBC) {
    m.copy(b).lerp(c, 0.5);
    voxelizeTriangle(a, b, m, world, type);
    voxelizeTriangle(a, m, c, world, type);
  } else {
    m.copy(c).lerp(a, 0.5);
    voxelizeTriangle(a, b, m, world, type);
    voxelizeTriangle(m, b, c, world, type);
  }
}

const gltfLoader = new GLTFLoader();
gltfLoader.load('./model.glb', (gltf) => {
  const model = gltf.scene;

  // 1. Get the original dimensions of the raw model
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // 2. Scale it to fit the world (e.g., max 120 blocks wide/tall)
  const MAX_SIZE = 250; 
  const maxDim = Math.max(size.x, size.y, size.z);
  const scaleFactor = MAX_SIZE / maxDim;
  model.scale.setScalar(scaleFactor);

  // 3. Recalculate the box now that it has been scaled
  box.setFromObject(model);
  box.getCenter(center);
  box.getSize(size);

  // 4. Center it at (128, 128) and rest the bottom exactly on the grass (y = 1)
  const targetX = 128;
  const targetZ = 128;
  const targetY = 1 + (size.y / 2); 

  // Offset the model by the difference between its current center and our target center
  model.position.x += (targetX - center.x);
  model.position.y += (targetY - center.y);
  model.position.z += (targetZ - center.z);

  // 5. Bake the new transforms into the vertices for the voxelizer
  model.updateMatrixWorld(true);

  // 6. Traverse the model and extract triangles into an array first
  const triangles = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  model.traverse((child) => {
    if (child.isMesh) {
      const geometry = child.geometry;
      const position = geometry.attributes.position;
      const index = geometry.index;
      const matrix = child.matrixWorld;

      if (index) {
        for (let i = 0; i < index.count; i += 3) {
          a.fromBufferAttribute(position, index.getX(i)).applyMatrix4(matrix);
          b.fromBufferAttribute(position, index.getX(i + 1)).applyMatrix4(matrix);
          c.fromBufferAttribute(position, index.getX(i + 2)).applyMatrix4(matrix);
          triangles.push({ a: a.clone(), b: b.clone(), c: c.clone() });
        }
      } else {
        for (let i = 0; i < position.count; i += 3) {
          a.fromBufferAttribute(position, i).applyMatrix4(matrix);
          b.fromBufferAttribute(position, i + 1).applyMatrix4(matrix);
          c.fromBufferAttribute(position, i + 2).applyMatrix4(matrix);
          triangles.push({ a: a.clone(), b: b.clone(), c: c.clone() });
        }
      }
    }
  });

  // 7. Process the triangles asynchronously in batches
  async function processVoxelization() {
    const BATCH_SIZE = 250; // Adjust this: lower is smoother, higher is faster loading

    for (let i = 0; i < triangles.length; i++) {
      const t = triangles[i];
      voxelizeTriangle(t.a, t.b, t.c, world, 'stone');

      // Yield to the main thread every BATCH_SIZE triangles
      if (i % BATCH_SIZE === 0) {
        // await a short timeout to let the renderer catch up and draw the frame
        await new Promise(resolve => setTimeout(resolve, 0)); 
      }
    }

    console.log("Model voxelization complete!");

    // Place the player in the middle of the model at the highest point
    if (player && player.pos) {
      player.pos.x = targetX;
      player.pos.y = targetY + (size.y / 2) + 2;
      player.pos.z = targetZ;
    }
  }

  // Start the batch process
  processVoxelization();

}, undefined, (error) => {
  console.error("Failed to load GLB:", error);
});

/* ============================ input & UI ============================= */
const controls = new PointerLockControls(camera, renderer.domElement);
ui.onLockRequested(() => controls.lock());
controls.addEventListener('lock',   () => ui.setLocked(true));
controls.addEventListener('unlock', () => { ui.setLocked(false); world.setHighlight(null); });

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
    if (r) fx.burst(r.x + .5, r.y + .5, r.z + .5, TYPES[r.type]);   
  } else if (e.button === 2) placeBlock(hit, HOTBAR[ui.getSelected()], world, player);
});
addEventListener('contextmenu', e => e.preventDefault());

/* ============================ main loop ============================== */
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.033);

  dayT = (dayT + dt / DAY_LENGTH) % 1;                 
  updateSky(dayT);

  if (controls.isLocked) {
    player.step(dt, keys, camera);
    world.setHighlight(pick(camera, world));           
  }

  for (const c of clouds) { c.position.x += dt * 1.1; if (c.position.x > 80) c.position.x = -80; }
  fx.step(dt);                                         

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
