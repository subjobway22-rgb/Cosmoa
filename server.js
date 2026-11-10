'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./lib/store');
const scraper = require('./lib/scraper');

const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const PUB = path.join(__dirname, 'public');
const ROLES = ['사진사', '코스어', '관람객', '부스러', '기타'];
const DAY = 24 * 3600 * 1000;

const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const getEvents = () => store.read('events.json', null) || store.read('seed-events.json', []);

// 간단 레이트리밋 (IP당 분당 30회 쓰기)
const hits = new Map();
function limited(ip) {
  const now = Date.now(), a = (hits.get(ip) || []).filter(t => now - t < 60000);
  a.push(now); hits.set(ip, a);
  return a.length > 30;
}

function safeUrl(u) {
  u = clean(u, 200);
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) return '';
  try { return new URL(u).href; } catch { return ''; }
}
function snsLink(platform, handle) {
  const h = handle.replace(/^@/, '');
  if (/^https?:\/\//i.test(handle)) return safeUrl(handle);
  if (!/^[\w.\-]{1,40}$/.test(h)) return '';
  return { X: `https://x.com/${h}`, 인스타그램: `https://instagram.com/${h}`, 트위터: `https://x.com/${h}` }[platform] || '';
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FIELDS = { name: 120, category: 20, startDate: 10, endDate: 10, time: 60, fee: 80, location: 160, region: 10 };
function isAdmin(req) { return !!ADMIN_TOKEN && req.headers['x-admin-token'] === ADMIN_TOKEN; }
// 제안 필드 정리·검증. 오류 시 문자열 반환
function cleanFields(f, isNew) {
  f = f || {}; const out = {};
  for (const [k, n] of Object.entries(FIELDS)) { const v = clean(f[k], n); if (v) out[k] = v; }
  if (f.officialUrl) { const u = safeUrl(f.officialUrl); if (!u) return '공식 링크는 http(s):// 주소여야 합니다'; out.officialUrl = u; }
  for (const k of ['startDate', 'endDate']) if (out[k] && (!DATE_RE.test(out[k]) || isNaN(Date.parse(out[k])))) return '날짜는 YYYY-MM-DD 형식이어야 합니다';
  if (isNew && (!out.name || !out.startDate)) return '행사명과 시작일은 필수입니다';
  if (isNew && !out.endDate) out.endDate = out.startDate;
  if (out.startDate && out.endDate && out.endDate < out.startDate) return '종료일이 시작일보다 빠릅니다';
  return out;
}

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'content-type': type, 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((ok, no) => {
    let b = '';
    req.on('data', c => { b += c; if (b.length > 20000) { no(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch { no(new Error('bad json')); } });
  });
}

const publicP = (p) => ({ id: p.id, eventId: p.eventId, nickname: p.nickname, role: p.role, sns: p.sns, snsPlatform: p.snsPlatform, snsUrl: p.snsUrl, memo: p.memo, createdAt: p.createdAt });
const publicC = (c) => ({ id: c.id, eventId: c.eventId, nickname: c.nickname, text: c.text, inquiry: c.inquiry, role: c.role, createdAt: c.createdAt });

async function api(req, res, url) {
  const ip = req.socket.remoteAddress;
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // after "api"
  const m = req.method;

  if (m === 'GET' && parts[0] === 'events' && !parts[1]) {
    const events = getEvents();
    const ps = store.read('participants.json', []);
    const cs = store.read('comments.json', []);
    const out = events.map(e => {
      const counts = Object.fromEntries(ROLES.map(r => [r, 0]));
      ps.filter(p => p.eventId === e.id).forEach(p => counts[p.role]++);
      return { ...e, counts, commentCount: cs.filter(c => c.eventId === e.id).length };
    }).sort((a, b) => a.startDate.localeCompare(b.startDate));
    return send(res, 200, { events: out, meta: store.read('meta.json', {}), roles: ROLES });
  }
  if (m === 'GET' && parts[0] === 'events' && parts[1]) {
    const id = parts[1];
    const ev = getEvents().find(e => e.id === id);
    if (!ev) return send(res, 404, { error: '행사를 찾을 수 없습니다' });
    return send(res, 200, {
      participants: store.read('participants.json', []).filter(p => p.eventId === id).map(publicP),
      comments: store.read('comments.json', []).filter(c => c.eventId === id).map(publicC),
    });
  }

  if (m === 'POST' && parts[0] === 'admin' && parts[1] === 'refresh') {
    if (!isAdmin(req)) return send(res, 403, { error: 'forbidden' });
    return send(res, 200, await scraper.run());
  }

  if (parts[0] === 'admin' && parts[1] === 'suggestions') {
    if (m === 'POST') await readBody(req).catch(() => ({}));
    if (!isAdmin(req)) return send(res, 403, { error: 'forbidden' });
    const all = store.read('suggestions.json', []);
    if (m === 'GET') return send(res, 200, { suggestions: all.filter(x => x.status === 'pending').map(x => ({ ...x, owner: undefined, ip: undefined, eventName: (getEvents().find(e => e.id === x.eventId) || {}).name })) });
    if (m === 'POST' && parts[2] && ['approve', 'reject'].includes(parts[3])) {
      const sg = all.find(x => x.id === parts[2] && x.status === 'pending');
      if (!sg) return send(res, 404, { error: '대기 중인 제안이 아닙니다' });
      if (parts[3] === 'approve') {
        const events = getEvents();
        if (sg.type === 'new') {
          const id = 'user-' + crypto.createHash('sha1').update(sg.fields.name + sg.fields.startDate).digest('hex').slice(0, 10);
          if (events.some(e => e.id === id)) return send(res, 409, { error: '이미 같은 행사가 있습니다' });
          events.push({ links: [], description: '', ...sg.fields, id, origin: 'user', locked: true, sourceUrl: sg.sourceUrl, source: '이용자 제보' });
        } else {
          const ev = events.find(e => e.id === sg.eventId);
          if (!ev) return send(res, 404, { error: '행사를 찾을 수 없습니다' });
          Object.assign(ev, sg.fields, { locked: true, sample: false, origin: ev.origin || 'user-edited', updatedAt: new Date().toISOString() });
        }
        store.write('events.json', events);
      }
      sg.status = parts[3] === 'approve' ? 'approved' : 'rejected'; sg.decidedAt = new Date().toISOString();
      store.write('suggestions.json', all);
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'not found' });
  }

  if (!['POST', 'DELETE'].includes(m)) return send(res, 404, { error: 'not found' });
  if (limited(ip)) return send(res, 429, { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요' });
  const body = await readBody(req);
  const token = clean(body.token, 80);
  if (token.length < 16) return send(res, 400, { error: '잘못된 요청입니다' });

  // 행사 제안 (신규/수정): 즉시 공개하지 않고 관리자 승인 대기
  if (m === 'POST' && parts[0] === 'suggestions') {
    const type = body.type === 'edit' ? 'edit' : 'new';
    const eventId = clean(body.eventId, 80);
    if (type === 'edit' && !getEvents().some(e => e.id === eventId)) return send(res, 404, { error: '행사를 찾을 수 없습니다' });
    const fields = cleanFields(body.fields, type === 'new');
    if (typeof fields === 'string') return send(res, 400, { error: fields });
    if (type === 'edit' && !Object.keys(fields).length) return send(res, 400, { error: '수정할 내용을 입력해주세요' });
    const sourceUrl = safeUrl(body.sourceUrl);
    if (!sourceUrl) return send(res, 400, { error: '근거가 되는 출처 링크(공식 공지·SNS)를 입력해주세요' });
    const all = store.read('suggestions.json', []);
    const o = hash(token), dayAgo = Date.now() - DAY;
    if (all.filter(x => (x.owner === o || x.ip === ip) && Date.parse(x.createdAt) > dayAgo).length >= 5) return send(res, 429, { error: '제안은 하루 5건까지 가능합니다' });
    if (all.filter(x => x.status === 'pending').length >= 300) return send(res, 503, { error: '대기 중인 제안이 많습니다. 잠시 후 다시 시도해주세요' });
    all.push({ id: crypto.randomUUID(), type, eventId: type === 'edit' ? eventId : '', fields, sourceUrl, note: clean(body.note, 300), nickname: clean(body.nickname, 20), status: 'pending', createdAt: new Date().toISOString(), owner: o, ip });
    store.write('suggestions.json', all);
    return send(res, 200, { ok: true });
  }

  // 참가 체크 (행사+브라우저당 1건, 재전송 시 수정)
  if (m === 'POST' && parts[0] === 'participate') {
    const eventId = clean(body.eventId, 80);
    if (!getEvents().some(e => e.id === eventId)) return send(res, 404, { error: '행사를 찾을 수 없습니다' });
    const role = clean(body.role, 10);
    const nickname = clean(body.nickname, 20);
    if (!ROLES.includes(role)) return send(res, 400, { error: '분류를 선택해주세요' });
    if (!nickname) return send(res, 400, { error: '닉네임을 입력해주세요' });
    const snsPlatform = clean(body.snsPlatform, 10), sns = clean(body.sns, 100);
    const rec = { eventId, nickname, role, snsPlatform, sns, snsUrl: sns ? snsLink(snsPlatform, sns) : '', memo: clean(body.memo, 120), owner: hash(token) };
    const ps = store.read('participants.json', []);
    const i = ps.findIndex(p => p.eventId === eventId && p.owner === rec.owner);
    if (i >= 0) ps[i] = { ...ps[i], ...rec };
    else ps.push({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...rec });
    store.write('participants.json', ps);
    return send(res, 200, { ok: true });
  }
  if (m === 'DELETE' && parts[0] === 'participate') {
    const eventId = clean(body.eventId, 80), o = hash(token);
    const ps = store.read('participants.json', []);
    store.write('participants.json', ps.filter(p => !(p.eventId === eventId && p.owner === o)));
    return send(res, 200, { ok: true });
  }

  // 댓글 (문의/촬영약속)
  if (m === 'POST' && parts[0] === 'comments') {
    const eventId = clean(body.eventId, 80);
    if (!getEvents().some(e => e.id === eventId)) return send(res, 404, { error: '행사를 찾을 수 없습니다' });
    const text = clean(body.text, 500), nickname = clean(body.nickname, 20);
    if (!text || !nickname) return send(res, 400, { error: '닉네임과 내용을 입력해주세요' });
    const cs = store.read('comments.json', []);
    const c = { id: crypto.randomUUID(), eventId, nickname, text, inquiry: !!body.inquiry, role: ROLES.includes(body.role) ? body.role : '', createdAt: new Date().toISOString(), owner: hash(token) };
    cs.push(c);
    store.write('comments.json', cs);
    return send(res, 200, publicC(c));
  }
  if (m === 'DELETE' && parts[0] === 'comments') {
    const id = clean(body.id, 60), o = hash(token);
    const cs = store.read('comments.json', []);
    const c = cs.find(x => x.id === id);
    if (!c || c.owner !== o) return send(res, 403, { error: '삭제 권한이 없습니다' });
    store.write('comments.json', cs.filter(x => x.id !== id));
    return send(res, 200, { ok: true });
  }
  return send(res, 404, { error: 'not found' });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    let f = path.normalize(path.join(PUB, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!f.startsWith(PUB + path.sep)) return send(res, 403, 'forbidden', 'text/plain');
    fs.readFile(f, (err, buf) => {
      if (err) return send(res, 404, 'not found', 'text/plain');
      res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' });
      res.end(buf);
    });
  } catch (e) { send(res, 500, { error: e.message }); }
});

// 하루 1회 수집: 시작 시 마지막 실행이 24시간 지났으면 실행, 이후 1시간마다 확인
async function maybeRefresh() {
  const last = Date.parse(store.read('meta.json', {}).lastRun || 0) || 0;
  if (Date.now() - last >= DAY) {
    try { const r = await scraper.run(); console.log('[cosmoa] 수집 완료', r.added, '추가', r.updated, '갱신', r.errors.length, '오류'); }
    catch (e) { console.error('[cosmoa] 수집 실패', e.message); }
  }
}

if (require.main === module) {
  server.listen(PORT, () => console.log(`코스모아 http://localhost:${PORT}`));
  maybeRefresh();
  setInterval(maybeRefresh, 3600 * 1000).unref();
}
module.exports = server;
