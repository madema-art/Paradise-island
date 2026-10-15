import test from 'node:test';
import assert from 'node:assert/strict';
import { MusicPlaylist } from '../src/music_playlist.js';

const tracks = (names) => names.map((id) => ({ id, title: id.toUpperCase(), src: `music/${id}.mp3` }));

test('shuffles every available track once per cycle', () => {
  const playlist = new MusicPlaylist(() => 0.37);
  playlist.setTracks(tracks(['a', 'b', 'c', 'd']));
  const firstCycle = Array.from({ length: 4 }, () => playlist.next().id);
  assert.equal(new Set(firstCycle).size, 4);
  assert.deepEqual(new Set(firstCycle), new Set(['a', 'b', 'c', 'd']));
  const next = playlist.next().id;
  assert.notEqual(next, firstCycle.at(-1));
});

test('plays the chosen opening song first and shuffles the rest', () => {
  const playlist = new MusicPlaylist(() => 0.2, { first: 'c' });
  playlist.setTracks(tracks(['a', 'b', 'c', 'd']));
  assert.equal(playlist.next().id, 'c');
  const rest = Array.from({ length: 3 }, () => playlist.next().id);
  assert.equal(new Set(rest).size, 3);
  assert.ok(!rest.includes('c'));
});

test('removing and restoring tracks changes game availability without losing library entries', () => {
  const playlist = new MusicPlaylist(() => 0.8);
  playlist.setTracks(tracks(['a', 'b', 'c']));
  playlist.remove('b');
  assert.deepEqual(playlist.available().map((track) => track.id).sort(), ['a', 'c']);
  assert.equal(playlist.library().find((track) => track.id === 'b').removed, true);
  assert.equal(playlist.restore('b'), true);
  assert.deepEqual(playlist.available().map((track) => track.id).sort(), ['a', 'b', 'c']);
});

test('newly discovered songs join the current cycle and removed songs stay excluded', () => {
  const playlist = new MusicPlaylist(() => 0.5, { removed: ['b'] });
  playlist.setTracks(tracks(['a', 'b']));
  playlist.next();
  playlist.setTracks(tracks(['a', 'b', 'c']));
  assert.ok(playlist.queue.includes('c'));
  assert.ok(!playlist.queue.includes('b'));
  assert.equal(playlist.library().find((track) => track.id === 'b').removed, true);
});

test('previous and next navigate playback history', () => {
  const playlist = new MusicPlaylist(() => 0.1);
  playlist.setTracks(tracks(['a', 'b', 'c']));
  const a = playlist.next(); const b = playlist.next();
  assert.equal(playlist.previous().id, a.id);
  assert.equal(playlist.next().id, b.id);
});
