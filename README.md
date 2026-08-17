# 🦕 Focusaurus

**Focus mode for Chrome, with a dinosaur who notices.**

Focusaurus blocks the sites that eat your day. That part isn't new — a dozen
extensions do it. What's different is **Doug**, a small dinosaur who lives in the
extension, knows how your day is going, and reacts to it.

The bet: the reason website blockers fail isn't that they're too easy to bypass.
It's that they feel like a cop, so you turn them off and never turn them back on.
Focusaurus is trying to be the blocker you don't *want* to disable.

> **Status:** early. A working prototype exists (hard blocking + a site list).
> Everything below the "Now" line in [the roadmap](docs/ROADMAP.md) is unbuilt.

---

## The idea in one paragraph

You flip on focus mode. Distracting sites stop resolving — instead you get a
full-page dinosaur, gently pointing out that you asked not to be here. Over time
you stop hard-blocking things and start giving them *budgets* ("15 minutes of
Instagram, that's it"). Doug's mood tracks how the day is trending: pleased when
you're deep in a session, side-eyeing you at 80% of your Reddit budget, bummed
when it's blown. The mood is the interface — you learn how your day is going from
a glance at a cartoon lizard instead of reading a dashboard.

## Why this might actually be useful

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
  blocked. None of them tell you *"you reached for Twitter 23 times today,"*
  which is the number that actually changes behavior.

Full analysis, including who this is for and the honest case against building it:
[docs/PRODUCT.md](docs/PRODUCT.md).

## Why a Chrome extension and not a desktop app

Chrome extension, and it's not close for v1 — see
[Design → Platform decision](docs/DESIGN.md#adr-1-chrome-extension-mv3-not-a-desktop-app)
for the full reasoning. The short version:

- The distraction lives in the browser, and the browser is the only place you can
  render a **full-page dinosaur where the site should have been**. That
  interstitial is the entire emotional payload of this product. A desktop app
  blocking at the DNS/hosts layer gets you a connection error, not a character.
- A desktop app buys you *enforcement* (system-wide, harder to bypass) at the
  cost of admin privileges, per-OS work, code signing, antivirus false positives,
  and no store distribution.
- Enforcement is the wrong axis to compete on. Cold Turkey already won it. If
  you're determined enough to open Firefox to get around this, a stricter block
  wouldn't have saved you either.

If system-wide blocking ever becomes the thing standing between this and being
useful, the answer is a small Tauri companion daemon in v2+, not a rewrite.

## Roadmap at a glance

| Phase | Name | What lands |
| --- | --- | --- |
| v0.1 | Blocks | Fix the prototype: correct domain matching, real rule IDs, redirect-to-interstitial |
| v0.2 | Doug | Mood engine, 6 dino moods, the interstitial as hero surface, attempt counter |
| v0.3 | Time | Per-domain active-time tracking with idle handling. Visibility only |
| v0.4 | Budgets | Per-site daily budgets, soft warnings, budget-driven moods |
| v0.5 | Streaks | Day-over-day streaks, weekly review, earned dino cosmetics |
| v1.0 | Polish | Onboarding, schedules, override friction, Web Store listing |

Details and the deliberate **anti-roadmap** (what we're not building):
[docs/ROADMAP.md](docs/ROADMAP.md).

## Docs

- [docs/PRODUCT.md](docs/PRODUCT.md) — market reality, positioning, who it's for,
  design risks, what would make this fail
- [docs/DESIGN.md](docs/DESIGN.md) — architecture, data model, mood engine spec,
  numbered technical decisions, MV3 gotchas
- [docs/ROADMAP.md](docs/ROADMAP.md) — phased plan with exit criteria per phase

## Development

Currently a plain unbundled MV3 extension — no build step.

```bash
# Load in Chrome
# 1. chrome://extensions
# 2. Enable "Developer mode"
# 3. "Load unpacked" → select this directory
```

`Focusaurus.crx` and `Focusaurus.pem` in the repo root are a packed build and its
signing key from the original prototype. **The `.pem` is a private key and should
not be in version control** — see
[Design → Housekeeping](docs/DESIGN.md#housekeeping).

## The dinosaur

The species is *Focusaurus*. The individual is **Doug** — a mundane, slightly
dorky human name on a prehistoric reptile, which is funnier than a cute name and
much more memorable. Doug is a coworker, not a mascot. That's the register:
low-key, a bit resigned, on your side.

Doug's one rule, which governs every piece of art and copy in this product:
**Doug is disappointed *with* you, never *in* you.** Shame makes people uninstall
things. Doug is on your side, and Doug gets over it fast.
