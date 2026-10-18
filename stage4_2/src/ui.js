import { HOTBAR, TYPES } from './config.js';

/* DOM refs — safe at module scope: module scripts run after the body is parsed */
const overlay   = document.getElementById('overlay');
const crosshair = document.getElementById('crosshair');
const hud       = document.getElementById('hud');
const hotbar    = document.getElementById('hotbar');

for (const [i, t] of HOTBAR.entries()) {
  const slot = document.createElement('div');
  slot.className = 'slot' + (i === 0 ? ' active' : '');
  slot.innerHTML = `<span>${i + 1}</span><div class="swatch" style="background:#${TYPES[t].toString(16).padStart(6, '0')}"></div>`;
  hotbar.appendChild(slot);
}

let selected = 0;                                     // active hotbar slot
export function getSelected() { return selected; }
export function selectSlot(i) {
  selected = i;
  [...hotbar.children].forEach((el, j) => el.classList.toggle('active', j === i));
}

/* pointer-locked? toggles the overlay and crosshair */
export function setLocked(locked) {
  overlay.classList.toggle('hidden', locked);
  crosshair.style.display = locked ? 'block' : 'none';
}

/** main.js registers what a click on the start/pause screen does (lock pointer, etc.) */
export function onLockRequested(fn) { overlay.addEventListener('click', fn); }

export function setHud(text) { hud.textContent = text; }

