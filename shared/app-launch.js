'use strict';
// Platform details shared by the Antigravity and ChatGPT/Codex launchers.
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';

// Arguments after `--` go to the app itself (e.g. --user-data-dir on Linux).
// Electron refuses to start as root without --no-sandbox.
function appArgs(argv = process.argv, uid = process.getuid?.()) {
  const i = argv.indexOf('--');
  return [...(uid === 0 ? ['--no-sandbox'] : []), ...(i === -1 ? [] : argv.slice(i + 1))];
}

module.exports = { PYTHON, appArgs };
