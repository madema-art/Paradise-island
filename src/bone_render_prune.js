// Bone visibility can prune render/shadow traversal without stopping matrices or
// skeleton evaluation. Keep every branch containing any drawable, even a hidden
// prop: it may become visible later. Child-add events restore newly occupied paths.
export function createBoneRenderPruner() {
  const eligible = new Set(), listened = new WeakSet();
  let enabled = false;
  const drawable = o => o.isMesh || o.isLine || o.isPoints || o.isSprite || o.isLight || o.isCamera || o.isLOD;
  function added() {
    for (let p = this; p; p = p.parent) if (eligible.delete(p)) p.visible = true;
  }
  function scan(o) {
    if (!listened.has(o)) { o.addEventListener('childadded', added); listened.add(o); }
    let has = !!drawable(o);
    for (const child of o.children) has = scan(child) || has;
    if (o.isBone && o.visible && !has) { eligible.add(o); if (enabled) o.visible = false; }
    return has;
  }
  return {
    get count() { return eligible.size; },
    add(root) { scan(root); },
    set(on) { enabled = on; for (const o of eligible) o.visible = !on; },
    get enabled() { return enabled; },
  };
}
