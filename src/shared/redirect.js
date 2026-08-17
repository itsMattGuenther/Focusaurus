/* ==========================================================================
   The interstitial URL contract
   --------------------------------------------------------------------------
   Two halves of one agreement, deliberately kept in the same file so they
   can't drift apart:

     build — rules.js bakes this into a DNR regexSubstitution
     parse — blocked.js reads it back out on load

   The awkward shape (site id in the query, original URL in the FRAGMENT) is
   forced by how DNR substitutions work. `\0` expands to the entire matched
   URL, which routinely contains `?`, `&` and `#`. Put that in the query string
   and URLSearchParams truncates it at the first `&`, or silently absorbs the
   rest as extra params. The fragment has no such structure — everything after
   `#url=` can be read as one opaque slice, so even a URL carrying its own
   fragment survives intact.

   PURE MODULE. Both directions are covered by test/redirect.test.js, which
   simulates Chrome's substitution step end to end.
   ========================================================================== */

/** Everything after this marker in the fragment is the original URL, verbatim. */
export const FRAGMENT_PREFIX = '#url=';

/** DNR expands `\0` to the whole regexFilter match. */
export const WHOLE_MATCH = '\\0';

/**
 * Build the `regexSubstitution` for a blocked site.
 *
 * @param {string} interstitialUrl absolute chrome-extension:// URL
 * @param {string} siteId
 */
export function buildRedirectSubstitution(interstitialUrl, siteId) {
  return `${interstitialUrl}?site=${encodeURIComponent(siteId)}${FRAGMENT_PREFIX}${WHOLE_MATCH}`;
}

/**
 * Read the interstitial's own location back apart.
 *
 * Takes the raw pieces rather than reading `location` directly, so it stays
 * pure and testable.
 *
 * @param {string} search e.g. '?site=s_abc'
 * @param {string} hash   e.g. '#url=https://x.com/a?b=1#c'
 * @returns {{siteId: string|null, rawTarget: string|null}}
 */
export function parseInterstitial(search, hash) {
  const siteId = new URLSearchParams(search || '').get('site');
  const rawTarget =
    typeof hash === 'string' && hash.startsWith(FRAGMENT_PREFIX)
      ? hash.slice(FRAGMENT_PREFIX.length)
      : null;
  return { siteId, rawTarget };
}

/**
 * Gate the blocked URL before it can be used for navigation.
 *
 * This value is attacker-influenced: any site can send you to a crafted URL,
 * which then lands in our fragment. Without a scheme check a `javascript:` URL
 * would execute the moment someone clicked through an override.
 *
 * @returns {string|null} the URL if it's plain http(s), otherwise null
 */
export function safeExternalUrl(raw) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Host without `www.`, for display. Null if unparseable. */
export function displayHost(raw) {
  try {
    return new URL(raw).host.replace(/^www\./, '');
  } catch {
    return null;
  }
}
