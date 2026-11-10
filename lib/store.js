'use strict';
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'data');

function read(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8')); }
  catch { return fallback; }
}
function write(name, obj) {
  const f = path.join(DIR, name), tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, f);
}
module.exports = { read, write };
