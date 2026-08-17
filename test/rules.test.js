import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BLOCK_ID_BASE,
  OVERRIDE_ID_BASE,
  PRIORITY_BLOCK,
  PRIORITY_OVERRIDE,
  compileRules,
} from '../src/background/rules.js';
import { MATCH_DOMAIN } from '../src/shared/match.js';

const INTERSTITIAL = 'chrome-extension://abcdef/src/blocked/blocked.html';

const site = (id, value, mode = 'block') => ({
  id,
  label: value,
  match: { kind: MATCH_DOMAIN, value },
  mode,
});

const SITES = [
  site('s_a', 'instagram.com'),
  site('s_b', 'reddit.com'),
  site('s_c', 'tiktok.com'),
];

function compile(overrides = {}) {
  return compileRules({
    sites: SITES,
    interstitialUrl: INTERSTITIAL,
    enforcing: true,
    now: 1_000_000,
    ...overrides,
  });
}

test('every rule id is unique', () => {
  // REGRESSION (prototype bug #1): the old code set `id: 1` on every rule, so
  // Chrome rejected the whole addRules batch and nothing was ever blocked.
  const rules = compile();
  const ids = rules.map((r) => r.id);
  assert.equal(rules.length, SITES.length);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, [BLOCK_ID_BASE, BLOCK_ID_BASE + 1, BLOCK_ID_BASE + 2]);
});

test('nothing is enforced outside a session', () => {
  assert.deepEqual(compile({ enforcing: false }), []);
});

test('rules only touch top-level navigations', () => {
  // REGRESSION (prototype bug #3): it listed all 11 resource types, which
  // killed images, scripts and iframes across the whole web.
  for (const rule of compile()) {
    assert.deepEqual(rule.condition.resourceTypes, ['main_frame']);
  }
});

test('blocking redirects to the interstitial rather than erroring', () => {
  // REGRESSION (prototype bug #4): `block` yields Chrome's own error page,
  // which throws away the surface the entire product depends on.
  const [rule] = compile();
  assert.equal(rule.action.type, 'redirect');
  assert.equal(rule.priority, PRIORITY_BLOCK);

  const sub = rule.action.redirect.regexSubstitution;
  assert.ok(sub.startsWith(INTERSTITIAL), 'redirects to our own page');
  assert.ok(sub.includes('?site=s_a'), 'carries the site id in the query');
  // The original URL must ride in the FRAGMENT: \0 expands to a whole URL,
  // which routinely contains & and #, and URLSearchParams would truncate it.
  assert.ok(sub.includes('#url=\\0'), 'carries the original URL in the fragment');
  assert.ok(sub.indexOf('#url=') > sub.indexOf('?site='), 'fragment comes last');
});

test('the pattern matches the whole URL so \\0 keeps the path', () => {
  // If the filter only anchored the host, \0 would expand to just the prefix
  // and the override could never return the user to where they were going.
  const [rule] = compile();
  const re = new RegExp(rule.condition.regexFilter, 'i');
  const url = 'https://www.instagram.com/p/xyz?a=1#top';
  const m = url.match(re);
  assert.ok(m, 'should match');
  assert.equal(m[0], url, 'entire URL is the match');
});

test('budget-mode sites compile to nothing until v0.4', () => {
  const rules = compileRules({
    sites: [site('s_x', 'youtube.com', 'budget')],
    interstitialUrl: INTERSTITIAL,
    enforcing: true,
  });
  assert.deepEqual(rules, []);
});

test('an active override becomes an allow rule that outranks blocking', () => {
  const rules = compile({ overrides: [{ siteId: 's_b', expiresAt: 2_000_000 }] });

  const allow = rules.filter((r) => r.action.type === 'allow');
  assert.equal(allow.length, 1);
  assert.equal(allow[0].priority, PRIORITY_OVERRIDE);
  assert.ok(PRIORITY_OVERRIDE > PRIORITY_BLOCK);
  assert.equal(allow[0].id, OVERRIDE_ID_BASE + 1);

  // No competing block rule for the overridden site, and the others still block.
  assert.equal(rules.length, 3);
  assert.equal(rules.filter((r) => r.action.type === 'redirect').length, 2);
});

test('expired overrides are ignored', () => {
  const rules = compile({ overrides: [{ siteId: 's_b', expiresAt: 999_999 }] });
  assert.equal(rules.filter((r) => r.action.type === 'allow').length, 0);
  assert.equal(rules.length, 3);
});

test('a malformed site is skipped without taking the batch down', () => {
  const rules = compileRules({
    sites: [
      site('s_ok', 'reddit.com'),
      { id: 's_bad', mode: 'block' },                                  // no match
      { id: 's_bad2', mode: 'block', match: { kind: 'nope', value: 'x' } }, // bad kind
      null,
    ],
    interstitialUrl: INTERSTITIAL,
    enforcing: true,
  });
  assert.equal(rules.length, 1);
  assert.equal(rules[0].id, BLOCK_ID_BASE);
});

test('compileRules refuses to build without an interstitial URL', () => {
  assert.throws(() => compileRules({ sites: SITES, enforcing: true }), TypeError);
});

test('block and override id bands cannot collide', () => {
  // 900k of headroom is far beyond the 5,000 unsafe-rule ceiling, but the
  // bands exist so a rule's purpose is readable from its id while debugging.
  assert.ok(OVERRIDE_ID_BASE > BLOCK_ID_BASE + 100_000);
});
