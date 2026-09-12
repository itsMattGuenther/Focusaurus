import { renderDoug } from '../shared/doug.js';
import { send, act, requireSuccess, applyTheme, feedback, rememberFocus, watchState, renderAccess } from '../shared/ui.js';
const el = (id) => document.getElementById(id);

async function refresh() {
  const state = await send('getState');
  const restore = rememberFocus();
  applyTheme(state.settings.theme);
  renderAccess(state.access);
  renderDoug(el('dougMount'), state.session ? 'focused' : 'chill', { name: state.settings.dino.name });
  el('dinoName').textContent = `${state.settings.dino.name}, Focusaurus`;
  el('packChips').replaceChildren();
  for (const pack of state.packs) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'pack'; btn.dataset.state = pack.status.state;
    btn.dataset.focusKey = `pack:${pack.id}`;
    btn.setAttribute('aria-pressed', pack.status.state === 'partial' ? 'mixed' : String(pack.status.state === 'all'));
    const label = document.createElement('span'); label.textContent = pack.label;
    const detail = document.createElement('span'); detail.className = 'pack__detail';
    detail.textContent = pack.status.state === 'all' ? `${pack.status.total} selected ✓` : `${pack.status.present ? `${pack.status.present} of ` : ''}${pack.status.total} sites`;
    btn.append(label, detail);
    btn.addEventListener('click', () => act(el('packChips').children, async () => {
      requireSuccess(await send('togglePack', { packId: pack.id })); await refresh();
    }));
    el('packChips').append(btn);
  }
  const count = state.settings.sites.length;
  el('siteCount').textContent = count ? `${count} site${count === 1 ? '' : 's'} ready to pause during your sessions.` : 'Choose at least one site to get started.';
  el('startBtn').disabled = !count || Boolean(state.session) || !state.access.granted;
  el('startBtn').dataset.stateDisabled = String(el('startBtn').disabled);
  el('startBtn').textContent = state.session ? 'Your session is running' : 'Start my first 25 minutes ↗';
  el('started').hidden = !state.session || !state.access.granted;
  restore();
}
el('startBtn').addEventListener('click', () => act(el('startBtn'), async () => {
  requireSuccess(await send('startSession', { minutes: 25 })); await refresh();
}));
el('addForm').addEventListener('submit', (event) => {
  event.preventDefault();
  act(el('addForm').querySelector('button'), async () => {
    const result = await send('addSite', { input: el('siteInput').value });
    if (['invalid', 'duplicate'].includes(result.reason)) {
      el('addError').textContent = result.reason === 'duplicate' ? 'Already on your list.' : 'Try a site like instagram.com or a path like youtube.com/shorts.';
      return;
    }
    requireSuccess(result); el('siteInput').value = ''; el('addError').textContent = 'Added to your list.'; await refresh();
  });
});
refresh().catch(feedback);
watchState(refresh);
