import { manifestFor } from './manifests.mjs';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync, unzipSync } from 'fflate';
import assert from 'node:assert/strict';
const root = resolve('.'); const dist = join(root, 'dist');
const targets = process.argv[2] ? [process.argv[2]] : ['chrome', 'firefox'];
for (const target of targets) { if (!['chrome', 'firefox'].includes(target)) throw new Error(`Unknown browser: ${target}`); } // Reject invalid output targets before writing.
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json')));
const pkg = JSON.parse(readFileSync(join(root, 'package.json')));
assert.equal(manifest.version, pkg.version);
for (const target of targets) {
  const extension = join(dist, target === 'chrome' ? 'extension' : 'firefox/extension');
  // Delete only the known generated directory, after resolving its exact path.
  assert.equal(extension, resolve(root, 'dist', target === 'chrome' ? 'extension' : 'firefox/extension'));
  assert.ok(relative(root, extension).startsWith(`dist`));
  rmSync(extension, { recursive: true, force: true }); mkdirSync(extension, { recursive: true });
  for (const name of ['src', 'assets']) cpSync(join(root, name), join(extension, name), { recursive: true });
  writeFileSync(join(extension, 'manifest.json'), JSON.stringify(manifestFor(manifest, target), null, 2) + '\n');
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  // Windows prototype checkouts may retain CRLF while Linux CI uses LF.
  // Normalize runtime text in the staging directory so both produce the same ZIP.
  for (const file of walk(extension)) {
    if (/\.(js|css|html|svg|txt)$/.test(file)) {
      writeFileSync(file, readFileSync(file, 'utf8').replaceAll('\r\n', '\n'));
    }
  }
  const entries = Object.fromEntries(walk(extension).sort().map((file) => {
    const path = relative(extension, file).replaceAll('\\', '/');
    assert.ok(/^(manifest\.json|src\/.*\.(js|css|html)|assets\/.*\.(png|svg|webp|woff2|txt))$/.test(path), `unexpected runtime file ${path}`);
    return [path, [new Uint8Array(readFileSync(file)), { mtime: new Date(2026, 0, 1) }]];
  }));
  const archive = zipSync(entries, { level: 9 });
  const zipName = `focusaurus-${target === 'firefox' ? 'firefox-' : ''}${manifest.version}.zip`;
  writeFileSync(join(dist, zipName), archive);
  const extracted = unzipSync(archive);
  assert.deepEqual(Object.keys(extracted).sort(), Object.keys(entries).sort());
  for (const [path, [bytes]] of Object.entries(entries)) assert.deepEqual(extracted[path], bytes);
  const sha = createHash('sha256').update(archive).digest('hex');
  writeFileSync(join(dist, `${zipName}.sha256`), `${sha}  ${zipName}\n`);
  writeFileSync(join(dist, target === 'chrome' ? 'package-manifest.json' : 'firefox-package-manifest.json'), JSON.stringify({ version: manifest.version, archive: zipName, bytes: archive.length, sha256: sha, files: Object.keys(entries) }, null, 2));

  console.log(`${zipName}: ${archive.length.toLocaleString()} bytes, ${Object.keys(entries).length} files\nSHA-256: ${sha}\nUnpacked extension: ${relative(root, extension)}`);
}

// A standalone privacy page ready for the publisher's chosen HTTPS host.
const privacy = join(dist, 'privacy'); mkdirSync(privacy, { recursive: true });
let page = readFileSync(join(root, 'src/privacy/privacy.html'), 'utf8');
const css = readFileSync(join(root, 'src/shared/tokens.css'), 'utf8').replaceAll('../../assets/', 'assets/') + readFileSync(join(root, 'src/privacy/privacy.css'), 'utf8');
page = page.replace(/<link rel="stylesheet"[^>]+>/g, '').replace('</head>', `<style>${css}</style></head>`)
  .replace('href="../welcome/welcome.html"', 'href="#"').replace('<a href="../options/options.html">Back to settings</a>', '<span>Focusaurus privacy policy</span>');
writeFileSync(join(privacy, 'index.html'), page);
cpSync(join(root, 'assets/fonts'), join(privacy, 'assets/fonts'), { recursive: true });
console.log('Public-ready privacy page: dist/privacy/index.html');
