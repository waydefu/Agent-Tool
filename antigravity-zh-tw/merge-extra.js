// 把 src/locales/zh-TW.extra.json 合併進 zh-TW.json（可重複執行，結果相同）。
// 用法：node merge-extra.js
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'src', 'locales');
const file = path.join(dir, 'zh-TW.json');
const loc = JSON.parse(fs.readFileSync(file, 'utf8'));
const extra = JSON.parse(fs.readFileSync(path.join(dir, 'zh-TW.extra.json'), 'utf8'));

Object.assign(loc.text, extra.actions, extra.text);
loc.valueMaps = loc.valueMaps || {};
loc.valueMaps.twAction = { ...extra.actions };
loc.valueMaps.twLevel = { ...(extra.levels || {}) };
loc.valueMaps.twPermTarget = { ...(extra.permTargets || {}) };
loc.valueMaps.preset = { ...(loc.valueMaps.preset || {}), ...extra.presetExtra };
const ids = new Set(extra.patterns.map((p) => p.id));
loc.patterns = [...extra.patterns, ...(loc.patterns || []).filter((p) => !ids.has(p.id))];
// First validate the in-memory result: never overwrite the working dictionary with invalid JSON.
require('./src/locale').validateLocale('zh-TW', loc);
const temp = file + '.tmp-' + process.pid;
try {
  fs.writeFileSync(temp, JSON.stringify(loc, null, 2) + '\n', 'utf8');
  fs.renameSync(temp, file);
} catch (err) {
  try { fs.unlinkSync(temp); } catch {}
  throw err;
}
require('./src/locale').loadLocale('zh-TW'); // Read back and validate the committed result
console.log(`zh-TW: ${Object.keys(loc.text).length} 條字串，${loc.patterns.length} 條規則，驗證通過`);
