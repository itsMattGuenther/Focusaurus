/* ==========================================================================
   Starter packs
   --------------------------------------------------------------------------
   Deliberately small. These SEED a list, they do not govern it
   (PRODUCT.md §4.1): distraction is contextual, so a big authoritative
   "distracting sites" list is guaranteed to be wrong for someone in a way
   that costs trust. Packs exist purely to solve the cold-start problem — an
   empty text box makes you sit and inventory your own weaknesses before you
   get any value.

   Rules of thumb for adding entries here:
     - only sites whose PRIMARY mode is an infinite feed
     - nothing anyone plausibly needs for work (no GitHub, no Stack Overflow)
     - never auto-add to a user's list after onboarding
   ========================================================================== */

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
    ],
  },
  {
    id: 'video',
    label: 'Video',
    blurb: 'Autoplay is the problem',
    sites: [
      'youtube.com/shorts',
      'twitch.tv',
      'netflix.com',
      'hulu.com',
    ],
    // Note: youtube.com itself is intentionally absent — it's genuinely work
    // for a lot of people. Shorts is the feed-shaped part.
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
    ],
  },
];

export function packById(id) {
  return STARTER_PACKS.find((p) => p.id === id) || null;
}
