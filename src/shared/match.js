/* ==========================================================================
   Site matching
   --------------------------------------------------------------------------
   Turning "what the user typed" into "a pattern that blocks exactly that and
   nothing else". This is where the original prototype went most wrong: it used
   `urlFilter: '*' + input + '*'`, an unanchored substring match against the
   whole URL, so adding `fb` blocked every URL containing "fb" anywhere.

   Pure module — no chrome.* calls, fully unit-testable.
   ========================================================================== */

/** Match kinds we support.
 *  domain    — the host and all its subdomains, any path
 *  urlPrefix — host + a path prefix, e.g. youtube.com/shorts */
export const MATCH_DOMAIN = 'domain';
export const MATCH_URL_PREFIX = 'urlPrefix';

/** Escape RE2 metacharacters so user input can't smuggle in a pattern. */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/**
 * Normalize free-text input into a match spec.
 *
 * Accepts what people actually type: "youtube.com", "https://www.YouTube.com/",
 * "youtube.com/shorts", "  reddit.com  ".
 *
 * @param {string} raw
 * @returns {{kind: string, value: string} | null} null when unusable
 */
export function parseInput(raw) {
  if (typeof raw !== 'string') return null;

  let s = raw.trim().toLowerCase();
  if (!s) return null;

  // Drop a scheme if present, plus any credentials.
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  s = s.replace(/^[^/@]*@/, '');

  // Strip a leading www. — nobody means "only the www subdomain", and our
  // domain matching covers subdomains anyway.
  s = s.replace(/^www\./, '');

  // Split host from path, discarding query and fragment: blocking is decided
  // by host and path, and keeping ?utm_source=… would make rules unshareable.
  s = s.split('?')[0].split('#')[0];

  const slash = s.indexOf('/');
  let host = slash === -1 ? s : s.slice(0, slash);
  let path = slash === -1 ? '' : s.slice(slash);

  // Drop a port; DNR matches on host regardless.
  host = host.split(':')[0];

  // A host needs at least one dot and only legal characters. This rejects
  // bare words like "reddit", which would otherwise compile to a pattern that
  // matches far more than intended.
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;

  // Hyphens must be interior to EVERY label, not just the host as a whole.
  // Checking only the ends of `host` would let "a-.com" through.
  if (host.split('.').some((part) => part.startsWith('-') || part.endsWith('-'))) {
    return null;
  }

  path = path.replace(/\/+$/, ''); // trailing slashes carry no meaning here

  return path
    ? { kind: MATCH_URL_PREFIX, value: host + path }
    : { kind: MATCH_DOMAIN, value: host };
}

/**
 * Compile a match spec into a DNR `regexFilter`.
 *
 * The pattern deliberately matches the ENTIRE url, because `\0` in a
 * regexSubstitution expands to the whole regexFilter match — if we only
 * anchored the prefix, the redirect would lose the path (DESIGN.md ADR-4).
 *
 * @param {{kind: string, value: string}} spec
 * @returns {string} RE2-compatible pattern
 */
export function toRegexFilter(spec) {
  if (!spec || typeof spec.value !== 'string') {
    throw new TypeError('toRegexFilter: invalid spec');
  }

  // Optional subdomain chain, so example.com also covers a.b.example.com.
  const subdomains = '([a-z0-9-]+\\.)*';

  if (spec.kind === MATCH_DOMAIN) {
    // Tail allows :port, /path, ?query, #fragment, or nothing at all.
    return `^https?://${subdomains}${escapeRegex(spec.value)}(?:[:/?#].*)?$`;
  }

  if (spec.kind === MATCH_URL_PREFIX) {
    const slash = spec.value.indexOf('/');
    const host = escapeRegex(spec.value.slice(0, slash));
    const path = escapeRegex(spec.value.slice(slash));
    // Path must end at a boundary so /shorts doesn't match /shortsomething.
    return `^https?://${subdomains}${host}${path}(?:[/?#].*)?$`;
  }

  throw new TypeError(`toRegexFilter: unknown kind "${spec.kind}"`);
}

/** Human-facing name for a spec — used in lists and on the interstitial. */
export function displayName(spec) {
  return spec && spec.value ? spec.value : '';
}

/** Stable key for dedupe. Two inputs that normalize the same are the same site. */
export function specKey(spec) {
  return `${spec.kind}:${spec.value}`;
}
