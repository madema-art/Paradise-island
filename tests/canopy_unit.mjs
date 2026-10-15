import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
fs.mkdirSync('work', { recursive: true });
await build({ entryPoints: ['tests/canopy_geometry.test.js'], bundle: true, platform: 'node', format: 'esm', outfile: 'work/canopy-unit.mjs',
    plugins: [{ name: 'no-render-core', setup(b) { b.onLoad({ filter: /[\\/]src[\\/]core\.js$/ }, () => ({ contents: `import * as THREE from 'three';
      export const U = { pxScale: { value: 1000 } };
      export const camera = new THREE.PerspectiveCamera();
      export const scene = new THREE.Scene();
      export const updaters = [];`, loader: 'js' })); } }] });
const result = spawnSync(process.execPath, ['--test', 'work/canopy-unit.mjs', 'tests/geometry_normals.test.js'], { stdio: 'inherit' });
process.exitCode = result.status;
