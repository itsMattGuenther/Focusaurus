/* ==========================================================================
   Session math
   --------------------------------------------------------------------------
   PURE MODULE (DESIGN.md ADR-8).

   Split out of the service worker so the badge's arithmetic is testable. The
   badge is the only always-visible surface in the product, so being subtly
   wrong there undermines trust in everything else the extension claims.

   Every value is derived from `endsAt` at call time — never decremented from a
   previous value. That's the same checkpoint discipline as ADR-5: a paint that
   gets skipped (dead worker, sleeping machine, throttled alarm) must not make
   the next one wrong, only late.
   ========================================================================== */

/** Sessions at or above this planned length are treated as open-ended. */
export const OPEN_ENDED_MINUTES = 720;

/** Above this many minutes remaining, the badge switches to hours — three
 *  digits is unreadable at 16px. */
const HOURS_THRESHOLD = 100;

export function sessionActive(session, now = Date.now()) {
  return Boolean(session && session.endsAt > now);
}

export function isOpenEnded(session) {
  return Boolean(session && session.plannedMinutes >= OPEN_ENDED_MINUTES);
}

/** Whole minutes left, rounded up. Never 0 while any time remains, so the
 *  badge can't read "0" on a session that's still enforcing. */
export function minutesRemaining(session, now = Date.now()) {
  if (!sessionActive(session, now)) return 0;
  return Math.max(1, Math.ceil((session.endsAt - now) / 60000));
}

/**
 * Text for the toolbar badge. Empty string means "clear it".
 *
 * An open-ended session shows ∞ rather than counting down from 720, which is
 * both meaningless and wider than the badge.
 */
export function badgeText(session, now = Date.now()) {
  if (!sessionActive(session, now)) return '';
  if (isOpenEnded(session)) return '∞';

  const mins = minutesRemaining(session, now);
  if (mins >= HOURS_THRESHOLD) return `${Math.round(mins / 60)}h`;
  return String(mins);
}
