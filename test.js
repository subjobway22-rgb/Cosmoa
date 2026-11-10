'use strict';
const assert = require('assert');
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

  const [, list] = await j('GET', '/api/events');
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
  console.log('ALL OK'); server.close();
})().catch(e => { console.error(e); process.exit(1); });
