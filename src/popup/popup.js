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
  packs: document.getElementById('packs'),
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

  els.countdownNote.textContent =
    session.plannedMinutes >= 720
      ? 'Open-ended — ends when you say so'
      : `${session.plannedMinutes} minute session`;

  const tick = () => {
    const ms = session.endsAt - Date.now();
    if (ms <= 0) {
      clearInterval(countdownTimer);
      refresh(); // the worker's alarm has ended it; pull fresh state
      return;
    }
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    els.countdown.textContent = h
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

function renderSites(sites) {
  els.siteCount.textContent = sites.length ? `· ${sites.length}` : '';
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

function renderPacks(packs, hasSites) {
  els.packs.hidden = hasSites;
  if (hasSites) return;

  els.packChips.replaceChildren();
  for (const pack of packs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.textContent = pack.label;
    btn.title = pack.blurb;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      await send('applyPack', { packId: pack.id });
      refresh();
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

  renderSites(state.settings.sites);
  renderPacks(state.packs, state.settings.sites.length > 0);
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
