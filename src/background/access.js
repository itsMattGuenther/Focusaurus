import { extensionApi as chrome } from '../shared/browser.js';
/** Check effective host grants, including permissions withheld in browser controls. */
export async function siteAccess(sites) {
  try {
    if (await chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] })) {
      return { granted: true };
    }
    const hosts = [...new Set(sites.map((site) => site.match.value.split('/')[0]))];
    // Blocks include subdomains and both schemes. A grant for only one exact
    // host cannot cover the whole block, even for a path entry. Check the list
    // in one API call so a large blocklist stays responsive with limited access.
    const origins = hosts.flatMap((host) => [`http://*.${host}/*`, `https://*.${host}/*`]);
    return { granted: !origins.length || await chrome.permissions.contains({ origins }) };
  } catch {
    return { granted: false, unavailable: true };
  }
}
