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

const els = {
  statusChip: document.getElementById('statusChip'),
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

  siteCount: document.getElementById('siteCount'),
  addForm: document.getElementById('addForm'),
  siteInput: document.getElementById('siteInput'),
  addError: document.getElementById('addError'),
  siteList: document.getElementById('siteList'),
  sitesEmpty: document.getElementById('sitesEmpty'),
  packHint: document.getElementById('packHint'),
  packChips: document.getElementById('packChips'),
};

let selectedMinutes = 50;
let countdownTimer = null;

function send(action, payload = {}) {
  return chrome.runtime.sendMessage({ action, ...payload });
}

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
      refresh(); // the worker's alarm has ended it; pull fresh state
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
    remove.addEventListener('click', async () => {
      await send('removeSite', { siteId: site.id });
      refresh();
    });

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
    btn.setAttribute('aria-pressed', String(state === 'all'));

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

    btn.addEventListener('click', async () => {
      // Disable the whole group: a pack write is several storage round trips,
      // and a second click mid-flight could act on a stale status.
      for (const c of els.packChips.children) c.disabled = true;
      await send('togglePack', { packId: pack.id });
      await refresh();
    });

    els.packChips.append(btn);
  }
}

function render(state) {
  renderDoug(els.doug, state.mood);
  els.moodLine.textContent = moodCopy(state.mood);
  els.moodBecause.textContent = state.because || MOODS[state.mood]?.because || '';

  renderSession(state.session);
  els.attemptsToday.textContent = String(state.attemptsToday || 0);

  renderPacks(state.packs);
  renderSites(state.settings.sites);
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

for (const chip of document.querySelectorAll('.chip[data-minutes]')) {
  chip.addEventListener('click', () => {
    document
      .querySelectorAll('.chip[data-minutes]')
      .forEach((c) => c.classList.toggle('chip--on', c === chip));
    selectedMinutes = Number(chip.dataset.minutes);
  });
}

els.startBtn.addEventListener('click', async () => {
  els.startBtn.disabled = true;
  await send('startSession', { minutes: selectedMinutes });
  els.startBtn.disabled = false;
  refresh();
});

els.endBtn.addEventListener('click', async () => {
  els.endBtn.disabled = true;
  await send('endSession');
  els.endBtn.disabled = false;
  refresh();
});

els.addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.addError.textContent = '';

  const input = els.siteInput.value;
  if (!input.trim()) return;

  const res = await send('addSite', { input });
  if (res?.ok) {
    els.siteInput.value = '';
    refresh();
    return;
  }

  els.addError.textContent =
    res?.reason === 'duplicate'
      ? 'Already on the list.'
      : "Doesn't look like a site — try instagram.com";
});

refresh();
