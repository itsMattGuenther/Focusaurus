/* ==========================================================================
   Starter packs
   --------------------------------------------------------------------------
   These SEED a list, they do not govern it (PRODUCT.md §4.1): distraction is
   contextual, so a big authoritative "distracting sites" list is guaranteed to
   be wrong for someone in a way that costs trust. Packs exist to solve the
   cold-start problem — an empty text box makes you inventory your own
   weaknesses before you get any value.

   Rules for adding entries:
     - only sites whose PRIMARY mode is an infinite feed
     - nothing anyone plausibly needs for work (no GitHub, no Stack Overflow)
     - prefer a PATH over a whole domain when only part of a site is the trap.
       `linkedin.com/feed` blocks the doomscroll while leaving messages, jobs
       and profiles usable — a blunt `linkedin.com` block would get switched
       off within a day, and a rule you switch off protects nothing.
     - packs must stay DISJOINT. A site in two packs would make removal
       ambiguous, since provenance is a single `pack` field per site. Enforced
       by test/packs.test.js.
     - never auto-add to a user's list after onboarding

   Every entry is run through parseInput() by a test, so a typo here fails the
   build rather than silently dropping a site.
   ========================================================================== */

import { parseInput, specKey } from './match.js';

export const STARTER_PACKS = [
  {
    id: 'social',
    label: 'Social',
    blurb: 'Infinite scroll, mostly',
    sites: [
      'instagram.com',
      'x.com',
      'twitter.com',
      'tiktok.com',
      'facebook.com',
      'threads.net',
      'bsky.app',
      'snapchat.com',
      'pinterest.com',
      'tumblr.com',
      'mastodon.social',
      'vk.com',
      'weibo.com',
      // Path-scoped on purpose: the feed is the trap, the rest is a tool.
      'linkedin.com/feed',
    ],
  },
  {
    id: 'video',
    label: 'Video',
    blurb: 'Autoplay is the problem',
    sites: [
      // youtube.com itself is deliberately absent — it's genuinely work for a
      // lot of people. These two paths are the feed-shaped parts of it.
      'youtube.com/shorts',
      'youtube.com/feed/trending',
      'twitch.tv',
      'kick.com',
      'netflix.com',
      'hulu.com',
      'disneyplus.com',
      'max.com',
      'primevideo.com',
      'peacocktv.com',
      'paramountplus.com',
      'crunchyroll.com',
      'dailymotion.com',
      'tv.apple.com',
    ],
  },
  {
    id: 'forums',
    label: 'Forums',
    blurb: 'Great in small doses',
    sites: [
      'reddit.com',
      'news.ycombinator.com',
      'quora.com',
      '4chan.org',
      '9gag.com',
      'imgur.com',
      'lemmy.world',
      'digg.com',
      'boredpanda.com',
      'forums.somethingawful.com',
    ],
  },
  {
    id: 'news',
    label: 'News',
    blurb: 'Refreshing it won’t help',
    sites: [
      'cnn.com',
      'foxnews.com',
      'nytimes.com',
      'bbc.com/news',
      'theguardian.com',
      'washingtonpost.com',
      'msnbc.com',
      'nypost.com',
      'dailymail.co.uk',
      'huffpost.com',
      'buzzfeed.com',
      'vice.com',
      'politico.com',
      'thehill.com',
      'npr.org',
      'apnews.com',
      'reuters.com',
    ],
  },
  {
    id: 'shopping',
    label: 'Shopping',
    blurb: 'Browsing is the trap',
    sites: [
      'amazon.com',
      'ebay.com',
      'etsy.com',
      'aliexpress.com',
      'temu.com',
      'shein.com',
      'walmart.com',
      'target.com',
      'wish.com',
      'wayfair.com',
      'bestbuy.com',
      'newegg.com',
    ],
  },
  {
    id: 'games',
    label: 'Games',
    blurb: '“One quick game”',
    sites: [
      'chess.com',
      'lichess.org',
      // Scoped to the storefront subdomain so the community and support sites,
      // which people do use for real reasons, stay reachable.
      'store.steampowered.com',
      'epicgames.com',
      'itch.io',
      'poki.com',
      'coolmathgames.com',
      'miniclip.com',
      'roblox.com',
      'kongregate.com',
    ],
  },
];

export function packById(id) {
  return STARTER_PACKS.find((p) => p.id === id) || null;
}

/**
 * How much of a pack is already on the blocklist.
 *
 * PURE. Drives the chip's three visual states, so a pack is never a one-shot
 * button — you can see at a glance which packs are on, partly on, or off.
 *
 * @param {object} pack
 * @param {Array}  sites current site records
 * @returns {{present: number, total: number, state: 'none'|'partial'|'all'}}
 */
export function packStatus(pack, sites = []) {
  const have = new Set(sites.map((s) => specKey(s.match)));

  let present = 0;
  for (const entry of pack.sites) {
    const spec = parseInput(entry);
    if (spec && have.has(specKey(spec))) present += 1;
  }

  const total = pack.sites.length;
  return {
    present,
    total,
    state: present === 0 ? 'none' : present >= total ? 'all' : 'partial',
  };
}
