import test from 'node:test';
import assert from 'node:assert/strict';
import { fullscreenBrowserCommand } from '../startup.mjs';
const url = 'http://localhost:5173/';
const env = { LOCALAPPDATA: 'C:\\Users\\Island Owner\\AppData\\Local', ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)' };
test('Chrome opens a new fullscreen window with the game URL as a separate argument', () => {
  const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  assert.deepEqual(fullscreenBrowserCommand(url, env, p => p === chrome), {
    executable: chrome, args: ['--new-window', '--start-fullscreen', url],
  });
});
test('Edge is used when Chrome is not installed', () => {
  const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  assert.equal(fullscreenBrowserCommand(url, env, p => p === edge).executable, edge);
});
test('per-user Chrome takes precedence over Edge', () => {
  const chrome = env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe';
  assert.equal(fullscreenBrowserCommand(url, env, () => true).executable, chrome);
});
test('missing browser produces a clear error rather than silently opening windowed', () => {
  assert.throws(() => fullscreenBrowserCommand(url, env, () => false), /Neither was found/);
  assert.throws(() => fullscreenBrowserCommand(url, {}, () => true), /Neither was found/);
});
