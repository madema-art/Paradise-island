// Safe updater/build coordinator for Open Paradise Island.bat. Node built-ins only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ownRoot = path.dirname(fileURLToPath(import.meta.url));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function command(root, program, args, { visible = false, timeout = 120000 } = {}) {
  const result = spawnSync(program, args, { cwd: root, encoding: 'utf8', timeout,
    stdio: visible ? 'inherit' : 'pipe', windowsHide: true,
    windowsVerbatimArguments: process.platform === 'win32' && path.basename(program).toLowerCase() === 'cmd.exe',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' } });
  if (result.error || result.status !== 0) {
    const detail = result.error?.code === 'ENOENT' ? `${program} is not installed or is missing from PATH.`
      : result.error?.message || result.stderr?.trim() || `exit code ${result.status}`;
    throw new Error(`${program} ${args.join(' ')} failed: ${detail}`);
  }
  return result.stdout?.trim() || '';
}
const git = (root, args) => command(root, 'git', args);

export function loadConfig(root) {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'startup.config.json'), 'utf8'));
  if (typeof config.remote !== 'string' || !/^[\w.-]+$/.test(config.remote) || config.remote.startsWith('-')
      || typeof config.branch !== 'string' || !config.branch || config.branch.startsWith('-')
      || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('Invalid startup.config.json.');
  git(root, ['check-ref-format', `refs/heads/${config.branch}`]);
  return config;
}

export function assertClean(root) {
  const changes = git(root, ['status', '--porcelain=v1', '--untracked-files=all']);
  if (changes) throw new Error(`Local changes detected. Update skipped to protect your work.\n${changes}\nReview and commit/push or move these files yourself, then launch again. Nothing was discarded.`);
}
function assertBranch(root, config) {
  const branch = git(root, ['branch', '--show-current']);
  if (branch !== config.branch) throw new Error(`Expected playable branch "${config.branch}", found "${branch || 'detached HEAD'}".\nNo branch was switched. Review your work and switch branches yourself before launching.`);
}

export function updatePlayable(root, config, log = console.log) {
  log('Checking Paradise Island for updates...');
  assertClean(root);
  assertBranch(root, config);
  const before = git(root, ['rev-parse', 'HEAD']);
  try {
    // FETCH_HEAD refers to this explicit branch, never whichever upstream is configured.
    git(root, ['fetch', '--no-tags', config.remote, `refs/heads/${config.branch}`]);
  } catch (error) {
    throw new Error(`Update check failed. Check your connection, GitHub access, remote and configured branch.\n${error.message}\nThe game was not started; no unverified local version will be opened.`);
  }
  const remote = git(root, ['rev-parse', 'FETCH_HEAD']);
  assertClean(root); assertBranch(root, config);
  if (git(root, ['rev-parse', 'HEAD']) !== before) throw new Error('The checkout changed during the update check. Launch again after the other Git operation finishes.');
  if (before === remote) { log('Paradise Island is up to date.'); return { updated: false, revision: before }; }
  const ancestor = (a, b) => {
    const r = spawnSync('git', ['merge-base', '--is-ancestor', a, b], { cwd: root, windowsHide: true });
    if (r.error || ![0, 1].includes(r.status)) throw new Error('Could not compare local and remote history. No update was applied.');
    return r.status === 0;
  };
  if (!ancestor(before, remote)) {
    if (ancestor(remote, before)) throw new Error('The local branch has unpushed commits. Commit/push completed work before testing. No update was applied.');
    throw new Error('Local and remote history have diverged. Resolve this manually; the launcher will not merge or rebase.');
  }
  log('Update found. Downloading...');
  git(root, ['-c', 'merge.autoStash=false', 'merge', '--ff-only', remote]);
  assertClean(root);
  log('Update complete. Checking rebuild requirements...');
  return { updated: true, revision: remote };
}

function readState(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, '.paradise-startup/state.json'), 'utf8')); }
  catch { return {}; }
}
function writeState(root, state) {
  const dir = path.join(root, '.paradise-startup'); fs.mkdirSync(dir, { recursive: true });
  const temp = path.join(dir, 'state.json.tmp'); fs.writeFileSync(temp, JSON.stringify(state, null, 2));
  fs.renameSync(temp, path.join(dir, 'state.json'));
}
function npm(root, args) {
  // npm.cmd cannot be execFile'd on Windows. Only fixed, internal arguments enter cmd.
  return process.platform === 'win32'
    ? command(root, process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `npm ${args.join(' ')}`], { visible: true, timeout: 600000 })
    : command(root, 'npm', args, { visible: true, timeout: 600000 });
}
const outputs = ['dist/island.js', 'dist/scale_viewer.js'];
function outputHashes(root) {
  return outputs.map(file => { try { return hash(fs.readFileSync(path.join(root, file))); } catch { return null; } });
}

