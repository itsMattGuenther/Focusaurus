# Roadmap after the first Chrome release

## Release candidate · 1.0.0

Finish the gates in [RELEASE-READINESS.md](RELEASE-READINESS.md), review the
[submission kit](STORE-LISTING.md), and submit through the chosen publisher’s
Chrome Web Store account. The repository’s former multi-phase v0.x plan is
superseded by this focused release scope.

## Browser sequence · updated September 13, 2026

Chrome preparation is complete. The user authorized the Firefox port on
September 13; the repository now builds separate Chrome and Firefox candidates.
Complete Mozilla signing/listing through the chosen publisher account before
sharing a normally installable Firefox release. Brave uses the Chrome Web Store
package and passes the same 21 integration tests locally; a focused pilot
still covers normal store installation and updates. Publisher identity tasks
are planned for Monday, September 14, followed by a friends-and-family pilot.

## First two weeks · earn trust

- Run an opt-in pilot with a small group. Learn whether Doug stays enabled.
- Check first-session setup time and whether category/path behavior is understood.
- Ask whether the character/copy feels supportive, especially after repeat attempts.
- Gather examples of blocked work sites or missed distractions; fix correctness
  before adding mechanics. Keep all feedback collection explicit and voluntary.
- Test browser updates and permissions with the documented manual matrix.

## Next · evidence-led improvements

| Candidate | Gate before building |
| --- | --- |
| Time tracking | Users request visibility; focused-tab/idle/sleep accounting can be measured accurately without excessive permissions. |
| Per-site budgets | Tracking is demonstrably accurate and pilot users prefer budgets over sessions. Give every limit a clear recovery path. |
| Gentle completed-session review | Users want progress context beyond attempt counts; avoid pressure and scorekeeping. |
| Older Firefox ESR / Android | Explicit demand and independent lifecycle, permission and UI validation. Desktop 153+ is the current Firefox target. |
| Sync | Explicit user demand; opt-in design and an honest privacy model. Never reintroduce a single oversized Chrome sync item. |
| More character poses | Keep silhouette/texture consistency; review at real sizes and with reduced motion. |

## Deliberately outside scope

Employee monitoring, parental controls, invasive enforcement, social leaderboards,
hidden analytics, medical claims, desktop daemons, and engagement mechanics
designed to keep someone inside a productivity app.
