import { build } from 'esbuild';
import fs from 'node:fs';
fs.mkdirSync('music', { recursive: true });
if (!fs.existsSync('music/playlist.js')) fs.writeFileSync('music/playlist.js', 'window.MUSIC_PLAYLIST = [];\n');
await build({ entryPoints: ['src/main.js'], bundle: true, outfile: 'dist/island.js', format: 'iife', target: 'es2020', minify: false, loader: { '.glb': 'binary' }, logLevel: 'info' });
