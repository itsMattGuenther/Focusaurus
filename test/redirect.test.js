import test from 'node:test';
import assert from 'node:assert/strict';

import { compileRules } from '../src/background/rules.js';
import { parseInterstitial, safeExternalUrl } from '../src/shared/redirect.js';
import { MATCH_DOMAIN, MATCH_URL_PREFIX, toRegexFilter } from '../src/shared/match.js';

/* ==========================================================================
   End-to-end simulation of the redirect mechanism.

   This is the closest we can get to the real thing without a browser, and it
   covers the design's riskiest assumption (ADR-4): that the original URL
   survives a regexSubstitution intact, including URLs carrying their own
   query strings and fragments.

   Chrome's pipeline is:
     1. match the request URL against `regexFilter`
     2. expand `\0` (whole match) and `\1`..`\9` (groups) into
        `regexSubstitution`
     3. navigate to the result
     4. our page reads it back apart

   Steps 1-3 are simulated here; step 4 is the real production parser.
   ========================================================================== */

const INTERSTITIAL = 'chrome-extension://mnopqrst/src/blocked/blocked.html';

/** Simulate Chrome's steps 1-3. Returns the URL the browser would land on. */
function chromeRedirect(rule, requestUrl) {
  const match = requestUrl.match(new RegExp(rule.condition.regexFilter, 'i'));
  if (!match) return null;
  return rule.action.redirect.regexSubstitution.replace(
    /\\([0-9])/g,
    (_, d) => match[Number(d)] ?? '',
  );
}

/** Split a landed URL the way a browser would: everything after the FIRST
 *  '#' is the fragment, second '#' included. */
function splitLocation(url) {
  const hashAt = url.indexOf('#');
  const base = hashAt === -1 ? url : url.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : url.slice(hashAt);
  const qAt = base.indexOf('?');
  return { search: qAt === -1 ? '' : base.slice(qAt), hash };
}

function ruleFor(value, kind = MATCH_DOMAIN, id = 's_test') {
  const [rule] = compileRules({
    sites: [{ id, label: value, match: { kind, value }, mode: 'block' }],
    interstitialUrl: INTERSTITIAL,
    enforcing: true,
  });
  return rule;
}

/** Full loop: request URL in, {siteId, recovered URL} out. */
function roundTrip(requestUrl, value = 'instagram.com', kind = MATCH_DOMAIN) {
  const landed = chromeRedirect(ruleFor(value, kind), requestUrl);
  assert.ok(landed, `rule should have matched ${requestUrl}`);
  const { search, hash } = splitLocation(landed);
  const { siteId, rawTarget } = parseInterstitial(search, hash);
  return { landed, siteId, rawTarget, safe: safeExternalUrl(rawTarget) };
}

test('a plain URL round-trips exactly', () => {
  const url = 'https://instagram.com/';
  const { siteId, rawTarget, safe } = roundTrip(url);
  assert.equal(siteId, 's_test');
  assert.equal(rawTarget, url);
  assert.equal(safe, url);
});

test('the path survives — this is why the filter matches the whole URL', () => {
  const url = 'https://www.instagram.com/p/CxYz123/?img_index=2';
  const { rawTarget } = roundTrip(url);
  assert.equal(rawTarget, url);
});

test('a URL with & in its query survives (the URLSearchParams trap)', () => {
  // Had the URL ridden in the query string instead of the fragment, everything
  // from the first & onward would have been parsed as extra params and lost.
  const url = 'https://instagram.com/explore?tag=a&sort=new&page=3';
  const { rawTarget, safe } = roundTrip(url);
  assert.equal(rawTarget, url);
  assert.equal(safe, url);
});

test("a URL with its own # survives, second hash included", () => {
  // The browser keeps everything after the FIRST '#' in location.hash, so a
  // nested fragment comes back whole.
  const url = 'https://instagram.com/watch?v=abc#t=120';
  const { rawTarget, safe } = roundTrip(url);
  assert.equal(rawTarget, url);
  assert.equal(safe, url);
});

test('the pathological case: & and # and = all at once', () => {
  const url = 'https://instagram.com/a?x=1&y=2#frag?with=stuff&more=yes';
  const { rawTarget } = roundTrip(url);
  assert.equal(rawTarget, url);
});

