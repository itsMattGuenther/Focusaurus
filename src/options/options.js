/* ==========================================================================
   Options — behavior
   --------------------------------------------------------------------------
   Saves on change; there is no Save button. That means the page must confirm
   visibly (the "Saved" flag), or a silent write feels like a dropped click.

   Same contract as the popup: the worker owns the truth, this page holds no
   cached copy, and every mutation is followed by a re-read.
   ========================================================================== */

import { renderDoug } from '../shared/doug.js';
import { describeSchedule, isWithinSchedule } from '../shared/schedule.js';
import { historyHeadline, timesPhrase } from '../shared/history.js';
import { send, act, requireSuccess, applyTheme, feedback, rememberFocus, watchState } from '../shared/ui.js';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const els = {
  doug: document.getElementById('dougMount'),
  mastheadSub: document.getElementById('mastheadSub'),
  savedFlag: document.getElementById('savedFlag'),

  dinoName: document.getElementById('dinoName'),

  strictness: document.getElementById('strictness'),
  overrideRow: document.getElementById('overrideRow'),
  overrideMinutes: document.getElementById('overrideMinutes'),

  scheduleEnabled: document.getElementById('scheduleEnabled'),
  scheduleBody: document.getElementById('scheduleBody'),
  days: document.getElementById('days'),
  scheduleStart: document.getElementById('scheduleStart'),
  scheduleEnd: document.getElementById('scheduleEnd'),
  scheduleSummary: document.getElementById('scheduleSummary'),

  siteCount: document.getElementById('siteCount'),
  packChips: document.getElementById('packChips'),
  addForm: document.getElementById('addForm'),
  siteInput: document.getElementById('siteInput'),
  addError: document.getElementById('addError'),
  siteFilter: document.getElementById('siteFilter'),
  siteList: document.getElementById('siteList'),
  sitesEmpty: document.getElementById('sitesEmpty'),

  exportBtn: document.getElementById('exportBtn'),
  importBtn: document.getElementById('importBtn'),
  importFile: document.getElementById('importFile'),
  dataNote: document.getElementById('dataNote'),

  historyTotal: document.getElementById('historyTotal'),
  historyHeadline: document.getElementById('historyHeadline'),
  historyDays: document.getElementById('historyDays'),
  historySites: document.getElementById('historySites'),
  historyEmpty: document.getElementById('historyEmpty'),

  versionNote: document.getElementById('versionNote'),
};

/** Last state from the worker. Read-only mirror for rendering — never the
 *  source of truth for a write, which always sends a patch instead. */
let state = null;
let savedTimer = null;

function flagSaved() {
  els.savedFlag.textContent = 'Saved';
  els.savedFlag.dataset.on = 'true';
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { els.savedFlag.dataset.on = 'false'; }, 1600);
}

async function save(values) {
  await act(null, async () => {
    requireSuccess(await send('patchSettings', { values }));
    flagSaved();
    await refresh();
  });
}

/* --- Schedule ------------------------------------------------------------ */

function buildDayButtons() {
  els.days.replaceChildren();
  DAY_LETTERS.forEach((letter, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'day';
    btn.textContent = letter;
    btn.dataset.day = String(index);
    // The letters repeat (S/T/S/T), so the accessible name has to be the real
    // day rather than the glyph.
    btn.setAttribute('aria-label', DAY_NAMES[index]);
    btn.addEventListener('click', () => act(btn, async () => {
      requireSuccess(await send('toggleScheduleDay', { day: index }));
      flagSaved(); await refresh();
    }));
    els.days.append(btn);
  });
}

