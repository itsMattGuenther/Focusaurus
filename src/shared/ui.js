/** Shared messaging, feedback, theme and focus behavior for extension pages. */
const REASONS = {
  'site-limit': 'Your list is full (300 sites). Remove a site before adding more.',
  'unsupported-pattern': 'Chrome cannot block this long path. Use a shorter path or the whole domain.',
  'no-sites': 'Choose a category or add a site before starting.',
  'already-running': 'A session is already running. Reopen the popup to see it.',
  'invalid-duration': 'Choose a valid session length.',
  locked: 'Locked mode is on. You can end the session from the popup.',
  wait: 'Give yourself a moment. The pause is still running.',
  'invalid-context': 'This page does not contain a valid blocked site.',
};

export async function send(action, payload = {}) {
  let result;
  try { result = await chrome.runtime.sendMessage({ action, ...payload }); }
  catch { throw new Error('Could not reach Focusaurus. Reload this page or reopen the extension.'); }
  if (!result || result.error) throw new Error(result?.error || 'Focusaurus did not reply. Please try again.');
  return result;
}

export function requireSuccess(result) {
  if (result?.ok === false) throw new Error(REASONS[result.reason] || 'That change could not be applied. Please try again.');
  return result;
}

export function feedback(error) {
  const el = document.getElementById('appError');
  if (el) { el.textContent = error?.message || String(error); el.hidden = false; }
}

export async function act(controls, work) {
  const list = controls ? (controls instanceof Element ? [controls] : [...controls]) : [];
  const original = list.map((el) => el.disabled);
  list.forEach((el) => { el.disabled = true; });
  const error = document.getElementById('appError');
  if (error) error.hidden = true;
  try { return await work(); }
  catch (err) { feedback(err); return null; }
  finally { list.forEach((el, i) => { if (el.isConnected) el.disabled = el.dataset.stateDisabled !== undefined ? el.dataset.stateDisabled === 'true' : original[i]; }); }
}

export function applyTheme(theme = 'system') {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

export function rememberFocus() {
  const el = document.activeElement;
  const key = el?.dataset.focusKey;
  return () => {
    if (!key || el.isConnected) return;
    const next = [...document.querySelectorAll('[data-focus-key]')].find((node) => node.dataset.focusKey === key);
    (next || document.getElementById('siteInput'))?.focus({ preventScroll: true });
  };
}

export function watchState(refresh) {
  let timer;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) applyTheme(changes.settings.newValue?.theme);
    if (area !== 'local' || !Object.keys(changes).some((k) => ['settings', 'session', 'overrides', 'recentAttempts'].includes(k) || k.startsWith('usage:'))) return;
    clearTimeout(timer);
    timer = setTimeout(() => { if (!document.hidden) refresh().catch(feedback); }, 150);
  });
  window.addEventListener('focus', () => refresh().catch(feedback));
}

// Read only the theme early, while the worker prepares state.
chrome.storage.local.get('settings').then(({ settings }) => applyTheme(settings?.theme)).catch(() => {});
