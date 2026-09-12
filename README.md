# Focusaurus

**A little room to focus.** A private Chrome extension with Doug, your quietly
persistent dinosaur companion.

Focusaurus pauses distracting sites during focus sessions, helps you notice
the habit of reaching for them, and gives you a gentle way back to your work.

**Status:** 1.0.0 release candidate. Chrome Web Store submission materials are
prepared locally. No store upload or publication has been performed.
See [release readiness](docs/RELEASE-READINESS.md) for verification and human gates.

![Focusaurus](docs/store-assets/promo-marquee.png)

## What ships

- 25 / 50 / 90 minute and genuinely open-ended focus sessions, with a toolbar countdown.
- Domain, subdomain and path blocking; matching open tabs pause too. In-page
  history route changes are covered without injecting content scripts.
- Six optional category packs and a custom list of up to 300 sites.
- A full-page illustrated Doug, rotating supportive copy, a live session clock,
  and temporary passes after a 5 or 15 second pause. Locked mode removes passes.
- Local work-hour schedules, including overnight windows. A manual stop is
  respected for the rest of the current window.
- Seven-day attempt history with matching retention and a clear-history control.
- Site-access checks before starting, with visible recovery instructions if access changes.
- Welcome/setup page, settings import/export, custom dinosaur name, and
  system/daylight/lamplight appearance.
- Local settings and history, bundled art/fonts, no account or analytics.

Daily browsing budgets, time tracking, streak rewards and Firefox are deferred.
Focusaurus is voluntary: it does not restrict other browsers or desktop apps.
Chrome controls extension site access and incognito access. Internal browser
pages and local files are outside the blocker’s scope.

## Try the release candidate

Requires Chrome/Chromium **140 or newer**.

1. Open `chrome://extensions` and enable Developer mode.
2. Choose **Load unpacked**, then select this repository or `dist/extension`
   after running the build.
3. Pick a category or add a site on the welcome page, then start your first session.
4. Pin Focusaurus from Chrome’s Extensions menu to keep the timer close.

For an existing unpacked installation, use **Reload** on its extension card.
Existing prototype settings migrate from Chrome sync to local storage once;
the old Focusaurus sync keys are removed only after the local write succeeds.

## Develop and verify

Node 20+ is required; Node 24 is used for release verification. The extension
has no runtime dependencies. Pinned development tools supply browser testing,
accessibility checks, icon generation and ZIP creation.

```sh
npm ci
npx playwright install chromium
npm run verify       # static checks, unit tests, real extension browser tests, build
npm run icons        # toolbar/store PNGs rescaled from happy Doug
npm run doug         # all seven illustrations at different sizes/in both themes
npm run review       # local screenshots of every application surface
npm run store-art    # actual product screenshots and promotional tiles
```

On Linux with Chromium already installed, use isolated profiles with your own binary:

```sh
FOCUSAURUS_CHROMIUM_PATH=/usr/bin/chromium npm run verify
FOCUSAURUS_CHROMIUM_PATH=/usr/bin/chromium FOCUSAURUS_EXTENSION_PATH=dist/extension npm run test:browser
FOCUSAURUS_CHROMIUM_PATH=/usr/bin/chromium npm run review
```

The override also works for icon and store-art generation. It never uses your
normal browser profile. Omit it to use Playwright's downloaded Chromium.
Chrome 140 is the minimum because local storage access is restricted with
`storage.local.setAccessLevel`; the installed Chromium version is recorded in
release readiness. Browser tests do not establish compatibility with Brave or Firefox.

On Linux CI, install the browser with `npx playwright install --with-deps chromium`.
Browser tests use a separate temporary Chromium profile; they do not modify your
normal Chrome profile. Set `FOCUSAURUS_EXTENSION_PATH=dist/extension` to run the
same tests against the package contents.

The build produces `dist/focusaurus-1.0.0.zip`, its SHA-256 checksum, an explicit
package manifest, an unpacked extension, and a public-ready privacy page. The
ZIP includes only `manifest.json`, `src/` and `assets/`. Sources, tests, developer
tools and store artwork are excluded.

## Architecture and art

The Manifest V3 worker serializes mutations. Persistent settings, sessions and
usage live in Chrome local storage; transient per-document override pauses
live in session storage. Pure modules own matching, rules, schedules, session
math, moods and history. UI pages use a shared message/error/theme layer.

Doug is now an original gouache and colored-pencil character with seven matched
expressions. An SVG wrapper sizes the bundled WebP art and supplies accessible
labels. Toolbar and store icons rescale the same happy Doug illustration.
The paper/moss/clay palette, local Fraunces and Public Sans, and reduced-motion
behavior form one visual system. [Art direction and generation prompts](docs/ART-DIRECTION.md).

## Project documents

- [Product scope and principles](docs/PRODUCT.md)
- [Architecture and state contracts](docs/DESIGN.md)
- [Release audit, evidence and remaining checks](docs/RELEASE-READINESS.md)
- [Chrome Web Store submission kit](docs/STORE-LISTING.md)
- [Follow-up roadmap](docs/ROADMAP.md)
- [Privacy policy source](src/privacy/privacy.html)

The older `Focusaurus.webp` at the repository root is an unused prototype asset
retained as project history; it is excluded from the release.