function renderSchedule(schedule) {
  els.scheduleEnabled.checked = Boolean(schedule.enabled);
  els.scheduleBody.hidden = !schedule.enabled;
  els.scheduleStart.value = schedule.start;
  els.scheduleEnd.value = schedule.end;

  for (const btn of els.days.children) {
    btn.setAttribute('aria-pressed', String(schedule.days.includes(Number(btn.dataset.day))));
  }

  if (!schedule.enabled) return;

  const inside = isWithinSchedule(schedule, new Date());
  const noDays = schedule.days.length === 0;
  const noWindow = schedule.start === schedule.end;

  els.scheduleSummary.textContent = noWindow ? 'Start and end are the same — the schedule will not run.' : noDays
    ? 'No days selected — the schedule will never run.'
    : `${describeSchedule(schedule)} · ${inside ? 'in work hours now' : 'outside work hours now'}`;

  els.scheduleSummary.dataset.live = String(inside && !noDays);
  els.scheduleSummary.dataset.warn = String(noDays || noWindow);
}

/* --- Sites --------------------------------------------------------------- */

function renderPacks(packs) {
  els.packChips.replaceChildren();

  for (const pack of packs) {
    const { state: packState, present, total } = pack.status;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.dataset.state = packState;
    btn.setAttribute('aria-pressed', packState === 'partial' ? 'mixed' : String(packState === 'all'));
    btn.dataset.focusKey = `pack:${pack.id}`;

    const label = document.createElement('span');
    label.textContent = pack.label;

    const mark = document.createElement('span');
    mark.className = 'chip__mark';
    mark.textContent =
      packState === 'all' ? '✓' : packState === 'partial' ? `${present}/${total}` : String(total);

    btn.append(label, mark);
    btn.title =
      packState === 'all'
        ? `Click to remove all ${total}`
        : packState === 'partial'
          ? `${present} of ${total} on — click to add the rest`
          : `Click to block ${total} sites`;

    btn.addEventListener('click', () => act(els.packChips.children, async () => {
      requireSuccess(await send('togglePack', { packId: pack.id }));
      flagSaved();
      await refresh();
    }));

    els.packChips.append(btn);
  }
}

