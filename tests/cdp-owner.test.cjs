'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createOwnerGuard, linuxOwnerOk, splitCmdline } = require('../shared/cdp-owner');

test('CDP verification uses Windows process identity and caches only the read probe', () => {
  let time = 0;
  const calls = [];
  const fakePowerShell = (bin, args, options) => {
    calls.push({ bin, args, options });
    return 'AGENT_TOOL_CDP_OWNER_OK\n';
  };
  const verify = createOwnerGuard('antigravity', 9339, fakePowerShell, () => time, 10000, 'win32');
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
    const verify = createOwnerGuard('codex', 9340, execute, undefined, undefined, 'win32');
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
  const verify = createOwnerGuard('antigravity', 9339, timeoutExec, undefined, undefined, 'win32');
  assert.throws(() => verify(), { code: 'CDP_CHECK_TIMEOUT' });
});
test('CDP guard honors custom cache TTL to avoid excessive PowerShell checks', () => {
  let time = 0;
  let calls = 0;
  const fakePowerShell = () => {
    calls += 1;
    return 'AGENT_TOOL_CDP_OWNER_OK\n';
  };
  const verify = createOwnerGuard('antigravity', 9339, fakePowerShell, () => time, 300000, 'win32');
  verify();
  time = 120000;
  verify();
  assert.equal(calls, 1);
  time = 301000;
  verify();
  assert.equal(calls, 2);
});

const MAIN = ['/opt/antigravity-hub/antigravity', '--no-sandbox', '--remote-debugging-port=9339', '--remote-debugging-address=127.0.0.1'];
test('Linux check accepts only the app main process started with the loopback debug flags', () => {
  assert.equal(linuxOwnerOk('antigravity', 9339, [MAIN]), true);
  assert.equal(linuxOwnerOk('codex', 9340, [['/usr/lib/chatgpt/ChatGPT', '--remote-debugging-port=9340', '--remote-debugging-address=127.0.0.1']]), true);
  assert.equal(linuxOwnerOk('hermes', 9346, [['/usr/local/lib/hermes-agent/apps/desktop/release/linux-arm64-unpacked/Hermes', '--remote-debugging-port=9346', '--remote-debugging-address=127.0.0.1']]), true);
  assert.equal(linuxOwnerOk('hermes', 9346, [['/tmp/Hermes', '--remote-debugging-port=9346']]), false);
  assert.equal(linuxOwnerOk('antigravity', 9341, [MAIN]), false);
  assert.equal(linuxOwnerOk('codex', 9339, [MAIN]), false);
  assert.equal(linuxOwnerOk('antigravity', 9339, [[...MAIN, '--type=renderer']]), false);
  assert.equal(linuxOwnerOk('antigravity', 9339, [MAIN.filter((a) => !a.startsWith('--remote-debugging-address'))]), false);
  assert.equal(linuxOwnerOk('antigravity', 9339, [['/tmp/evil', ...MAIN.slice(1)]]), false);
  assert.equal(linuxOwnerOk('antigravity', 9339, [[]]), false);
});
test('Linux guard fails closed without a matching process and caches a success', () => {
  let calls = 0;
  const ok = createOwnerGuard('antigravity', 9339, undefined, () => 0, 10000, 'linux', () => { calls += 1; return [MAIN]; });
  ok();
  ok();
  assert.equal(calls, 1);
  const bad = createOwnerGuard('antigravity', 9339, undefined, () => 0, 10000, 'linux', () => [['/usr/bin/python3', 'x.py']]);
  assert.throws(() => bad(), { code: 'UNTRUSTED_CDP' });
  const broken = createOwnerGuard('codex', 9340, undefined, () => 0, 10000, 'linux', () => { throw new Error('EACCES'); });
  assert.throws(() => broken(), { code: 'UNTRUSTED_CDP' });
});
test('Linux cmdline parsing handles NUL-separated argv and Chromium space-joined titles', () => {
  assert.deepEqual(splitCmdline('/usr/bin/python3\0x.py\0'), ['/usr/bin/python3', 'x.py']);
  assert.deepEqual(splitCmdline('/opt/antigravity-hub/antigravity --remote-debugging-port=9339 --remote-debugging-address=127.0.0.1'),
    ['/opt/antigravity-hub/antigravity', '--remote-debugging-port=9339', '--remote-debugging-address=127.0.0.1']);
  assert.deepEqual(splitCmdline(''), []);
});
