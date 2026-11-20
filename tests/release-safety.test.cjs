'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('release tag is never injected into a generated PowerShell script', () => {
  const content = fs.readFileSync('.github/workflows/release.yml', 'utf8');
  assert.doesNotMatch(content, /\$\{\{\s*github\.ref_name\s*\}\}/);
  assert.match(content, /\$env:GITHUB_REF_NAME/);
  assert.match(content, /merge-base --is-ancestor HEAD origin\/main/);
  const source = content.match(/-cnotmatch '([^']+)'/);
  assert.ok(source, 'release tag must have an explicit allowlist');
  const allow = new RegExp(source[1]);
  for (const value of ['v1.0.0', 'v0.2.3', 'v1.2.3-rc.1']) {
    assert.match(value, allow);
  }
  for (const value of ['v1.2.3";echo hijacked', 'v1.2.3$(whoami)', 'v1.2.3;rm -rf', 'v01.2.3', 'test']) {
    assert.doesNotMatch(value, allow);
  }
});