function renderSites(sites) {
  const filter = els.siteFilter.value.trim().toLowerCase();
  const shown = filter ? sites.filter((s) => s.label.toLowerCase().includes(filter)) : sites;

  els.siteCount.textContent = sites.length
    ? filter
      ? `· ${shown.length} of ${sites.length}`
      : `· ${sites.length}`
    : '';

  els.siteList.replaceChildren();
  els.sitesEmpty.hidden = shown.length > 0;
  if (!shown.length) {
    els.sitesEmpty.textContent = sites.length
      ? 'Nothing matches that filter.'
      : 'Nothing blocked yet — pick a category above, or add a site.';
    return;
  }

  for (const site of shown) {
    const li = document.createElement('li');
    li.className = 'site';

    const name = document.createElement('span');
    name.className = 'site__name';
    name.textContent = site.label; // textContent: labels are user input

    li.append(name);

    if (site.match?.kind === 'urlPrefix') {
      const scope = document.createElement('span');
      scope.className = 'site__scope';
      scope.textContent = 'path only';
      scope.title = 'Only this path is blocked — the rest of the site still works';
      li.append(scope);
    }

    if (site.pack && site.pack !== 'custom') {
      const pack = document.createElement('span');
      pack.className = 'site__pack';
      pack.textContent = site.pack;
      li.append(pack);
    }

    const remove = document.createElement('button');
    remove.className = 'site__remove';
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Stop blocking ${site.label}`);
    remove.title = `Stop blocking ${site.label}`;
    remove.dataset.focusKey = `site:${site.id}`;
    remove.addEventListener('click', () => act(remove, async () => {
      requireSuccess(await send('removeSite', { siteId: site.id }));
      flagSaved();
      await refresh();
    }));

    li.append(remove);
    els.siteList.append(li);
  }
}

function renderHistory(history) {
  const total = history?.total || 0;
  const days = history?.days || [];
  const peak = history?.peak || 0;
  const empty = total === 0;

  els.historyTotal.textContent = String(total);
  els.historyHeadline.textContent = historyHeadline(history);
  els.historyEmpty.hidden = days.length > 0;
  els.historySites.hidden = empty;

  els.historyDays.replaceChildren();
  els.historyDays.setAttribute('aria-label', 'Attempts per day, last seven days');
  days.forEach((day, i) => {
    const isToday = i === days.length - 1;
    const li = document.createElement('li');
    li.className = 'history__day';
    if (isToday) li.dataset.today = 'true';
    li.setAttribute(
      'aria-label',
      `${isToday ? 'Today' : day.weekdayName}, ${timesPhrase(day.attempts)}`,
    );

    const bar = document.createElement('div');
    bar.className = 'history__bar';
    bar.setAttribute('aria-hidden', 'true');
    if (day.attempts > 0 && peak > 0) {
      const fill = document.createElement('span');
      fill.className = 'history__fill';
      fill.style.height = `${Math.max(8, Math.round((day.attempts / peak) * 100))}%`;
      bar.append(fill);
    }

    const dow = document.createElement('span');
    dow.className = 'history__dow';
    dow.textContent = day.weekday;

    li.append(bar, dow);
    els.historyDays.append(li);
  });

  els.historySites.replaceChildren();
  for (const site of history?.sites || []) {
    const li = document.createElement('li');
    li.className = 'history__site';

    const name = document.createElement('span');
    name.className = 'history__site-name';
    name.textContent = site.label;

    const n = document.createElement('span');
    n.className = 'history__site-n';
    n.textContent = String(site.attempts);
    n.setAttribute('aria-label', timesPhrase(site.attempts));

    li.append(name, n);
    els.historySites.append(li);
  }
}

/* --- Render -------------------------------------------------------------- */

function render() {
  const restore = rememberFocus();
  const { settings } = state;
  const name = settings.dino.name;

  applyTheme(settings.theme);
  document.getElementById('themeSelect').value = settings.theme;
  renderDoug(els.doug, state.mood, { name });
  els.mastheadSub.textContent = `${name} is ${state.mood.replace('_', ' ')} — ${state.because}`;

  if (document.activeElement !== els.dinoName) els.dinoName.value = name;
  els.dinoName.setAttribute('aria-label', `Dinosaur name, currently ${name}`);

  for (const input of els.strictness.querySelectorAll('input')) {
    input.checked = input.value === settings.strictness;
  }
  // Override length is meaningless when there's no override to grant.
  els.overrideRow.hidden = settings.strictness === 'locked';
  if (document.activeElement !== els.overrideMinutes) {
    els.overrideMinutes.value = String(settings.overrideMinutes);
  }

  renderSchedule(settings.schedule);
  renderHistory(state.history);
  renderPacks(state.packs);
  renderSites(settings.sites);

  els.versionNote.textContent = `${settings.sites.length} sites · all data local`;
  document.getElementById('appVersion').textContent = `Focusaurus ${chrome.runtime.getManifest().version}`;
  restore();
}

async function refresh() {
  const next = await send('getState');
  if (!next || next.error) {
    els.dataNote.dataset.tone = 'bad';
    els.dataNote.textContent = next?.error || 'Could not reach the extension.';
    return;
  }
  state = next;
  render();
}

/* --- Wiring -------------------------------------------------------------- */

els.dinoName.addEventListener('change', () => {
  const name = els.dinoName.value.trim().slice(0, 24) || 'Doug';
  save({ dino: { name } });
});

els.strictness.addEventListener('change', (e) => {
  if (e.target.name === 'strictness') save({ strictness: e.target.value });
});

els.overrideMinutes.addEventListener('change', () => {
  const n = Math.min(120, Math.max(1, Math.round(Number(els.overrideMinutes.value) || 5)));
  els.overrideMinutes.value = String(n);
  save({ overrideMinutes: n });
});

els.scheduleEnabled.addEventListener('change', () => {
  save({ schedule: { enabled: els.scheduleEnabled.checked } });
});

for (const [el, key] of [[els.scheduleStart, 'start'], [els.scheduleEnd, 'end']]) {
  el.addEventListener('change', () => {
    if (!el.value) return; // cleared time input — leave the stored value alone
    save({ schedule: { [key]: el.value } });
  });
}

els.addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.addError.textContent = '';
  if (!els.siteInput.value.trim()) return;

  await act(els.addForm.querySelector('button'), async () => {
  const res = await send('addSite', { input: els.siteInput.value });
  if (res?.ok) {
    els.siteInput.value = '';
    flagSaved();
    await refresh();
    return;
  }
  if (['site-limit', 'unsupported-pattern'].includes(res.reason)) requireSuccess(res);
  els.addError.textContent =
    res?.reason === 'duplicate'
      ? 'Already on the list.'
      : "That doesn't look like a site. Try instagram.com, or youtube.com/shorts.";
  });
});

// Filter is local-only; no need to disturb the worker.
els.siteFilter.addEventListener('input', () => { if (state) renderSites(state.settings.sites); });

/* --- Export / import ----------------------------------------------------- */

els.exportBtn.addEventListener('click', () => act(els.exportBtn, async () => {
  const res = await send('exportSettings');
  if (!res?.ok) return;

  // Extension pages can hand the user a real file, unlike a sandboxed page.
  const url = URL.createObjectURL(new Blob([res.data], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `focusaurus-settings-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);

  els.dataNote.dataset.tone = 'good';
  els.dataNote.textContent = 'Exported. Keep it somewhere you can find it.';
}));

