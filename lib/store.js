'use strict';
const fs = require('fs');
const path = require('path');
const SEED = path.join(__dirname, '..', 'data');
const DIR = process.env.DATA_DIR || SEED;
fs.mkdirSync(DIR, { recursive: true });

// 설정 파일(seed-events, sources)은 항상 저장소 data/ 에서, 나머지 상태는 DATA_DIR(영구 디스크)에서 읽는다
const STATIC = new Set(['seed-events.json', 'sources.json']);
function read(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(STATIC.has(name) ? SEED : DIR, name), 'utf8')); }
  catch { return fallback; }
}
function write(name, obj) {
  const f = path.join(DIR, name), tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, f);
}
module.exports = { read, write };
