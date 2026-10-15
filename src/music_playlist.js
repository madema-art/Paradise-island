/** Random, no-repeat song rotation with one optional opening track. */
export class MusicPlaylist {
  constructor(random = Math.random, { first = null, removed = [] } = {}) {
    this.random = random;
    this.first = first;
    this.removed = new Set(removed);
    this.tracks = [];
    this.byId = new Map();
    this.queue = [];
    this.history = [];
    this.cursor = -1;
    this.cyclePlayed = new Set();
    this.firstPending = true;
  }

  setTracks(tracks) {
    const seen = new Set();
    this.tracks = [];
    for (const source of tracks || []) {
      if (!source || !source.src) continue;
      const track = { ...source, id: String(source.id ?? source.src), title: String(source.title || source.id || source.src) };
      if (seen.has(track.id)) continue;
      seen.add(track.id);
      this.tracks.push(track);
    }
    this.byId = new Map(this.tracks.map((track) => [track.id, track]));
    this.queue = this.queue.filter((id) => this.byId.has(id) && !this.removed.has(id));
    if (this.first && (!this.byId.has(this.first) || this.removed.has(this.first))) this.first = null;
    // Songs added while the game is open join this cycle's remaining shuffled queue.
    const queued = new Set(this.queue);
    const additions = this.available().map((t) => t.id).filter((id) => !this.cyclePlayed.has(id) && !queued.has(id));
    this.queue.push(...this.shuffle(additions));
  }

  available() { return this.tracks.filter((track) => !this.removed.has(track.id)); }
  current() { return this.history[this.cursor] ? this.byId.get(this.history[this.cursor]) || null : null; }

  next() {
    if (this.cursor < this.history.length - 1) {
      this.cursor++;
      const replay = this.byId.get(this.history[this.cursor]);
      if (replay && !this.removed.has(replay.id)) return replay;
    }
    if (this.firstPending) {
      this.firstPending = false;
      const opening = this.first && !this.removed.has(this.first) ? this.byId.get(this.first) : null;
      if (opening) {
        this.cyclePlayed.add(opening.id);
        this.history.push(opening.id); this.cursor = this.history.length - 1;
        this.queue = this.shuffle(this.available().map((t) => t.id).filter((id) => id !== opening.id));
        return opening;
      }
    }
    if (!this.queue.length) this.refill();
    while (this.queue.length) {
      const id = this.queue.shift();
      const track = this.byId.get(id);
      if (!track || this.removed.has(id)) continue;
      this.cyclePlayed.add(id);
      this.history.push(id); this.cursor = this.history.length - 1;
      return track;
    }
    return null;
  }

  previous() {
    while (this.cursor > 0) {
      const track = this.byId.get(this.history[--this.cursor]);
      if (track && !this.removed.has(track.id)) return track;
    }
    return this.current();
  }

  setFirst(id) {
    id = id == null ? null : String(id);
    this.first = id && this.byId.has(id) && !this.removed.has(id) ? id : null;
    if (this.firstPending) this.queue = [];
    return this.first;
  }

  remove(id) {
    id = String(id);
    if (!this.byId.has(id)) return false;
    this.removed.add(id); this.queue = this.queue.filter((queued) => queued !== id);
    if (this.first === id) this.first = null;
    return true;
  }

  restoreAll() {
    this.removed.clear();
    const queued = new Set(this.queue);
    const additions = this.available().map((t) => t.id).filter((id) => !this.cyclePlayed.has(id) && !queued.has(id));
    this.queue.push(...this.shuffle(additions));
  }

  restore(id) {
    id = String(id);
    if (!this.byId.has(id) || !this.removed.delete(id)) return false;
    if (!this.cyclePlayed.has(id) && !this.queue.includes(id)) this.queue.push(...this.shuffle([id]));
    return true;
  }

  library() {
    return this.tracks.map((track) => ({ ...track, removed: this.removed.has(track.id), first: this.first === track.id, current: this.current()?.id === track.id }));
  }

  refill() {
    let ids = this.available().map((track) => track.id).filter((id) => !this.cyclePlayed.has(id));
    if (!ids.length) {
      this.cyclePlayed.clear();
      const currentId = this.current()?.id;
      ids = this.available().map((track) => track.id).filter((id) => id !== currentId);
      if (!ids.length) ids = this.available().map((track) => track.id);
    }
    this.queue = this.shuffle(ids);
  }

  shuffle(ids) {
    const result = [...ids];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}
