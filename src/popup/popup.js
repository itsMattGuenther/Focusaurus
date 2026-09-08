/* ==========================================================================
   Popup — behavior
   --------------------------------------------------------------------------
   Reads all state from the service worker in one round trip, renders, and
   re-renders after any mutation. No local state duplication: the worker owns
   the truth, and a popup that cached it would drift the moment a session
   ended on an alarm.
   ========================================================================== */

import { renderDoug, MOODS } from '../shared/doug.js';
import { moodCopy } from '../shared/copy.js';
import { isOpenEnded } from '../shared/session.js';
import { historyGlance } from '../shared/history.js';
import { send, act, requireSuccess, applyTheme, feedback, rememberFocus, watchState } from '../shared/ui.js';

const els = {
  statusChip: document.getElementById('statusChip'),
  settingsBtn: document.getElementById('settingsBtn'),
  doug: document.getElementById('dougMount'),
  moodLine: document.getElementById('moodLine'),
  moodBecause: document.getElementById('moodBecause'),

  sessionIdle: document.getElementById('sessionIdle'),
  sessionActive: document.getElementById('sessionActive'),
  countdown: document.getElementById('countdown'),
  countdownNote: document.getElementById('countdownNote'),
  startBtn: document.getElementById('startBtn'),
  endBtn: document.getElementById('endBtn'),

  attemptsToday: document.getElementById('attemptsToday'),
  attemptsWeek: document.getElementById('attemptsWeek'),

  siteCount: document.getElementById('siteCount'),
  addForm: document.getElementById('addForm'),
  siteInput: document.getElementById('siteInput'),
  addError: document.getElementById('addError'),
  siteList: document.getElementById('siteList'),
  sitesEmpty: document.getElementById('sitesEmpty'),
  packHint: document.getElementById('packHint'),
  packChips: document.getElementById('packChips'),
};

let selectedMinutes = 25;
let countdownTimer = null;
let lastMood = null;

/* --- Render -------------------------------------------------------------- */

