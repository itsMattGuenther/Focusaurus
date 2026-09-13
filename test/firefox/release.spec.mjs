import { before, after, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { By } from 'selenium-webdriver';
import { launchFirefox } from './fixtures.mjs';

let server, base, e;
before(async () => {
  server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><html lang="en"><title>Focusaurus fixture</title><h1>Work area</h1></html>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server) await new Promise((resolve) => server.close(resolve)); });
beforeEach(async () => { e = await launchFirefox(); });
afterEach(async (t) => {
  if (e && t.error) {
    mkdirSync('test-results/firefox', { recursive: true });
    const name = t.name.replace(/[^a-z0-9]+/gi, '-');
    writeFileSync(`test-results/firefox/${name}.png`, await e.driver.takeScreenshot(), 'base64');
    console.error(await e.driver.executeScript('return document.body.innerText'));
  }
  await e?.driver.quit(); e = null;
});

test('Firefox fresh setup, all category packs and concurrent writes persist locally', async () => {
  assert.equal(await e.driver.findElement(By.css('#startBtn')).isEnabled(), false);
  const initial = await e.send('getState');
  for (const pack of initial.packs) assert.equal((await e.send('togglePack', { packId: pack.id })).ok, true);
  const results = await e.driver.executeAsyncScript((done) => {
    Promise.all(Array.from({ length: 12 }, (_, i) => browser.runtime.sendMessage({ action: 'addSite', input: `site${i}.example` }))).then(done);
  });
  assert.ok(results.every((r) => r.ok));
  const state = await e.send('getState');
  assert.ok(state.settings.sites.length > 80);
  assert.ok(state.packs.every((p) => p.status.state === 'all'));
  await e.poll(() => e.driver.findElement(By.css('#startBtn')).isEnabled());
  await e.click('#startBtn');
  await e.poll(async () => await e.text('#statusChip') === 'Focusing');
  assert.equal(await e.driver.executeAsyncScript((done) => browser.declarativeNetRequest.getDynamicRules().then((rules) => done(rules.length))), state.settings.sites.length);
});

test('Firefox real redirect preserves query, enforces pause per document and grants a temporary pass', async () => {
  await e.send('addSite', { input: base });
  await e.send('patchSettings', { values: { strictness: 'gentle' } });
  assert.equal((await e.send('startSession', { minutes: 25 })).ok, true);
  await e.newTab(`${base}/a?one=1&two=2`);
  await e.poll(async () => (await e.driver.getCurrentUrl()).includes('blocked.html'));
  await e.poll(async () => await e.text('#attemptsValue') === 'First time today');
  assert.equal((await e.call('requestOverride')).reason, 'wait');
  assert.equal((await e.call('endSession')).error, 'This action is not available here.');
  await e.poll(() => e.driver.findElement(By.css('#overrideBtn')).isEnabled());
  await e.click('#overrideBtn');
  await e.poll(async () => (await e.driver.getCurrentUrl()) === `${base}/a?one=1&two=2`);
  assert.equal(await e.text('h1'), 'Work area');
  assert.equal((await e.send('getState')).attemptsToday, 1);
});

test('Firefox pauses open tabs, catches in-page paths and releases Locked mode after ending', async () => {
  await e.send('addSite', { input: `${base}/shorts` });
  await e.send('patchSettings', { values: { strictness: 'locked' } });
  await e.newTab(`${base}/shorts/video`);
  await e.send('startSession', { minutes: 25 });
  await e.poll(async () => (await e.driver.getCurrentUrl()).includes('blocked.html'));
  await e.poll(async () => await e.text('#attemptsValue') === 'Paused open tab');
  assert.equal(await e.visible('#overrideBtn'), false);
  assert.equal((await e.call('requestOverride')).reason, 'locked');
  await e.newTab(`${base}/work`);
  await e.driver.executeScript("history.pushState({}, '', '/shorts/video')");
  await e.poll(async () => (await e.driver.getCurrentUrl()).includes('blocked.html'));
  await e.poll(async () => await e.text('#attemptsValue') === 'First time today');
  await e.send('endSession');
  await e.poll(() => e.visible('#overrideBtn'));
  await e.click('#overrideBtn');
  await e.poll(async () => (await e.driver.getCurrentUrl()) === `${base}/shorts/video`);
});


