// Review renders (development only, ?shots=1). The browser pane has no frame callback while hidden and its screenshots can be stale, so a frame is
// rendered by hand and copied onto an overlay canvas that the screenshot then shows. The world's scenery can be hidden (so a creature is seen clearly
// on a plain floor) and restored; creatures are shown by the game's own renderer, instanced parts and all.
//   __shots.begin(cols)        overlay on; scenery off (pass false to keep the scenery)
//   __shots.shoot(c, i, o)     render creature c into tile i; o: {dist, yaw, pitch, height, fov, target:[x,y,z]}
//   __shots.end()              overlay off, scenery back
import * as THREE from 'three';
import { scene, camera, renderer, composer, env } from '../core.js';
import { getHeight } from '../world.js';

let hidden = [], ov = null, floor = null, cols = 4, cw = 360, ch = 240;
const api = {
  begin(c = 4, hideScenery = true, w = 360, h = 240, keepKeys = []) {
    cols = c; cw = w; ch = h;
    if (hideScenery) {
      const fauna = new Set();
      scene.children.forEach((o, i) => { if (o.isLight || o.name === 'instanced parts' || o === camera || (o.userData.inspect && keepKeys.includes(o.userData.inspect.key))) return; let hasC = false; o.traverse((x) => { if (x.userData && x.userData.creature) hasC = true; }); if (hasC) { fauna.add(o); return; } if (o.visible) { o.visible = false; hidden.push(o); } });
      floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x6a8a4a })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
    }
    ov = document.createElement('canvas'); ov.width = cols * cw; ov.height = 4 * ch;
    Object.assign(ov.style, { position: 'fixed', left: 0, top: 0, zIndex: 99999, width: innerWidth + 'px', height: innerWidth * (ov.height / ov.width) + 'px', background: '#345' });
    document.body.appendChild(ov);
    return 'ok';
  },
  clear() { if (ov) { const x = ov.getContext('2d'); x.fillStyle = '#345'; x.fillRect(0, 0, ov.width, ov.height); } },
  shoot(c, i, o = {}) {
    const g = c.group, p = o.target ? new THREE.Vector3(...o.target) : c.focus(new THREE.Vector3());
    if (floor) { floor.position.set(p.x, getHeight(p.x, p.z) - 0.02, p.z); floor.updateMatrixWorld(true); }
    if (!o.still) window.__step(0.001);
    if (o.game) {                                    // the game's own camera, as it stands
      composer.render(); composer.render();
      const x = ov.getContext('2d'), s = renderer.domElement, tx = (i % cols) * cw, ty = Math.floor(i / cols) * ch;
      x.drawImage(s, 0, 0, s.width, s.height, tx, ty, cw, ch);
      if (o.label) { x.fillStyle = '#fff'; x.font = '15px sans-serif'; x.fillText(o.label, tx + 6, ty + 18); }
      return camera.position.toArray();
    }
    const d = o.dist ?? 1.5, yaw = o.yaw ?? 0.8, pitch = o.pitch ?? 0.35;
    camera.fov = o.fov ?? 40; camera.aspect = cw / ch; camera.updateProjectionMatrix();
    camera.position.set(p.x + Math.sin(yaw) * Math.cos(pitch) * d, p.y + (o.height ?? 0) + Math.sin(pitch) * d, p.z + Math.cos(yaw) * Math.cos(pitch) * d);
    camera.lookAt(p.x, p.y + (o.height ?? 0), p.z); camera.updateMatrixWorld(true);
    composer.render(); composer.render();
    const x = ov.getContext('2d'), s = renderer.domElement, tx = (i % cols) * cw, ty = Math.floor(i / cols) * ch;
    x.drawImage(s, 0, 0, s.width, s.height, tx, ty, cw, ch);
    if (o.label) { x.fillStyle = '#fff'; x.font = '15px sans-serif'; x.fillText(o.label, tx + 6, ty + 18); }
    return p.toArray().map((v) => +v.toFixed(2));
  },
  end() { hidden.forEach((o) => { o.visible = true; }); hidden = []; if (floor) { scene.remove(floor); floor = null; } if (ov) { ov.remove(); ov = null; } },
};
window.__shots = api;
export default api;
