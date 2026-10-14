// Use the private isolated install when present; otherwise use ordinary project dependencies.
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL, fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const deps = fs.existsSync(path.join(root, 'work/deps/node_modules/esbuild/lib/main.js')) ? path.join(root, 'work/deps/node_modules') : path.join(root, 'node_modules');
export const { build } = await import(pathToFileURL(path.join(deps, 'esbuild/lib/main.js')).href);
