/* ==========================================================================
   The interstitial — behavior
   ========================================================================== */

import { renderDoug } from '../shared/doug.js';
import { blockedCopy } from '../shared/copy.js';

const els = {
  doug: document.getElementById('dougMount'),
  line: document.getElementById('line'),
  subline: document.getElementById('subline'),
  site: document.getElementById('siteValue'),
  attempts: document.getElementById('attemptsValue'),
  session: document.getElementById('sessionValue'),
  tagNumber: document.getElementById('tagNumber'),
  closeBtn: document.getElementById('closeBtn'),
  overrideBtn: document.getElementById('overrideBtn'),
  overrideLabel: document.getElementById('overrideLabel'),
  overrideNote: document.getElementById('overrideNote'),
};

/* --- Inputs -------------------------------------------------------------- */

const siteId = new URLSearchParams(location.search).get('site');

/* The original URL arrives in the FRAGMENT, not the query string (rules.js
   explains why). Read it as one opaque slice so a URL carrying its own `#`
   or `&` survives intact. */
const rawTarget = location.hash.startsWith('#url=')
  ? location.hash.slice('#url='.length)
  : null;

/**
 * The blocked URL is attacker-influenced — any site can navigate you to a
 * crafted URL, which then lands in our fragment. So it is never written with
 * innerHTML, and it is scheme-checked before it can reach location.
 */
function safeExternalUrl(raw) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

const target = safeExternalUrl(rawTarget);

/* --- Helpers ------------------------------------------------------------- */

function ordinal(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
}

function hostOf(raw) {
  try {
    return new URL(raw).host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function send(action, payload = {}) {
  return chrome.runtime.sendMessage({ action, ...payload });
}

/* --- Session countdown --------------------------------------------------- */

let countdownTimer = null;

function renderCountdown(endsAt) {
  if (!endsAt) {
    els.session.textContent = 'no session';
    return;
  }
  const tick = () => {
    const ms = endsAt - Date.now();
    if (ms <= 0) {
      els.session.textContent = 'just now';
      clearInterval(countdownTimer);
      return;
    }
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    els.session.textContent =
      mins >= 60
        ? `in ${Math.floor(mins / 60)}h ${mins % 60}m`
        : `in ${mins}:${String(secs).padStart(2, '0')}`;
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

/* --- Override ------------------------------------------------------------
   Breathing room, not a wall and not a free pass. Doug simply stands there
   for N seconds before the button unlocks. The delay is the mechanism: it
   interrupts the automaticity of the reflex, which is the thing we're
   actually up against (DESIGN.md §5). */

function armOverride({ delaySeconds, overrideMinutes }) {
  if (delaySeconds === null || delaySeconds === undefined) {
    els.overrideBtn.hidden = true;
    els.overrideNote.textContent = 'Strict mode — no overrides until the session ends.';
    return;
  }
  if (!target) {
    els.overrideBtn.hidden = true;
    return;
  }

  let remaining = delaySeconds;

  const paint = () => {
    if (remaining > 0) {
      els.overrideLabel.textContent = `Let me in for ${overrideMinutes} min · ${remaining}`;
      remaining -= 1;
      return;
    }
    clearInterval(timer);
    els.overrideBtn.disabled = false;
    els.overrideLabel.textContent = `Let me in for ${overrideMinutes} min`;
  };

  paint();
  const timer = setInterval(paint, 1000);

  els.overrideBtn.addEventListener('click', async () => {
    els.overrideBtn.disabled = true;
    els.overrideLabel.textContent = 'Opening…';

    const res = await send('requestOverride', { siteId });
    if (!res || res.ok === false) {
      els.overrideLabel.textContent = 'Could not open';
      els.overrideNote.textContent = "Doug couldn't lift the block. Try the popup.";
      return;
    }
    // requestOverride awaits rule reconciliation before replying, so the allow
    // rule is live by now and this navigation won't bounce straight back here.
    location.replace(target);
  });
}

/* --- Boot ---------------------------------------------------------------- */

async function main() {
  els.tagNumber.textContent = `Field note · ${new Date()
    .toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    .toUpperCase()}`;

  // Site name: prefer what the block rule knows, fall back to the URL's host.
  const fallbackHost = target ? hostOf(target) : null;

  let ctx = null;
  try {
    ctx = await send('getBlockedContext', { siteId });
  } catch {
    /* worker asleep or mid-restart; fall through to defaults */
  }

  const label = ctx?.site?.label || fallbackHost || 'this site';
  els.site.textContent = label; // textContent, never innerHTML — see safeExternalUrl

  // Record the hit and use the returned count, so the number shown is the
  // authoritative one rather than a stale read.
  const copy = blockedCopy((ctx?.attempts || 0) + 1, ctx?.lastLine);
  let attempts = (ctx?.attempts || 0) + 1;
  try {
    const res = await send('recordAttempt', { siteId, line: copy.line });
    if (res?.attempts) attempts = res.attempts;
  } catch {
    /* non-fatal: the page still works, the count is just optimistic */
  }

  els.line.textContent = copy.line;
  els.subline.textContent = copy.subline || '';
  els.attempts.textContent =
    attempts <= 1 ? 'first time today' : `${ordinal(attempts)} time today`;

  // A rough day earns a softer, sadder Doug; otherwise he's side-eyeing you.
  // Both are recoverable moods — neither is a scold.
  renderDoug(els.doug, attempts >= 8 ? 'bummed' : 'side_eye');

  renderCountdown(ctx?.session?.endsAt);
  armOverride({
    delaySeconds: ctx?.strictnessDelay,
    overrideMinutes: ctx?.overrideMinutes ?? 5,
  });
}

els.closeBtn.addEventListener('click', async () => {
  // window.close() is a no-op for a tab the user navigated to, so close via
  // the tabs API. chrome.tabs.remove needs no "tabs" permission — that one
  // only gates reading a tab's url/title.
  try {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id) {
      await chrome.tabs.remove(tab.id);
      return;
    }
  } catch {
    /* fall through */
  }
  window.close();
});

main();