function renderSession(session) {
  const active = Boolean(session);
  els.sessionIdle.hidden = active;
  els.sessionActive.hidden = !active;
  els.statusChip.textContent = active ? 'Focusing' : 'Idle';
  els.statusChip.dataset.on = String(active);

  clearInterval(countdownTimer);
  if (!active) return;

  const openEnded = isOpenEnded(session);

  els.countdownNote.textContent = openEnded
    ? 'Open-ended — ends when you say so'
    : `${session.plannedMinutes} minute session`;

  const clock = (ms) => {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  };

  const tick = () => {
    // An open-ended session counts UP from its start. Counting down from the
    // 12-hour backstop would be technically accurate and completely useless.
    if (openEnded) {
      els.countdown.textContent = clock(Date.now() - session.startedAt);
      return;
    }
    const ms = session.endsAt - Date.now();
    if (ms <= 0) {
      clearInterval(countdownTimer);
      refresh().catch(feedback); // Pull authoritative state after the deadline.
      return;
    }
    els.countdown.textContent = clock(ms);
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

function renderSites(sites) {
  els.siteCount.textContent = sites.length ? `· ${sites.length}` : '';
  els.sitesEmpty.hidden = sites.length > 0;
  els.siteList.replaceChildren();

  for (const site of sites) {
    const li = document.createElement('li');
    li.className = 'site';

    const name = document.createElement('span');
    name.className = 'site__name';
    name.textContent = site.label; // textContent: site labels are user input

    const remove = document.createElement('button');
    remove.className = 'site__remove';
    remove.type = 'button';
    remove.textContent = '×';
    remove.title = `Stop blocking ${site.label}`;
    remove.setAttribute('aria-label', `Stop blocking ${site.label}`);
    remove.dataset.focusKey = `site:${site.id}`;
    remove.addEventListener('click', () => act(remove, async () => {
      requireSuccess(await send('removeSite', { siteId: site.id }));
      await refresh();
    }));

    li.append(name);
    if (site.pack && site.pack !== 'custom') {
      const pack = document.createElement('span');
      pack.className = 'site__pack';
      pack.textContent = site.pack;
      li.append(pack);
    }
    li.append(remove);
    els.siteList.append(li);
  }
}

/**
 * Pack chips: always present, independently toggleable, three visual states.
 *
 * The previous version hid this whole section as soon as any site existed, so
 * the first click locked you out of every other category. Packs are not a
 * one-shot onboarding step — combining several is the normal case.
 */
function renderPacks(packs) {
  const onCount = packs.filter((p) => p.status.state === 'all').length;
  els.packHint.textContent = onCount ? `· ${onCount} on` : '';

  els.packChips.replaceChildren();

  for (const pack of packs) {
    const { state, present, total } = pack.status;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip chip--pack';
    btn.dataset.state = state;
    // aria-pressed, because these are toggles rather than navigation.
    btn.setAttribute('aria-pressed', state === 'partial' ? 'mixed' : String(state === 'all'));
    btn.dataset.focusKey = `pack:${pack.id}`;

    const label = document.createElement('span');
    label.textContent = pack.label;
    btn.append(label);

    // Only annotate when there's something to say: a bare label reads as off,
    // a tick reads as fully on, and a fraction reads as partly on.
    const mark = document.createElement('span');
    mark.className = 'chip__mark';
    if (state === 'all') mark.textContent = '✓';
    else if (state === 'partial') mark.textContent = `${present}/${total}`;
    else mark.textContent = `${total}`;
    btn.append(mark);

    btn.title =
      state === 'all'
        ? `${pack.blurb} — click to remove all ${total}`
        : state === 'partial'
          ? `${pack.blurb} — ${present} of ${total} on, click to add the rest`
          : `${pack.blurb} — click to block ${total} sites`;

    btn.addEventListener('click', () => act(els.packChips.children, async () => {
      requireSuccess(await send('togglePack', { packId: pack.id }));
      await refresh();
    }));

    els.packChips.append(btn);
  }
}

function render(state) {
  const restore = rememberFocus();
  applyTheme(state.settings.theme);
  renderDoug(els.doug, state.mood, { name: state.settings.dino.name });
  if (lastMood !== state.mood) els.moodLine.textContent = moodCopy(state.mood);
  lastMood = state.mood;
  document.getElementById('dinoLabel').textContent = `${state.settings.dino.name} · your focus companion`;
  els.moodBecause.textContent = state.because || MOODS[state.mood]?.because || '';

  renderSession(state.session);
  els.attemptsToday.textContent = String(state.attemptsToday || 0);
  els.attemptsWeek.textContent = historyGlance(state.history);

  renderPacks(state.packs);
  renderSites(state.settings.sites);
  els.startBtn.disabled = state.settings.sites.length === 0;
  els.startBtn.dataset.stateDisabled = String(els.startBtn.disabled);
  document.getElementById('setupHint').hidden = state.settings.sites.length > 0;
  restore();
}

async function refresh() {
  const state = await send('getState');
  if (state?.error) {
    els.moodBecause.textContent = state.error;
    return;
  }
  render(state);
}

/* --- Wiring -------------------------------------------------------------- */

els.settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close(); // the options page takes over; leaving the popup up is noise
});

for (const chip of document.querySelectorAll('.chip[data-minutes]')) {
  chip.addEventListener('click', () => {
    document
      .querySelectorAll('.chip[data-minutes]')
      .forEach((c) => { c.classList.toggle('chip--on', c === chip); c.setAttribute('aria-pressed', String(c === chip)); });
    selectedMinutes = Number(chip.dataset.minutes);
  });
}

els.startBtn.addEventListener('click', () => act(els.startBtn, async () => {
  requireSuccess(await send('startSession', { minutes: selectedMinutes }));
  await refresh();
  els.endBtn.focus();
}));

els.endBtn.addEventListener('click', () => act(els.endBtn, async () => {
  requireSuccess(await send('endSession'));
  await refresh();
  els.startBtn.focus();
}));

els.addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.addError.textContent = '';

  const input = els.siteInput.value;
  if (!input.trim()) return;

  await act(els.addForm.querySelector('button'), async () => {
  const res = await send('addSite', { input });
  if (res?.ok) {
    els.siteInput.value = '';
    await refresh();
    return;
  }

  if (['site-limit', 'unsupported-pattern'].includes(res.reason)) requireSuccess(res);
  els.addError.textContent =
    res?.reason === 'duplicate'
      ? 'Already on the list.'
      : "Doesn't look like a site — try instagram.com";
  });
});

refresh().catch(feedback);
watchState(refresh);
