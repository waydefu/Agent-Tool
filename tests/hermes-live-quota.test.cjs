'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { queryQuota, createQuotaPoller } = require('../hermes-cache-watch/live-quota');

function fakeServer(response) {
  let args;
  const spawn = (cmd, options) => {
    args = options;
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = () => { child.emit('close', 0); return true; };
    let buffer = '';
    child.stdin.on('data', chunk => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const req = JSON.parse(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        if (req.id === 1) child.stdout.write(JSON.stringify({ id: 1, result: {} }) + '\n');
        if (req.id === 2) child.stdout.write(JSON.stringify({ id: 2, result: response }) + '\n');
      }
    });
    return child;
  };
  return { spawn, args: () => args };
}

test('queries live quota without enabling the hybrid2 channel', async () => {
  const fake = fakeServer({ rateLimits: {
    primary: { usedPercent: 23, windowDurationMins: 300, resetsAt: 2000000000 },
    secondary: { usedPercent: 14, windowDurationMins: 10080, resetsAt: 2000000000 },
  } });
  const quota = await queryQuota('codex-test', fake.spawn);
  assert.deepEqual(quota[0].buckets.map(b => [b.window, b.remaining]), [['week', 86], ['5h', 77]]);
  assert.ok(fake.args().includes('mcp_servers.hybrid2.enabled=false'));
});

test('keeps hybrid2 disabled when no server is configured', async () => {
  const fake = fakeServer({ rateLimits: { primary: { usedPercent: 23, windowDurationMins: 300 } } });
  let calls = 0;
  const start = (cmd, args, opts) => {
    calls++;
    if (calls === 1) {
      const child = new EventEmitter();
      child.stdout = new PassThrough(); child.stdin = new PassThrough();
      child.kill = () => true;
      setImmediate(() => child.emit('close', 1));
      return child;
    }
    return fake.spawn(cmd, args, opts);
  };
  const quota = await queryQuota('codex-test', start);
  assert.equal(quota[0].buckets[0].remaining, 77);
  assert.equal(calls, 2);
  assert.ok(fake.args().includes('mcp_servers.hybrid2={command="__disabled__",enabled=false}'));
});

test('does not guess full quota when the last reset has passed', async () => {
  const fake = fakeServer({ rateLimits: { primary: { usedPercent: 80, windowDurationMins: 300, resetsAt: 1 } } });
  const quota = await queryQuota('codex-test', fake.spawn);
  assert.equal(quota[0].buckets[0].remaining, 20);
});

test('poller refreshes after 60 seconds and marks last result stale on failure', async () => {
  let calls = 0;
  const poller = createQuotaPoller(async () => {
    calls++;
    if (calls > 1) throw new Error('offline');
    return [{ buckets: [{ remaining: 77 }] }];
  });
  assert.equal((await poller.refresh(1000)).quotaStatus, 'fresh');
  assert.equal((await poller.refresh(60999)).quotaStatus, 'fresh');
  const state = await poller.refresh(61000);
  assert.equal(calls, 2);
  assert.equal(state.quotaStatus, 'stale');
  assert.equal(state.quota[0].buckets[0].remaining, 77);
  await poller.refresh(180999);
  assert.equal(calls, 2);
});

test('rejects missing or invalid quota rather than reporting zero use', async () => {
  const fake = fakeServer({ rateLimits: { primary: { usedPercent: null, windowDurationMins: 300 } } });
  await assert.rejects(queryQuota('codex-test', fake.spawn));
});
