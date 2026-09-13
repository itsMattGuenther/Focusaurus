# Architecture · Focusaurus 1.0

## Runtime

Plain ES modules, HTML and CSS in Manifest V3 extensions for Chrome 140+ and
Firefox desktop 153+. No runtime
framework, remote code, content scripts, accounts, backend, or telemetry.
Development dependencies are pinned and excluded from the package.

```
src/background/  worker, storage, event queue, pure rule and mood engines
src/shared/      matching, redirect contract, schedule/session/history math,
                 character renderer, copy, UI messaging and theme helpers
src/popup/       quick session control and site list
src/blocked/     interruption, pause, temporary pass, released state
src/welcome/     first session setup
src/options/     schedule, preferences, sites, history and backup
src/privacy/     bundled privacy policy; build also emits a public-ready copy
assets/art/     seven compressed character illustrations
assets/icons/   happy Doug rescaled into four PNG icon sizes
assets/fonts/   locally bundled fonts and full redistribution notices
```

## Browser packaging

`manifest.json` is the Chrome source manifest. `dev/manifests.mjs` derives the
Firefox manifest with an event-page `background.scripts` entry, stable add-on
ID `focusaurus@itsmattguenther`, minimum 153, and a `none` data-collection
declaration. Both targets use the same module code and assets. Firefox's minimum
retains the per-document security boundary: `runtime.MessageSender.documentId`
was added in 153. Do not lower it without redesigning and retesting that boundary.

`src/shared/browser.js` selects native Promise APIs in each browser. Sender
validation compares the public add-on ID separately from the origin produced
by `runtime.getURL`: Firefox uses a per-profile UUID for its extension URL host.
The path allowlist and document-bound pause remain enforced by the background.
No WebExtension polyfill or other runtime dependency is required.

## State and ownership

All application mutations enter the worker through an allowlisted message or a
browser lifecycle/navigation/alarm event. One promise queue serializes those
operations. Its only in-memory state is coordination; durable product state is
read from storage. A failed operation does not strand the queue.

| Store/key | Data |
| --- | --- |
| local `settings` | Schema 2, site list, name, theme, strictness, override length, schedule, onboarding flag. |
| local `session` | `startedAt`, `plannedMinutes`, `endsAt`, `source`. Null `endsAt` denotes an open-ended manual session. |
| local `overrides` | Site IDs and expiry timestamps. End with their session. |
| local `scheduleSuppressedUntil` | Manual-stop suppression until the current work window ends. |
| local `usage:YYYY-MM-DD` | Per-site attempt/pass counts and completed/ended session records. Local calendar dates. |
| local `recentAttempts`, `lastBlockedLine` | Bounded short-term mood/copy context. |
| session `blockedVisits` | Per-tab/document pause context, counts and selected copy. No target URLs. Survives worker suspension, not browser exit. Bounded to 100 entries. |

Settings formerly lived in Chrome sync. The entire list exceeded sync’s 8 KB
per-item quota when category packs were combined. Migration writes sanitized
local settings before removing only the known legacy Focusaurus sync keys.
Subsequent settings remain local. Chrome local storage access is explicitly restricted to trusted extension
contexts. Firefox does not expose `local.setAccessLevel`; the Firefox build has
no content scripts or externally connectable messaging. History retains today and the preceding six local calendar days, matching the
shared week length. Older buckets are pruned on recovery, control-page reads,
session transitions and hourly maintenance. Session records and recent-attempt arrays are bounded.

Imports require a settings object with a sites array; future schema versions,
unrelated JSON and oversized files are refused. Patterns are rebuilt from site
labels. Invalid entries are reported, duplicates collapse, and unsafe/duplicate
IDs are repaired. Unsupported budget records become explicit session blocks
with a visible warning. Import UI confirms replacement before writing.

## Enforcement

`match.js` canonicalizes HTTP/HTTPS input using URL parsing, validates hostnames,
and produces anchored RE2-compatible patterns. Domain blocks cover subdomains;
path blocks end at a path boundary. Explicit ports, trailing host dots, IDNs,
encoded paths and dot segments are handled. Path matching is case-insensitive,
consistent with Chrome’s default DNR behavior. Queries/fragments are not part
of a user-configured match.

Custom and imported patterns are checked with Chrome's `isRegexSupported`
before saving. This catches compiled-memory limits that raw input validation
cannot predict and preserves the existing list when an import is rejected.

