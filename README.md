# 🦕 Focusaurus

**Focus mode for Chrome, with a dinosaur who notices.**

Focusaurus blocks the sites that eat your day. That part isn't new — a dozen
extensions do it. What's different is **Doug**, a small dinosaur who lives in the
extension, knows how your day is going, and reacts to it.

The bet: the reason website blockers fail isn't that they're too easy to bypass.
It's that they feel like a cop, so you turn them off and never turn them back on.
Focusaurus is trying to be the blocker you don't *want* to disable.

> **Status:** v0.2 in progress. Blocking works, Doug's proportions and icons
> are redrawn, sessions run, attempt history reports the week, and the palette
> now clears WCAG AA in both themes with a test that keeps it there. Keyboard
> and focus-order audit next, then time tracking — see
> [the roadmap](docs/ROADMAP.md).

---

## 💡 The idea in one paragraph

You flip on focus mode. Distracting sites stop resolving — instead you get a
full-page dinosaur, gently pointing out that you asked not to be here. Over time
you stop hard-blocking things and start giving them *budgets* ("15 minutes of
Instagram, that's it"). Doug's mood tracks how the day is trending: pleased when
you're deep in a session, side-eyeing you at 80% of your Reddit budget, bummed
when it's blown. The mood is the interface — you learn how your day is going from
a glance at a cartoon lizard instead of reading a dashboard.

## ✅ What works today

- **Focus sessions** — 25 / 50 / 90 minutes, or open-ended. A live countdown
  runs on the toolbar badge, and the session ends itself on an alarm.
- **Real blocking** — anchored domain and path matching, so `reddit.com` covers
  every subdomain and nothing else. `youtube.com/shorts` can be blocked while
  leaving YouTube alone.
- **The interstitial** — blocked navigations *redirect* to a full-page Doug
  instead of Chrome's error page. It shows what you reached for, how many times
  today, and how long is left.
- **Doug, in seven moods** — one SVG body, mood-swapped face, redrawn in v0.2
  against the specimen plate. He breathes and blinks. Run `npm run doug` to see
  the whole set.
- **Attempt counting** — "12th time today" is the stat we think actually changes
  behavior, because it exposes the reflex rather than the elapsed time.
- **Attempt history** — trailing seven days, counted from the same buckets
  the interstitial already writes. The popup names today's total and the
  week's leader; settings lists every site, neutrally. "You reached for
  reddit.com 40 times" is the sentence. Time spent is still ahead.
- **Breathing-room overrides** — Doug sits there for 15 seconds before the
  "let me in for 5 minutes" button unlocks. Tunable; strict mode removes it.
- **Category packs** — 77 sites across six toggleable categories (Social, Video,
  Forums, News, Shopping, Games). Combine any of them; each chip shows whether
  it's off, partial, or fully on. Sites that are only *partly* a trap are
  path-scoped, so `linkedin.com/feed` is blocked while the rest of LinkedIn
  keeps working.
- **Work hours** — focus mode turns itself on during a schedule you set, so
  there's no daily decision to make. End a session by hand and it won't restart
  until the next window, because a blocker that fights you gets uninstalled.
- **A settings page** — strictness (how long Doug makes you wait), override
  length, schedule, his name, plus settings export/import as JSON.
- **Local only** — no accounts, no servers, no analytics, no network requests.

## 📊 Why this might actually be useful

The category is crowded but *badly served*, and the gap is specific:

- **Gamified focus has enormous proven demand — on mobile.** Forest has 40M+
  users on the strength of one mechanic: you care about the tree, so you don't
  touch your phone.
- **Desktop browser blockers are all utilitarian.** BlockSite (3.8★, aggressive
  paywall — free tier blocks *three* sites), StayFocusd (4.4★ but barely
  maintained, no sync, no Firefox), LeechBlock (powerful, looks like a 2009
  config panel). Nobody has brought the Forest mechanic to the place where
  knowledge work actually happens.
- **Nobody instruments the interesting moment.** Every blocker tells you what it
  blocked. None of them tell you *"you reached for Twitter 23 times today."*

Full analysis, including who this is for and the honest case against building it:
[docs/PRODUCT.md](docs/PRODUCT.md).

## 🌐 Why a Chrome extension and not a desktop app

Chrome extension, and it's not close — see
[Design → ADR-1](docs/DESIGN.md#adr-1-chrome-extension-mv3-not-a-desktop-app).
The short version:

- The browser is the only place you can render a **full-page dinosaur where the
  site should have been**. That interstitial is the entire emotional payload of
  this product. A desktop app blocking at the DNS/hosts layer gets you
  `ERR_CONNECTION_REFUSED` — an error page you don't control, with nowhere to put
  a character.
- A desktop app buys you *enforcement* at the cost of admin privileges, per-OS
  work, code signing, antivirus false positives, and no store distribution.
- Enforcement is the wrong axis to compete on. Cold Turkey already won it. If
  you're determined enough to open Firefox to get around this, a stricter block
  wouldn't have saved you either.

A Tauri companion daemon stays deferred — revisited only if browser-only
enforcement turns out to be the actual bottleneck, and then as a satellite
alongside the extension rather than a replacement for it.

## 🎨 Design

Design is treated as equal in weight to functionality here, not a pass at the
end. Everything visual derives from [src/shared/tokens.css](src/shared/tokens.css)
— no surface hardcodes a color, size, or duration.

**Direction: field guide.** A naturalist's notebook — warm pressed paper, ink
hairlines, moss and clay. Doug is a specimen being observed, not a mascot being
marketed. Deliberately not the cold utilitarian register every other blocker
lives in.

- **Type** — [Fraunces](https://github.com/undercasetype/Fraunces) for display,
  driven through its optical-size axis so large type gets tighter letterforms;
  [Public Sans](https://github.com/uswds/public-sans) for body and UI. Both
  bundled locally, both OFL.
- **Light and dark** — full token swap, with an explicit choice always beating
  the OS preference. Every text and focus-ring pair in both palettes clears
  WCAG AA, measured by `npm run contrast` and asserted by the test suite, so a
  later palette tweak can't quietly break it.
- **Texture** — inline SVG fractal grain, so large paper fills have tooth
  instead of looking like dead vector space.
- **Motion** — one orchestrated entrance on the interstitial with staggered
  reveals, and Doug's idle breathing. Everything collapses under
  `prefers-reduced-motion`.

## 🗺️ Roadmap at a glance

| Phase | Name | What lands | |
| --- | --- | --- | --- |
| v0.1 | Blocks | Correct blocking, sessions, Doug, the interstitial | ✅ |
| v0.2 | Doug | Settings + schedule + redrawn Doug + icons + attempt history | ◐ |
| v0.3 | Time | Per-domain active-time tracking with idle handling | |
| v0.4 | Budgets | Per-site daily budgets, soft warnings, budget moods | |
| v0.5 | Streaks | Day-over-day streaks, earned dino cosmetics | |
| v1.0 | Polish | Onboarding, schedules, Web Store listing, Firefox | |

Details and the deliberate **anti-roadmap** (what we're not building):
[docs/ROADMAP.md](docs/ROADMAP.md).

## 🧪 Development

No build step and no dependencies — it's a plain unbundled MV3 extension.

```bash
# Load it
#   1. chrome://extensions
#   2. Enable "Developer mode"
#   3. "Load unpacked" -> select this directory

npm test        # 189 tests over the pure logic modules, no browser needed
npm run doug    # regenerate dev/doug-sheet.html — every mood, both themes
npm run contrast # WCAG contrast table for both palettes, with the selectors
```

The modules most likely to harbour a subtle bug — rule compilation, site
matching, mood resolution, schedule decisions, settings validation — are pure
functions with no `chrome.*` calls, so they run under node's built-in test
runner with no mocking
([ADR-8](docs/DESIGN.md#adr-8-pure-core-testable-without-chrome)). The design
system gets the same treatment: because no surface hardcodes a color, the
palette is data in one file, and contrast is arithmetic rather than something
you eyeball in a browser.

```
src/
  background/   service-worker.js (the only stateful file), rules.js,
                mood.js, storage.js
  blocked/      the interstitial — the hero surface
  popup/        session control, blocklist
  options/      settings, schedule, full site list, backup
  shared/       tokens.css (design system), doug.js, match.js, copy.js,
                schedule.js, session.js, redirect.js
```

## 📚 Docs

- [docs/PRODUCT.md](docs/PRODUCT.md) — market reality, positioning, who it's for,
  design risks, and what would make this fail
- [docs/DESIGN.md](docs/DESIGN.md) — architecture, 10 numbered decisions, data
  model, mood engine spec, MV3 gotchas
- [docs/ROADMAP.md](docs/ROADMAP.md) — phased plan with exit criteria per phase

## 🦖 The dinosaur

The species is *Focusaurus*. The individual is **Doug** — a mundane, slightly
dorky human name on a prehistoric reptile, which is funnier than a cute name and
much more memorable. Doug is a coworker, not a mascot. That's the register:
low-key, a bit resigned, on your side.

Doug's one rule, which governs every piece of art and copy in this product:
**Doug is disappointed *with* you, never *in* you.** Shame makes people uninstall
things. Doug is on your side, and Doug gets over it fast — a single decent
session pulls him out of any bad mood, and nothing negative survives midnight.
That's enforced in [mood.js](src/background/mood.js) and there's a test named
after it.