test('subdomains and ports round-trip', () => {
  for (const url of [
    'https://old.instagram.com/x',
    'http://a.b.instagram.com/y?z=1',
    'https://instagram.com:8443/p/1',
  ]) {
    assert.equal(roundTrip(url).rawTarget, url, url);
  }
});

test('a urlPrefix rule round-trips too', () => {
  const url = 'https://www.youtube.com/shorts/xyz?feature=share';
  const { rawTarget, siteId } = roundTrip(url, 'youtube.com/shorts', MATCH_URL_PREFIX);
  assert.equal(rawTarget, url);
  assert.equal(siteId, 's_test');
});

test('the landed URL is a well-formed extension URL', () => {
  const { landed } = roundTrip('https://instagram.com/p/1?a=b#c');
  // Chrome has to be able to parse this, and it must point at our own page.
  const parsed = new URL(landed);
  assert.equal(parsed.protocol, 'chrome-extension:');
  assert.equal(parsed.pathname, '/src/blocked/blocked.html');
  assert.equal(parsed.searchParams.get('site'), 's_test');
  // No unexpanded substitution token left behind.
  assert.ok(!landed.includes('\\0'), 'the \\0 token must be expanded');
});

test('a site id needing encoding survives the query string', () => {
  const rule = ruleFor('instagram.com', MATCH_DOMAIN, 's_a b&c=d');
  const landed = chromeRedirect(rule, 'https://instagram.com/');
  const { search, hash } = splitLocation(landed);
  const { siteId, rawTarget } = parseInterstitial(search, hash);
  assert.equal(siteId, 's_a b&c=d', 'id must not be corrupted by its own & or =');
  assert.equal(rawTarget, 'https://instagram.com/');
});

test('SECURITY: a javascript: target is refused', () => {
  // The fragment is attacker-influenced. Without this gate, a crafted URL would
  // execute the moment someone clicked through an override.
  for (const evil of [
    'javascript:alert(document.cookie)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'chrome-extension://abc/steal.html',
    'vbscript:msgbox(1)',
  ]) {
    assert.equal(safeExternalUrl(evil), null, `must refuse: ${evil}`);
  }
});

test('SECURITY: garbage and empty targets are refused, not crashed on', () => {
  for (const junk of [null, undefined, '', 'not a url', '://', '#url=', 'http://']) {
    assert.equal(safeExternalUrl(junk), null, `must refuse: ${JSON.stringify(junk)}`);
  }
});

test('a missing or malformed fragment degrades gracefully', () => {
  // A user landing on blocked.html directly, or a stripped fragment.
  assert.deepEqual(parseInterstitial('?site=s_x', ''), {
    siteId: 's_x',
    rawTarget: null,
  });
  assert.deepEqual(parseInterstitial('', '#something-else'), {
    siteId: null,
    rawTarget: null,
  });
  assert.deepEqual(parseInterstitial(undefined, undefined), {
    siteId: null,
    rawTarget: null,
  });
});

test('non-matching URLs produce no redirect at all', () => {
  const rule = ruleFor('instagram.com');
  for (const url of [
    'https://notinstagram.com/',
    'https://instagram.com.evil.example/',
    'https://google.com/search?q=instagram.com',
  ]) {
    assert.equal(chromeRedirect(rule, url), null, `should not redirect: ${url}`);
  }
});

test('the regexFilter stays inside DNR limits', () => {
  // RE2 has no backreferences or lookaround; DNR also caps regex rules at 1000.
  // Guard against someone reaching for a construct RE2 will reject at runtime,
  // which surfaces as the rule being silently dropped.
  const filter = toRegexFilter({ kind: MATCH_DOMAIN, value: 'instagram.com' });
  assert.ok(!/\(\?=/.test(filter), 'no lookahead');
  assert.ok(!/\(\?!/.test(filter), 'no negative lookahead');
  assert.ok(!/\(\?</.test(filter), 'no lookbehind');
  assert.ok(!/\\[1-9]/.test(filter), 'no backreferences');
  assert.ok(filter.length < 1000, 'pattern stays small');
});
