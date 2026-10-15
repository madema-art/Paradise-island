import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { command, loadConfig, assertClean, updatePlayable, prepareBuild, startServer } from '../startup.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const silent = () => {};
const config = { remote: 'origin', branch: 'playable', port: 5173 };
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paradise-startup-test-'));
  t.after(() => {
    assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('paradise-startup-test-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const run = (dir, ...args) => command(dir, 'git', args);
  const remote = path.join(root, 'remote.git'), seed = path.join(root, 'author'), local = path.join(root, 'player');
  fs.mkdirSync(seed);
  run(root, 'init', '--bare', '--initial-branch=playable', remote);
  run(seed, 'init', '--initial-branch=playable');
  run(seed, 'config', 'user.name', 'Launcher Test'); run(seed, 'config', 'user.email', 'launcher@example.invalid');
  run(seed, 'config', 'core.autocrlf', 'false');
  fs.mkdirSync(path.join(seed, 'src')); fs.mkdirSync(path.join(seed, 'music'));
  fs.writeFileSync(path.join(seed, 'music/.gitkeep'), '');
  fs.writeFileSync(path.join(seed, '.gitignore'), 'node_modules/\ndist/\n.paradise-startup/\nmusic/playlist.js\nfail-build\n');
  fs.writeFileSync(path.join(seed, 'src/main.js'), 'version one');
  fs.writeFileSync(path.join(seed, 'index.html'), '<!doctype html><title>Fixture game</title>');
  fs.writeFileSync(path.join(seed, 'package.json'), JSON.stringify({ name: 'launcher-fixture', version: '1.0.0', scripts: { build: 'node build.mjs' } }));
  fs.writeFileSync(path.join(seed, 'package-lock.json'), JSON.stringify({ name: 'launcher-fixture', version: '1.0.0', lockfileVersion: 3, packages: { '': { name: 'launcher-fixture', version: '1.0.0' } } }));
  fs.writeFileSync(path.join(seed, 'build.mjs'), `import fs from 'node:fs';
if(fs.existsSync('fail-build'))throw new Error('Deliberate fixture build failure');
fs.mkdirSync('dist',{recursive:true});
fs.writeFileSync('dist/island.js',fs.readFileSync('src/main.js'));
fs.writeFileSync('dist/scale_viewer.js','fixture viewer');
fs.appendFileSync('dist/build-count','built\\n');`);
  fs.copyFileSync(path.join(project, 'serve.mjs'), path.join(seed, 'serve.mjs'));
  const commit = (dir, message) => { run(dir, 'add', '.'); run(dir, 'commit', '-m', message); return run(dir, 'rev-parse', 'HEAD'); };
  commit(seed, 'Initial fixture'); run(seed, 'remote', 'add', 'origin', remote); run(seed, 'push', '-u', 'origin', 'playable');
  run(root, '-c', 'core.autocrlf=false', 'clone', remote, local);
  run(local, 'config', 'user.name', 'Launcher Test'); run(local, 'config', 'user.email', 'launcher@example.invalid');
  run(local, 'config', 'core.autocrlf', 'false');
  return { root, seed, local, remote, run, commit, push: () => run(seed, 'push', 'origin', 'playable') };
}

test('real Git: no-update, dirty tracked/untracked, wrong branch, detached HEAD, unpushed work', t => {
  const f = fixture(t), { local, run } = f;
  const head = run(local, 'rev-parse', 'HEAD');
  assert.deepEqual(updatePlayable(local, config, silent), { updated: false, revision: head });
  fs.writeFileSync(path.join(local, 'src/main.js'), 'private local edit');
  assert.throws(() => updatePlayable(local, config, silent), /Local changes detected/);
  assert.equal(fs.readFileSync(path.join(local, 'src/main.js'), 'utf8'), 'private local edit');
  fs.writeFileSync(path.join(local, 'src/main.js'), 'version one');
  fs.writeFileSync(path.join(local, 'personal.txt'), 'keep me');
  assert.throws(() => updatePlayable(local, config, silent), /personal.txt/);
  fs.unlinkSync(path.join(local, 'personal.txt'));
  run(local, 'switch', '-c', 'other');
  assert.throws(() => updatePlayable(local, config, silent), /Expected playable branch/);
  assert.equal(run(local, 'branch', '--show-current'), 'other');
  run(local, 'switch', '--detach', head);
  assert.throws(() => updatePlayable(local, config, silent), /detached HEAD/);
  run(local, 'switch', 'playable');
  fs.writeFileSync(path.join(local, 'local.txt'), 'unpublished'); f.commit(local, 'Local work');
  assert.throws(() => updatePlayable(local, config, silent), /unpushed commits/);
});

test('real Git: available update fast-forwards exactly; divergent history never merges', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.seed, 'src/main.js'), 'version two');
  const newer = f.commit(f.seed, 'Remote update'); f.push();
  assert.deepEqual(updatePlayable(f.local, config, silent), { updated: true, revision: newer });
  assert.equal(f.run(f.local, 'rev-list', '--parents', '-n', '1', 'HEAD').split(' ').length, 2);
  fs.writeFileSync(path.join(f.local, 'private.txt'), 'local commit'); const localHead = f.commit(f.local, 'Local branch');
  fs.writeFileSync(path.join(f.seed, 'remote.txt'), 'remote commit'); f.commit(f.seed, 'Remote branch'); f.push();
  assert.throws(() => updatePlayable(f.local, config, silent), /diverged/);
  assert.equal(f.run(f.local, 'rev-parse', 'HEAD'), localHead);
});

