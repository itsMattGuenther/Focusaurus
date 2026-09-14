# Publish Focusaurus on the Chrome Web Store

This checklist is for the first **Chrome** release of Focusaurus 1.0.0.
Brave and standard Chromium use the same store release. Firefox publication
is a separate task.

You can prepare and submit the extension today. Google must review it before
it becomes installable from the store; approval today is not guaranteed.

## 1. Choose the account and public identity

Use the Google account that should own Focusaurus long term. Choose your
publisher display name and a support/contact email you are comfortable using.
A project email can keep support separate from personal mail.

Enable Google **2-Step Verification**. Sign in to the
[Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole),
accept the developer agreement, and pay the one-time **US$5 registration fee**
if you have not registered already. Check the amount shown at checkout.
Verify the contact email using Google's verification message.

[Account registration](https://developer.chrome.com/docs/webstore/register),
[account setup](https://developer.chrome.com/docs/webstore/set-up-account),
and Google's [current fee reference](https://developer.chrome.com/docs/extensions/whats-new).

## 2. Complete the publisher declarations

Complete the dashboard's trader/non-trader declaration and any identity or
contact verification it requests. Make the declaration that matches your
actual circumstances; a free extension is not automatically a non-trader.
Review which details the dashboard says it will show publicly.

[Google's trader verification FAQ](https://developer.chrome.com/docs/webstore/program-policies/trader-verification-faq).

## 3. Check the privacy and support links

Once this repository is public, its readable policy is available at:

`https://github.com/itsMattGuenther/Focusaurus/blob/main/PRIVACY.md`

Open that link in a signed-out/private browser window and confirm the complete
policy is readable without a login. You can use it as the public HTTPS policy
URL; a custom website is not required to make this document publicly accessible.
Google makes the final decision on the submission. If you prefer your own site,
the build also produces the standalone policy in `dist/privacy/`.

Suggested homepage: `https://github.com/itsMattGuenther/Focusaurus`

Suggested support page: `https://github.com/itsMattGuenther/Focusaurus/issues`

The support page must be public before you put it in the listing. Keep public
reports free of personal URLs, settings exports, and credentials.

## 4. Use the Chrome upload ZIP

The release upload is **`dist/focusaurus-1.0.0.zip`**.

Do not upload GitHub's source download, the Firefox ZIP, or a ZIP of the entire
project folder. The upload ZIP already has `manifest.json` at its root and
contains the extension's runtime files.

To rebuild from the current main branch, use `npm ci && npm run build:chrome`.
The adjacent `.sha256` file and `dist/package-manifest.json` describe the build.
If a previous version has already been submitted, confirm the dashboard's
version requirements before reusing version 1.0.0.

## 5. Do one quick manual run

Load `dist/extension` using **Load unpacked** at `chrome://extensions`.
Choose a category, start a session, and visit a site you chose to block.
Check a temporary pass, Locked mode, ending a session, and reopening the browser.
Confirm that the popup, settings, and privacy information make sense to you.
If you keep a development copy installed later, disable it while testing the
store-installed copy so two blockers do not interfere.

## 6. Create the store item and upload

In the Developer Dashboard, choose **Add new item** (or **New item**), select
`dist/focusaurus-1.0.0.zip`, and upload it. Resolve any validation message before
continuing. Keep this item for later releases so users receive updates under
the same extension ID.

[Google's upload and publishing instructions](https://developer.chrome.com/docs/webstore/publish).

## 7. Fill in the listing

Use [STORE-LISTING.md](STORE-LISTING.md) for the ready-to-copy short description,
detailed description, and single-purpose statement. Choose English and the
appropriate productivity/tools category shown in the dashboard.

Upload these prepared images:

| Dashboard field | File |
| --- | --- |
| Store icon | `docs/store-assets/store-icon-128.png` (128 × 128) |
| Screenshots | All three `docs/store-assets/screenshot-*.png` files (1280 × 800) |
| Small promotional tile | `docs/store-assets/promo-small.png` (440 × 280) |
| Optional marquee tile | `docs/store-assets/promo-marquee.png` (1400 × 560) |

Add your homepage, support link, and contact details where requested. Review
how the listing looks, especially its screenshots and first few sentences.

[Image requirements](https://developer.chrome.com/docs/webstore/images).

## 8. Complete Privacy practices carefully

Copy the single-purpose statement and permission explanations from
[STORE-LISTING.md](STORE-LISTING.md). Select **No remote code** and supply the
privacy-policy URL from step 3.

Disclose the actual local processing: Focusaurus examines website addresses
to decide what to block and stores site-level blocked-attempt/pass counts and
session timestamps. It does not read page contents or send this information
to the publisher. The relevant dashboard categories include **Web history**
for addresses and **User activity** for local attempt/session records; map the
current wording to this behavior. Do not select a blanket "no user data"
answer merely because nothing leaves the device. Only select categories the
extension actually handles and confirm the limited-use certifications truthfully.

This guidance follows [Google's privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
and [local-data disclosure requirement](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).
The Firefox manifest's "none" transmission declaration does not substitute
for Chrome's disclosures.

## 9. Choose distribution for your pilot

**Recommended: Unlisted** for the first friends-and-family pilot. Anyone with
the Chrome Web Store link can install it after approval, but it will not appear
in normal store search. You can move the same item to Public when ready for
broader discovery; follow the dashboard's review flow for that change.

Choose **Public** now if you want it discoverable from the first approved
release. **Private** is for a restricted tester list and adds tester-account
management. Every option still requires Google's review. Making GitHub public
does not force your Chrome listing to be Public.

Select the regions where you intend to distribute it.

[Distribution options](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution).

## 10. Submit for review

Save every tab and resolve any incomplete-field warnings. Choose **Submit for
review**. If the dashboard offers automatic publication after approval, use
that for the unlisted pilot, or choose deferred publication if you want to
control the release moment yourself. Check the account's notification settings.

No Focusaurus login or test account is needed. If reviewer notes are available,
use the short test path: choose a category, start a 25-minute session, visit a
chosen site, then end the session from the popup. Explain that Locked mode
removes temporary passes but still lets the user end the session.

[Submission and deferred publication](https://developer.chrome.com/docs/webstore/publish),
[review status](https://developer.chrome.com/docs/webstore/check-review).

## 11. After approval

Install from the store link in a normal browser profile and verify the first
session. Replace the README's coming-soon message with that exact link, then
share it with your pilot group. Ask them about setup, unexpected blocking,
missed distractions, and how the experience feels.

For later updates, use the same store item, increment the extension version,
build a new Chrome ZIP, and submit that version. Keep signing material and any
future publishing credentials out of GitHub.
