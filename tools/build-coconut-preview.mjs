import { build, deps } from './coconut-build-runtime.mjs';
import fs from 'node:fs';
const unit = process.argv.includes('--unit');
if (!unit) { fs.mkdirSync('music', { recursive: true }); if (!fs.existsSync('music/playlist.js')) fs.writeFileSync('music/playlist.js', 'window.MUSIC_PLAYLIST=[];'); }
await build({ entryPoints: [unit ? 'tests/coconut.test.js' : 'src/main.js'], bundle: true,
  outfile: unit ? 'work/coconut-unit.mjs' : 'dist/island.js', platform: unit ? 'node' : 'browser',
  format: unit ? 'esm' : 'iife', target: 'es2020', nodePaths: [deps], loader: { '.glb': 'binary' }, logLevel: 'info' });
