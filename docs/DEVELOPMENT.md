# Developing Focusaurus

Node 22+ is required; Node 24 is used for release verification. The extension
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
release readiness. Firefox has its own Selenium/GeckoDriver integration suite;
Use the same binary override for Brave when repeating its checks:
`FOCUSAURUS_CHROMIUM_PATH=/usr/bin/brave FOCUSAURUS_EXTENSION_PATH=dist/extension npm run test:browser`.

On Linux CI, install the browser with `npx playwright install --with-deps chromium`.
Browser tests use a separate temporary Chromium profile; they do not modify your
normal Chrome profile. Set `FOCUSAURUS_EXTENSION_PATH=dist/extension` to run the
same tests against the package contents.

For Firefox, install Firefox 153+ and run:

```sh
npm run verify:firefox    # Firefox package, Mozilla lint, real Firefox integration tests
```

Selenium Manager obtains GeckoDriver if needed. Optional binary overrides are
`FOCUSAURUS_FIREFOX_PATH` and `FOCUSAURUS_GECKODRIVER_PATH`. Tests use fresh
profiles and privileged browser automation only inside those profiles, never
your everyday browser. `FOCUSAURUS_FIREFOX_EXTENSION_PATH` selects another build.

`npm run build` produces both `dist/focusaurus-1.0.0.zip` and
`dist/focusaurus-firefox-1.0.0.zip`, checksums, explicit package manifests,
unpacked extensions, and a public-ready privacy page. Use `build:chrome` or
`build:firefox` to build one target. Each ZIP includes only `manifest.json`, `src/` and `assets/`. Non-runtime documentation, tests, developer tools and store artwork are excluded.

## Project references

- [Architecture and state contracts](DESIGN.md)
- [Product scope](PRODUCT.md)
- [Art direction and source assets](ART-DIRECTION.md)
- [Release evidence and manual checks](RELEASE-READINESS.md)
- [Chrome submission copy and images](STORE-LISTING.md)
- [Firefox packaging and signing](FIREFOX-RELEASE.md)
- [Roadmap](ROADMAP.md)

Firefox development builds are temporary add-ons. Build with `npm run build:firefox`,
then open `about:debugging#/runtime/this-firefox` and load
`dist/firefox/extension/manifest.json`. Requires Firefox desktop 153+.
The temporary installation ends when Firefox closes; a normal install requires
Mozilla signing. Firefox ESR below 153 and Android are not qualified.
