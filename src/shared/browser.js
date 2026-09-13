/** Native Promise APIs in Firefox; Chrome MV3 already supplies Promise APIs. */
export const isFirefox = typeof globalThis.browser?.runtime?.getBrowserInfo === 'function';
export const extensionApi = isFirefox ? globalThis.browser : globalThis.chrome;

/** Extension URL hosts and public add-on IDs are different values in Firefox. */
export function trustedPage(sender, runtime = extensionApi.runtime) {
  try {
    const expected = new URL(runtime.getURL('/'));
    const actual = new URL(sender.url);
    return sender.id === runtime.id && actual.protocol === expected.protocol &&
      actual.host === expected.host ? actual.pathname : null;
  } catch { return null; }
}
