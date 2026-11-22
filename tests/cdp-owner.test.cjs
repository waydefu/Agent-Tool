'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createOwnerGuard } = require('../shared/cdp-owner');

test('CDP verification uses Windows process identity and caches only the read probe', () => {
  let time = 0;
  const calls = [];
  const fakePowerShell = (bin, args, options) => {
    calls.push({ bin, args, options });
    return 'AGENT_TOOL_CDP_OWNER_OK\n';
  };
  const verify = createOwnerGuard('antigravity', 9339, fakePowerShell, () => time);
  verify();
  verify();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].bin, 'powershell.exe');
  assert.ok(calls[0].args.some(s => s.endsWith('Verify-CdpOwner.ps1')));
  assert.ok(calls[0].args.includes('9339'));
  assert.ok(calls[0].args.includes('antigravity'));
  time = 5000;
  verify(true);
  assert.equal(calls.length, 2);
  time = 16000;
  verify();
  assert.equal(calls.length, 3);
});
test('CDP verification fails closed if ownership is unknown or verification fails', () => {
  const checks = [() => { throw new Error('wrong process'); }, () => ''];
  for (const execute of checks) {
    const verify = createOwnerGuard('codex', 9340, execute);
    assert.throws(() => verify(), { code: 'UNTRUSTED_CDP' });
    assert.throws(() => verify(), { code: 'UNTRUSTED_CDP' });
  }
});
test('CDP guard rejects unknown apps and invalid ports', () => {
  assert.throws(() => createOwnerGuard('other', 9339), TypeError);
  assert.throws(() => createOwnerGuard('codex', 0), TypeError);
  assert.throws(() => createOwnerGuard('codex', 70000), TypeError);
});
test('CDP guard distinguishes transient PowerShell timeout from untrusted listener', () => {
  const timeoutExec = () => {
    const err = new Error('timed out');
    err.code = 'ETIMEDOUT';
    err.killed = true;
    throw err;
  };
  const verify = createOwnerGuard('antigravity', 9339, timeoutExec);
  assert.throws(() => verify(), { code: 'CDP_CHECK_TIMEOUT' });
});
test('CDP guard honors custom cache TTL to avoid excessive PowerShell checks', () => {
  let time = 0;
  let calls = 0;
  const fakePowerShell = () => {
    calls += 1;
    return 'AGENT_TOOL_CDP_OWNER_OK\n';
  };
  const verify = createOwnerGuard('antigravity', 9339, fakePowerShell, () => time, 300000);
  verify();
  time = 120000;
  verify();
  assert.equal(calls, 1);
  time = 301000;
  verify();
  assert.equal(calls, 2);
});
