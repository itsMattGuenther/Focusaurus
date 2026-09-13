import test from 'node:test';
import assert from 'node:assert/strict';
import { trustedPage } from '../src/shared/browser.js';
import { manifestFor, FIREFOX_ID } from '../dev/manifests.mjs';
import { readFileSync } from 'node:fs';

test('page validation binds the actual Firefox origin to its different public add-on ID', () => {
  const runtime = { id: FIREFOX_ID, getURL: () => 'moz-extension://random-install-uuid/' };
  const sender = { id: FIREFOX_ID, url: 'moz-extension://random-install-uuid/src/blocked/blocked.html?site=s_1#url=https://example.com/' };
  assert.equal(trustedPage(sender, runtime), '/src/blocked/blocked.html');
  for (const url of ['https://random-install-uuid/src/popup/popup.html', 'moz-extension://other-install/src/popup/popup.html', `moz-extension://${FIREFOX_ID}/src/popup/popup.html`, 'invalid']) {
    assert.equal(trustedPage({ ...sender, url }, runtime), null);
  }
  assert.equal(trustedPage({ ...sender, id: 'another-addon' }, runtime), null);
});

test('Chrome page validation still requires both its extension ID and origin', () => {
  const runtime = { id: 'chrome-id', getURL: () => 'chrome-extension://chrome-id/' };
  assert.equal(trustedPage({ id: 'chrome-id', url: 'chrome-extension://chrome-id/src/popup/popup.html' }, runtime), '/src/popup/popup.html');
  assert.equal(trustedPage({ id: 'other-id', url: 'chrome-extension://chrome-id/src/popup/popup.html' }, runtime), null);
  assert.equal(trustedPage({ id: 'chrome-id', url: 'moz-extension://chrome-id/src/popup/popup.html' }, runtime), null);
});

test('Firefox packaging preserves permissions and source while choosing a supported background and data declaration', () => {
  const base = JSON.parse(readFileSync('manifest.json'));
  const original = structuredClone(base);
  const firefox = manifestFor(base, 'firefox');
  assert.deepEqual(base, original);
  assert.deepEqual(manifestFor(base, 'chrome'), base);
  assert.deepEqual(firefox.background, { scripts: [base.background.service_worker], type: 'module' });
  assert.equal(firefox.minimum_chrome_version, undefined);
  assert.equal(firefox.browser_specific_settings.gecko.strict_min_version, '153.0');
  assert.deepEqual(firefox.browser_specific_settings.gecko.data_collection_permissions.required, ['none']);
  assert.deepEqual(firefox.permissions, base.permissions);
  assert.deepEqual(firefox.host_permissions, base.host_permissions);
  assert.throws(() => manifestFor(base, '../outside'), /Unknown browser/);
});
