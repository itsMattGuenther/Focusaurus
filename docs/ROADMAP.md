# Focusaurus — Roadmap

Six phases to v1.0. Each is independently shippable and independently *useful* —
no phase is a refactor you can't feel. Each has an explicit exit criterion,
because "when it feels done" is how side projects stall at 80%.

Estimates assume evenings-and-weekends pace on a personal project.

---

## Now → v0.1 · "Blocks"

**Goal:** the existing prototype, correct. No new features.

The prototype's blocking is mostly broken in ways that aren't visible in a demo
(see [DESIGN.md §1](DESIGN.md#1-what-the-prototype-got-wrong)), and every later
phase sits on top of it.

- [ ] Restructure to the `src/` layout in [DESIGN.md §3](DESIGN.md#3-file-layout)
- [ ] `rules.js` as a pure function: settings → DNR rules. Unique IDs, proper
      domain anchoring, `main_frame` only
- [ ] Reconcile rules wholesale on startup and on every settings change — never
      patch individual IDs (§1 #8)
- [ ] Switch `block` → `redirect` at a placeholder interstitial (ADR-2, ADR-4)
- [ ] Fix the popup toggle race (§1 #5); dedupe on add (§1 #7)
- [ ] Drop the unused `webRequest` permission; add `alarms`
- [ ] Focus mode with a **duration** (25 / 50 / 90 min / until I stop) rather than
      an indefinite toggle
- [ ] Starter packs as onboarding chips — Social, Video, News, Shopping, Forums
- [ ] `test/` with node's built-in runner against `rules.js`
- [ ] `.gitignore` the `.pem` and `.crx` ([DESIGN.md → Housekeeping](DESIGN.md#housekeeping))

**Exit:** add 10 sites across 3 packs, start a 25-minute session, and all 10
redirect correctly. Nothing else on the web breaks. Rules survive a browser
restart and reconcile correctly after editing the list with focus off.

**Rough size:** a weekend.

---

## v0.2 · "Doug" — the character

**Goal:** the thing that makes this Focusaurus and not another blocker. This is
the phase that either validates the whole thesis or doesn't.

- [ ] `mood.js` — the 7 priority rules from
      [DESIGN.md §5](DESIGN.md#5-the-mood-engine), pure and unit-tested
- [ ] 6 dino sprites: `asleep`, `locked_in`/`focused`, `bummed`, `side_eye`,
      `stoked`, `chill`
- [ ] The interstitial as a real designed page — full-bleed Doug, the site you
      tried to reach, today's attempt count for it
- [ ] `copy.js` — rotating per-mood lines, no repeat-in-a-row (ADR-6)
- [ ] Attempt counting per site per day
- [ ] Override flow with the breathing-room delay, and `strictness` in settings
- [ ] Popup rebuilt around the dino: mood, session control, today at a glance
- [ ] Mood tooltip explaining *why* Doug feels this way

**Exit:** you can tell how your day is going from the popup icon alone, without
reading any text. The interstitial makes you smile the first time and still
registers on day five.

**Rough size:** 2–3 weekends, art dependent. The art is the critical path — 6
consistent expressive sprites is real work. Options: commission, generate,
or draw badly on purpose and make that the style.

> **This is the checkpoint that matters.** Ship v0.2, use it for two weeks, and
> answer honestly: is it still enabled? If the dino isn't carrying its weight,
> nothing later fixes that — better to know before building budgets on top.

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
