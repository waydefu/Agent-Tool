'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  const path = 'hermes-cache-watch/desktop-plugin/plugin.js';
  assert.ok(fs.existsSync(path), 'context plugin must exist');
  const source = fs.readFileSync(path, 'utf8').replace("import { host } from '@hermes/plugin-sdk'", 'const host = globalThis.__testHost').replace('export default', 'globalThis.__plugin =');
  const atom = value => ({ get: () => value });
  const requests = [];
  const host = {
    state: { focusedSessionId: atom('session-a'), focusedSessionOwner: atom({connectionId: 'local', profile: 'default'}), connectionId: atom('local'), profile: atom('default'), busy: atom(false) },
    request: async (method, params) => { requests.push([method, params]); return { context_used: 60, context_max: 100, context_estimated: true, context_source: 'local_estimate', categories: [{ id: 'conversation', tokens: 30 }], context_files: [{ path: 'private fixture' }] }; },
  };
  const window = {};
  const context = { __testHost: host, window };
  vm.runInNewContext(source, context, { filename: path, timeout: 1000 });
  let dispose;
  context.__plugin.register({ onDispose(fn) { dispose = fn; } });
  return { host, window, requests, dispose: () => dispose() };
}

test('context bridge refuses busy or wrong-route sessions without a request', async () => {
  const { host, window, requests } = setup();
  host.state.busy = { get: () => true };
  await assert.rejects(window.__hermesHudContext.read());
  host.state.busy = { get: () => false };
  host.state.connectionId = { get: () => 'other' };
  await assert.rejects(window.__hermesHudContext.read());
  assert.equal(requests.length, 0);
});

test('context bridge discards a response if the focused session changes', async () => {
  const { host, window } = setup();
  let finish;
  host.request = () => new Promise(resolve => { finish = resolve; });
  const reading = window.__hermesHudContext.read();
  host.state.focusedSessionId = { get: () => 'session-b' };
  finish({ context_used: 10, categories: [] });
  await assert.rejects(reading);
});

test('context bridge reads only on demand and exposes aggregate fields', async () => {
  const { window, requests, dispose } = setup();
  assert.equal(requests.length, 0);
  const data = await window.__hermesHudContext.read();
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], 'session.context_breakdown');
  assert.equal(data.context_used, 60);
  assert.equal(data.categories[0].id, 'conversation');
  assert.equal('context_files' in data, false);
  dispose();
  assert.equal(window.__hermesHudContext, undefined);
});