test('missing Git/remote branch and unavailable remote fail visibly without moving HEAD', t => {
  const f = fixture(t), head = f.run(f.local, 'rev-parse', 'HEAD');
  assert.throws(() => command(f.local, 'paradise-nonexistent-git-binary', []), /not installed/);
  f.run(f.local, 'switch', '-c', 'absent-on-remote');
  assert.throws(() => updatePlayable(f.local, { ...config, branch: 'absent-on-remote' }, silent), /Update check failed/);
  f.run(f.local, 'switch', 'playable');
  f.run(f.local, 'remote', 'set-url', 'origin', path.join(f.root, 'unavailable.git'));
  assert.throws(() => updatePlayable(f.local, config, silent), /game was not started/);
  assert.equal(f.run(f.local, 'rev-parse', 'HEAD'), head);
  fs.writeFileSync(path.join(f.local, 'startup.config.json'), JSON.stringify({ ...config, remote: '-invalid' }));
  assert.throws(() => loadConfig(f.local), /Invalid startup/);
});

test('real npm/build: first launch, cached launch, source update, docs-only update, changed dependencies, missing output', t => {
  const f = fixture(t), logs = [], log = s => logs.push(s);
  prepareBuild(f.local, log);
  assert.equal(logs.filter(x => x.startsWith('Installing')).length, 1);
  assert.equal(logs.filter(x => x.startsWith('Rebuilding')).length, 1);
  logs.length = 0; prepareBuild(f.local, log);
  assert.deepEqual(logs, ['Game build is current.']);
  fs.writeFileSync(path.join(f.seed, 'src/main.js'), 'version two'); f.commit(f.seed, 'Code'); f.push();
  updatePlayable(f.local, config, silent); logs.length = 0; prepareBuild(f.local, log);
  assert.deepEqual(logs, ['Rebuilding Paradise Island...']);
  assert.equal(fs.readFileSync(path.join(f.local, 'dist/island.js'), 'utf8'), 'version two');
  fs.writeFileSync(path.join(f.seed, 'README.md'), 'Documentation'); f.commit(f.seed, 'Docs'); f.push();
  updatePlayable(f.local, config, silent); logs.length = 0; prepareBuild(f.local, log);
  assert.deepEqual(logs, ['Game build is current.']);
  const pkg = JSON.parse(fs.readFileSync(path.join(f.seed, 'package.json'))); pkg.description = 'Dependency manifest changed';
  fs.writeFileSync(path.join(f.seed, 'package.json'), JSON.stringify(pkg)); f.commit(f.seed, 'Manifest'); f.push();
  updatePlayable(f.local, config, silent); logs.length = 0; prepareBuild(f.local, log);
  assert.ok(logs.some(x => x.startsWith('Installing'))); assert.ok(logs.some(x => x.startsWith('Rebuilding')));
  fs.unlinkSync(path.join(f.local, 'dist/island.js')); logs.length = 0; prepareBuild(f.local, log);
  assert.deepEqual(logs, ['Rebuilding Paradise Island...']);
  fs.writeFileSync(path.join(f.local, 'dist/island.js'), 'dev output'); logs.length = 0; prepareBuild(f.local, log);
  assert.deepEqual(logs, ['Rebuilding Paradise Island...']);
});

