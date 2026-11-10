'use strict';
const assert = require('assert');
process.env.ADMIN_TOKEN = 'adm';
const server = require('./server');
const { jsonLdEvents, normalize } = require('./lib/scraper');
const T = 'a'.repeat(32), T2 = 'b'.repeat(32);

(async () => {
  const html = '<script type="application/ld+json">{"@type":"Event","name":"테스트콘","startDate":"2026-12-01T10:00:00+09:00","endDate":"2026-12-01T18:00:00+09:00","location":{"name":"코엑스","address":"서울"},"offers":{"price":"5000","priceCurrency":"KRW"}}</script>';
  const ev = normalize(jsonLdEvents(html)[0], { name: 't' }, 'https://x.test');
  assert.equal(ev.time, '10:00 ~ 18:00'); assert.equal(ev.fee, '5,000원');

  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const j = async (m, p, b) => { const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json' }, body: b && JSON.stringify(b) }); return [r.status, await r.json()]; };

  let [, list] = await j('GET', '/api/events');
  const id = list.events[0].id;
  let [s] = await j('POST', '/api/participate', { token: T, eventId: id, role: '해커', nickname: 'a' }); assert.equal(s, 400);
  [s] = await j('POST', '/api/participate', { token: T, eventId: id, role: '코스어', nickname: '<b>x</b>', snsPlatform: 'X', sns: '@foo' }); assert.equal(s, 200);
  [s] = await j('POST', '/api/participate', { token: T, eventId: id, role: '사진사', nickname: 'x', snsPlatform: 'X', sns: 'javascript:alert(1)' }); assert.equal(s, 200);
  let [, d] = await j('GET', '/api/events/' + id);
  assert.equal(d.participants.length, 1); assert.equal(d.participants[0].role, '사진사'); assert.equal(d.participants[0].snsUrl, ''); assert.ok(!('owner' in d.participants[0]));
  const [, c] = await j('POST', '/api/comments', { token: T, eventId: id, nickname: 'n', text: '촬영 문의', inquiry: true });
  [s] = await j('DELETE', '/api/comments', { token: T2, id: c.id }); assert.equal(s, 403);
  [s] = await j('DELETE', '/api/comments', { token: T, id: c.id }); assert.equal(s, 200);
  await j('DELETE', '/api/participate', { token: T, eventId: id });
  [, d] = await j('GET', '/api/events/' + id); assert.equal(d.participants.length, 0);
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/..%2fserver.js')).status, 404);
  // 제안 → 승인 흐름
  const A = { 'x-admin-token': 'adm' };
  const post = async (p, b, hd = {}) => { const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...hd }, body: JSON.stringify(b) }); return [r.status, await r.json()]; };
  [s] = await post('/api/suggestions', { token: T, type: 'new', fields: { name: '신규콘', startDate: '2026-12-20' } }); assert.equal(s, 400); // 출처 없음
  [s] = await post('/api/suggestions', { token: T, type: 'new', sourceUrl: 'javascript:1', fields: { name: '신규콘', startDate: '2026-12-20' } }); assert.equal(s, 400);
  [s] = await post('/api/suggestions', { token: T, type: 'new', sourceUrl: 'https://x.com/a/1', fields: { name: '신규콘', startDate: '2026-12-20', officialUrl: 'javascript:1' } }); assert.equal(s, 400);
  [s] = await post('/api/suggestions', { token: T, type: 'new', sourceUrl: 'https://x.com/a/1', fields: { name: '신규콘', startDate: '2026-12-20', fee: '무료' } }); assert.equal(s, 200);
  [s] = await post('/api/suggestions', { token: T, type: 'edit', eventId: id, sourceUrl: 'https://x.com/a/2', fields: { time: '10:00 ~ 17:00' } }); assert.equal(s, 200);
  [, list] = await j('GET', '/api/events'); assert.ok(!list.events.some(e => e.name === '신규콘')); // 승인 전 비공개
  assert.equal((await fetch(base + '/api/admin/suggestions')).status, 403);
  const pend = (await (await fetch(base + '/api/admin/suggestions', { headers: A })).json()).suggestions;
  assert.equal(pend.length, 2); assert.ok(!('owner' in pend[0]));
  for (const p of pend) [s] = await post(`/api/admin/suggestions/${p.id}/approve`, {}, A), assert.equal(s, 200);
  [, list] = await j('GET', '/api/events');
  assert.ok(list.events.find(e => e.name === '신규콘' && e.origin === 'user' && e.locked));
  assert.equal(list.events.find(e => e.id === id).time, '10:00 ~ 17:00');
  console.log('ALL OK'); server.close();
})().catch(e => { console.error(e); process.exit(1); });
