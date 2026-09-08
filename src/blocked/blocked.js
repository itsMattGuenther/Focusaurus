import { renderDoug } from '../shared/doug.js';
import { displayHost, parseInterstitial, safeExternalUrl } from '../shared/redirect.js';
import { isOpenEnded } from '../shared/session.js';
import { send, act, requireSuccess, feedback, watchState } from '../shared/ui.js';

const el = (id) => document.getElementById(id);
const { rawTarget } = parseInterstitial(location.search, location.hash);
const target = safeExternalUrl(rawTarget);
let context = null;
let loading = false;
let opening = false;

const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;

function paint() {
  if (!context) return;
  const ctx = context;
  el('siteValue').textContent = ctx.site?.label || displayHost(target) || 'This site';
  el('portraitName').textContent = `${ctx.name || 'Doug'} · Focusaurus`;
  el('overrideBtn').hidden = !target || (!ctx.released && ctx.strictnessDelay === null);
  if (ctx.released) {
    renderDoug(el('dougMount'), 'chill', { name: ctx.name });
    el('line').textContent = 'A little room to choose.';
    el('subline').textContent = 'This page is available again. Carry on when you’re ready.';
    el('sessionValue').textContent = 'Not blocking';
    el('attemptsValue').textContent = 'All clear';
    el('overrideLabel').textContent = 'Continue to site';
    el('overrideBtn').disabled = opening;
    el('overrideNote').textContent = 'Your next step is yours.';
    return;
  }
  renderDoug(el('dougMount'), ctx.attempts >= 8 ? 'bummed' : 'side_eye', { name: ctx.name });
  el('line').textContent = ctx.copy?.line || 'A small pause. A fresh start.';
  el('subline').textContent = ctx.copy?.subline || 'You made this space for something that matters.';
  el('attemptsValue').textContent = ctx.attempts === 0 ? 'Paused open tab' : ctx.attempts === 1 ? 'First time today' : `${ordinal(ctx.attempts)} time today`;
  const session = ctx.session;
  if (isOpenEnded(session)) el('sessionValue').textContent = 'When you’re ready';
  else {
    const seconds = Math.max(0, Math.ceil((session.endsAt - Date.now()) / 1000));
    el('sessionValue').textContent = seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} left` : 'Finishing…';
    if (!seconds && !loading) refresh().catch(feedback);
  }
  if (ctx.strictnessDelay === null) {
    el('overrideNote').textContent = 'Locked mode · no temporary passes. You can end the session from the popup.';
    return;
  }
  const remaining = Math.max(0, Math.ceil((ctx.readyAt - Date.now()) / 1000));
  el('overrideBtn').disabled = opening || remaining > 0;
  el('overrideLabel').textContent = remaining > 0 ? `Take a breath · ${remaining}s` : `Let me in for ${ctx.overrideMinutes} min`;
  el('overrideNote').textContent = remaining > 0 ? 'A moment to decide before opening the site.' : 'Need this site? A temporary pass is here when you need it.';
}

async function refresh() {
  if (loading) return;
  loading = true;
  try {
    const next = requireSuccess(await send('getBlockedContext'));
    context = next;
    paint();
  } finally { loading = false; }
}

el('overrideBtn').addEventListener('click', () => act(el('overrideBtn'), async () => {
  opening = true;
  try {
    requireSuccess(await send('requestOverride'));
    // The worker replies only after Chrome has installed the allow rule.
    if (target) location.replace(target);
  } finally { opening = false; }
}));

el('closeBtn').addEventListener('click', () => act(el('closeBtn'), async () => {
  const tab = await chrome.tabs.getCurrent();
  if (tab?.id !== undefined) await chrome.tabs.remove(tab.id);
  else window.close();
}));
el('retryBtn').addEventListener('click', () => act(el('retryBtn'), refresh));
el('tagNumber').textContent = `Field note · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
renderDoug(el('dougMount'), 'chill');
refresh().catch(feedback);
watchState(refresh);
setInterval(paint, 1000);
setInterval(() => { if (!document.hidden) refresh().catch(feedback); }, 5000);
