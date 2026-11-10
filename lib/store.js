'use strict';
// 저장소 추상화: backend = { get(name) -> text|null, put(name, text) }, statics = 저장소에 포함된 읽기 전용 JSON
function createStore(backend, statics = {}) {
  return {
    async read(name, fallback) {
      if (name in statics) return statics[name];
      try { const t = await backend.get(name); return t ? JSON.parse(t) : fallback; } catch { return fallback; }
    },
    async write(name, obj) { await backend.put(name, JSON.stringify(obj, null, 2)); },
  };
}

// 로컬 개발용: 파일
function fileBackend(dir) {
  const fs = require('fs'), path = require('path');
  fs.mkdirSync(dir, { recursive: true });
  return {
    async get(n) { try { return fs.readFileSync(path.join(dir, n), 'utf8'); } catch { return null; } },
    async put(n, text) { const f = path.join(dir, n), tmp = f + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, f); },
  };
}

// 배포용: Upstash Redis REST (Cloudflare Workers 등 디스크가 없는 환경)
function upstashBackend(url, token) {
  url = url.replace(/\/$/, '');
  const call = (p, opt = {}) => fetch(url + p, { ...opt, headers: { authorization: 'Bearer ' + token } });
  return {
    async get(n) { const r = await call('/get/cosmoa:' + n); if (!r.ok) throw new Error('Upstash ' + r.status); return (await r.json()).result || null; },
    async put(n, text) { const r = await call('/set/cosmoa:' + n, { method: 'POST', body: text }); if (!r.ok) throw new Error('Upstash ' + r.status); },
  };
}
module.exports = { createStore, fileBackend, upstashBackend };
