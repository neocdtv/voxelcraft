import * as THREE from 'three';

/* Minecraft-style player figure, shown only in third-person view.
   A handful of boxes sharing 4 materials → negligible cost (hidden entirely in first person). */

export function createFigure(scene) {
  const skinMat  = new THREE.MeshLambertMaterial({ color: 0xd7a37c });
  const shirtMat = new THREE.MeshLambertMaterial({ color: 0x1fa9a0 });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x4a52b8 });
  const hairMat  = new THREE.MeshLambertMaterial({ color: 0x4a3220 });

  function box(w, h, d, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.castShadow = true;
    return m;
  }

  /* feet at y=0 … hair top ~1.89 (player.height is 1.8 — close enough to read as "you") */
  const g = new THREE.Group();
  const legL = box(0.2, 0.7, 0.3, pantsMat); legL.position.set(-0.15, 0.35, 0);
  const legR = box(0.2, 0.7, 0.3, pantsMat); legR.position.set( 0.15, 0.35, 0);
  const body = box(0.5, 0.7, 0.3, shirtMat); body.position.set(0, 1.05, 0);          // y 0.7..1.4
  const armL = box(0.2, 0.6, 0.24, skinMat);  armL.position.set(-0.35, 1.08, 0);     // shoulders at torso top
  const armR = box(0.2, 0.6, 0.24, skinMat);  armR.position.set( 0.35, 1.08, 0);
  const head = box(0.46, 0.46, 0.46, skinMat); head.position.set(0, 1.65, 0);        // y ~1.42..1.88
  const hair = box(0.5, 0.12, 0.5, hairMat);   hair.position.set(0, 1.83, 0);        // cap on the skull

  g.add(legL, legR, body, armL, armR, head, hair);
  g.visible = false;                                     // first person by default (no face in your view)
  scene.add(g);

  return {
    setMode(third) { g.visible = third; },

    /** Feet at (px,py,pz), body turned toward the horizontal look dir → its back faces a camera behind you. */
    update(px, py, pz, dx, dz) {
      g.position.set(px, py, pz);
      g.rotation.y = Math.atan2(-dx, -dz);               // local −Z (face direction) aligned to world dir
    }
  };
}

