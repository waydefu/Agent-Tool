'use strict';
// Windows-only fail-closed check for the executable owning the CDP TCP listener.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

function createOwnerGuard(app, port, execute = execFileSync, clock = Date.now) {
  if (!['antigravity', 'codex'].includes(app) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TypeError('Invalid CDP owner guard configuration');
  }
  let checkedAt = null;
  return function ensureTrustedOwner(force = false) {
    if (!force && checkedAt !== null && clock() - checkedAt < 10000) return;
    try {
      const output = execute('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', path.join(__dirname, 'Verify-CdpOwner.ps1'),
        '-App', app, '-Port', String(port),
      ], { encoding: 'utf8', timeout: 8000, windowsHide: true, maxBuffer: 16384 });
      if (String(output).trim() !== 'AGENT_TOOL_CDP_OWNER_OK') throw new Error('Unexpected verification result');
      checkedAt = clock();
    } catch {
      checkedAt = null;
      const error = new Error('CDP endpoint ownership or loopback binding could not be verified');
      error.code = 'UNTRUSTED_CDP';
      throw error;
    }
  };
}
module.exports = { createOwnerGuard };
