# Firefox desktop release · 1.0.0

The Firefox candidate shares Focusaurus's features, design and local data model
with Chrome. It requires **Firefox 153 or newer**. Firefox ESR versions below
153 and Android have not been qualified. The manifest intentionally retains the
minimum that supplies `runtime.MessageSender.documentId`, which the background
uses to enforce a fresh pause for each blocked document.

## Build and temporary testing

Use Node 22+ (CI uses 24), Firefox 153+, and a clean dependency installation:

```sh
npm ci
npm run verify:firefox
```

Outputs:

- `dist/firefox/extension/`: unpacked Firefox build.
- `dist/focusaurus-firefox-1.0.0.zip`: unsigned Mozilla submission archive.
- Matching `.sha256` and `dist/firefox-package-manifest.json`: package inventory.
- `dist/privacy/`: standalone policy for the publisher's chosen HTTPS host.

For local testing, open `about:debugging#/runtime/this-firefox`, choose
**Load Temporary Add-on**, then select the unpacked `manifest.json` or the ZIP.
The temporary add-on disappears when Firefox closes. The Chrome manifest at
the repository root cannot be loaded directly into Firefox.

The test suite installs the actual packaged add-on into fresh Firefox profiles
with Selenium/GeckoDriver. Browser-parent automation terminates the event page
and accepts real permission prompts only within those test profiles. It does
not change signature enforcement or attach to the user's normal browser.

## Signing and distribution

A normal Firefox release needs **Mozilla signing**, including releases sent
directly to friends. The ZIP is an upload candidate, not a signed, persistently
installable XPI. See Mozilla's [signing and distribution guidance](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/).

1. Use the chosen publisher's Mozilla account and open the
   [Developer Hub submission flow](https://addons.mozilla.org/developers/addon/submit/distribution).
2. Choose a public Firefox Add-ons listing, or unlisted distribution for a
   signed pilot shared directly with friends. Unlisted does not waive review or
   signing. Decide the public listing/support identity before public promotion.
3. Upload `dist/focusaurus-firefox-1.0.0.zip`. Keep the stable add-on ID
   `focusaurus@itsmattguenther` for all subsequent versions. It is an identifier,
   not a support email address. Increment the version for future submissions.
4. Supply listing details, support contact, license selection and the hosted
   privacy policy. Review every data declaration against the actual policy.
   No publisher account or support address is invented in this repository.
5. Download the signed XPI and verify installation, first session, website
   permissions, Firefox restart and update behavior in an ordinary profile
   before sending it to the pilot group. Keep the signed artifact and source
   revision together. GitHub's unsigned ZIP does not replace this step.

This source uses plain, readable ES modules, HTML and CSS. Packaging copies
runtime files and generates the target manifest; it does not minify or transpile
JavaScript. If Mozilla requests build sources, provide this revision, the lockfile,
Node version and `npm ci && npm run build:firefox` instructions. Do not include
credentials or a signing key in source archives or GitHub.

## Listing copy

**Name:** Focusaurus

**Summary:** A little room to focus. Block distracting sites, set work hours,
and find your way back with Doug, your dinosaur companion.

Use the feature descriptions in [the Chrome submission kit](STORE-LISTING.md),
with these Firefox-specific substitutions:

- Firefox desktop 153+ instead of Chrome 140+.
- Settings and history stay in this Firefox profile.
- Firefox controls website access and private-window access. “Allow website
  access” opens Firefox's permission prompt if access is missing.
- Internal Firefox pages, restricted browser-managed domains and local files
  are outside the blocker's effective scope. Browser policy may limit access.

Use genuine product screenshots from this Firefox build for the Firefox listing;
local review captures are generated under `docs/review/firefox/`. Existing Doug
icons and promotional art are shared. No Firefox store screenshots have been
uploaded or approved.

## Permissions and privacy declarations

The Firefox manifest uses the same HTTP/HTTPS host grants and permissions as
Chrome: `declarativeNetRequestWithHostAccess`, `webNavigation`, `storage`, `alarms`.
No new permission is added. Justifications in the Chrome submission kit apply
with Firefox as the browser executing the rules.

`browser_specific_settings.gecko.data_collection_permissions.required` is
`["none"]`: the extension sends no user data to the publisher or any third-party
service. Local processing of configured URLs and seven-day counts is described
in the bundled privacy policy. Original destinations remain visible in blocked
page addresses and may enter the browser's own history/sync. Do not describe the
extension as avoiding all local data processing.

## Tooling advisory

The extension has **no runtime dependencies**. As of September 13, npm reports
three high-severity dependency entries in the development-only Mozilla lint
chain (`web-ext` → `addons-linter` → `image-size` 2.0.2). The underlying advisories
[GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) and
[GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) concern
crafted image files causing parser loops. No patched `image-size` release was
available during this preparation. The pinned official linter scans this
repository's known artwork; none of these packages enters the extension ZIP.
Update the toolchain when a patched compatible release is available. A clean
Mozilla lint result is not a clean npm audit result.
