import test from 'node:test';
import assert from 'node:assert/strict';

import { STARTER_PACKS, packById, packStatus } from '../src/shared/starter-packs.js';
import { MATCH_URL_PREFIX, parseInput, specKey } from '../src/shared/match.js';

/** Build the site records a pack would produce when applied. */
const sitesFor = (pack, count = Infinity) =>
  pack.sites.slice(0, count).map((entry, i) => ({
    id: `s_${pack.id}_${i}`,
    label: entry,
    match: parseInput(entry),
    mode: 'block',
    pack: pack.id,
  }));

test('every pack entry parses — a typo here must fail the build', () => {
  // Without this, a malformed entry is silently skipped by addSite and the user
  // just quietly gets fewer sites than the chip's count promised.
  for (const pack of STARTER_PACKS) {
    for (const entry of pack.sites) {
      assert.ok(parseInput(entry), `${pack.id}: unparseable entry "${entry}"`);
    }
  }
});

test('packs are disjoint', () => {
  // Site provenance is a single `pack` field, so an entry in two packs would
  // make removal ambiguous: dropping one pack would silently strip a site the
  // other still wants.
  const owner = new Map();
  for (const pack of STARTER_PACKS) {
    for (const entry of pack.sites) {
      const key = specKey(parseInput(entry));
      const prior = owner.get(key);
      assert.equal(prior, undefined, `"${entry}" is in both ${prior} and ${pack.id}`);
      owner.set(key, pack.id);
    }
  }
});

test('no duplicates within a single pack', () => {
  for (const pack of STARTER_PACKS) {
    const keys = pack.sites.map((e) => specKey(parseInput(e)));
    assert.equal(new Set(keys).size, keys.length, `${pack.id} has a duplicate`);
  }
});

test('pack metadata is complete and ids are unique', () => {
  const ids = new Set();
  for (const pack of STARTER_PACKS) {
    assert.match(pack.id, /^[a-z]+$/, 'id should be a simple slug');
    assert.ok(pack.label, `${pack.id} needs a label`);
    assert.ok(pack.blurb, `${pack.id} needs a blurb`);
    assert.ok(pack.sites.length >= 5, `${pack.id} is too thin to be worth a chip`);
    assert.equal(ids.has(pack.id), false, `duplicate pack id ${pack.id}`);
    ids.add(pack.id);
    assert.equal(packById(pack.id), pack);
  }
  assert.equal(packById('nope'), null);
});

test('nothing plausibly needed for work is blanket-blocked', () => {
  // A rule you switch off protects nothing, so the packs must not contain
  // anything that forces the user to disable a whole category to do their job.
  const forbidden = [
    'github.com',
    'stackoverflow.com',
    'google.com',
    'docs.google.com',
    'gmail.com',
    'slack.com',
    'notion.so',
    'youtube.com', // the bare domain — only its feed paths belong in a pack
    'linkedin.com', // ditto: linkedin.com/feed is fine, the whole site is not
  ];
  const all = STARTER_PACKS.flatMap((p) => p.sites.map((e) => parseInput(e).value));
  for (const bad of forbidden) {
    assert.equal(all.includes(bad), false, `"${bad}" must not be blanket-blocked`);
  }
});

test('sites that are only partly a trap are scoped to a path', () => {
  // These are the entries where a domain-wide block would get the extension
  // switched off within a day.
  const byValue = new Map(
    STARTER_PACKS.flatMap((p) => p.sites.map((e) => [parseInput(e).value, parseInput(e)])),
  );
  for (const scoped of ['youtube.com/shorts', 'linkedin.com/feed', 'bbc.com/news']) {
    const spec = byValue.get(scoped);
    assert.ok(spec, `expected a scoped entry for ${scoped}`);
    assert.equal(spec.kind, MATCH_URL_PREFIX, `${scoped} should be a path match`);
  }
});

/* --- packStatus ---------------------------------------------------------- */

test('packStatus reports none when nothing is applied', () => {
  const pack = STARTER_PACKS[0];
  const status = packStatus(pack, []);
  assert.deepEqual(status, { present: 0, total: pack.sites.length, state: 'none' });
});

test('packStatus reports all when every entry is present', () => {
  const pack = STARTER_PACKS[0];
  const status = packStatus(pack, sitesFor(pack));
  assert.equal(status.state, 'all');
  assert.equal(status.present, pack.sites.length);
});

test('packStatus reports partial in between', () => {
  const pack = STARTER_PACKS[0];
  const status = packStatus(pack, sitesFor(pack, 3));
  assert.equal(status.state, 'partial');
  assert.equal(status.present, 3);
});

test('packStatus ignores sites belonging to other packs', () => {
  const [social, video] = STARTER_PACKS;
  const status = packStatus(social, sitesFor(video));
  assert.equal(status.state, 'none', 'disjointness means no cross-counting');
});

test('packStatus matches on the normalized spec, not the raw string', () => {
  // A site the user typed as "https://www.instagram.com/" must still count
  // toward the Social pack, otherwise the chip would offer to re-add it.
  const social = packById('social');
  const typed = [{
    id: 's_manual',
    label: 'instagram.com',
    match: parseInput('https://www.Instagram.com/'),
    mode: 'block',
    pack: 'custom',
  }];
  assert.equal(packStatus(social, typed).present, 1);
});

test('packStatus survives junk in the site list', () => {
  const pack = STARTER_PACKS[0];
  assert.doesNotThrow(() => packStatus(pack, []));
  assert.equal(packStatus(pack, sitesFor(pack, 0)).state, 'none');
});

test('the packs total is a sensible starting library', () => {
  const total = STARTER_PACKS.reduce((n, p) => n + p.sites.length, 0);
  assert.ok(total >= 60, `expected a substantial library, got ${total}`);
  assert.ok(STARTER_PACKS.length >= 5, 'want enough categories to combine');
});
