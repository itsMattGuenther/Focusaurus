/* ==========================================================================
   DNR rule compilation
   --------------------------------------------------------------------------
   PURE MODULE. Settings in, declarativeNetRequest rules out. No chrome.*
   calls live here, which is what makes the trickiest logic in the extension
   unit-testable in plain node (DESIGN.md ADR-8).

   Everything the prototype got wrong about rules is fixed here:
     - unique, deterministic ids (it hardcoded id: 1 on every rule, so Chrome
       rejected the whole batch and nothing actually blocked)
     - anchored patterns instead of a substring match on the full URL
     - main_frame only, instead of all 11 resource types
     - redirect instead of block, so Doug has somewhere to stand
   ========================================================================== */

import { toRegexFilter } from '../shared/match.js';

/* Id space. Kept in explicit bands so a rule's purpose is obvious from its id
   while debugging, and so the two kinds can never collide. */
export const BLOCK_ID_BASE = 1000;
export const OVERRIDE_ID_BASE = 900000;

/* Override (allow) rules must outrank block rules. DNR resolves ties by action
   type, but relying on that is subtle — an explicit priority gap is clearer to
   read and impossible to get wrong. */
export const PRIORITY_BLOCK = 1;
export const PRIORITY_OVERRIDE = 100;

/** Only top-level navigations. Redirecting a sub-resource (an image, a script)
 *  to an HTML page produces garbage, and blocking them all is how the prototype
 *  broke embeds across the entire web. */
const RESOURCE_TYPES = ['main_frame'];

/**
 * Build the redirect target for a blocked site.
 *
 * The site id rides in the query string; the original URL rides in the
 * FRAGMENT, after `#url=`.
 *
 * That split is deliberate. `\0` expands to the entire matched URL, which
 * routinely contains `?`, `&`, and `#` — put it in the query string and
 * URLSearchParams truncates it at the first `&`. In the fragment we can read
 * everything after `#url=` as one opaque string, so even a URL with its own
 * fragment survives intact.
 *
 * @param {string} interstitialUrl absolute chrome-extension:// URL
 * @param {string} siteId
 */
export function redirectTarget(interstitialUrl, siteId) {
  return `${interstitialUrl}?site=${encodeURIComponent(siteId)}#url=\\0`;
}

/**
 * Compile the full dynamic rule set.
 *
 * Always produces the COMPLETE set. Reconciliation replaces everything
 * wholesale rather than patching individual ids — dynamic rules persist across
 * restarts and extension updates, so incremental patching strands orphans that
 * block forever with no UI showing them (DESIGN.md §1 #8).
 *
 * @param {object} args
 * @param {Array}  args.sites            site records
 * @param {string} args.interstitialUrl  absolute URL of blocked.html
 * @param {boolean} args.enforcing       false => no block rules at all
 * @param {Array}  [args.overrides]      [{ siteId, expiresAt }]
 * @param {number} [args.now]            for deterministic tests
 * @returns {Array} DNR rule objects
 */
export function compileRules({
  sites = [],
  interstitialUrl,
  enforcing = false,
  overrides = [],
  now = Date.now(),
}) {
  if (!interstitialUrl) throw new TypeError('compileRules: interstitialUrl required');

  const rules = [];
  if (!enforcing) return rules; // nothing enforced outside a session

  const activeOverrides = new Set(
    overrides.filter((o) => o && o.expiresAt > now).map((o) => o.siteId),
  );

  sites.forEach((site, index) => {
    // v0.1 enforces hard blocks only. `budget` sites are carried in storage
    // from day one so v0.4 doesn't need a migration, but they compile to
    // nothing until the tracker exists to measure them.
    if (!site || site.mode !== 'block') return;
    if (!site.match || !site.match.value) return;

    let regexFilter;
    try {
      regexFilter = toRegexFilter(site.match);
    } catch {
      return; // a malformed entry shouldn't take the whole rule set down
    }

    if (activeOverrides.has(site.id)) {
      rules.push({
        id: OVERRIDE_ID_BASE + index,
        priority: PRIORITY_OVERRIDE,
        action: { type: 'allow' },
        condition: { regexFilter, resourceTypes: RESOURCE_TYPES },
      });
      return; // an allowed site needs no block rule alongside it
    }

    rules.push({
      id: BLOCK_ID_BASE + index,
      priority: PRIORITY_BLOCK,
      action: {
        type: 'redirect',
        redirect: { regexSubstitution: redirectTarget(interstitialUrl, site.id) },
      },
      condition: { regexFilter, resourceTypes: RESOURCE_TYPES },
    });
  });

  return rules;
}
