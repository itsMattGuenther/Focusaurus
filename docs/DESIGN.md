# Focusaurus — Design Document

Technical design for the Chrome extension. Product reasoning lives in
[PRODUCT.md](PRODUCT.md); phasing lives in [ROADMAP.md](ROADMAP.md).

---

## 1. What the prototype got wrong

The May 2024 prototype worked in the demo sense but had real bugs. **All of these
are fixed as of v0.1** — the record stays because several are subtle enough to
reintroduce by accident, and the ones marked 🧪 now have named regression tests
guarding them.

| # | Issue | Why it mattered | Fixed in |
| --- | --- | --- | --- |
| 1 🧪 | Every generated rule was assigned `id: 1` | Duplicate IDs in one `addRules` array — Chrome rejects the batch. **At most one site was ever actually blocked.** | `rules.js` allocates deterministic ids from `BLOCK_ID_BASE` |
| 2 🧪 | `urlFilter: '*' + website + '*'` | Unanchored substring match against the *whole URL*. `fb` blocked every URL containing "fb"; `news` blocked `anything.com/news`. Also matched `notreddit.com` and `reddit.com.evil.example`. | `match.js` — anchored patterns, and bare words are rejected outright |
| 3 🧪 | All 11 `resourceTypes` blocked | Killed images, scripts, fonts and iframes across the entire web, not just top-level navigations. Broke embeds everywhere. | `main_frame` only |
| 4 🧪 | `action: { type: 'block' }` | Chrome's generic error page. **Threw away the single best surface in the product.** | `redirect` → the interstitial (ADR-2) |
| 5 | `popup.js` initialized `focusModeEnabled = false`, then an async `storage.get` set the real value | Clicking before that read resolved sent the first toggle the wrong way. | Popup holds no duplicated state; the worker owns truth and the popup re-reads |
| 6 | Dead read of `focusModeEnabled` wrapping the whole listener | Needless async callback around every message. | Gone |
| 7 🧪 | No dedupe on add | The same site could be added repeatedly, each spawning a rule. | `specKey()` dedupe in `addSite` |
| 8 | `disableFocusMode` removed only rule ID `1` | Dynamic rules **persist across restarts and extension updates**, so any rule with another ID was orphaned forever. | `reconcile()` replaces the whole set every time |
| 9 | `webRequest` declared but unused | Dead permission, and extra Web Store review scrutiny. | Removed |
| 10 | Rules never reconciled on startup | Enforcement drifted from settings after any change made while focus was off. | `onStartup`, `onInstalled`, and `storage.onChanged` all reconcile |

---

## 2. Architecture decisions

### ADR-1: Chrome extension (MV3), not a desktop app

**Decision:** Ship as an MV3 Chrome extension. Revisit a desktop companion only
if system-wide blocking becomes the blocker to usefulness.

**Why:**

- The browser is the only place we can render a **full-page interstitial in place
  of the site**. That surface is the product's entire emotional payload
  (ADR-3). A desktop app blocking at the hosts/DNS/proxy layer produces a
  connection error — you cannot put a dinosaur in a connection error.
- Distribution: Chrome Web Store vs. code signing certs, per-OS installers,
  notarization, and antivirus false positives on anything that rewrites `hosts`.
