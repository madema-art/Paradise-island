// True while the player is typing in a field (a note, a search box, a menu). Game keys must ignore those keystrokes,
// or letters such as W, A, S, D, E or H would steer the camera or hide the interface while a note is being written.
export const isTyping = (e) => {
  const t = e.target;
  return !!t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
};
