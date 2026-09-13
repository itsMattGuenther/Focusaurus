import { Builder, By, error } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { resolve } from 'node:path';
import { FIREFOX_ID } from '../../dev/manifests.mjs';

/** Each test gets a new Firefox profile; never attach to the user's browser. */
export async function launchFirefox() {
  const options = new firefox.Options().addArguments('-headless').setPreference('ui.prefersReducedMotion', 1);
  if (process.env.FOCUSAURUS_FIREFOX_PATH) options.setBinary(process.env.FOCUSAURUS_FIREFOX_PATH);
  const service = new firefox.ServiceBuilder(process.env.FOCUSAURUS_GECKODRIVER_PATH).addArguments('--allow-system-access');
  const driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).setFirefoxService(service).build();
  try {
    await driver.manage().setTimeouts({ script: 15000, pageLoad: 15000 });
    await driver.manage().window().setRect({ width: 1280, height: 900 });
    await driver.installAddon(resolve(process.env.FOCUSAURUS_FIREFOX_EXTENSION_PATH || 'dist/firefox/extension'), true);
    await driver.setContext('chrome');
    const ids = JSON.parse(await driver.executeScript('return Services.prefs.getStringPref("extensions.webextensions.uuids");'));
    await driver.setContext('content');
    const url = (path) => `moz-extension://${ids[FIREFOX_ID]}/src/${path}`;
    await driver.get(url('popup/popup.html'));
    const control = await driver.getWindowHandle();
    const call = (action, payload = {}) => driver.executeAsyncScript(function (action, payload, done) {
      browser.runtime.sendMessage({ action, ...payload }).then(done, (err) => done({ error: err.message }));
    }, action, payload);
    const poll = (fn) => driver.wait(async () => {
      try { return await fn(); }
      catch (err) {
        // A redirect can commit its URL before the new document exposes its DOM.
        if (err instanceof error.NoSuchElementError || err instanceof error.StaleElementReferenceError) return false;
        throw err;
      }
    }, 10000, 'Firefox state did not settle', 100);
    const text = async (selector) => (await driver.findElement(By.css(selector)).getAttribute('textContent')).trim();
    const visible = async (selector) => {
      const matches = await driver.findElements(By.css(selector));
      return matches.length > 0 && matches[0].isDisplayed();
    };
    const click = (selector) => driver.findElement(By.css(selector)).click();
    const send = async (action, payload = {}) => {
      const previous = await driver.getWindowHandle();
      await driver.switchTo().window(control);
      try { return await call(action, payload); }
      finally { await driver.switchTo().window(previous); }
    };
    const privileged = async (script, ...args) => {
      await driver.setContext('chrome');
      try { return await driver.executeAsyncScript(script, FIREFOX_ID, ...args); }
      finally { await driver.setContext('content'); }
    };
    const api = async (script, ...args) => {
      const result = await driver.executeAsyncScript(`const done = arguments[arguments.length - 1]; Promise.resolve((async () => { ${script} })()).then(done, err => done({ __webdriverError: err.message }));`, ...args);
      if (result?.__webdriverError) throw new Error(result.__webdriverError);
      return result;
    };
    await poll(async () => await text('#statusChip') === 'Idle');
    return { driver, control, url, call, send, api, poll, text, visible, click, privileged,
      open: (path) => driver.get(url(path)),
      newTab: async (address) => { await driver.switchTo().newWindow('tab'); await driver.get(address); return driver.getWindowHandle(); },
    };
  } catch (err) { console.error(await driver.executeScript("return document.body.innerText")); await driver.quit(); throw err; }
}