- Enforcement is a losing axis (see [PRODUCT.md §2](PRODUCT.md#2-positioning)).
  A desktop app's main advantage is precisely the advantage we've decided not to
  compete on.

**Accepted costs:** trivially bypassed (open Firefox, a guest profile, or your
phone); blind to native apps (Slack, Discord, Steam); no cross-device sync without
building a backend.

**If revisited:** Tauri, not Electron — ~3MB vs ~100MB, and it stays a thin
enforcement daemon that the extension talks to, not a rewrite that swallows the
extension.

### ADR-2: `redirect` to an interstitial, not `block`

**Decision:** Blocked top-level navigations get a `redirect` action pointing at a
web-accessible extension page.

Requires the interstitial in `web_accessible_resources`. Note that `redirect` is
classified as an **unsafe** action, so these rules count against
`MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES` (5,000) rather than the 30,000 safe-rule
ceiling. Irrelevant at our scale (tens of sites), but worth knowing before
generating rules programmatically.

### ADR-3: The interstitial is the primary surface, not the popup

Most extensions treat the popup as the app and the block page as an error. We
invert it. The interstitial is where the user's attention is *highest* and their
intent is *weakest* — that's where the character, the attempt count, and the
override flow belong. The popup is a control panel; the interstitial is the
product.

### ADR-4: `regexFilter` + `regexSubstitution` to carry the original URL

To let the interstitial show *what* you tried to visit and return you there after
an override, the original URL has to survive the redirect. Static
`extensionPath` redirects can't carry it.

```js
{
  id: siteRuleId,
  priority: 1,
  action: {
    type: 'redirect',
    redirect: {
      regexSubstitution:
        chrome.runtime.getURL('/src/blocked/blocked.html') + '?site=' + siteId + '&url=\\0'
    }
  },
  condition: {
    regexFilter: '^https?://([a-z0-9-]+\\.)*youtube\\.com/',
    resourceTypes: ['main_frame']
  }
}
```

**Tradeoff:** regex rules are capped at 1,000 (`MAX_NUMBER_OF_REGEX_RULES`) —
roughly 10x more headroom than a realistic personal blocklist. If a list ever
exceeds that, fall back to `requestDomains` + static redirect and lose the
return-to-URL nicety.

`resourceTypes: ['main_frame']` **only.** Redirecting a sub-resource to an HTML
page produces garbage. If sub-frame blocking is wanted later, add a separate
`block` rule for `sub_frame`.

### ADR-5: `chrome.alarms` + checkpoint accounting, never `setInterval`

The MV3 service worker is terminated after ~30 seconds of inactivity. Anything
that assumes a long-lived process is a bug waiting to ship.

Two consequences, and the second is the one that bites people:

1. All periodic work goes through `chrome.alarms` (minimum period 30s as of
   Chrome 120; 1 minute before that). Never `setTimeout`/`setInterval` for
   anything beyond the current event.
2. **Time accounting must be checkpoint-based, not increment-based.** Do not do
   `seconds += 60` on each tick — ticks get skipped when the worker is dead or
   the machine sleeps, silently under-counting. Instead persist
   `activeSince` / `lastCheckpoint` timestamps and compute
   `now - lastCheckpoint` on each wake, clamping any delta larger than the
   expected interval (machine was asleep, not browsing).

This is the #1 source of wrong numbers in MV3 time trackers.

### ADR-6: Rotating interstitial copy

A fixed block-page message becomes wallpaper within about three days —
habituation is what kills interstitials. Doug's lines are drawn from a per-mood
pool in `src/shared/copy.js`, seeded so the same line doesn't repeat twice
running. Cheap to build, and it's the difference between a page that lands and a
page you reflexively close.

### ADR-7: `storage.sync` for settings, `storage.local` for usage

`storage.sync` quotas are small and easy to blow: 102,400 bytes total, 8,192 per
item, 1,800 writes/hour, 120 writes/minute. Per-day per-domain usage data written
every minute would exceed the write rate alone.

- **`storage.sync`** — settings only: site list, budgets, schedule, dino name,
  strictness. Small, and worth syncing across machines for free.
- **`storage.local`** — usage time series, streaks, attempt counters, mood cache.
  10MB, no write throttle.

### ADR-8: Pure core, testable without Chrome

`mood.js`, `rules.js` and `match.js` take plain state objects and return plain
values — no `chrome.*` calls inside. Chrome APIs are confined to
`service-worker.js` and `storage.js`. That makes the three pieces of logic most
likely to have subtle bugs (mood resolution, rule compilation, site matching)
unit-testable in plain node with no browser harness and no mocking library.

30 tests, `npm test`, no dependencies. The same property lets
`dev/build-doug-sheet.js` render Doug in node to generate a character sheet.

### ADR-9: Doug is inline SVG, not raster sprites

**Decision:** Doug is generated as an SVG string by `src/shared/doug.js`, with
one shared body and a mood-swapped face layer.

**Why:**

- **Themeable.** Every fill is a CSS custom property, so Doug follows dark mode
  for free. Six PNGs would need twelve.
- **Can't drift.** The body is a module constant, so no mood can accidentally
  ship a slightly different Doug. That constraint is what makes him read as one
  character across seven states instead of seven drawings of a dinosaur.
- **Animatable.** He breathes, blinks, and his pupils move. All CSS.
- **Cheap.** ~4KB total, and a new mood is a few path strings rather than a
  commission.
- **Reviewable.** `npm run doug` renders every mood in both themes to one
  standalone page. Reviewing a character system side by side is the only
  reliable way to catch an off-model expression.

**Accepted cost:** a hand-authored vector dinosaur has a lower ceiling of charm
than a real illustrator's work. If Doug ever gets commissioned art, the mood
system and all its plumbing survive unchanged — only the render function swaps.

### ADR-10: `declarativeNetRequestWithHostAccess` + explicit host permissions

**Decision:** request `declarativeNetRequestWithHostAccess` plus
`host_permissions` for `http://*/*` and `https://*/*`.

**Why:** the `redirect` action **requires host permissions**, unlike `block`.
The plain `declarativeNetRequest` permission grants implicit access only to
`allow`, `allowAllRequests` and `block` — redirect rules silently fail to match
without host access, which is a miserable thing to debug because nothing errors.

Given host permissions are non-negotiable for ADR-2, the `WithHostAccess`
variant is strictly better: it suppresses the *second*, redundant install-time
warning while requiring exactly the access we already need. One permission
prompt instead of two.

**Accepted cost:** the install prompt still says "read and change all your data
on all websites," which is unavoidable for any redirect-based blocker. Mitigated
by the privacy posture in §7 being real and stated plainly in the listing.

### ADR-11: The schedule may only ever stop sessions it started

**Decision:** every session carries `source: 'manual' | 'schedule'`. Automation
starts a session when the work window opens and stops it when the window closes
— but only if `source === 'schedule'`. A manual session is never touched.

Additionally, ending a *scheduled* session by hand sets
`scheduleSuppressedUntil` to the end of the current window, muting auto-start
until the next one.

**Why the suppression rule exists:** without it, quitting a session mid-window
would see the schedule restart it on the next alarm tick, roughly a minute
later. That is the single most infuriating way to ship this feature, and it
directly contradicts the positioning — a tool that overrules you is a cop, and
people uninstall cops (PRODUCT.md §2). The user must always be able to win an
argument with the schedule.

The corollary matters too: `endSession({ byUser: false })` is used for the
window closing, the timer expiring, and the badge tick's expiry safety net.
Marking those as user actions would arm suppression and silently kill the *next*
day's session — a bug that would take weeks to notice.

`decideScheduleAction()` in `shared/schedule.js` is a pure function returning
`{action, endsAt, reason}`; the worker only carries out the verdict. Every
branch is covered in `test/schedule.test.js`, including the case where a session
predating this feature has no `source` field and must be treated as manual so an
upgrade doesn't silently kill it.

---

## 3. File layout

```
focusaurus/
├─ manifest.json
├─ src/
│  ├─ background/
│  │  ├─ service-worker.js   # event + alarm router. THE only stateful file
│  │  ├─ rules.js            # PURE: settings -> DNR rule array
│  │  ├─ mood.js             # PURE: day state -> mood id + explanation
│  │  ├─ storage.js          # typed accessors, defaults, usage buckets
│  │  └─ tracker.js          # (v0.3) active-time checkpoint accounting
│  ├─ blocked/               # the interstitial — hero surface (ADR-3)
│  │  ├─ blocked.html
│  │  ├─ blocked.css
│  │  └─ blocked.js
│  ├─ popup/                 # session control, blocklist, Doug's mood
│  │  ├─ popup.html
│  │  ├─ popup.css
│  │  └─ popup.js
│  ├─ options/               # settings, schedule, full site list, backup
│  │  ├─ options.html
│  │  ├─ options.css
│  │  └─ options.js
│  └─ shared/
│     ├─ tokens.css          # THE design system — see §8
│     ├─ doug.js             # PURE: mood -> SVG string (ADR-9)
│     ├─ doug.css            # Doug's sizing and motion
│     ├─ match.js            # PURE: user input -> anchored pattern
│     ├─ redirect.js         # PURE: the interstitial URL contract, both ways
│     ├─ session.js          # PURE: session state + badge text
│     ├─ schedule.js         # PURE: work hours + the automation decision
│     ├─ copy.js             # rotating Doug lines, per mood and tier
│     └─ starter-packs.js    # onboarding seed lists
├─ assets/
│  ├─ fonts/                 # Fraunces + Public Sans, latin subset, OFL
│  └─ icons/                 # 16/48/128 — still prototype placeholders
├─ dev/
│  └─ build-doug-sheet.js    # `npm run doug` -> character sheet
├─ docs/
└─ test/                     # node --test, 102 tests, no dependencies
```

Everything above exists as of v0.1 except the two entries marked with a version.

No build step until it hurts. When it does (v0.5+, if a framework earns its
place in the options page), Vite with `@crxjs/vite-plugin`.

**Where state lives:** only `service-worker.js` holds any, and it holds none
*between* events — there are deliberately no module-level mutable variables in
it. The popup and interstitial keep no cached copy either; both fetch state in
one round trip and re-fetch after any mutation. A popup that cached state would
drift the moment a session ended on an alarm.

---

## 4. Data model

Designed for budgets from day one even though v0.1 only enforces hard blocks
(see [PRODUCT.md §4.2](PRODUCT.md#42-hard-blocking-is-the-weakest-mechanic-budgets-are-the-actual-product)).
A `site` carries a `mode`; v0.1 only ever writes `'block'`.

### `storage.sync`

```jsonc
{
  "schemaVersion": 1,
  "dino": { "name": "Doug" },
  "schedule": {
    "enabled": false,
    "days": [1, 2, 3, 4, 5],          // 0 = Sunday
    "start": "09:00",
    "end": "17:00"
  },
  "strictness": "firm",                // gentle | firm | locked
  "overrideDelaySeconds": 15,          // breathing room before override unlocks
  "sites": [
    {
      "id": "s_yt",
      "label": "YouTube",
      "match": { "kind": "domain", "value": "youtube.com" },
      // kind: "domain" (incl. subdomains) | "urlPrefix" (e.g. youtube.com/shorts)
      "mode": "block",                 // block | budget
      "budgetMinutes": null,           // required when mode === "budget"
      "pack": "video"                  // provenance: which starter pack, or "custom"
    }
  ]
}
```

`match.kind: "urlPrefix"` matters more than it looks — the most-requested shape in
this category is "block `youtube.com/shorts` but not YouTube" and "block Reddit
but allow `/r/programming`."

### `storage.local`

```jsonc
{
  "session": {                          // null when no session running
    "startedAt": 1755400000000,
    "plannedMinutes": 50,
    "endsAt": 1755403000000,
    "source": "manual"                  // manual | schedule -- load-bearing:
                                        // the schedule may only stop its own
  },
  "scheduleSuppressedUntil": null,      // auto-start muted until this ts
  "tracker": {                          // ADR-5 checkpoint state
    "activeDomain": "youtube.com",
    "activeSince": 1755400000000,
    "lastCheckpoint": 1755400060000
  },
  "usage:2026-08-17": {
    "perSite": {
      "s_yt": { "activeSeconds": 1840, "attempts": 23, "overrides": 2 }
    },
    "sessions": [
      { "start": 1755400000000, "end": 1755403000000, "plannedMinutes": 50, "completed": true }
    ]
  },
  "streak": { "current": 4, "best": 11, "lastGoodDay": "2026-08-16" },
  "moodCache": { "id": "focused", "computedAt": 1755400060000 }
}
```

**Retention:** `usage:*` keys are pruned to a rolling 90 days by a daily alarm.
Bounded storage, and 90 days is more history than anyone reviews.

**Day boundary:** local midnight, from the user's own clock. Not UTC — a day that
rolls over at 7pm would make budgets nonsense. Store day keys as local
`YYYY-MM-DD`.

---

## 5. The mood engine

The mood is the primary output of the whole system — the thing you're supposed to
be able to read at a glance instead of opening a dashboard.

### Resolution: priority-ordered rules, not a score

A blended numeric score is tempting and wrong: it's impossible to debug ("why is
the dino sad?") and impossible to tune. Use the first matching rule, top down.

```
1.  schedule enabled AND outside work hours AND no session   -> asleep
2.  session active AND 0 attempts in last 10 min             -> locked_in
3.  session active                                           -> focused
4.  any budget >= 100%                                       -> bummed
5.  any budget >= 80%                                        -> side_eye
6.  streak >= 3 AND all budgets < 50%                        -> stoked
7.  (default)                                                -> chill
```

Seven rules, six sprites (`locked_in` and `focused` can share art early on with
a different accessory). Deterministic, trivially unit-testable, and every mood
has a one-line explanation you can surface in a tooltip — which is itself a
feature, because an unexplained mood is just decoration.

### The recovery rules (non-negotiable)

These exist because shame drives uninstalls
([PRODUCT.md §4.3](PRODUCT.md#43-the-mood-dinosaur-is-the-best-idea-here-and-the-biggest-risk)).
They are product requirements, not polish:

1. **Any completed session ≥ 15 minutes immediately promotes out of `bummed` or
   `side_eye`.** Rule 2/3 already outranks 4/5 — that ordering is deliberate, not
   incidental. Do not reorder.
2. **Nothing negative survives local midnight.** Fresh day, `chill` dino.
3. **A broken streak resets silently.** No "you lost your 11-day streak" modal,
   ever. `best` is retained and shown; `current` just quietly starts over.
4. **Visible streak pressure caps at 7 days.** Beyond that, display the number
   but stop framing it as at-risk. Long streaks invert into anxiety.

### Copy tone

| Do | Don't |
| --- | --- |
| First person plural: *"we said 15 minutes"* | *"you failed"*, *"you wasted"* |
| Present and specific: *"that's #12 today"* | Deficit framing: *"you've lost 2 hours"* |
| Offer the exit: *"want 5 minutes? I'll wait"* | Guilt-trip, then block anyway |
| Short — one or two lines, Doug isn't chatty | Paragraphs of motivational copy |

### Override friction

Neither a hard wall nor a free pass. On the interstitial, Doug sits there for
`overrideDelaySeconds` (default 15) before an *"okay, 5 minutes"* button becomes
active. The delay interrupts the automaticity of the reflex, which is the actual
mechanism — the reflex is what you're fighting, not the decision.

Overrides are logged honestly and shown in the weekly review. Not as a scold — as
data. `strictness` tunes the delay: `gentle` 5s, `firm` 15s, `locked` no override
at all until the session ends.

---

## 6. Time tracking (v0.3)

Per ADR-5, checkpoint-based. Signals:

- `chrome.tabs.onActivated` / `onUpdated` — which domain is in the active tab
- `chrome.windows.onFocusChanged` — Chrome lost focus entirely → stop counting
  (`windowId === chrome.windows.WINDOW_ID_NONE`)
- `chrome.idle.onStateChanged` with a 60s detection interval (API minimum is 15s)
  — user is idle/locked → stop counting
- A 1-minute alarm as a checkpoint flush, so a crash loses ≤60s

**Only count the focused tab in the focused window while the user is active.**
Counting every open tab is how time trackers end up reporting 14 hours in a day
and losing all credibility.

Clamp any checkpoint delta above ~2 minutes to the expected interval — that's a
sleeping machine or a dead worker, not browsing.

---

## 7. Privacy

Non-negotiable, and worth stating in the Web Store listing as a feature:

- **All data local.** No servers, no accounts, no analytics, no telemetry.
- **No history access.** The `history` permission is never requested. Tracking
  works off active-tab events only, which is strictly less invasive.
- **Domains, never URLs.** Usage aggregates to the registrable domain. Full URLs
  are handled transiently to render the interstitial and never persisted.
- **No remote resources.** Fonts are vendored; the CSP forbids remote hosts
  anyway, but the point is that the extension makes zero network requests, so
  there is nothing to intercept or leak.
- Permissions stay as narrow as the features allow: currently
  `declarativeNetRequestWithHostAccess`, `storage`, `alarms`, plus
  `host_permissions` for http/https. No `webRequest` (§1 #9), no `history`, no
  `tabs` permission (closing the interstitial's own tab doesn't need it).

The broad host permission is the one genuinely uncomfortable ask, and it's
unavoidable for a redirect-based blocker (ADR-10). Since we can't reduce it, the
mitigation is that everything above is true and verifiable: the whole extension
is ~1,500 lines of unbundled, unminified source with no dependencies, so anyone
can read exactly what it does.

**Interstitial input is treated as hostile.** The blocked URL arrives in a
fragment that any site can influence by navigating you to a crafted URL. So it is
written to the DOM with `textContent` only, never `innerHTML`, and it is
scheme-checked against http/https before it can reach `location` — otherwise a
crafted `javascript:` URL would execute on click.

---

## 8. Design system

Design carries equal weight with functionality on this project, so it gets a
spec rather than a vibe. Everything derives from `src/shared/tokens.css`; no
surface hardcodes a color, size, or duration.

### Direction: field guide

A naturalist's notebook — warm pressed paper, ink hairlines, moss and clay. Doug
is a specimen being observed, not a mascot being marketed.

This is a deliberate reaction to the category: every competing blocker lives in a
cold utilitarian register (gray chrome, red warnings, dashboards), which
reinforces exactly the "software as cop" feeling that makes people uninstall
them. Warm analog paper does the opposite work for free.

### Tokens

| Group | Notes |
| --- | --- |
| Color | Warm palette; `--ink` is `#241f19`, never `#000`. Semantic accents: moss = focus/good, clay = blocked/over, amber = caution. Doug's palette is namespaced separately so he can be retinted without touching UI semantics. |
| Type | Fraunces (display) driven through its **optical-size axis** — high `opsz` for hero type, low for small. Public Sans for body/UI. |
| Space | 4px base, 9 steps. |
| Shadow | Warm-tinted. Neutral gray shadows on warm paper read as dirt. |
| Motion | `--dur-fast/mid/slow` at 120/260/520ms, two easings. Unhurried, because snappy UI would fight Doug's tone. |

### Rules that aren't obvious

- **Both themes are complete palettes**, and an explicit `data-theme` choice
  always beats the OS preference — the dark block is guarded
  `:root:not([data-theme='light'])` so a light choice can't be overridden by a
  dark OS setting.
- **Grain over flat fills.** An inline SVG fractal-noise overlay gives paper its
  tooth. It's `position: fixed` and `pointer-events: none`, and it's disabled in
  the popup, where fixed positioning misbehaves inside a scroll container. Grain
  opacity drops from 0.32 to 0.05 in dark mode — it reads far louder on dark
  ground, and the blend mode flips from `multiply` to `screen`.
- **One orchestrated entrance beats scattered micro-interactions.** The
  interstitial staggers its reveal with `animation-delay`; nothing else in the
  app animates on load.
- **Motion is anchored.** Doug's breathing has `transform-origin` at his feet, so
  he swells upward instead of floating. Unanchored scaling reads as a pulsing
  logo.
- **`prefers-reduced-motion` collapses everything**, including Doug's breathing
  and blinking.
- **The disabled override button keeps its border** and dims only its label. A
  fully faded control during the breathing-room countdown looks broken rather
  than deliberate.

---

---

## Housekeeping

Resolved, recorded so the reasoning isn't lost:

1. **`Focusaurus.pem`** — a private signing key. It was **never committed**
   (`git ls-files` never tracked it), so no history rewrite was needed and the
   key is not compromised. **Moved out of the repo entirely** on 2026-08-18 to
   `D:\Dev Projects\_keys\`, and still covered by `.gitignore`.

   Two reasons it had to leave the extension directory: Chrome warns about a key
   file whenever the directory is loaded unpacked, and — the part that actually
   matters — a key left in place gets bundled into any zip or `.crx` built from
   the folder, which is exactly how signing keys leak.

   **Correction to an earlier note here:** the `.pem` does *not* fix the
   extension's ID during development. For `Load unpacked`, Chrome derives the ID
   from the **directory path**. The key only affects the ID of a packed `.crx`.
   And if Focusaurus is ever published on the Web Store, Google generates and
   holds the signing key, making this file irrelevant.
2. **`Focusaurus.crx`** — 93KB packed build artifact, also never tracked. Now
   ignored.
3. **Git refused to run in this directory** — the repo was created under a
   different machine's Windows SID, tripping the `dubious ownership` check,
   which blocks *every* git command including `status`. This presents as "the
   repo won't sync with GitHub." Fixed with
   `git config --global --add safe.directory 'D:/Dev Projects/Focusaurus'`.
4. **The GitHub remote was stale** — the account was renamed
   `guentherishere` → `matthewguenther`. GitHub redirects pushes, so the CLI
   worked and hid the problem, but a stale remote breaks VS Code's git
   integration. Remote updated; a push printing `remote: This repository moved`
   is the tell if it recurs on another repo.

Still outstanding:

- **The icons in `assets/icons/` are prototype placeholders.** They need to be
  redrawn from Doug's actual geometry before any Web Store listing — the toolbar
  icon at 16px is the most-seen artwork in the entire product.
