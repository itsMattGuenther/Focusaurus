import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = resolve('.');
export function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]); }
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
assert.equal(manifest.version, pkg.version, 'manifest/package version drift');
assert.equal(manifest.manifest_version, 3);
assert.ok(manifest.description.length <= 132);
for (const file of files('src')) {
  const text = readFileSync(file, 'utf8');
  if (file.endsWith('.js')) {
    const checked = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(checked.status, 0, checked.stderr);
    assert.doesNotMatch(text, /\beval\s*\(|new Function\s*\(|\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/, `${file}: unexpected remote/code execution API`);
  }
  if (file.endsWith('.html')) {
    assert.match(text, /<html lang="en">/);
    assert.match(text, /name="viewport"/);
    assert.doesNotMatch(text, /\son(?:click|load|error|submit)=|<script(?![^>]*\bsrc=)[^>]*>\s*[^<\s]/i, `${file}: inline executable code`);
  }
  for (const match of text.matchAll(/(?:\b(?:src|href)=["']|from\s+['"]|url\(['"]?)([^'"\s)<>]+)/g)) {
    const ref = match[1];
    if (!ref.startsWith('.')) continue;
    assert.ok(existsSync(resolve(dirname(file), ref.split(/[?#]/)[0])), `${file}: missing ${ref}`);
  }
}
for (const path of [manifest.background.service_worker, manifest.action.default_popup, manifest.options_ui.page,
  ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)]) assert.ok(existsSync(join(root, path)), `missing manifest asset ${path}`);
assert.ok(existsSync('assets/fonts/Fraunces-OFL.txt'));
assert.ok(existsSync('assets/fonts/Public-Sans-LICENSE.txt'));
console.log('Runtime syntax, local references, CSP patterns, versions and required assets checked.');
