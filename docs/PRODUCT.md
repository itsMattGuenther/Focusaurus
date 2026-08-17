# Focusaurus — Product Thinking

The point of this document is to make the idea falsifiable. What are we betting
on, who is it for, and what would tell us we're wrong.

---

## 1. Is there real demand?

Yes for the category, and yes for the specific angle — but they're two different
questions and worth separating.

### Demand for blocking: proven, saturated

Website blockers are a mature category with millions of installs across
BlockSite, StayFocusd, LeechBlock NG, Cold Turkey, Freedom, and FocusMe. Nobody
needs to be convinced the problem exists. **This means "a website blocker" is not
a product idea.** It's table stakes.

### Demand for *gamified* focus: proven, and mostly unserved on desktop

This is the interesting signal. Forest — plant a tree, leave the app and it dies
— has 40M+ users and has been a top paid productivity app in 136 countries. The
mechanic is loss aversion applied to something you've been caring for. That works
well enough that people pay for it, repeatedly, in a category where free
alternatives are one search away.

Forest is mobile-first. **Desktop browser blockers have no equivalent.** The
emotional layer that made Forest a phenomenon is simply absent from the place
where most knowledge work — and most knowledge-work procrastination — happens.

### Where incumbents are weak

Researched complaints, not speculation:

| Tool | Rating | The actual weakness |
| --- | --- | --- |
| BlockSite | 3.8★ | Free tier blocks **3 sites**, ad-supported, aggressive upsell |
| StayFocusd | 4.4★ | Stagnant dev, no cross-device sync, no whitelist mode, Chrome-only, confusing settings |
| LeechBlock NG | high | Extremely capable, UI is a wall of config forms |
| Cold Turkey / Freedom | high | Paid, enforcement-focused, deliberately punitive |

The pattern: they're either **crippled to sell you something** or **built like
sysadmin tools**. Nothing in this category is *pleasant*.

### The honest case against building this

State it plainly so it isn't a surprise later:

1. **Blockers have terrible retention, industry-wide.** The common arc is install
   → two good weeks → one bad day → disable → uninstall. Whatever we build has to
   survive that bad day.
2. **Cute wears off.** Novelty decays fast. If Doug is only charming, Doug is
   charming for a week. Doug has to become *informative* — the mood has to tell
   you something you'd otherwise have to go read.
3. **You cannot win on enforcement, ever.** A browser extension is bypassable in
   four keystrokes (open another browser). Any roadmap item premised on "making
   it harder to escape" is wasted effort.
4. **Nobody is asking for another one of these.** This is a personal project
   whose primary user is you. That's a completely legitimate reason to build it —
   but it means "did anyone else adopt it" is the wrong success metric.

---

## 2. Positioning

> **Focusaurus is not a stricter blocker. It's the blocker you don't want to
> turn off.**

Every design decision resolves against that sentence. The competitive axis is
*voluntary retention*, not enforcement strength.

Concretely, that means when we face a choice:

- Harder to bypass **vs.** more pleasant to keep on → **pleasant wins.**
- More configurable **vs.** good defaults in 30 seconds → **defaults win.**
- More data shown **vs.** one legible signal → **one signal wins.**

## 3. Who it's for

**Primary:** someone who works in a browser all day, has tried a blocker,
and stopped using it. They don't need to be convinced distraction is a problem —
they need a tool that doesn't feel like punishment. Mildly nerdy, likes the idea
of a pet, would find a sad dinosaur funnier than a progress bar.

**Explicitly not for:**

- People with a serious compulsion problem. They need Cold Turkey's enforcement
  or actual help, and a friendly dinosaur is the wrong tool. Don't market at them.
- Parents restricting kids' browsing. Different product, different threat model
  (the user is adversarial rather than consenting), and it would drag the design
  toward exactly the punitive enforcement we're avoiding.
- Teams / employee monitoring. Poisons the whole premise.

## 4. Three critiques of the original concept

### 4.1 "Should we curate a list of distracting sites?" — mostly no

Curation is a trap, because distraction is contextual. YouTube is work for a video
editor. Reddit is research for a dev. Twitter is a newsroom. A curated global
"distracting sites" list will be wrong for everyone in some specific, annoying
way, and every wrong entry is a reason to open the settings and lose trust.

But the alternative — an empty text input — is worse. That's the current prototype
and it has a cold-start problem: the user has to sit and *think* of their own
weaknesses before getting any value.

**Resolution:** ship a handful of small opinionated **starter packs** (Social,
Video, News, Shopping, Forums) shown during onboarding as accept/reject chips.
Pick your poison in 15 seconds, then it's yours to edit. The packs are a
*seeding mechanism*, not a curated authority — and we should never auto-add to
someone's list after onboarding.

