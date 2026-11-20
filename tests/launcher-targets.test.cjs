'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function sourceFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, name + ' not found');
  const tail = source.slice(start);
  const end = tail.indexOf('\n}');
  assert.notEqual(end, -1, name + ' has no closing brace');
  return tail.slice(0, end + 2);
}

function loadChecks(file, port, functionNames) {
  const source = fs.readFileSync(file, 'utf8');
  const code = functionNames.map((n) => sourceFunction(source, n)).join('\n');
  const env = { URL, PORT: port };
  vm.createContext(env);
  vm.runInContext(code, env);
  return env;
}

const ag = loadChecks('antigravity-zh-tw/launch-zh-tw.js', 9339, ['isLocalDebugSocket', 'isAntigravityPage']);
const cd = loadChecks('codex-cache-watch/launch-codex-hud.js', 9340, ['isMainPage']);

function tab(url, port, ws = '127.0.0.1', title = 'App') {
  return { type: 'page', url, title, webSocketDebuggerUrl: 'ws://' + ws + ':' + port + '/devtools/page/1' };
}

test('Antigravity accepts local app and local debug WebSocket', () => {
  assert.equal(ag.isAntigravityPage(tab('app://antigravity/index.html', 9339)), true);
  assert.equal(ag.isAntigravityPage(tab('http://localhost:3123/', 9339)), true);
  assert.equal(ag.isAntigravityPage(tab('https://127.0.0.1:65389/c/65652377', 9339)), true);
  assert.equal(ag.isAntigravityPage(tab('https://evil.invalid/', 9339, '127.0.0.1', 'Antigravity')), false);
  assert.equal(ag.isAntigravityPage(tab('http://localhost.evil.invalid/', 9339)), false);
  assert.equal(ag.isAntigravityPage(tab('app://antigravity/', 9339, 'evil.invalid')), false);
});

test('Codex denies spoofed host, title, avatar-overlay and remote debug endpoint', () => {
  assert.equal(cd.isMainPage(tab('https://chatgpt.com/', 9340)), true);
  assert.equal(cd.isMainPage(tab('app://-/index.html', 9340)), true);
  assert.equal(cd.isMainPage(tab('app://-/index.html?initialRoute=%2Favatar-overlay', 9340)), false);
  assert.equal(cd.isMainPage(tab('https://chatgpt.com.attacker.invalid/', 9340, '127.0.0.1', 'ChatGPT')), false);
  assert.equal(cd.isMainPage(tab('https://evil.invalid/', 9340, '127.0.0.1', 'ChatGPT')), false);
  assert.equal(cd.isMainPage(tab('https://chatgpt.com/', 9340, 'evil.invalid')), false);
  assert.equal(cd.isMainPage(tab('http://localhost:5000/', 9340)), true);
});
