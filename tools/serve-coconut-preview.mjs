// Isolated static preview. Notebook writes are never routed to a development server.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/api/notes' && req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(fs.readFileSync(path.join(root, 'notes/island-notes.json'))); return; }
  if (req.method !== 'GET' || u.pathname.startsWith('/api/')) { res.writeHead(405); res.end(); return; }
  const p = path.resolve(root, '.' + decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
  if (!p.startsWith(root + path.sep) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(p).pipe(res);
}).listen(8768, '127.0.0.1', () => console.log('Coconut preview: http://127.0.0.1:8768/?coconutReview'));
