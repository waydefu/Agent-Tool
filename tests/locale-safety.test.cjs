'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const locale = require('../antigravity-zh-tw/src/locale');

test('Traditional Chinese is the valid default locale; extra dictionaries are not exposed as locales', () => {
  assert.equal(locale.DEFAULT_LOCALE, 'zh-TW');
  assert.ok(locale.listLocales().includes('zh-TW'));
  assert.ok(!locale.listLocales().includes('zh-TW.extra'));
  assert.equal(locale.loadLocale().language, 'zh-TW');
});

test('merging invalid translations never overwrites the working dictionary', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-tool-merge-'));
  try {
    const src = path.join(dir, 'src');
    const locDir = path.join(src, 'locales');
    fs.mkdirSync(locDir, { recursive: true });
    fs.copyFileSync('antigravity-zh-tw/src/locale.js', path.join(src, 'locale.js'));
    fs.copyFileSync('antigravity-zh-tw/merge-extra.js', path.join(dir, 'merge-extra.js'));
    const dictionaryFile = path.join(locDir, 'zh-TW.json');
    const base = { language: 'zh-TW', text: { hello: '你好' }, patterns: [], valueMaps: {} };
    fs.writeFileSync(dictionaryFile, JSON.stringify(base), 'utf8');
    const extraFile = path.join(locDir, 'zh-TW.extra.json');
    const broken = { text: {}, actions: {}, levels: {}, permTargets: {}, presetExtra: {},
      patterns: [{ id: 'broken', pattern: '(', template: 'bad' }] };
    fs.writeFileSync(extraFile, JSON.stringify(broken), 'utf8');
    assert.throws(() => execFileSync(process.execPath, [path.join(dir, 'merge-extra.js')],
      { encoding: 'utf8', stdio: 'pipe' }));
    assert.deepEqual(JSON.parse(fs.readFileSync(dictionaryFile, 'utf8')), base,
      'bad regex must not overwrite the previously valid dictionary');

    fs.writeFileSync(extraFile, JSON.stringify({ ...broken, patterns: [], text: { thanks: '謝謝' } }), 'utf8');
    execFileSync(process.execPath, [path.join(dir, 'merge-extra.js')],
      { encoding: 'utf8', stdio: 'pipe' });
    const merged = JSON.parse(fs.readFileSync(dictionaryFile, 'utf8'));
    assert.equal(merged.text.thanks, '謝謝');
    assert.equal(merged.text.hello, '你好');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