### 4.2 Hard blocking is the weakest mechanic. Budgets are the actual product.

The v1 idea (binary block) is the commodity. The v2 idea (*"only 15 minutes of
Instagram today"*) is the differentiator, and it's a much better fit for how
people actually want to live — most people don't want Instagram *gone*, they want
it *bounded*.

Binary blocking also has a nasty failure mode: it's all-or-nothing, so the only
available action on a bad day is to disable everything. A budget degrades
gracefully. You can blow today's budget and still have a working system tomorrow.

**Resolution:** blocking still ships first — it's the enforcement primitive
budgets are built on, and it's already half-working. But the data model is
designed for budgets from day one (see
[DESIGN.md → Data model](DESIGN.md#4-data-model)), and budgets are v0.4, not
"some future version."

### 4.3 The mood dinosaur is the best idea here *and* the biggest risk

The risk is precise: **a sad dino can read as shame, and shame makes people
uninstall.** This is the single most likely way the product dies. The mechanic
that makes Forest work (a dead tree) is also why some people find Forest
stressful and quit.

Three rules that fall out of this, specified properly in
[DESIGN.md → Mood engine](DESIGN.md#5-the-mood-engine):

1. **Negative moods are transient and cheap to exit.** One decent focus session
   pulls Doug out of a bad mood immediately. Nothing carries over past midnight.
   Forest kills your tree but lets you plant another one *right now* — that
   recovery path is the load-bearing part, not the death.
2. **Doug is disappointed with you, not in you.** First-person plural: *"we said
   15 minutes."* Never "you failed," never a deficit number.
3. **No streak longer than a week is ever displayed as at-risk.** Long streaks
   invert into anxiety and then a single miss torches the whole thing. Cap the
   visible pressure.

---

## 5. What we're betting on

Falsifiable claims, roughly in order of how load-bearing they are:

1. **A character makes people keep a blocker installed longer than a UI does.**
   *Falsified if:* you personally disable it on the first bad day anyway. That's
   the whole thesis and you're the test subject.
2. **The interstitial is the highest-leverage surface in the product.** The moment
   you're caught reaching for a blocked site is the moment of maximum attention.
   *Falsified if:* you start reflexively closing the tab without reading it —
   which is why the copy has to rotate (see
   [DESIGN.md → ADR-6](DESIGN.md#adr-6-rotating-interstitial-copy)).
3. **Attempt count is the killer stat.** "You reached for Twitter 23 times today"
   is more behavior-changing than "you spent 40 minutes on Twitter," because it
   exposes the *reflex* rather than the time.
   *Falsified if:* it's just a number you glance at and forget.
4. **Budgets beat blocks for long-term use.** *Falsified if:* you end up putting
   everything back on hard-block because budgets are too fiddly.

## 6. Success criteria

For a personal project, installs and MAU are vanity. The real bar:

- **8 weeks after v0.2 ships, is it still enabled in your browser?** That's the
  headline metric. Everything else is secondary.
- Can a stranger get from install to a configured, running focus session in under
  60 seconds without reading anything?
- Does the mood glance actually replace opening the stats page?
- Is the codebase still pleasant to come back to after a month away? (This is a
  portfolio piece as much as a tool.)

## Sources

- [Top 10 Web Blocker Chrome Extensions](https://www.creolestudios.com/web-blocker-chrome-extensions/)
- [Best Website Blockers for Chrome and Firefox in 2026](https://siteblocker.app/blog/best-website-blockers-2026)
- [StayFocusd Alternatives for Stronger Website Blocking](https://www.digitalzen.app/blog/stayfocusd-alternative/)
- [BlockSite on the Chrome Web Store](https://chromewebstore.google.com/detail/blocksite-block-websites/eiimnmioipafcokbfikbljfdeojpcgbh)
- [How Forest Leverages Gamification to Boost Retention](https://trophy.so/blog/forest-gamification-case-study)
- [How Forest uses gamification to retain users](https://medium.com/design-bootcamp/how-a-top-rated-productivity-app-forest-uses-gamification-to-retain-users-9345f6867a2d)
- [Stay focused and grow a Forest: design and paradoxes of gamified digital disconnection](https://www.researchgate.net/publication/385812746_Stay_focused_and_grow_a_Forest_The_design_and_paradoxes_of_gamified_digital_disconnection)
- [Website Blocking Schedule and Time Limits](https://focusguard.one/blog/website-blocking-schedule-and-time-limits/)
- [How to Block Distracting Websites and Stay Focused 2026](https://www.asianefficiency.com/productivity/block-distracting-websites/)