export function prepareBuild(root, log = console.log) {
  const state = readState(root);
  const manifest = fs.readFileSync(path.join(root, 'package.json'));
  const lockPath = path.join(root, 'package-lock.json');
  const lock = fs.existsSync(lockPath) ? fs.readFileSync(lockPath) : '';
  const deps = hash(Buffer.concat([manifest, Buffer.from(lock), Buffer.from(`${process.version}/${process.platform}/${process.arch}`)]));
  const packages = Object.keys(JSON.parse(manifest).dependencies || {}).concat(Object.keys(JSON.parse(manifest).devDependencies || {}));
  const missing = packages.some(name => !fs.existsSync(path.join(root, 'node_modules', name, 'package.json')));
  if (missing || state.dependencies !== deps) {
    log('Installing dependencies (first launch, missing packages, or dependency/runtime change)...');
    // Invalidate a previous successful build BEFORE installation, including on failure.
    state.built = null; state.dependencies = null; writeState(root, state);
    npm(root, [lock ? 'ci' : 'install', '--no-audit', '--no-fund']);
    assertClean(root);
    state.dependencies = deps; writeState(root, state);
  }
  const inputs = hash(git(root, ['ls-tree', '-r', 'HEAD', '--', 'src', 'assets', 'build.mjs', 'package.json', 'package-lock.json']) + deps);
  const current = outputHashes(root);
  if (state.built !== inputs || current.some(x => !x) || JSON.stringify(current) !== JSON.stringify(state.outputs)) {
    log('Rebuilding Paradise Island...');
    state.built = null; writeState(root, state);
    npm(root, ['run', 'build']);
    assertClean(root);
    const built = outputHashes(root);
    if (built.some(x => !x)) throw new Error('Build did not produce the expected game bundles. The game was not started.');
    state.built = inputs; state.outputs = built; writeState(root, state);
  } else log('Game build is current.');
  // Preserve the old launcher's discovery of songs without bundling the whole game.
  const extensions = new Set(['.mp3', '.ogg', '.wav', '.m4a', '.flac', '.opus']);
  const items = fs.readdirSync(path.join(root, 'music')).filter(f => extensions.has(path.extname(f).toLowerCase())).sort()
    .map(f => ({ id: f, title: f.replace(/\.[^.]+$/, '').replace(/_+/g, ' '), src: 'music/' + encodeURIComponent(f) }));
  const playlist = 'window.MUSIC_PLAYLIST = ' + JSON.stringify(items, null, 2) + ';\n';
  const file = path.join(root, 'music/playlist.js');
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== playlist) fs.writeFileSync(file, playlist);
}

async function portOpen(port) {
  return new Promise(resolve => {
    const s = net.connect({ host: '127.0.0.1', port });
    s.setTimeout(500); s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false)); s.once('timeout', () => { s.destroy(); resolve(false); });
  });
}
async function identity(port) {
  return new Promise(resolve => {
    const req = http.get(`http://localhost:${port}/api/startup`, res => {
      let data = ''; res.on('data', c => { data += c; if (data.length > 8192) req.destroy(); });
      res.on('error', () => resolve(null));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    });
    req.setTimeout(1000, () => req.destroy()); req.on('error', () => resolve(null));
  });
}
export async function startServer(root, port, revision, log = console.log) {
  const expected = { root: fs.realpathSync(root), revision, serverHash: hash(fs.readFileSync(path.join(root, 'serve.mjs'))) };
  const matches = data => data?.app === 'paradise-island' && data.root === expected.root && data.revision === revision && data.serverHash === expected.serverHash;
  if (await portOpen(port)) {
    if (!matches(await identity(port))) throw new Error(`Port ${port} is already in use by an older server, another checkout, or another application.\nClose the old Paradise Island server window (or review the process using this port), then launch again. Nothing was stopped automatically.`);
    log('Using the existing Paradise Island server for this checkout and revision.'); return null;
  }
  const child = spawn(process.execPath, ['serve.mjs', String(port)], { cwd: root, stdio: 'inherit',
    env: { ...process.env, PARADISE_ISLAND_REVISION: revision } });
  let failed = null; child.on('error', error => { failed = error.message; });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => { failed = `server exited (${code ?? signal})`; resolve(code ?? 1); }));
  for (let i = 0; i < 100; i++) {
    if (failed) throw new Error(`Server startup failed: ${failed}`);
    if (matches(await identity(port))) return { child, exited };
    await sleep(100);
  }
  child.kill(); throw new Error('Server did not become ready. The browser was not opened.');
}

function openBrowser(url) {
  if (process.platform !== 'win32') throw new Error(`Open ${url} manually (the .bat launcher targets Windows).`);
  command(ownRoot, process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `start "" "${url}"`]);
}

async function main() {
  let unlock = () => {}, server = null;
  try {
    const config = loadConfig(ownRoot);
    const lock = git(ownRoot, ['rev-parse', '--path-format=absolute', '--git-path', 'paradise-startup.lock']);
    try { fs.writeFileSync(lock, `PID ${process.pid}\n${new Date().toISOString()}\n`, { flag: 'wx' }); }
    catch { throw new Error(`Another launcher is updating/building this checkout. Wait for it to finish.\nIf it crashed, review that process before removing the stale lock: ${lock}`); }
    unlock = () => { fs.unlinkSync(lock); unlock = () => {}; };
    const result = updatePlayable(ownRoot, config);
    if (result.updated) {
      // Load any updated launcher/build logic before continuing, never run a stale updater.
      unlock();
      const next = spawnSync(process.execPath, [path.join(ownRoot, 'startup.mjs')], { cwd: ownRoot, stdio: 'inherit' });
      process.exitCode = next.status ?? 1; return;
    }
    prepareBuild(ownRoot);
    assertClean(ownRoot); assertBranch(ownRoot, config);
    if (git(ownRoot, ['rev-parse', 'HEAD']) !== result.revision) throw new Error('The checkout changed while building. Launch again after the other Git operation finishes.');
    console.log(`Starting Paradise Island... (${config.branch} ${result.revision.slice(0, 12)})`);
    server = await startServer(ownRoot, config.port, result.revision);
    unlock();
    openBrowser(`http://localhost:${config.port}/`);
    if (server) {
      console.log('Game is ready. Keep this window open for the notebook server; close it or press Ctrl+C to stop.');
      let stopping = false;
      process.once('SIGINT', () => { stopping = true; server.child.kill(); });
      const code = await server.exited;
      process.exitCode = stopping ? 0 : code;
    }
  } catch (error) {
    if (server) server.child.kill();
    console.error(`\nParadise Island could not start:\n${error.message}\nNo browser was opened by the failed startup.`);
    process.exitCode = 1;
  } finally { unlock(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