`rules.js` compiles the whole desired rule set. Redirect and override IDs occupy
separate bands. Rules affect main-frame requests only. Temporary `allow` rules
have a higher priority than blocks, including when domain/path entries overlap.
Reconciliation replaces rules atomically through Chrome’s dynamic-rule API.

On a rule change, matching already-open tabs pause. `webNavigation` catches
top-frame history-state changes inside single-page apps. Neither path injects
scripts or reads page contents. These supplemental checks use the same match
semantics and honor every applicable temporary pass. Automatic pauses are
distinguished from user attempts in both the history and interstitial.

The original destination is carried as `#url=` on the blocked page, while the
matched site ID is in its query. This preserves original query parameters and
fragments through DNR substitution. Only safe HTTP/HTTPS destinations can be
opened. Chrome’s own history may retain blocked-page addresses; the privacy
policy states this limitation.

### Site access

`access.js` checks effective host grants using `permissions.contains`. Full
HTTP/HTTPS access takes one call; restricted access is checked against the
configured domains, including subdomains and both schemes, in one batched call.
No extra manifest permission is needed. Unknown access is treated as unavailable.
Manual and scheduled sessions cannot start without the required access.

Revoking access during a session preserves its deadline and usable rules, but
shows a warning in the control pages and an exclamation mark on the toolbar.
Restoring access reconciles rules and pauses matching open tabs even when the
rules themselves did not change. Permission events and returning to a control
page refresh access status. Chrome's recovery button opens extension details.
Firefox's button calls `permissions.request` during the user gesture to show
the native website-access prompt; only the user changes its grants.

## Worker and clock lifecycle

Every worker incarnation restores state, prunes history, retires an expired
session, applies the schedule and reconciles enforcement. Listeners register
synchronously. Startup/installation and alarm events use the same queue.
Alarms are advisory: handlers inspect current timestamps, so a stale end alarm
cannot terminate a newer session. Periodic alarms are not reset by routine
configuration writes. The toolbar derives its countdown from `endsAt`.

Schedule transitions use local time, selected start days and overnight windows.
Only scheduled sessions are stopped when work hours end or scheduling is
disabled. Editing a running schedule adjusts its endpoint. A manual end during
work hours suppresses automatic restarting for that window. Sleeping/closed
browsers can delay alarms; recovery checks timestamps rather than elapsed ticks.

## Page/message boundary

Message sources must be this extension’s expected pages. Popup, welcome and
settings pages can configure state. The web-accessible blocked page can only
read its blocked context and request a temporary pass. It cannot end a session,
change settings, or delete history. Action lookup rejects inherited properties.

The worker reads the target and site from the browser’s sender URL, validates the
match, and records a visit once per document/session. A pause deadline lives in
session storage and is checked again before granting a pass. UI countdowns are
informational, not the enforcement mechanism. Ending a session or expiring an
override reconciles rules before a successful navigation response.

UI mutations use shared error handling with recoverable controls. Saved feedback
appears only after success. Live storage changes refresh visible pages; theme
choices propagate immediately. Category/site focus is restored after updates.
History deletion and settings replacement use native accessible confirmation
dialogs. The per-second countdown is not a live region.

## Visual system and verification

`tokens.css` owns UI palette, typography, spacing and motion tokens. New Doug
art uses an SVG image wrapper around local WebP files, with escaped accessible
names and explicit motion reduction. The icons use that same happy illustration,
rescaled with transparent padding. See ART-DIRECTION.md for sources and prompts.

Node tests cover matching, DNR compilation, redirects, schedules, sessions,
settings, history, moods, palette contrast, assets and serialization. Playwright
loads the actual extension in isolated Chromium profiles to exercise browser
rules, concurrency, migration, schedules, suspension, backup/deletion, keyboard
behavior, both themes and reduced motion. Axe supplements the measured contrast
checks; it does not replace human screen-reader or usability review.

Firefox has an independent Selenium suite covering actual redirects, native
permission recovery, event-page suspension, alarms, data management, both-theme
accessibility and the actual action popup. Firefox temporary installations do
not replace signed-installation/restart/update verification.

`npm run build` emits a deterministic ZIP per browser with a file manifest and SHA-256,
then verifies every decompressed byte. CI runs the same checks and tests the
unpacked package. Publishing and store dashboard changes are separate actions.

## Primary references

- [Chrome storage](https://developer.chrome.com/docs/extensions/reference/api/storage/)
- [Declarative Net Request](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)
- [Navigation lifecycle](https://developer.chrome.com/docs/extensions/reference/api/webNavigation)
- [Extension browser testing](https://playwright.dev/docs/chrome-extensions)
