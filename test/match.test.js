import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MATCH_DOMAIN,
  MATCH_URL_PREFIX,
  parseInput,
  toRegexFilter,
  specKey,
} from '../src/shared/match.js';

/** Does a compiled filter match this URL? Mirrors how DNR applies regexFilter:
 *  case-insensitive by default (isUrlFilterCaseSensitive defaults to false). */
function matches(spec, url) {
  return new RegExp(toRegexFilter(spec), 'i').test(url);
}

test('parseInput normalizes what people actually type', () => {
  const expected = { kind: MATCH_DOMAIN, value: 'youtube.com' };
  for (const input of [
    'youtube.com',
    'YouTube.com',
    'https://youtube.com',
    'http://www.youtube.com/',
    '  https://www.YouTube.com/  ',
    'youtube.com:443',
    'https://youtube.com/?utm_source=x#frag',
  ]) {
    assert.deepEqual(parseInput(input), expected, `failed for: ${input}`);
  }
});

test('parseInput keeps a path as a urlPrefix match', () => {
  assert.deepEqual(parseInput('youtube.com/shorts'), {
    kind: MATCH_URL_PREFIX,
    value: 'youtube.com/shorts',
  });
  // Trailing slashes carry no meaning and shouldn't create a distinct entry.
  assert.deepEqual(parseInput('reddit.com/r/all/'), {
    kind: MATCH_URL_PREFIX,
    value: 'reddit.com/r/all',
  });
});

test('parseInput rejects input that would over-block', () => {
  // REGRESSION (prototype bug #2): the old code did urlFilter '*' + input + '*'.
  // A bare word like "fb" or "news" became an unanchored substring match
  // against the entire URL, blocking anything that happened to contain it.
  for (const bad of ['', '   ', 'reddit', 'fb', 'news', 'localhost', '.', '..', '-a.com', 'a-.com']) {
    assert.equal(parseInput(bad), null, `should reject: ${JSON.stringify(bad)}`);
  }
});

test('domain match covers subdomains and every path', () => {
  const spec = parseInput('reddit.com');
  for (const url of [
    'https://reddit.com',
    'https://reddit.com/',
    'https://www.reddit.com/r/all',
    'https://old.reddit.com/r/all?sort=new',
    'http://a.b.c.reddit.com/x#y',
    'https://reddit.com:8443/x',
  ]) {
    assert.ok(matches(spec, url), `should match: ${url}`);
  }
});

test('domain match does not bleed into lookalike hosts', () => {
  // REGRESSION (prototype bug #2), the dangerous half: a substring pattern for
  // "reddit.com" also matched notreddit.com and reddit.com.evil.example.
  const spec = parseInput('reddit.com');
  for (const url of [
    'https://notreddit.com/',
    'https://reddit.com.evil.example/',
    'https://myreddit.community/',
    'https://example.com/reddit.com',
    'https://example.com/?q=reddit.com',
  ]) {
    assert.equal(matches(spec, url), false, `should NOT match: ${url}`);
  }
});

test('urlPrefix match respects path boundaries', () => {
  const spec = parseInput('youtube.com/shorts');
  assert.ok(matches(spec, 'https://youtube.com/shorts'));
  assert.ok(matches(spec, 'https://www.youtube.com/shorts/abc123'));
  assert.ok(matches(spec, 'https://youtube.com/shorts?x=1'));

  // The whole point of urlPrefix: leave the rest of the host usable.
  assert.equal(matches(spec, 'https://youtube.com/'), false);
  assert.equal(matches(spec, 'https://youtube.com/watch?v=abc'), false);
  // /shorts must not match /shortstories.
  assert.equal(matches(spec, 'https://youtube.com/shortstories'), false);
});

test('compiled patterns only apply to http(s)', () => {
  const spec = parseInput('reddit.com');
  assert.equal(matches(spec, 'ftp://reddit.com/'), false);
  assert.equal(matches(spec, 'javascript:alert(1)//reddit.com'), false);
});

test('regex metacharacters in input are escaped, not interpreted', () => {
  // A host is validated before it gets here, so this is belt-and-braces
  // against a pattern being smuggled through a future input path.
  const spec = { kind: MATCH_DOMAIN, value: 'a.b.com' };
  assert.ok(matches(spec, 'https://a.b.com/'));
  assert.equal(matches(spec, 'https://axbxcom/'), false);
});

test('specKey collapses inputs that normalize identically', () => {
  // REGRESSION (prototype bug #7): the old popup pushed every submission onto
  // the array, so "reddit.com" and "https://www.reddit.com/" both got stored.
  assert.equal(
    specKey(parseInput('https://www.reddit.com/')),
    specKey(parseInput('reddit.com')),
  );
});
