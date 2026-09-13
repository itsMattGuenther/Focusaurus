# Focusaurus 1.0.0 release readiness

**Decision: release candidate prepared for publisher review.** Code, art,
privacy page, submission kit and production archive are ready locally. This is
not a claim of Chrome Web Store approval or publication. Publisher identity,
support contact and domain remain undecided, as confirmed by the user.

Initially reviewed and prepared on **2026-09-08**. See the September 12
verification below for historical Chrome evidence and the Firefox follow-up for the current package. The user selected the first Chrome Web
Store release and warm illustrated field-guide art direction. Sessions,
schedules, blocking, temporary passes and attempt history are the release scope.
Daily time budgets, browsing-time tracking and streak rewards are deferred.

## Firefox follow-up · September 13, 2026

The user authorized the Firefox build and GitHub push after Chrome preparation.
Both browser candidates now share the product runtime, with browser-specific
manifests generated at build time. No store submission, signing or hosting has
been performed. See [Firefox release and signing](FIREFOX-RELEASE.md) for the
concrete submission steps and artifact paths.

- Firefox uses a Manifest V3 nonpersistent module event page; Chrome retains its
  service worker. Native Promise APIs require no runtime polyfill.
- Sender validation binds the public extension ID and actual extension origin
  separately. Firefox's URL host is a per-profile UUID. Minimum Firefox **153**
  retains `MessageSender.documentId` and the per-document pause security check.
- The website-access recovery button opens Firefox's native permission prompt.
  Revocation prevents misleading starts; restoring access pauses matching tabs.
- Doug's renderer creates SVG DOM nodes instead of inserting an HTML string.
  Mozilla's package validator reports zero errors, notices or warnings.
- Firefox's real toolbar popup exposed a 746px window around 420px content.
  Explicit body and root widths fix it at 420px while preserving Chrome sizing.
- Privacy policy 1.2 describes both browsers and seven-day local retention.
  The Firefox manifest declares no data collection/transmission. Its stable
  add-on ID is `focusaurus@itsmattguenther`.
- Node 22+ is now required by the Firefox test toolchain; CI uses Node 24.
  CI separately exercises Firefox minimum 153 and latest, with browser-specific
  package artifacts. Pinned development dependencies remain outside both ZIPs.

Local verification: Omarchy/Arch Linux, Node **26.8.1**, Chromium
**152.0.7977.82**, Firefox **155.0.1**, Brave **153.1.95.101**. Static checks and **197 unit tests** pass.
The **21 Chromium browser tests** pass against source and package, and the same
**21 tests pass in Brave** against the Chrome package. Firefox's
**9 package integration tests** cover category packs, concurrent writes, real
redirects, query preservation, temporary passes, Locked mode, open tabs, SPA
routes, event-page suspension, alarm recovery, native permission prompts,
unattended expiry, schedules, backups, seven-day retention, history deletion,
all five surfaces in both themes, reduced motion, narrow reflow, and actual
420px toolbar sizing. Local screenshots under `docs/review/firefox/` were inspected.

Firefox tests use temporary add-on installation. Persistent signed installation,
a full Firefox restart, upgrades, OS sleep/wake, human screen-reader use and
private-window/browser-policy combinations remain pilot checks. Browser-managed
restricted sites are outside effective blocking coverage. Firefox ESR below 153
and Android are not qualified.

