'use strict';
// Fail-closed check for the process owning the CDP TCP listener.
// Windows: PowerShell maps the listener to its executable. Linux: see linuxOwnerOk.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// argv[0] basename of each app's Electron main process on Linux.
const LINUX_BINARIES = { antigravity: /^antigravity$/, codex: /^ChatGPT$/, hermes: /^Hermes$/ };

// Chromium/Electron rewrite their process title, so /proc/pid/cmdline becomes one space-joined
// string instead of NUL-separated argv. An app path containing spaces then fails the check (closed).
function splitCmdline(raw) {
  const parts = raw.split('\0').filter(Boolean);
  return parts.length === 1 ? parts[0].split(' ').filter(Boolean) : parts;
}

function procArgvs() {
  const out = [];
  for (const pid of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(pid)) continue;
    try { out.push(splitCmdline(fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8'))); } catch {}
  }
  return out;
}

// shortcut: matches the main process's own argv, not the socket owner, because PRoot denies
// /proc/net/tcp and shows sharded apps' /proc/pid/exe as the proot loader; a process that binds the
// port first and fakes argv[0] passes. Upgrade to /proc/net/tcp inode -> /proc/pid/fd once readable.
function linuxOwnerOk(app, port, argvs) {
  return argvs.some((argv) => LINUX_BINARIES[app].test(path.basename(argv[0] || '')) &&
    argv.includes(`--remote-debugging-port=${port}`) &&
    argv.includes('--remote-debugging-address=127.0.0.1') &&
    !argv.some((a) => a.startsWith('--type=')));
}

function createOwnerGuard(app, port, execute = execFileSync, clock = Date.now, ttlMs = 10000,
  platform = process.platform, listArgvs = procArgvs) {
  if (!['antigravity', 'codex', 'hermes'].includes(app) || !Number.isInteger(port) || port < 1 || port > 65535 || !Number.isFinite(ttlMs) || ttlMs < 0) {
    throw new TypeError('Invalid CDP owner guard configuration');
  }
  let checkedAt = null;
  return function ensureTrustedOwner(force = false) {
    if (!force && checkedAt !== null && clock() - checkedAt < ttlMs) return;
    try {
      if (platform === 'linux') {
        if (!linuxOwnerOk(app, port, listArgvs())) throw new Error('No matching app process');
      } else {
        const output = execute('powershell.exe', [
          '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
          '-File', path.join(__dirname, 'Verify-CdpOwner.ps1'),
          '-App', app, '-Port', String(port),
        ], { encoding: 'utf8', timeout: 25000, windowsHide: true, maxBuffer: 16384 });
        if (String(output).trim() !== 'AGENT_TOOL_CDP_OWNER_OK') throw new Error('Unexpected verification result');
      }
      checkedAt = clock();
    } catch (err) {
      checkedAt = null;
      const isTimeout = err && (err.code === 'ETIMEDOUT' || err.killed === true);
      const error = new Error(isTimeout
        ? 'CDP ownership check timed out (will retry without exiting)'
        : 'CDP endpoint ownership or loopback binding could not be verified');
      error.code = isTimeout ? 'CDP_CHECK_TIMEOUT' : 'UNTRUSTED_CDP';
      throw error;
    }
  };
}
module.exports = { createOwnerGuard, linuxOwnerOk, procArgvs, splitCmdline };
