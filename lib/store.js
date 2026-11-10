'use strict';
const fs = require('fs');
const path = require('path');
const SEED = path.join(__dirname, '..', 'data');
const DIR = process.env.DATA_DIR || SEED;
fs.mkdirSync(DIR, { recursive: true });

// 설정 파일은 항상 저장소 data/ 에서, 나머지 상태는 DATA_DIR에서 읽는다
const STATIC = new Set(['seed-events.json', 'sources.json']);
// 무료 호스팅(디스크가 재시작 시 초기화)용 백업: UPSTASH_REDIS_REST_URL/TOKEN이 있으면 상태 파일을 Redis에도 저장
const R_URL = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const R_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const REMOTE = !!(R_URL && R_TOKEN);
const STATE = ['events.json', 'participants.json', 'comments.json', 'suggestions.json', 'meta.json'];
const rk = (n) => 'cosmoa:' + n;
const rfetch = (p, opt = {}) => fetch(R_URL + p, { ...opt, headers: { authorization: 'Bearer ' + R_TOKEN }, signal: AbortSignal.timeout(10000) });

// 서버 시작 시 1회: Redis의 최신 상태를 로컬 파일로 복원
async function init() {
  if (!REMOTE) return;
  for (const n of STATE) {
    try {
      const j = await (await rfetch('/get/' + rk(n))).json();
      if (j.result) fs.writeFileSync(path.join(DIR, n), j.result);
    } catch (e) { console.error('[cosmoa] Redis 복원 실패', n, e.message); }
  }
}
// 쓰기는 직렬화해서 순서가 뒤바뀌지 않게 한다
let chain = Promise.resolve();
function push(name, text) {
  chain = chain.then(() => rfetch('/set/' + rk(name), { method: 'POST', body: text }))
    .catch((e) => console.error('[cosmoa] Redis 저장 실패', name, e.message));
}

function read(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(STATIC.has(name) ? SEED : DIR, name), 'utf8')); }
  catch { return fallback; }
}
function write(name, obj) {
  const f = path.join(DIR, name), tmp = f + '.tmp', text = JSON.stringify(obj, null, 2);
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, f);
  if (REMOTE && STATE.includes(name)) push(name, text);
}
module.exports = { read, write, init, REMOTE };
