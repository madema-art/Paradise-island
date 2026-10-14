import { build, context } from 'esbuild';
import fs from 'node:fs';

// Scan ./music and write music/playlist.js (a plain script, so it also works from file://)
{
  const exts = ['.mp3', '.ogg', '.wav', '.m4a', '.flac', '.opus'];
  fs.mkdirSync('music', { recursive: true });
  const files = fs.readdirSync('music').filter((f) => exts.includes(f.slice(f.lastIndexOf('.')).toLowerCase())).sort();
  const items = files.map((f) => ({ title: f.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' '), src: 'music/' + encodeURIComponent(f) }));
  fs.writeFileSync('music/playlist.js', 'window.MUSIC_PLAYLIST = ' + JSON.stringify(items, null, 2) + ';\n');
  console.log('music: ' + (items.length ? items.map((i) => i.title).join(', ') : 'none found'));
}

const opts = {
  entryPoints: ['src/main.js'],
  bundle: true,
  outfile: 'dist/island.js',
  format: 'iife',
  target: 'es2020',
  sourcemap: false,
  minify: !process.argv.includes('--dev'),
  loader: { '.glb': 'binary' },
  logLevel: 'info',
};

// the development-only wildlife scale viewer (dev/scale_viewer.html), built separately
const devOpts = { ...opts, entryPoints: ['src/dev/scale_viewer.js'], outfile: 'dist/scale_viewer.js' };

if (process.argv.includes('--watch')) {
  const ctx = await context(opts);
  await ctx.watch();
} else {
  await build(opts);
  await build(devOpts);
}
