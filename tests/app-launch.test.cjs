'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { appArgs } = require('../shared/app-launch');

test('app arguments: only what follows --, plus --no-sandbox for root', () => {
  assert.deepEqual(appArgs(['node', 'l.js'], 1000), []);
  assert.deepEqual(appArgs(['node', 'l.js', '--lang=en'], 1000), []);
  assert.deepEqual(appArgs(['node', 'l.js', '--', '--user-data-dir=/x'], 1000), ['--user-data-dir=/x']);
  assert.deepEqual(appArgs(['node', 'l.js', '--', '--user-data-dir=/x'], 0), ['--no-sandbox', '--user-data-dir=/x']);
});
