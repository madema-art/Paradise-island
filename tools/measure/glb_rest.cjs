// Rest-pose measurement of a GLB model, from the source file (not from the running game).
// Walks the node tree at its default (rest) transforms, transforms the real vertices of every mesh, and reports the extents of the
// whole model and of named parts. Animation, skin deformation and anything not in the file are ignored. Use:
//   node tools/measure/glb_rest.cjs assets/boar.glb [--exclude=regex] [--include=regex] [--bones=regex]
// --bones prints the chain length along matching joints (for snakes: the extended body length from head to tail tip).
const fs = require('fs');
const path = require('path');

const COMP = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const TYPE_N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readGlb(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB: ' + file);
  const jl = b.readUInt32LE(12);
  const json = JSON.parse(b.slice(20, 20 + jl).toString('utf8'));
  const binStart = 20 + jl + 8;
  return { json, bin: b.slice(binStart) };
}

function accessorArray(gltf, idx) {
  const { json, bin } = gltf;
  const acc = json.accessors[idx];
  const bv = json.bufferViews[acc.bufferView];
  const [Arr, csize] = COMP[acc.componentType];
  const n = TYPE_N[acc.type];
  const stride = bv.byteStride || csize * n;
  const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const out = new Float64Array(acc.count * n);
  for (let i = 0; i < acc.count; i++) {
    for (let k = 0; k < n; k++) {
      const off = base + i * stride + k * csize;
      const v = new Arr(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + csize))[0];
      out[i * n + k] = acc.normalized ? v / (acc.componentType === 5121 ? 255 : 32767) : v;
    }
  }
  return { data: out, n, count: acc.count };
}

function localMatrix(node) {
  if (node.matrix) return node.matrix.slice();
  const t = node.translation || [0, 0, 0], r = node.rotation || [0, 0, 0, 1], s = node.scale || [1, 1, 1];
  const [x, y, z, w] = r;
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [
    (1 - 2 * (yy + zz)) * s[0], 2 * (xy + wz) * s[0], 2 * (xz - wy) * s[0], 0,
    2 * (xy - wz) * s[1], (1 - 2 * (xx + zz)) * s[1], 2 * (yz + wx) * s[1], 0,
    2 * (xz + wy) * s[2], 2 * (yz - wx) * s[2], (1 - 2 * (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const xform = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

/** every node's world matrix at its rest transform (scene roots only) */
function worldMatrices(json) {
  const world = new Array(json.nodes.length);
  const visit = (i, parentM) => {
    const m = mul(parentM, localMatrix(json.nodes[i]));
    world[i] = m;
    for (const c of json.nodes[i].children || []) visit(c, m);
  };
  const scene = json.scenes[json.scene || 0];
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const root of scene.nodes) visit(root, identity);
  return world;
}

/** the world-space points of every mesh (rest pose), as {name, points} */
function meshPoints(gltf, world) {
  const out = [];
  gltf.json.nodes.forEach((node, i) => {
    if (node.mesh === undefined || world[i] === undefined) return;
    const mesh = gltf.json.meshes[node.mesh];
    mesh.primitives.forEach((p) => {
      if (p.attributes.POSITION === undefined) return;
      const pos = accessorArray(gltf, p.attributes.POSITION);
      const pts = new Float64Array(pos.count * 3);
      for (let v = 0; v < pos.count; v++) {
        const q = xform(world[i], pos.data[v * 3], pos.data[v * 3 + 1], pos.data[v * 3 + 2]);
        pts[v * 3] = q[0]; pts[v * 3 + 1] = q[1]; pts[v * 3 + 2] = q[2];
      }
      out.push({ name: node.name || mesh.name || ('mesh' + node.mesh), points: pts });
    });
  });
  return out;
}

function extents(list) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const m of list) for (let i = 0; i < m.points.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], m.points[i + k]); hi[k] = Math.max(hi[k], m.points[i + k]); }
  if (lo[0] === Infinity) return null;
  return { min: lo.map((v) => +v.toFixed(4)), max: hi.map((v) => +v.toFixed(4)), size: hi.map((v, k) => +(v - lo[k]).toFixed(4)) };
}

function main() {
  const file = process.argv[2];
  const opt = Object.fromEntries(process.argv.slice(3).map((a) => { const m = a.match(/^--(\w+)=(.*)$/); return m ? [m[1], m[2]] : [a, true]; }));
  const gltf = readGlb(file);
  const world = worldMatrices(gltf.json);
  let meshes = meshPoints(gltf, world);
  const ex = opt.exclude ? new RegExp(opt.exclude, 'i') : null;
  const inc = opt.include ? new RegExp(opt.include, 'i') : null;
  const kept = meshes.filter((m) => (!ex || !ex.test(m.name)) && (!inc || inc.test(m.name)));
  const result = {
    file: path.basename(file),
    all_meshes: meshes.map((m) => m.name),
    kept_meshes: kept.map((m) => m.name),
    model_extents: extents(kept),
  };
  if (opt.bones) {
    // chain length of joints matching the regex: the sum of the rest distances along the parent chain, from the most distant joint
    const re = new RegExp(opt.bones, 'i');
    const joints = [];
    gltf.json.nodes.forEach((n, i) => { if (n.name && re.test(n.name)) joints.push(i); });
    const pos = (i) => [world[i][12], world[i][13], world[i][14]];
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const parent = {};
    gltf.json.nodes.forEach((n, i) => (n.children || []).forEach((c) => { parent[c] = i; }));
    let best = null;
    for (const j of joints) {
      let len = 0, cur = j; const chain = [];
      while (cur !== undefined && joints.includes(cur)) { chain.push(gltf.json.nodes[cur].name); if (parent[cur] !== undefined && joints.includes(parent[cur])) len += dist(pos(parent[cur]), pos(cur)); cur = parent[cur]; }
      if (!best || len > best.length) best = { length: +len.toFixed(4), from: gltf.json.nodes[j].name, chainLength: chain.length };
    }
    result.joint_chain = best;
    result.joints_matched = joints.map((i) => gltf.json.nodes[i].name);
  }
  if (opt.chain) {
    // anatomical length along a body made of separate segments: the sum of the distances between successive segment centres,
    // in the order of their numbers (for example bd_m0 ... bd_m31), plus the head if given
    const re = new RegExp(opt.chain, 'i');
    const segs = meshes.filter((m) => re.test(m.name)).map((m) => {
      const n = m.points.length / 3; const c = [0, 0, 0];
      for (let i = 0; i < m.points.length; i += 3) { c[0] += m.points[i]; c[1] += m.points[i + 1]; c[2] += m.points[i + 2]; }
      return { name: m.name, idx: parseInt((m.name.match(/(d+)D*$/) || [0, 0])[1], 10), c: c.map((v) => v / n) };
    }).sort((a, b) => a.idx - b.idx);
    let len = 0;
    for (let i = 1; i < segs.length; i++) len += Math.hypot(segs[i].c[0] - segs[i - 1].c[0], segs[i].c[1] - segs[i - 1].c[1], segs[i].c[2] - segs[i - 1].c[2]);
    result.segment_chain = { segments: segs.length, length: +len.toFixed(4), first: segs[0] && segs[0].name, last: segs[segs.length - 1] && segs[segs.length - 1].name };
  }
  console.log(JSON.stringify(result, null, 1));
}
main();
