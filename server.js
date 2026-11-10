'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createStore, fileBackend, upstashBackend } = require('./lib/store');
const { createApp } = require('./lib/app');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const statics = {
  'seed-events.json': require('./data/seed-events.json'),
  'sources.json': require('./data/sources.json'),
};
const backend = process.env.UPSTASH_REDIS_REST_URL
  ? upstashBackend(process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN)
  : fileBackend(process.env.DATA_DIR || path.join(__dirname, 'data'));
const app = createApp({ store: createStore(backend, statics), adminToken: process.env.ADMIN_TOKEN });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const out = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'content-type': type, 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};
function readBody(req) {
  return new Promise((ok, no) => {
    let b = '';
    req.on('data', c => { b += c; if (b.length > 20000) { no(new Error('too large')); req.destroy(); } });
    req.on('end', () => ok(b));
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) {
      const r = await app.handle({ method: req.method, path: url.pathname, headers: req.headers, ip: req.socket.remoteAddress, bodyText: await readBody(req) });
      return out(res, r.status, r.body);
    }
    let f = path.normalize(path.join(PUB, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!path.extname(f) && fs.existsSync(f + '.html')) f += '.html'; // Cloudflare처럼 .html 생략 허용
    if (!f.startsWith(PUB + path.sep)) return out(res, 403, 'forbidden', 'text/plain');
    fs.readFile(f, (err, buf) => {
      if (err) return out(res, 404, 'not found', 'text/plain');
      res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' });
      res.end(buf);
    });
  } catch (e) { out(res, 500, { error: e.message }); }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`코스모아 http://localhost:${PORT}`));
  const tick = () => app.maybeRefresh().then(r => r && console.log('[cosmoa] 수집 완료', r.added, '추가', r.updated, '갱신', r.errors.length, '오류')).catch(e => console.error('[cosmoa] 수집 실패', e.message));
  tick(); setInterval(tick, 3600 * 1000).unref();
}
module.exports = server;
