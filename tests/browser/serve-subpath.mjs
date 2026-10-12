// Serves ./dist under /sap-commerce-code-generator/ to mimic GitHub Pages (project site sub-path).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const BASE = '/sap-commerce-code-generator/';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith(BASE)) { res.writeHead(404); res.end('not found (outside base path)'); return; }
  let rel = normalize(url.pathname.slice(BASE.length)).replace(/^(\.\.[/\\])+/, '');
  if (rel === '.' || rel === '' || rel.endsWith('/')) rel = join(rel, 'index.html');
  try {
    const data = await readFile(join('dist', rel));
    res.writeHead(200, { 'content-type': types[extname(rel)] ?? 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); } // like GitHub Pages: no SPA rewrite
}).listen(4173, () => console.log('serving dist at http://localhost:4173' + BASE));
