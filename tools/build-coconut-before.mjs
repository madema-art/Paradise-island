// Baseline source with only the opt-in review harness retained, for an exact in-game A/B check.
import { build, deps } from './coconut-build-runtime.mjs'; import { execFileSync } from 'node:child_process'; import path from 'node:path';
const prior = new Set(['flora.js', 'human.js', 'monkey_model.js', 'fauna_land.js', 'survival/nodes.js', 'survival/avatar.js']);
await build({ entryPoints: ['src/main.js'], bundle: true, outfile: 'dist/coconut-before.js', format: 'iife', target: 'es2020', nodePaths: [deps], loader: { '.glb': 'binary' },
  plugins: [{ name: 'baseline-coconut', setup(b) { b.onLoad({ filter: /\.js$/ }, args => {
    const file = path.relative(path.resolve('src'), args.path).replaceAll('\\', '/');
    if (prior.has(file)) return { contents: execFileSync('git', ['show', '826fedf:src/' + file], { encoding: 'utf8' }), loader: 'js', resolveDir: path.dirname(args.path) };
  }); } }] });