els.importBtn.addEventListener('click', () => els.importFile.click());

els.importFile.addEventListener('change', async () => {
  const file = els.importFile.files?.[0];
  if (!file) return;
  if (file.size > 1_000_000) { feedback(new Error('That file is too large. Use a Focusaurus settings export under 1 MB.')); els.importFile.value = ''; return; }

  await act(els.importBtn, async () => {

  const json = await file.text();
  els.importFile.value = ''; // so re-picking the same file fires again

  if (!await confirmAction('Replace your settings?', 'This replaces your site list, work hours, and preferences. Your history stays. Export your current settings first if you want a backup.', 'Replace settings')) return;

  const res = await send('importSettings', { json });
  if (!res?.ok) {
    els.dataNote.dataset.tone = 'bad';
    els.dataNote.textContent =
      res?.reason === 'unsupported-pattern' ? 'This backup contains a path Chrome cannot block. Shorten that path before importing.' :
      res?.reason === 'newer-version' ? 'This backup is from a newer Focusaurus version. Update the extension first.' : res?.reason === 'wrong-format'
        ? "That file isn't a Focusaurus export."
        : "Couldn't read that file — it doesn't look like valid JSON.";
    return;
  }

  await refresh();
  els.dataNote.dataset.tone = res.warnings?.length ? 'bad' : 'good';
  // Report repairs honestly rather than pretending a lossy import was clean.
  els.dataNote.textContent = res.warnings?.length
    ? `Imported ${res.siteCount} sites, with fixes: ${res.warnings.join(' ')}`
    : `Imported ${res.siteCount} sites.`;
  flagSaved();
  });
});

/* --- Boot ---------------------------------------------------------------- */

buildDayButtons();
await refresh().catch(feedback);
watchState(refresh);
document.getElementById('themeSelect').addEventListener('change', (e) => save({ theme: e.target.value }));

function confirmAction(title, text, label) {
  const dialog = document.getElementById('confirmDialog');
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmText').textContent = text;
  document.getElementById('confirmBtn').textContent = label;
  dialog.returnValue = 'cancel';
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
    dialog.showModal();
  });
}

document.getElementById('clearHistoryBtn').addEventListener('click', (e) => act(e.currentTarget, async () => {
  if (!await confirmAction('Clear your history?', 'This deletes recorded attempts and past sessions from this Chrome profile. Your blocked sites, settings, and current session stay.', 'Clear history')) return;
  requireSuccess(await send('clearHistory'));
  await refresh();
  els.dataNote.dataset.tone = 'good'; els.dataNote.textContent = 'History cleared.';
}));

// The schedule summary says "in work hours now", which goes stale as the day
// moves. Cheap to keep honest while the tab is open.
setInterval(() => {
  if (state?.settings?.schedule?.enabled) renderSchedule(state.settings.schedule);
}, 30_000);
