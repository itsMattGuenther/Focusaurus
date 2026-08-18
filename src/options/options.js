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

  versionNote: document.getElementById('versionNote'),
};

/** Last state from the worker. Read-only mirror for rendering — never the
 *  source of truth for a write, which always sends a patch instead. */
let state = null;
let savedTimer = null;

function send(action, payload = {}) {
  return chrome.runtime.sendMessage({ action, ...payload });
}

function flagSaved() {
  els.savedFlag.textContent = 'Saved';
  els.savedFlag.dataset.on = 'true';
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { els.savedFlag.dataset.on = 'false'; }, 1600);
}

async function save(values) {
  await send('patchSettings', { values });
  flagSaved();
  await refresh();
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
    btn.addEventListener('click', () => {
      const days = new Set(state.settings.schedule.days);
      days.has(index) ? days.delete(index) : days.add(index);
      save({ schedule: { ...state.settings.schedule, days: [...days].sort((a, b) => a - b) } });
    });
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

  els.scheduleSummary.textContent = noDays
    ? 'No days selected — the schedule will never run.'
    : `${describeSchedule(schedule)} · ${inside ? 'in work hours now' : 'outside work hours now'}`;

  els.scheduleSummary.dataset.live = String(inside && !noDays);
  els.scheduleSummary.dataset.warn = String(noDays);
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
    btn.setAttribute('aria-pressed', String(packState === 'all'));

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

    btn.addEventListener('click', async () => {
      for (const c of els.packChips.children) c.disabled = true;
      await send('togglePack', { packId: pack.id });
      flagSaved();
      await refresh();
    });

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
    remove.addEventListener('click', async () => {
      await send('removeSite', { siteId: site.id });
      flagSaved();
      await refresh();
    });

    li.append(remove);
    els.siteList.append(li);
  }
}

/* --- Render -------------------------------------------------------------- */

function render() {
  const { settings } = state;
  const name = settings.dino.name;

  renderDoug(els.doug, state.mood);
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
  renderPacks(state.packs);
  renderSites(settings.sites);

  els.versionNote.textContent = `${settings.sites.length} sites · all data local`;
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
  save({ schedule: { ...state.settings.schedule, enabled: els.scheduleEnabled.checked } });
});

for (const [el, key] of [[els.scheduleStart, 'start'], [els.scheduleEnd, 'end']]) {
  el.addEventListener('change', () => {
    if (!el.value) return; // cleared time input — leave the stored value alone
    save({ schedule: { ...state.settings.schedule, [key]: el.value } });
  });
}

els.addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.addError.textContent = '';
  if (!els.siteInput.value.trim()) return;

  const res = await send('addSite', { input: els.siteInput.value });
  if (res?.ok) {
    els.siteInput.value = '';
    flagSaved();
    await refresh();
    return;
  }
  els.addError.textContent =
    res?.reason === 'duplicate'
      ? 'Already on the list.'
      : "That doesn't look like a site. Try instagram.com, or youtube.com/shorts.";
});

// Filter is local-only; no need to disturb the worker.
els.siteFilter.addEventListener('input', () => renderSites(state.settings.sites));

/* --- Export / import ----------------------------------------------------- */

els.exportBtn.addEventListener('click', async () => {
  const res = await send('exportSettings');
  if (!res?.ok) return;

  // Extension pages can hand the user a real file, unlike a sandboxed page.
  const url = URL.createObjectURL(new Blob([res.data], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `focusaurus-settings-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);

  els.dataNote.dataset.tone = 'good';
  els.dataNote.textContent = 'Exported. Keep it somewhere you can find it.';
});

els.importBtn.addEventListener('click', () => els.importFile.click());

els.importFile.addEventListener('change', async () => {
  const file = els.importFile.files?.[0];
  if (!file) return;

  const json = await file.text();
  els.importFile.value = ''; // so re-picking the same file fires again

  const res = await send('importSettings', { json });
  if (!res?.ok) {
    els.dataNote.dataset.tone = 'bad';
    els.dataNote.textContent =
      res?.reason === 'wrong-format'
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

/* --- Boot ---------------------------------------------------------------- */

buildDayButtons();
await refresh();

// The schedule summary says "in work hours now", which goes stale as the day
// moves. Cheap to keep honest while the tab is open.
setInterval(() => {
  if (state?.settings?.schedule?.enabled) renderSchedule(state.settings.schedule);
}, 30_000);
