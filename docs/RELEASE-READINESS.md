# Focusaurus 1.0.0 release readiness

**Decision: release candidate prepared for publisher review.** Code, art,
privacy page, submission kit and production archive are ready locally. This is
not a claim of Chrome Web Store approval or publication. Publisher identity,
support contact and domain remain undecided, as confirmed by the user.

Reviewed and prepared on **2026-09-08**. The user selected the first Chrome Web
Store release and warm illustrated field-guide art direction. Sessions,
schedules, blocking, temporary passes and attempt history are the release scope.
Daily time budgets, browsing-time tracking, streak rewards and Firefox are deferred.

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
| P1 | Dinosaur/icons lack a coherent, finished identity. | Seven original illustrated Doug states, transparent WebP assets, new profile mark and 16/32/48/128px icons, refreshed surfaces and store artwork. |
| P1 | Local-data claim conflicts with sync; no policy or history deletion. | Local settings, accurate bundled/public-ready policy, 90-day maintenance and clear-history control preserving the session/settings. |
| P1 | No release package, browser harness, CI or submission materials. | Pinned tools, package allowlist/byte verification/checksum, browser suite, configured GitHub workflow, listing copy/images and complete font licenses. |
| P2 | Historical docs promise unsupported features and contain stale assumptions. | Rewritten product scope, architecture, art provenance, roadmap and store materials. |

No known unresolved P0/P1 implementation finding from this audit remains.
That assessment is bounded by the verification below; human launch checks are
still required. Product retention and companion usefulness have not yet been
validated with a pilot cohort.

## Verification evidence

Local environment: Windows, Node **24.14.0**, npm **11.9.0**, Playwright **1.63.0**,
Chromium **153.0.8010.12**, Axe Playwright **4.13.0**. Isolated test profiles were
used; the user's normal browser profile was not modified.

| Check | Result |
| --- | --- |
| `npm run check` | Pass: runtime syntax, local references, version alignment, required assets and static remote-code/CSP checks. |
| `npm test` | **194 passed**, no failures or skips. Matching, rules, redirects, schedules, sessions, settings, history, moods, contrast, art and queue behavior. |
| `npm run test:browser` | **17 passed**, including full browser restart and delayed-action keyboard focus restoration. |
| `FOCUSAURUS_EXTENSION_PATH=dist/extension npm run test:browser` | **17 passed** against production package contents. |
| Accessibility subset | Zero Axe WCAG 2/2.1 A/AA violations across popup, welcome, settings, blocked and privacy pages in both themes. Measured 360px reflow and reduced motion. Automated coverage is not accessibility certification. |
| Visual review | Reviewed illustrated mood assets, actual light/dark screens, narrow settings, toolbar mark and store graphics. ART-DIRECTION.md records sources and prompts. |
| `npm run build` | Pass: 48 runtime files, allowlisted contents, each decompressed byte checked; ZIP and SHA-256 generated. |
| Artifact repeatability | A second build produced the same archive checksum. The current archive size/contents are in `package-manifest.json`; its hash is in the adjacent `.sha256` file. |
| Standalone privacy page | Loaded successfully in Chromium with no missing resources or links back into the extension. |
| Dependency audit | `npm audit`: zero reported vulnerabilities at verification time. No third-party runtime dependencies. |
| CI | GitHub Actions runs checks and source/package browser suites on Linux. Current results are attached to [release PR #3](https://github.com/matthewguenther/Focusaurus/pull/3); merging waits for successful checks. |

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
  preserved generation originals, prompts and authorized cleanup workflow.

## Human gates before submission

These remain open for the publisher/release reviewer:

- [ ] Choose publisher name, public support email and domain. Add the contact
  to the listing and, if desired, directly to the privacy policy.
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
- [ ] Perform an NVDA/keyboard review of setup, popup, settings dialogs and
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
