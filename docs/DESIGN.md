# Focusaurus — Design Document

Technical design for the Chrome extension. Product reasoning lives in
[PRODUCT.md](PRODUCT.md); phasing lives in [ROADMAP.md](ROADMAP.md).

---

## 1. What the prototype got wrong

The May 2024 prototype works in the demo sense but has real bugs. Documenting
them because v0.1 is largely "fix these," and a couple are subtle enough to
reintroduce by accident.

| # | Issue | Why it matters |
| --- | --- | --- |
| 1 | Every generated rule is assigned `id: 1` (`background.js:32`) | Duplicate IDs in one `addRules` array — Chrome rejects the batch. **Only one site is ever actually blocked**, if any. |
| 2 | `urlFilter: '*' + website + '*'` (`background.js:36`) | Unanchored substring match against the *whole URL*. Adding `fb` blocks every URL containing "fb". Adding `news` blocks `anything.com/news`. Wildly over-blocks. |
| 3 | All 11 `resourceTypes` are blocked (`background.js:37`) | Kills images, scripts, fonts and iframes across the entire web, not just top-level navigations to the blocked site. Breaks embeds everywhere. |
| 4 | `action: { type: 'block' }` | Yields Chrome's generic "Blocked by extension" error page. **This throws away the single best surface in the product** — the full page where the dino should be. |
| 5 | `popup.js:7` initializes `focusModeEnabled = false`, then an async `storage.get` at `popup.js:42` sets the real value | If the user clicks before that read resolves, the first toggle goes the wrong way. Read state *before* wiring the handler, or derive it from storage inside the handler. |
| 6 | `background.js:4` reads `focusModeEnabled` and never uses it | Dead read wrapping the whole listener in an unnecessary async callback. |
| 7 | No dedupe on add (`popup.js:21`) | Same site can be added repeatedly, each spawning a rule. |
| 8 | `disableFocusMode` only removes rule ID `1` | Dynamic rules **persist across browser restarts and extension updates**. Any rule that ever got a different ID is orphaned forever. Rules must be reconciled wholesale, never patched. |
| 9 | `webRequest` permission declared but unused (`manifest.json:10`) | Dead permission. Also draws extra Chrome Web Store review scrutiny. Remove it. |
| 10 | Rules never reconciled on startup | If the site list changes while focus mode is off, or a previous session left rules behind, enforcement drifts from settings. |

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

`mood.js` and `rules.js` take plain state objects and return plain values — no
`chrome.*` calls inside. Chrome APIs are confined to `service-worker.js` and
`storage.js`. That makes the two pieces of logic most likely to have subtle bugs
(mood resolution, rule compilation) unit-testable in plain Node with no browser
harness and no mocking library.

---

## 3. File layout

```
focusaurus/
├─ manifest.json
├─ src/
│  ├─ background/
│  │  ├─ service-worker.js   # entry: event + alarm router. Only stateful file
│  │  ├─ rules.js            # PURE: settings -> DNR rule array
│  │  ├─ tracker.js          # active-time checkpoint accounting
│  │  ├─ mood.js             # PURE: day state -> mood id
│  │  └─ storage.js          # typed accessors, defaults, schema migrations
│  ├─ blocked/               # the interstitial — hero surface (ADR-3)
│  │  ├─ blocked.html
│  │  ├─ blocked.js
│  │  └─ blocked.css
│  ├─ popup/                 # session control + today's glance
│  ├─ options/               # site list, budgets, schedule
│  └─ shared/
│     ├─ starter-packs.js    # onboarding seed lists
│     ├─ copy.js             # rotating Doug lines, keyed by mood
│     └─ moods.js            # mood ids -> asset paths + display names
├─ assets/dino/              # one sprite per mood + interstitial hero pose
├─ docs/
└─ test/                     # node --test against the pure modules
```

No build step until it hurts. When it does (v0.5+, if a framework earns its
place in the options page), Vite with `@crxjs/vite-plugin`.

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
    "endsAt": 1755403000000
  },
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
- Permissions stay minimal: `declarativeNetRequest`, `storage`, `alarms`,
  `tabs`, `idle`. No `webRequest` (see §1 #9), no broad host permissions.

---

## Housekeeping

Two items to deal with before this repo goes anywhere public:

1. **`Focusaurus.pem` is a private signing key committed to the repo.** It's the
   key that establishes the extension's identity/ID. It should be removed from
   the working tree, added to `.gitignore`, and stored outside the repo. If this
   repo is ever pushed publicly, purging it from history is the safe move — and
   note that anything already pushed should be treated as compromised, i.e.
   regenerate rather than reuse. (Low stakes today: nothing is published under
   it yet.)
2. **`Focusaurus.crx` is a build artifact** — 93KB of packed output. Belongs in
   `.gitignore`, not version control.

Also, `git` currently refuses to run in this directory: the repo is owned by a SID
from a different machine, so it trips Git's `dubious ownership` check. Fixed with
`git config --global --add safe.directory 'D:/Dev Projects/Focusaurus'` — worth
confirming that's the intended machine before adding the exception.
