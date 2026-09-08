# Chrome Web Store submission kit

Product: **Focusaurus** · version **1.0.0** · category **Productivity** · language **English**.

## Short description

Make room for focus. Block distracting sites, set work hours, and find your way back with Doug, your dinosaur companion.

## Detailed description

A little less scrolling. A little more you.

Focusaurus gives your attention some breathing room. Choose the sites that pull
you away, start a focus session, and let Doug hold your place. When you reach
for a blocked site, a warm illustrated dinosaur offers a moment to pause and
return to what matters.

• Focus for 25, 50, or 90 minutes, or keep an open-ended session running.
• Start quickly with six optional category packs, then make the list your own.
• Block a whole domain or a particular path, such as youtube.com/shorts.
• Pause matching tabs that are already open and catch in-page route changes.
• Set work hours, including overnight schedules. Ending a session manually
  pauses the schedule until the next work window.
• Choose a 5-second or 15-second pause before a temporary pass, or turn passes
  off with Locked mode. You can always end a session from the popup.
• Notice your habits with seven days of blocked-attempt counts.
• Make Doug your own with a name and daylight or lamplight appearance.

Private by design: no account, no analytics, no advertising, and no automatic
settings sync. Settings and history stay in your Chrome profile. Export your
settings or clear your history whenever you like. Code, fonts, and artwork are
bundled with the extension.

Focusaurus is a voluntary focus companion for Chrome. It does not block other
browsers or desktop apps, and it does not measure browsing time or provide
daily time budgets. It applies to HTTP and HTTPS sites; internal Chrome pages
and local files are outside its scope. Schedule and timer updates may be delayed
while your device sleeps. Chrome controls website access and incognito access.

## Single purpose

Help users focus by pausing self-selected distracting websites during manual
or scheduled focus sessions, with local attempt history and a dinosaur companion.

## Permission justifications

| Permission | Justification |
| --- | --- |
| declarativeNetRequestWithHostAccess | Redirect top-level navigations to sites chosen by the user during sessions, and allow temporary user-requested passes. Rules run in Chrome without reading request bodies. |
| http://*/* and https://*/* | The user can choose any HTTP/HTTPS site or path. Host access is required for redirects and checking matching open tabs. No content scripts are injected and page contents are not read. |
| webNavigation | Detect history-state route changes inside sites that navigate without a page reload, so path blocks still work. Only the main frame is handled; navigation events are not stored as a browsing log. |
| storage | Save settings, current session, temporary passes and bounded attempt history locally; read and remove legacy synced settings during migration. |
| alarms | End timed sessions, expire temporary passes, update the toolbar countdown, apply work hours, and prune old history. |

Remote code: **none**. Remote fonts/assets: **none**. Third-party runtime SDKs: **none**.
Review the dashboard’s exact data declarations against the bundled privacy
policy: addresses are processed locally for blocking, local history contains
site-level counts and session timestamps, and original targets are visible in
blocked-page addresses (and may therefore enter Chrome’s own history/sync).

## Files

- Upload archive: `dist/focusaurus-1.0.0.zip` (manifest at the root).
- Checksum and contents: `dist/focusaurus-1.0.0.zip.sha256`, `dist/package-manifest.json`.
- Store icon: `docs/store-assets/store-icon-128.png`.
- Small promo tile: `docs/store-assets/promo-small.png` (440 × 280).
- Optional marquee: `docs/store-assets/promo-marquee.png` (1400 × 560).
- Three actual product screenshots: `docs/store-assets/screenshot-*.png` (1280 × 800).
- Publishable privacy page and bundled fonts: the entire `dist/privacy/` folder.

Regenerate assets with `npm run store-art`; regenerate the archive and privacy
page with `npm run build`.

## Publisher-owned submission steps

- [ ] Confirm the developer account/publisher display name and public support email.
- [ ] Host `dist/privacy/` at the publisher’s chosen publicly accessible HTTPS URL.
- [ ] Enter that exact privacy URL and publisher contact in the dashboard.
- [ ] Review the final product/art and run the manual checks in RELEASE-READINESS.md.
- [ ] Upload archive and images; verify the permission and data-use declarations.
- [ ] Submit for Chrome Web Store review. Store approval and publication are external steps.

Nothing has been uploaded or published by the release-preparation scripts.

## Official requirements consulted

- [Listing images and dimensions](https://developer.chrome.com/docs/webstore/images)
- [User data disclosures and privacy policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Chrome Web Store policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
