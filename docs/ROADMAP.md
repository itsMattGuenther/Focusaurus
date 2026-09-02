# Focusaurus — Roadmap

Six phases to v1.0. Each is independently shippable and independently *useful* —
no phase is a refactor you can't feel. Each has an explicit exit criterion,
because "when it feels done" is how side projects stall at 80%.

Estimates assume evenings-and-weekends pace on a personal project.

---

## ✅ v0.1 · "Blocks" — shipped

**Goal was:** the existing prototype, correct.

- [x] Restructure to the `src/` layout in [DESIGN.md §3](DESIGN.md#3-file-layout)
- [x] `rules.js` as a pure function: settings → DNR rules. Unique IDs, anchored
      domain matching, `main_frame` only
- [x] Reconcile rules wholesale on startup, install, and every settings change
- [x] `block` → `redirect` at the interstitial (ADR-2, ADR-4)
- [x] Fix the popup toggle race (§1 #5); dedupe on add (§1 #7)
- [x] Drop the unused `webRequest` permission; add `alarms`
- [x] Focus sessions with a **duration** — 25 / 50 / 90 / open-ended, plus a
      countdown on the toolbar badge
- [x] Starter packs as onboarding chips
- [x] `test/` with node's built-in runner — 30 tests, named regression tests for
      each prototype bug
- [x] `.gitignore` the `.pem` and `.crx`

**Landed early, ahead of plan.** Design being equal-weight made it wasteful to
ship placeholder chrome and redo it later, so the following moved up from v0.2:

- [x] The full design token system — field-guide direction, light/dark, bundled
      variable fonts ([DESIGN.md §8](DESIGN.md#8-design-system))
- [x] Doug as inline SVG in all 7 moods, breathing and blinking (ADR-9) — which
      also removed the art commission from the critical path entirely
- [x] `mood.js`, complete, with the budget rules dormant until v0.4
- [x] The interstitial as a real designed page, not a placeholder
- [x] `copy.js` — rotating lines, tiered by attempt count (ADR-6)
- [x] Attempt counting per site per day
- [x] Override flow with the breathing-room delay and `strictness`

**Also found and fixed along the way:** `redirect` requires `host_permissions`,
unlike `block` — without it the rules match nothing and fail silently
([ADR-10](DESIGN.md#adr-10-declarativenetrequestwithhostaccess--explicit-host-permissions)).

**Exit criteria: ✅ verified in Chrome** on 2026-08-17. Blocking, path scoping,
anchoring, the override return path, sub-resource safety, and persistence across
a browser restart all behaved correctly. Dark mode confirmed good.

One bug found and fixed: the badge froze instead of counting down. One step
(#14, unattended session expiry) is still untested.

---

## v0.2 · "Doug, properly"

**Goal:** close the gap between "built" and "trustworthy," then find out whether
the thesis holds.

Much of the original v0.2 shipped in v0.1, so what's left is smaller and mostly
about finish:

- [x] **Doug's proportions.** Redrawn against the specimen plate in
      `Focusaurus.webp` and against the sizes he actually lives at (340px
      interstitial, 92px popup, 16px badge). Head dropped from `rx 32` to
      `rx 22` (~45% of body width instead of ~67%). Neck stroke 34 → 20 so it
      reads as a neck, not a third limb. Snout is a horizontal muzzle instead
      of a second egg. Brows sit on the face. Plates follow the spine and tuck
      under the body. Stubby T-rex arms added — that's the silhouette cue at
      popup size. Contract unchanged: `renderDoug(el, mood)`, seven mood ids,
      geometry confined to `doug.js` / `doug.css`.
- [x] **Real icons drawn from Doug's geometry.** `dev/build-icons.mjs`
      rasterizes the same SVG. 16px uses the head-and-shoulders crop
      (`ICON_VIEWBOX`) so he remains a dinosaur at toolbar size; 48 and 128
      keep the whole figure.
- [x] An options page: strictness, override length, schedule, dino name,
      settings export/import. Reachable from the popup's gear
- [x] **Schedule automation, pulled forward from v1.0.** Exposing a work-hours
      setting that only tinted Doug's mood would have been actively misleading,
      so the toggle now actually starts and stops sessions. Manually ending a
      scheduled session suppresses auto-start for the rest of the window
      ([ADR-11](DESIGN.md#adr-11-the-schedule-may-only-ever-stop-sessions-it-started))
- [x] Attempt history — "this week you reached for Reddit 40 times", reported
      neutrally. Trailing seven local days, folded from the existing `usage:*`
      buckets by `shared/history.js`. Popup names today's count and the week's
      leader; the settings page has the ranked list and a seven-day strip.
      Time spent is still v0.3; overrides stay in the data and wait for the
      weekly review.
- [x] Expand the copy pools — doubled every interstitial tier and the per-mood
      greetings. Covered by `test/copy.test.js` so they can't silently shrink.
- [x] Mood caption in the popup. The `because` string is always visible under
      Doug's line (`#moodBecause`) rather than a hover tooltip — the popup is
      the glance surface, and hover would hide the explanation on every
      touchscreen. Landed with the settings page.
- [x] **Contrast audit against both palettes.** `dev/contrast.js` parses the
      palettes out of `tokens.css` and measures every foreground/background
      pair the UI actually renders — 26 pairs, both themes — against WCAG 2.1.
      Ten rows failed, across five distinct problems. `--ink-faint` — the
      `.label` small-caps voice, and the most-used color in the app — was
      3.15:1 in light and 4.03:1 in dark. `--clay` on a sunk surface and on its
      own wash, and the label on a hovered primary button, all sat in the low
      fours. The count inside a partly-on pack chip was amber on amber wash at
      2.9:1. Fixed by nudging four light tokens and one dark one, and by making
      amber an accent rather than a text color.
      `npm run contrast` prints the table; `test/contrast.test.js` asserts it,
      so the palette can't drift back under AA
      ([DESIGN.md §8](DESIGN.md#8-design-system)).
      **Also found:** the two hand-duplicated dark blocks had diverged — the
      explicit `[data-theme='dark']` one was missing all three shadow
      overrides, so choosing dark on a light OS got warm light-mode shadows.
      Fixed, and the test now compares the blocks declaration by declaration.
- [ ] Accessibility pass on both surfaces: keyboard nav and focus order. The
      contrast half is done above; what's left is walking both surfaces on the
      keyboard alone, and the ARIA gaps that turned up while auditing —
      the session-length chips carry their selection in a class with no
      `aria-pressed` (the pack chips next to them do), and the add-site error
      is written into a `<p>` nothing announces

> ### ⚠️ The checkpoint that matters
>
> Ship v0.2, then **use it for two weeks and answer honestly: is it still
> enabled?** That's the thesis — a character makes people keep a blocker longer
> than a UI does — and you're the test subject. If Doug isn't carrying his
> weight, nothing later fixes it, and it's much better to learn that before
> building time tracking and budgets on top.

**Rough size:** 1–2 weekends.

---

## v0.3 · "Time" — visibility before enforcement

**Goal:** know where the time actually goes. Deliberately no budgets yet —
budgets built on inaccurate tracking are worse than no budgets, because they fire
wrongly and destroy trust in one shot.

- [ ] `tracker.js` — checkpoint accounting per ADR-5
- [ ] Idle + window-focus handling; focused-tab-only counting
      ([DESIGN.md §6](DESIGN.md#6-time-tracking-v03))
- [ ] Delta clamping for sleep/wake
- [ ] Per-domain daily totals in `storage.local`
- [ ] A "today" view: time per site, attempts per site
- [ ] 90-day pruning alarm

**Exit:** leave it running a full day, then sanity-check the numbers against your
own sense of the day. Sleep the laptop for an hour mid-session and confirm the
hour isn't counted. Totals must never exceed wall-clock time awake.

**Rough size:** 2 weekends. Mostly correctness work, and the edge cases (sleep,
crash, timezone, midnight rollover) are where the time goes.

---

## v0.4 · "Budgets" — the actual differentiator

**Goal:** the original v2 idea — *"only 15 minutes of Instagram today."* This is
what makes Focusaurus something you use in month three rather than week two.

- [ ] `mode: "budget"` sites with `budgetMinutes`
- [ ] Soft in-page warnings at 50% / 80% / 100% — a small Doug toast, not a wall
- [ ] Budget exhausted → the interstitial, for the rest of the day
- [ ] Mood rules 4 and 5 wired to real budget data
- [ ] `urlPrefix` matching so `youtube.com/shorts` can be budgeted separately
      from YouTube
- [ ] Budget rollover choice: strict daily reset vs. weekly pool

**Exit:** run a week with everything on budgets instead of hard blocks and
prefer it. If you revert to hard blocks, budgets are too fiddly — find out why
before moving on.

**Rough size:** 2 weekends.

---

## v0.5 · "Streaks" — earned reward

**Goal:** a reason to come back tomorrow. Carefully, because streaks are the most
common way gamification turns into anxiety.

- [ ] Streak tracking with the silent-reset rule
      ([DESIGN.md §5](DESIGN.md#the-recovery-rules-non-negotiable))
- [ ] Weekly review: time, attempts, overrides, budget adherence — reported
      neutrally, no grades
- [ ] Earned cosmetics: hats/accessories for Doug unlocked by milestones. Pure
      collection, zero mechanical effect
- [ ] Visible streak pressure capped at 7 days

**Exit:** breaking a 10-day streak feels like nothing much. If it stings, the
implementation is wrong — go back to the recovery rules.

**Rough size:** 1–2 weekends, plus cosmetic art.

---

## v1.0 · "Polish" — shippable to strangers

- [ ] Onboarding: install → configured → first session, under 60 seconds
- [x] ~~Schedule automation~~ — shipped early in v0.2
- [ ] Options page polish pass (it exists; onboarding flow still to come)
- [x] ~~Settings import/export as JSON~~ — shipped in v0.2, with a validating
      importer that repairs what it can and reports what it dropped
- [ ] Accessibility pass: keyboard nav, contrast, `prefers-reduced-motion`,
      alt text on every mood sprite
- [ ] Chrome Web Store listing — screenshots, privacy disclosure, a real icon
      set (current 16/48/128 are prototype placeholders)
- [ ] Firefox port. Firefox supports MV3 and `declarativeNetRequest`, but with
      differences — budget real time for it, don't assume a manifest tweak
- [ ] `CONTRIBUTING.md` + a license

**Exit:** someone who has never seen it installs it and completes a focus session
without asking you a question.

---

## The anti-roadmap

Things that will feel tempting and should be declined, with the reason recorded
so the argument doesn't get re-litigated at 1am:

| Not building | Why |
| --- | --- |
| **Accounts / cloud sync** | Needs a backend, a privacy policy, and auth support. Kills the "all data local" promise, which is a genuine differentiator. `storage.sync` covers settings across your own machines for free. |
| **Leaderboards / social / friends** | Turns focus into performance. Also demands the backend above. |
| **An AI coach** | FocusMe has one. It's a bullet point, not a reason anyone stays. Doug's mood *is* the coach, and it costs nothing to run. |
| **Ads or a crippled free tier** | The exact thing that dropped BlockSite to 3.8★. |
| **Hosts-file / DNS enforcement** | Admin privileges, antivirus false positives, and enforcement is the axis we chose not to compete on ([ADR-1](DESIGN.md#adr-1-chrome-extension-mv3-not-a-desktop-app)). |
| **Mobile app** | Different codebase, and Forest already owns it. |
| **A curated global "distracting sites" authority** | Distraction is contextual; every wrong entry costs trust ([PRODUCT.md §4.1](PRODUCT.md#41-should-we-curate-a-list-of-distracting-sites--mostly-no)). Starter packs seed, they don't govern. |
| **Parental controls / team monitoring** | Adversarial user, opposite design pressure. |
| **A frontend framework, before v0.5** | The popup is three buttons and a picture of a dinosaur. |

---

## Deferred, not rejected

Worth revisiting once v1.0 is real and being used:

- **Tauri companion daemon** for system-wide blocking — only if browser-only
  enforcement is demonstrably what's failing, and only as a satellite the
  extension talks to.
- **Pomodoro / break enforcement** — natural fit, but it's a second product
  concept and dilutes the focus-mode story if added early.
- **Calendar integration** (auto-focus during meetings or blocked-off time) —
  genuinely useful, needs OAuth, so it lands after the local-only story is solid.
- **Doug reacting to time of day** — small, charming, cheap. A nice v1.1.

---

## v0.1 smoke test

The 44 unit tests cover rule compilation, matching, mood resolution, and a
simulation of Chrome's `regexSubstitution` step — so the URL round-trip in step
11 is now covered in `test/redirect.test.js`, including URLs carrying their own
`&` and `#`. What tests still cannot prove is that **Chrome accepts the rules**
and that the **redirect actually fires**. That needs a browser.

Run this once after loading unpacked:

**Setup**

1. `chrome://extensions` → Developer mode → Load unpacked → this directory
2. Confirm **no errors** under the extension card. A red "Errors" button here
   usually means a bad `import` path in the service worker
3. Click the toolbar icon — Doug should appear, mood `chill`, status `Idle`

**Blocking**

4. Click a starter pack (say Social). Sites appear in the list with a pack tag
5. Start a 25-minute session. Badge shows `25`; status flips to `Focusing`
6. Visit `instagram.com` → **full-page Doug**, side-eyeing, "first time today"
7. Visit it again → count reads "2nd time today", and the line should differ
8. Confirm the specimen tag shows the site and a live session countdown

**The things most likely to be broken**

9. **Path matching:** `youtube.com/shorts` blocks, `youtube.com` does not
10. **Anchoring:** add `reddit.com`, then confirm a URL merely *containing* the
    string — e.g. a Google search for "reddit.com" — is not blocked
11. **Override:** wait out the 15s countdown, click through, confirm you land on
    the site *and* on the original path rather than the bare domain (this is the
    `#url=\0` fragment trick working)
12. **Sub-resources survive:** with `youtube.com/shorts` blocked, an embedded
    YouTube player elsewhere still loads. This is prototype bug #3 — if embeds
    break, `resourceTypes` regressed
13. **Reconciliation:** end the session, confirm blocked sites load again.
    Restart Chrome mid-session and confirm blocking is still correct
14. **Session expiry:** start a 1-minute session (temporarily edit a chip) and
    confirm the alarm ends it and clears the badge without the popup open

**Design**

15. Toggle OS dark mode and re-open both surfaces — full palette swap, grain
    still subtle, no unreadable text
16. Enable "reduce motion" in the OS and confirm Doug stops breathing
17. `npm run doug` → open `dev/doug-sheet.html` and check all 7 moods read as the
    same character in both themes

Anything that fails here is a v0.1 bug, not a v0.2 feature.

### Results — 2026-08-17

| Steps | Result |
| --- | --- |
| 1–8 loading, popup, basic blocking, attempt counting | ✅ |
| 9 path scoping — `youtube.com/shorts` blocks, `youtube.com` loads | ✅ |
| 10 anchoring — arriving via a Google result still blocks the site | ✅ |
| 11 override returns to the original deep path | ✅ |
| 12 sub-resources unaffected — unrelated video played fine | ✅ |
| 13 persistence across a browser restart | ✅ |
| 14 unattended session expiry clears the badge | ⏳ untested |
| 15–16 dark mode / reduced motion | ✅ dark mode confirmed |

**Bug found:** the toolbar badge froze rather than counting down — it read 49
while 47 minutes remained. Cause: the badge was only painted during a rule
reconcile (session start, override, settings change), so it was a snapshot, not
a countdown. Fixed with a dedicated 1-minute `badge-tick` alarm, a repaint
whenever the popup asks for state, and `shared/session.js` deriving the text
from `endsAt` on every paint so a skipped paint is late but never wrong.

**How to finish #14 quickly:** temporarily change a chip's `data-minutes` to `1`
in `src/popup/popup.html`, reload the extension, start that session, close the
popup, and watch the badge clear on its own. The new badge tick also
double-checks expiry, so a dropped `session-end` alarm now self-heals within a
minute instead of leaving a session running forever.
