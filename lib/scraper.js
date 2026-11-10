'use strict';
// 하루 1회 웹에서 행사 정보를 수집. 출처 페이지의 JSON-LD(schema.org Event)와 OpenGraph를 파싱.
const crypto = require('crypto');

const UA = 'CosmoaBot/1.0 (+event-info aggregator)';

async function fetchText(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: ctl.signal, redirect: 'follow' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return (await r.text()).slice(0, 2_000_000);
  } finally { clearTimeout(t); }
}

function jsonLdEvents(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    const t = [].concat(n['@type'] || []);
    if (t.some(x => /Event$/.test(String(x)))) out.push(n);
    if (n['@graph']) walk(n['@graph']);
    if (n.subEvent) walk(n.subEvent);
  };
  while ((m = re.exec(html))) { try { walk(JSON.parse(m[1])); } catch {} }
  return out;
}

const ymd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? m[0] : ''; };
const hm = (s) => { const m = /T(\d{2}:\d{2})/.exec(s || ''); return m ? m[1] : ''; };

function normalize(e, source, pageUrl) {
  const name = String(e.name || '').trim();
  const startDate = ymd(e.startDate);
  if (!name || !startDate) return null;
  const loc = e.location || {};
  const addr = typeof loc.address === 'string' ? loc.address : (loc.address && (loc.address.streetAddress || loc.address.addressLocality)) || '';
  const location = [loc.name, addr].filter(Boolean).join(' ') || '';
  const offer = [].concat(e.offers || [])[0];
  let fee = '';
  if (offer) fee = Number(offer.price) === 0 ? '무료' : offer.price ? `${Number(offer.price).toLocaleString('ko-KR')}${offer.priceCurrency === 'KRW' || !offer.priceCurrency ? '원' : ' ' + offer.priceCurrency}` : '';
  const st = hm(e.startDate), en = hm(e.endDate);
  const id = 'web-' + crypto.createHash('sha1').update(name + startDate).digest('hex').slice(0, 12);
  return {
    id, name: name.slice(0, 120), category: source.category || '기타',
    startDate, endDate: ymd(e.endDate) || startDate,
    time: st ? (en ? `${st} ~ ${en}` : st) : '', fee, location: location.slice(0, 160),
    region: '', officialUrl: typeof e.url === 'string' && /^https?:/.test(e.url) ? e.url : pageUrl,
    description: String(e.description || '').replace(/<[^>]+>/g, '').slice(0, 400),
    source: source.name, auto: true,
  };
}

async function run(store) {
  const log = { startedAt: new Date().toISOString(), added: 0, updated: 0, errors: [] };
  const seed = await store.read('seed-events.json', []);
  const events = await store.read('events.json', null) || seed;
  const byId = new Map(events.map(e => [e.id, e]));
  for (const s of seed) if (!byId.has(s.id)) byId.set(s.id, s);

  const { sources = [] } = await store.read('sources.json', {});
  for (const src of sources) {
    try {
      const html = await fetchText(src.url);
      for (const raw of jsonLdEvents(html)) {
        const ev = normalize(raw, src, src.url);
        if (!ev) continue;
        const old = byId.get(ev.id);
        if (!old) { byId.set(ev.id, ev); log.added++; }
        else if (old.auto) { byId.set(ev.id, { ...old, ...Object.fromEntries(Object.entries(ev).filter(([, v]) => v)) }); log.updated++; }
      }
    } catch (e) { log.errors.push(`${src.name}: ${e.message}`); }
  }

  // 공식 페이지가 있는 행사는 JSON-LD로 일정/요금/장소 갱신 시도 (locked 필드는 제외)
  for (const ev of byId.values()) {
    if (!ev.officialUrl || ev.locked) continue;
    try {
      const html = await fetchText(ev.officialUrl);
      const hit = jsonLdEvents(html).map(r => normalize(r, { name: ev.source || '공식', category: ev.category }, ev.officialUrl))
        .filter(Boolean).find(n => n.name.includes(ev.name.replace(/\s*\(샘플\)/, '')) || ev.name.includes(n.name));
      if (hit) {
        for (const k of ['startDate', 'endDate', 'time', 'fee', 'location']) if (hit[k]) ev[k] = hit[k];
        ev.sample = false; ev.updatedAt = new Date().toISOString(); log.updated++;
      }
    } catch (e) { log.errors.push(`${ev.name}: ${e.message}`); }
  }

  await store.write('events.json', [...byId.values()]);
  log.finishedAt = new Date().toISOString();
  await store.write('meta.json', { lastRun: log.finishedAt, lastLog: log });
  return log;
}

module.exports = { run, jsonLdEvents, normalize };