test('failed install/build invalidates the success stamp; next launch retries', t => {
  const f = fixture(t); prepareBuild(f.local, silent);
  fs.writeFileSync(path.join(f.seed, 'src/main.js'), 'next version'); f.commit(f.seed, 'Changed input'); f.push();
  updatePlayable(f.local, config, silent);
  fs.writeFileSync(path.join(f.local, 'fail-build'), '');
  assert.throws(() => prepareBuild(f.local, silent), /failed/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.local, '.paradise-startup/state.json'))).built, null);
  fs.unlinkSync(path.join(f.local, 'fail-build')); prepareBuild(f.local, silent);
  assert.equal(fs.readFileSync(path.join(f.local, 'dist/island.js'), 'utf8'), 'next version');
  fs.writeFileSync(path.join(f.seed, 'package-lock.json'), 'not JSON'); f.commit(f.seed, 'Broken fixture lock'); f.push();
  updatePlayable(f.local, config, silent);
  assert.throws(() => prepareBuild(f.local, silent), /failed/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.local, '.paradise-startup/state.json'))).dependencies, null);
});

async function freePort() {
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
test('local audio/backups are ignored, still served, and never overwritten; source and tracked songs remain protected', async t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.seed, 'music/library.mp3'), 'tracked library');
  f.commit(f.seed, 'Existing library song');
  fs.appendFileSync(path.join(f.seed, '.gitignore'), '\n' + fs.readFileSync(path.join(project, '.gitignore'), 'utf8'));
  f.commit(f.seed, 'Local content ignores'); f.push(); updatePlayable(f.local, config, silent);
  const audio = ['new.mp3', 'new.OGG', 'new.wav', 'new.m4a', 'new.flac', 'new.opus'];
  for (const name of audio) fs.writeFileSync(path.join(f.local, 'music', name), 'local song');
  fs.mkdirSync(path.join(f.local, 'notes/backups'), { recursive: true });
  const backup = 'notes/backups/island-notes.r51.2026-10-15T15-05-07-643Z.json';
  fs.writeFileSync(path.join(f.local, backup), '{"revision":51}');
  assert.doesNotThrow(() => assertClean(f.local));
  assert.equal(updatePlayable(f.local, config, silent).updated, false);
  assert.equal(f.run(f.local, 'ls-files', 'music/library.mp3'), 'music/library.mp3');
  for (const [file, text] of [['src/main.js', 'source edit'], ['music/library.mp3', 'tracked edit']]) {
    const original = fs.readFileSync(path.join(f.local, file)); fs.writeFileSync(path.join(f.local, file), text);
    assert.throws(() => updatePlayable(f.local, config, silent), /Local changes detected/); fs.writeFileSync(path.join(f.local, file), original);
  }
  for (const file of ['music/loader.js', 'music/README.md', 'notes/island-notes.json', 'notes/backups/research.json']) {
    fs.writeFileSync(path.join(f.local, file), 'real project content');
    assert.throws(() => assertClean(f.local), /Local changes detected/); fs.unlinkSync(path.join(f.local, file));
  }
  const port = await freePort(), server = await startServer(f.local, port, 'local-audio-test', silent);
  try {
    const songs = await (await fetch(`http://localhost:${port}/api/music/playlist`)).json();
    assert.ok(audio.every(name => songs.items.some(song => song.id === name)));
    assert.equal(await (await fetch(`http://localhost:${port}/music/new.mp3`)).text(), 'local song');
  } finally { server.child.kill(); await server.exited; }
  // A future publisher must not silently replace a local ignored song with the same name.
  const head = f.run(f.local, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(f.seed, 'music/new.mp3'), 'remote collision');
  f.run(f.seed, 'add', '-f', 'music/new.mp3'); f.run(f.seed, 'commit', '-m', 'Collision fixture'); f.push();
  assert.throws(() => updatePlayable(f.local, config, silent), /failed/);
  assert.equal(f.run(f.local, 'rev-parse', 'HEAD'), head);
  assert.equal(fs.readFileSync(path.join(f.local, 'music/new.mp3'), 'utf8'), 'local song');
  assert.equal(fs.readFileSync(path.join(f.local, backup), 'utf8'), '{"revision":51}');
});
test('existing real server: readiness, notebook/music/static GETs, same-version reuse, stale/foreign refusal', async t => {
  const f = fixture(t), port = await freePort();
  const revision = f.run(f.local, 'rev-parse', 'HEAD');
  const server = await startServer(f.local, port, revision, silent);
  try {
    const base = `http://localhost:${port}`;
    assert.match(await (await fetch(base)).text(), /Fixture game/);
    const notes = await (await fetch(base + '/api/notes')).json(); assert.equal(notes.ok, true);
    const songs = await (await fetch(base + '/api/music/playlist')).json(); assert.deepEqual(songs.items, []);
    assert.equal(await startServer(f.local, port, revision, silent), null);
    await assert.rejects(startServer(f.local, port, 'different-revision', silent), /older server/);
    assert.equal((await fetch(base)).status, 200, 'existing server was not killed');
  } finally { server.child.kill(); await server.exited; }
  const foreign = http.createServer((req, res) => res.end('another application'));
  await new Promise(resolve => foreign.listen(port, '127.0.0.1', resolve));
  try { await assert.rejects(startServer(f.local, port, revision, silent), /another application/); }
  finally { await new Promise(resolve => foreign.close(resolve)); }
});