test('Firefox event-page suspension preserves the session and pause while restoring alarms', async () => {
  await e.send('addSite', { input: base });
  await e.send('patchSettings', { values: { strictness: 'gentle' } });
  await e.send('startSession', { minutes: 25 });
  const before = (await e.send('getState')).session;
  await e.newTab(`${base}/restart`);
  await e.poll(async () => (await e.driver.getCurrentUrl()).includes('blocked.html'));
  await e.poll(() => e.driver.findElement(By.css('#overrideBtn')).isEnabled());
  const paused = await e.call('getBlockedContext');
  await e.api('await browser.alarms.clearAll();');
  assert.equal(await e.privileged(async function (id, done) {
    const ext = WebExtensionPolicy.getByID(id).extension;
    await ext.terminateBackground({ ignoreDevToolsAttached: true, disableResetIdleForTest: true });
    done(ext.backgroundState);
  }), 'stopped');
  assert.deepEqual((await e.send('getState')).session, before);
  assert.ok((await e.api('return await browser.alarms.getAll();')).some((a) => a.name === 'session-end'));
  assert.equal((await e.call('getBlockedContext')).readyAt, paused.readyAt);
  assert.ok(paused.readyAt <= Date.now());
  // Reload within the SAME session must not inherit the old document's deadline.
  await e.driver.navigate().refresh();
  await e.poll(async () => (await e.call('getBlockedContext')).readyAt > paused.readyAt);
  assert.equal((await e.call('requestOverride')).reason, 'wait');
});

test('Firefox permission recovery uses the native prompt and restores open-tab blocking', async () => {
  await e.send('addSite', { input: base });
  const origins = ['http://*/*', 'https://*/*'];
  assert.equal(await e.api('return await browser.permissions.remove({ origins: arguments[0] });', origins), true);
  await e.poll(async () => !(await e.send('getState')).access.granted);
  await e.poll(() => e.visible('#siteAccess'));
  assert.equal(await e.text('#siteAccessBtn'), 'Allow website access');
  assert.equal((await e.send('startSession', { minutes: 25 })).reason, 'site-access');
  await e.click('#siteAccessBtn');
  // Accept the browser's actual permission dialog in this isolated test profile.
  await e.poll(() => e.privileged(function (id, done) {
    const win = Services.wm.getMostRecentWindow('navigator:browser');
    const notice = win.PopupNotifications.panel.querySelector('popupnotification');
    if (!notice || win.PopupNotifications.panel.state !== 'open') { done(false); return; }
    notice.button.click(); done(true);
  }));
  await e.poll(async () => (await e.send('getState')).access.granted);
  assert.equal((await e.send('startSession', { minutes: 25 })).ok, true);
  const before = (await e.send('getState')).session;
  await e.api('await browser.permissions.remove({ origins: arguments[0] });', origins);
  await e.poll(async () => await e.api('return await browser.action.getBadgeText({});') === '!');
  assert.deepEqual((await e.send('getState')).session, before);
  await e.newTab(`${base}/permission`);
  assert.equal(await e.text('h1'), 'Work area');
  const unblocked = await e.driver.getWindowHandle();
  await e.driver.switchTo().window(e.control);
  await e.click('#siteAccessBtn');
  await e.poll(() => e.privileged(function (id, done) {
    const win = Services.wm.getMostRecentWindow('navigator:browser');
    const notice = win.PopupNotifications.panel.querySelector('popupnotification');
    if (!notice || win.PopupNotifications.panel.state !== 'open') { done(false); return; }
    notice.button.click(); done(true);
  }));
  await e.driver.switchTo().window(unblocked);
  await e.poll(async () => (await e.driver.getCurrentUrl()).includes('blocked.html'));
  await e.poll(async () => await e.text('#attemptsValue') === 'Paused open tab');
});

test('Firefox unattended expiry, stale alarms and scheduled manual stops keep authoritative deadlines', async () => {
  await e.send('addSite', { input: base });
  await e.send('startSession', { minutes: 0.02 });
  for (const handle of await e.driver.getAllWindowHandles()) {
    if (handle !== e.control) { await e.driver.switchTo().window(handle); await e.driver.close(); }
  }
  await e.driver.switchTo().window(e.control);
  await e.open('privacy/privacy.html'); // No product UI polls state to end the session.
  await e.poll(async () => (await e.api('return await browser.storage.local.get("session");')).session === null);
  assert.deepEqual(await e.api('return await browser.declarativeNetRequest.getDynamicRules();'), []);
  await e.open('popup/popup.html');
  await e.send('startSession', { minutes: 25 });
  const session = (await e.send('getState')).session;
  await e.open('privacy/privacy.html');
  await e.api('await browser.alarms.create("session-end", { when: Date.now() + 100 });');
  await e.poll(async () => (await e.api('return await browser.alarms.get("session-end");'))?.scheduledTime === session.endsAt);
  await e.open('popup/popup.html');
  await e.send('endSession');
  const clock = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const schedule = { enabled: true, days: [0, 1, 2, 3, 4, 5, 6], start: clock(Date.now() - 60000), end: clock(Date.now() + 3600000) };
  await e.send('patchSettings', { values: { schedule } });
  assert.equal((await e.send('getState')).session.source, 'schedule');
  await e.send('endSession');
  assert.equal((await e.send('getState')).session, null);
  await e.send('patchSettings', { values: { schedule: { enabled: false } } });
  await e.send('startSession', { minutes: 720 });
  assert.equal((await e.send('getState')).session.endsAt, null);
  assert.equal(await e.api('return await browser.action.getBadgeText({});'), '∞');
});

