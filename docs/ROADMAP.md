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

**Exit criteria:** ⏳ not yet verified in a real browser — see the smoke test at
the bottom of this file.

---

## v0.2 · "Doug, properly"

**Goal:** close the gap between "built" and "trustworthy," then find out whether
the thesis holds.

Much of the original v0.2 shipped in v0.1, so what's left is smaller and mostly
about finish:

- [ ] **Doug's proportions.** His v0.1 geometry was authored blind — no
      rasterizer was available, so the paths were never seen before shipping.
      He reads as recognizably a dinosaur but distinctly derpy. Deferring this
      is cheap and safe: his appearance is confined to `doug.js` (geometry) and
      `doug.css` (motion), and nothing else in the codebase knows what he looks
      like. Consumers only ever call `renderDoug(el, mood)`. The contract is the
      seven mood ids — hold those and he can be redrawn from scratch, or
      replaced with commissioned art, without touching a single other file.
      Prime suspects, in order:
      - head/body ratio — the head ellipse (`rx 32`) may be too large against
        the body (`rx 48`), and the `stroke-width: 34` neck reads thick
      - eyes sit high and wide on the head; the snout ellipse likely makes a
        lumpy silhouette where it overlaps the head rather than a clean muzzle
      - brows may float detached above the eyes
      - back plates may poke through at odd angles along the spine
      - tune him against real sizes (340px interstitial, 92px popup, 16px
        badge), not just the character sheet — the risk of perfecting him in
        isolation is that he looks right there and wrong in situ
- [ ] **Real icons drawn from Doug's geometry.** The 16/48/128 set is still
      prototype placeholder art. The 16px toolbar icon is the single
      most-frequently-seen artwork in the product. Blocked on the item above:
      drawing icons from proportions that are about to change is wasted work
- [ ] An options page: strictness, override length, schedule, dino name
- [ ] Attempt history — "this week you reached for Reddit 40 times", reported
      neutrally
- [ ] Expand the copy pools; they're thin enough to notice repeats inside a week
- [ ] Mood tooltip in the popup (the `because` string is already computed and
      returned, it just isn't surfaced on hover yet)
- [ ] Accessibility pass on both surfaces: keyboard nav, focus order, contrast
      audit against both palettes

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
- [ ] Schedule automation (auto-on during work hours) — the highest-value
      unglamorous feature, since it removes the decision entirely
- [ ] Options page that doesn't look like a config form
- [ ] Settings import/export as JSON
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

The 30 unit tests cover rule compilation, matching, and mood resolution, but
nothing about them proves Chrome accepts the rules or that the redirect fires.
That needs a browser. Run this once after loading unpacked:

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
