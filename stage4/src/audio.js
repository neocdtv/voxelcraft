/* Tiny WebAudio blips — no assets needed */
let actx = null;

export function sfx(kind) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime;
    const o = actx.createOscillator(), g = actx.createGain();
    o.connect(g).connect(actx.destination);
    if (kind === 'dig')   { o.type = 'square'; o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(70,  t + 0.10); g.gain.setValueAtTime(0.10, t); }
    if (kind === 'place') { o.type = 'square'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(330, t + 0.08); g.gain.setValueAtTime(0.10, t); }
    if (kind === 'jump')  { o.type = 'sine';   o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(420, t + 0.12); g.gain.setValueAtTime(0.05, t); }
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.start(t); o.stop(t + 0.16);
  } catch (e) { /* audio unavailable — ignore */ }
}