test('Firefox exports round-trip, invalid imports preserve data, and retention keeps exactly seven days', async () => {
  const site = (await e.send('addSite', { input: base })).site;
  for (const json of ['[]', '{}', '{broken']) {
    assert.equal((await e.send('importSettings', { json })).ok, false);
    assert.equal((await e.send('getState')).settings.sites.length, 1);
  }
  const exported = await e.send('exportSettings');
  await e.send('addSite', { input: 'another.example' });
  assert.equal((await e.send('importSettings', { json: exported.data })).ok, true);
  assert.equal((await e.send('getState')).settings.sites.length, 1);
  await e.send('startSession', { minutes: 25 });
  const before = (await e.send('getState')).session;
  await e.api(`
    const { weekKeys } = await import('../shared/history.js');
    const days = weekKeys(new Date(), 90);
    await browser.storage.local.set(Object.fromEntries(days.map(day => ['usage:' + day, { perSite: { [arguments[0]]: { attempts: 1, overrides: 0 } }, sessions: [] }])));
  `, site.id);
  const after = await e.send('getState');
  assert.equal(after.history.total, 7);
  assert.deepEqual(after.session, before);
  assert.equal(Object.keys(await e.api('return await browser.storage.local.get(null);')).filter(k => k.startsWith('usage:')).length, 7);
  await e.open('options/options.html');
  await e.poll(async () => (await e.driver.findElement(By.css('#dinoName')).getAttribute('value')) === 'Doug');
  await e.click('#clearHistoryBtn');
  await e.poll(() => e.visible('#confirmDialog'));
  await e.click('#confirmBtn');
  await e.poll(async () => await e.text('#dataNote') === 'History cleared.');
  assert.equal((await e.call('getState')).attemptsToday, 0);
});

test('Firefox all surfaces pass accessibility, reduced motion and narrow reflow in both themes', async () => {
  const site = (await e.send('addSite', { input: base })).site;
  await e.send('startSession', { minutes: 25 });
  const axe = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
  const paths = ['popup/popup.html', 'welcome/welcome.html', 'options/options.html', 'privacy/privacy.html', `blocked/blocked.html?site=${site.id}#url=${base}/`];
  for (const theme of ['light', 'dark']) {
    await e.send('patchSettings', { values: { theme } });
    for (const path of paths) {
      await e.newTab(e.url(path));
      await e.api('await document.fonts.ready;');
      if (!path.startsWith('privacy')) await e.poll(() => e.visible('.doug'));
      await e.driver.executeScript(axe);
      const result = await e.api("return (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({id:v.id, nodes:v.nodes.map(n => n.target)}));");
      assert.deepEqual(result, [], `${theme} ${path}`);
      await e.driver.manage().window().setRect({ width: 450, height: 800 });
      await e.poll(async () => await e.driver.executeScript('return document.documentElement.scrollWidth <= innerWidth;'));
      if (!path.startsWith('privacy')) assert.equal(await e.driver.executeScript('return getComputedStyle(document.querySelector(".doug__body")).animationName;'), 'none');
      mkdirSync('docs/review/firefox', { recursive: true });
      writeFileSync(`docs/review/firefox/${theme}-${path.split('/')[0]}.png`, await e.driver.takeScreenshot(), 'base64');
      await e.driver.close(); await e.driver.switchTo().window(e.control);
      await e.driver.manage().window().setRect({ width: 1280, height: 900 });
    }
  }
});


test('Firefox actual toolbar popup fits the session controls in both themes', async () => {
  assert.equal(await e.api('await browser.action.openPopup(); return true;'), true);
  for (const theme of ['light', 'dark']) {
    await e.call('patchSettings', { values: { theme } });
    await e.poll(() => e.api(`
      const view = browser.extension.getViews({ type: 'popup' })[0];
      if (!view?.document.querySelector('.doug')) return false;
      const doc = view.document;
      const chips = [...doc.querySelectorAll('[data-minutes]')];
      return doc.documentElement.dataset.theme === arguments[0] && doc.fonts.status === 'loaded' &&
        view.innerWidth >= 420 && view.innerWidth <= 460 && view.innerHeight <= 600 &&
        doc.body.getBoundingClientRect().width === 420 && doc.documentElement.scrollWidth <= view.innerWidth &&
        doc.querySelector('.hero__text').getBoundingClientRect().width >= 200 &&
        chips.length === 4 && new Set(chips.map(chip => chip.offsetTop)).size === 1;
    `, theme));
  }
  await e.api("browser.extension.getViews({ type: 'popup' }).forEach(view => view.close());");
});