Both ZIPs contain **49 runtime files** and are checked byte-for-byte after
compression; matching inventories and checksums are generated in `dist/`.
The Chrome ZIP is **775,159 bytes** and Firefox ZIP **775,241 bytes**. Their only
content difference is the generated manifest. Repeated builds produce the same
checksums. Brave needs no separate build or store submission; normal store
installation/update checks remain part of the pilot.
The official Mozilla linter's development-only dependency chain has unresolved
npm advisories; see the explicit [tooling advisory](FIREFOX-RELEASE.md#tooling-advisory).
This does not affect packaged runtime dependencies (there are none).

The Chrome follow-up and earlier Windows evidence below describe older candidates;
their file sizes, test counts and statements about not having run Firefox are
historical, not current restrictions.

## Chrome follow-up · September 12, 2026

The user requested Chrome completion on Omarchy, with a check-in before Brave
and another before Firefox. Publisher/account tasks are planned for Monday,
September 14; no store submission or privacy hosting has occurred.

Changes in this candidate:

- Chrome minimum raised from 120 to 140 to match the local-storage access API.
  Chromium 120's implementation restricts `setAccessLevel` to session storage;
  current compatibility data lists all storage areas from 140. References:
  [Chromium 120 source](https://raw.githubusercontent.com/chromium/chromium/120.0.6099.109/extensions/browser/api/storage/storage_api.cc)
  and [storage compatibility](https://raw.githubusercontent.com/mdn/browser-compat-data/main/webextensions/api/storage.json).
- Effective website access is checked before manual and scheduled starts.
  Setup, popup and settings explain missing access and link to the extension's
  browser details. An active session keeps its deadline while a toolbar `!`
  and popup warning identify incomplete blocking. Restoring access also pauses
  matching tabs that were already open. No new manifest permissions were added.
- History now keeps today and the previous six local calendar days. Legacy
  older buckets are removed on recovery, control-page reads and maintenance;
  current settings and active sessions survive cleanup. Privacy policy 1.1,
  effective September 12, and listing copy describe the shorter retention.
- Locked mode is retained. Its existing visible settings/blocked-page explanation
  is now also shown in the active popup: no temporary passes, with session ending
  still available. A hover is not required to discover this distinction.
- Test and visual tools accept `FOCUSAURUS_CHROMIUM_PATH`, so installed Chromium
  can be used on Linux without a downloaded Playwright browser. Every run uses
  an isolated profile. The standard CI/browser-download path is preserved.

Current local environment: Omarchy/Arch Linux, Node **26.8.1**, npm **11.19.0**,
installed Chromium **152.0.7977.82**, Playwright **1.63.0**.

| Current check | Result |
| --- | --- |
| Runtime static checks | Pass. |
| Unit tests | **194 passed**; individual cases confirmed with Node's TAP reporter and `--test-isolation=none`. |
| Browser suite against source | **21 passed** using installed Chromium. |
| Browser suite against `dist/extension` | **21 passed** using installed Chromium. |
| Site-access integration | Real browser `On click`/`On all sites` changes; denied manual/scheduled starts, active-session warning, working details button, and restoration of open-tab blocking. |
| Access-check failure | Simulated browser API failure remains visible and prevents a false start; recovery restores the controls. |
| Retention migration | 90 seeded daily buckets shrink to exactly the displayed seven; settings and active session remain intact. |
| Accessibility | Existing full-surface checks plus limited-access control pages in both themes, with reduced motion and 360px reflow (420px popup). |
| Visual review | Refreshed `docs/review/` captures; inspected Locked mode and site-access popup states in the existing visual system. |
| Production archive | **48 runtime files**, **774,171 bytes**; build verifies all decompressed bytes. SHA-256 is recorded beside the ZIP. |

This is Chromium validation of the Chrome extension. Branded Google Chrome,
Brave and Firefox have not been independently run in this follow-up. Actual OS
sleep/wake, human screen-reader use, and incognito/site-policy combinations
remain manual checks; automated lifecycle tests cover expiry and browser restart.
CI has not been run remotely for these uncommitted changes. The earlier Windows
results below are historical evidence, not additional runs on the current package.

## Inheritance audit and resolution

The starting revision passed 189 pure-logic tests but had no browser test harness
or distribution checks. These were the material release findings:

| Priority | Finding | Delivered resolution |
| --- | --- | --- |
| P0 | Combined category packs exceed Chrome sync's 8 KB per-item quota. Sequential pack writes can partially apply. | Schema 2 local settings, write-before-remove legacy migration, batched pack writes, 300-site cap. All six packs tested together. |
| P0 | Concurrent worker events race through read/modify/write operations. | One serial mutation queue for messages and lifecycle events; concurrent add/deduplication regressions. |
| P0 | Override pause lives only in UI; interstitial trusts arbitrary actions/context. | Worker validates sender page, document, site and destination; enforces stored deadlines. Blocked pages cannot configure settings or end sessions. |
| P0 | Stale alarms and startup leave incorrect session enforcement. | Timestamp-based recovery, restored alarms, current-session checks and atomic rule reconciliation. Unattended expiry, stale alarms, worker suspension and browser restart covered. |
| P1 | Previously open sites and in-page route changes escape blocking. | Pause matching open tabs and handle main-frame history-state navigation, respecting passes. Automatic pauses do not inflate attempt counts. |
| P1 | UI reports success after errors or strands disabled controls. | Shared error handling and recoverable controls; browser failure injection verifies visible error and no false Saved indication. |
| P1 | Locked interstitial cannot continue after a session ends. | Live released state and working continuation. Actual redirect, query parameters, pause and temporary onward navigation covered. |
| P1 | Empty blocklist starts a misleading session. | First-use setup, category selection and worker/UI start guard. |
| P1 | Imports accept unrelated JSON, unsafe/duplicate IDs and unsupported budget modes. | Envelope/size/version checks, repaired IDs, explicit conversion warnings and replacement confirmation. Invalid imports preserve settings. |
| P1 | Long paths exceed Chrome's compiled-regex memory limit. | Chrome validates custom/imported patterns before saving, including while idle. Rejected imports preserve the working list. |
| P1 | Open-ended sessions expire after 12 hours; paths mishandle ports and normalization. | Null-deadline manual sessions, explicit schedule deadlines, canonical URL matching and path-boundary tests. |
| P1 | Duration selection, keyboard focus, narrow layouts and motion need verification. | Accessible selection/status, focus restoration, both-theme Axe checks, 360px reflow and reduced motion. |
| P1 | Dinosaur/icons lack a coherent, finished identity. | Seven original illustrated Doug states, transparent WebP assets and 16/32/48/128px icons rescaled from happy Doug, refreshed surfaces and store artwork. |
| P1 | The real toolbar window collapses because its width is capped by its initial viewport. | Explicit 420px root width, normal word wrapping and a regression exercising Chrome's actual action popup in both themes. |
| P1 | Local-data claim conflicts with sync; no policy or history deletion. | Local settings, accurate bundled/public-ready policy, seven-day maintenance and clear-history control preserving the session/settings. |
| P1 | No release package, browser harness, CI or submission materials. | Pinned tools, package allowlist/byte verification/checksum, browser suite, configured GitHub workflow, listing copy/images and complete font licenses. |
| P2 | Historical docs promise unsupported features and contain stale assumptions. | Rewritten product scope, architecture, art provenance, roadmap and store materials. |

No known unresolved P0/P1 implementation finding from this audit remains.
That assessment is bounded by the verification below; human launch checks are
still required. Product retention and companion usefulness have not yet been
validated with a pilot cohort.

## Historical verification · September 8

Local environment: Windows, Node **24.14.0**, npm **11.9.0**, Playwright **1.63.0**,
Chromium **153.0.8010.12**, Axe Playwright **4.13.0**. Isolated test profiles were
used; the user's normal browser profile was not modified.

| Check | Result |
| --- | --- |
| `npm run check` | Pass: runtime syntax, local references, version alignment, required assets and static remote-code/CSP checks. |
| `npm test` | **194 passed**, no failures or skips. Matching, rules, redirects, schedules, sessions, settings, history, moods, contrast, art and queue behavior. |
| `npm run test:browser` | **18 passed**, including actual toolbar sizing, full browser restart and delayed-action keyboard focus restoration. |
| `FOCUSAURUS_EXTENSION_PATH=dist/extension npm run test:browser` | **18 passed** against production package contents. |
| Accessibility subset | Zero Axe WCAG 2/2.1 A/AA violations across popup, welcome, settings, blocked and privacy pages in both themes. Full-tab pages reflow at 360px; the toolbar keeps its 420px content width. Reduced motion is checked on both. Automated coverage is not accessibility certification. |
| Visual review | Reviewed illustrated mood assets, actual light/dark screens, narrow settings, toolbar mark and store graphics. ART-DIRECTION.md records sources and prompts. |
| `npm run build` | Pass: 47 runtime files, allowlisted contents, each decompressed byte checked; ZIP and SHA-256 generated. |
| Artifact repeatability | A second build produced the same archive checksum. The current archive size/contents are in `package-manifest.json`; its hash is in the adjacent `.sha256` file. |
| Standalone privacy page | Loaded successfully in Chromium with no missing resources or links back into the extension. |
| Dependency audit | `npm audit`: zero reported vulnerabilities at verification time. No third-party runtime dependencies. |
| CI | GitHub Actions runs checks and source/package browser suites on Linux. Current results are in [Release checks](https://github.com/matthewguenther/Focusaurus/actions/workflows/release-checks.yml); merging waits for successful checks. |

Browser coverage includes fresh setup/all packs, concurrent writes, actual DNR
redirects/onward navigation, worker-enforced pauses, locked release and message
permissions, migration, import/export, unattended expiry, stale alarms, schedule
edits/manual suppression, oversized patterns, write-failure UI, worker recovery,
confirmed history deletion, keyboard interaction, accessibility/reflow, open
tabs/SPA routes and full browser restart persistence.

## Prepared deliverables

- `dist/focusaurus-1.0.0.zip`: Chrome upload candidate, manifest at archive root.
- `dist/extension/`: unpacked production files for final manual testing.
- `dist/focusaurus-1.0.0.zip.sha256` and `dist/package-manifest.json`: checksum,
  size and exact contents. Regenerate together with `npm run build` after edits.
- `dist/privacy/`: standalone privacy page and fonts for an HTTPS host.
- `docs/STORE-LISTING.md`: description, single purpose, permissions and checklist.
- `docs/store-assets/`: 128px store icon, 440×280 promo, 1400×560 marquee and three 1280×800 product screenshots.
- `docs/ART-DIRECTION.md`, `assets/art/`, `dev/art-source/`: finished art,
  transparent PNG sources, prompts and authorized cleanup workflow. Original
  unprocessed generations are retained in Git history.

## Human gates before submission

These remain open for the publisher/release reviewer:

- [ ] Choose publisher name, public support email and a privacy-hosting URL (a custom domain is optional). Add the contact
  to the listing and, if desired, directly to the privacy policy.
- [ ] Register the publisher account, pay the fee, verify its contact email,
  enable two-step verification, and complete the applicable trader declaration.
- [ ] Host all of `dist/privacy/` at a public HTTPS URL; check it from a
  signed-out browser and enter that exact URL in the store dashboard.
- [ ] Install `dist/extension` in current stable Chrome in a separate profile.
  Inspect the real toolbar popup, icon and badge at normal/high-DPI scaling;
  pin it, start a session, visit a blocked site and try a temporary pass.
- [ ] Exercise device sleep/wake, browser exit past a session deadline and
  local time-zone/DST changes with work hours. Automated checks cover timestamp
  math and browser restart, not actual OS sleep or every locale.
- [ ] Check Chrome's per-site access controls and incognito behavior against
  the stated limits. Confirm restricted access is clear in Chrome's controls.
- [ ] Perform a screen-reader/keyboard review (for example Orca on Linux or NVDA on Windows) of setup, popup, settings dialogs and
  blocked page. Confirm Doug's final art and copy with a human reviewer.
- [ ] Review the dashboard's current permissions/data declarations against the
  policy, upload the archive/images and submit for Chrome Web Store review.

Store acceptance and publication are external steps. No Chrome Web Store
submission, privacy-site deployment or message to a publisher contact was performed.

## Product follow-through

Start a small opt-in pilot after distribution is approved. Assess whether users
can configure a first session unaided, understand passes, trust work hours and
find Doug supportive. Use volunteered feedback; there is no telemetry in this
release. Follow-up work and feature gates live in [ROADMAP.md](ROADMAP.md).

## Primary release references

- [Chrome storage quotas and access](https://developer.chrome.com/docs/extensions/reference/api/storage/)
- [Declarative Net Request limits](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)
- [Playwright extension testing](https://playwright.dev/docs/chrome-extensions)
- [Chrome Web Store images](https://developer.chrome.com/docs/webstore/images)
- [Chrome Web Store user data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