test('server launch failure never reports readiness', async t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.local, 'serve.mjs'), 'throw new Error("fixture startup failure");');
  await assert.rejects(startServer(f.local, await freePort(), 'test', silent), /Server startup failed/);
});

test('Windows .bat visibly stops on dirty work and missing Node, without building or starting a server', { skip: process.platform !== 'win32' }, t => {
  const f = fixture(t);
  for (const name of ['startup.mjs', 'Open Paradise Island.bat']) fs.copyFileSync(path.join(project, name), path.join(f.local, name));
  fs.writeFileSync(path.join(f.local, 'startup.config.json'), JSON.stringify(config));
  f.commit(f.local, 'Install fixture launcher'); f.run(f.local, 'push', 'origin', 'playable');
  fs.writeFileSync(path.join(f.local, 'private.txt'), 'do not discard');
  const invoke = env => spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'call "Open Paradise Island.bat"'],
    { cwd: f.local, input: '\r\n', encoding: 'utf8', timeout: 15000, windowsVerbatimArguments: true, env });
  const dirty = invoke(process.env);
  assert.equal(dirty.status, 1, dirty.error?.message || dirty.stderr);
  assert.match(dirty.stdout + dirty.stderr, /Local changes detected/);
  assert.match(dirty.stdout, /Read the message above/);
  assert.equal(fs.existsSync(path.join(f.local, 'dist')), false);
  const noNode = invoke({ ...process.env, PATH: path.join(process.env.SystemRoot, 'System32') });
  assert.equal(noNode.status, 1); assert.match(noNode.stdout, /Node.js is not installed/);
  assert.equal(fs.readFileSync(path.join(f.local, 'private.txt'), 'utf8'), 'do not discard');
});
