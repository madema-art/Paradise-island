// Rebuild the baseline revision with the same benchmark camera ordering fix.
// Source remains the original revision; no other checkout is changed.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const ref = process.argv[2] || 'ef68087aad788654c3e12e0848cb4afbac1bf53e';
await build({ entryPoints: ['src/main.js'], bundle: true, outfile: 'work/baseline.js', format: 'iife', target: 'es2020', minify: true,
  loader: { '.glb': 'binary' },
  plugins: [{ name: 'baseline-sources', setup(b) {
    b.onLoad({ filter: /\.js$/ }, args => {
      const relative = path.relative(process.cwd(), args.path).replaceAll('\\', '/');
      if (!relative.startsWith('src/')) return;
      let contents = execFileSync('git', ['show', `${ref}:${relative}`], { encoding: 'utf8', maxBuffer: 5e6 });
      if (relative === 'src/dev/perf_bench.js') contents = contents.replace('updaters.push(hook);', 'updaters.unshift(hook);');
      return { contents, loader: 'js', resolveDir: path.dirname(args.path) };
    });
  } }] });
