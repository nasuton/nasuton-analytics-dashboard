import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };
const dataNames = new Set(['DailySessions.json', 'MonthlyCountryAccess.json', 'MonthlySessionDefaultChannelGroupAccess.json', 'MonthlyTopPages.json', 'MonthlyOverview.json', 'MonthlyLandingPages.json']);
const server = http.createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!/^(index\.html|favicon\.svg|(css|js|vendor|data)\/[\w.-]+)$/.test(relative)) { res.writeHead(404); res.end('Not found'); return; }
    const externalData = process.env.ANALYTICS_DATA_DIR && relative.startsWith('data/') && dataNames.has(path.basename(relative));
    const filename = externalData ? path.join(process.env.ANALYTICS_DATA_DIR, path.basename(relative)) : path.join(root, relative);
    const content = await readFile(filename);
    res.writeHead(200, { 'Content-Type': `${types[path.extname(filename)] ?? 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) { res.writeHead(error.code === 'ENOENT' ? 404 : 500); res.end('Unable to load file'); }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Dashboard: http://127.0.0.1:${port}`));
