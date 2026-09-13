/** Produce store-specific manifests while sharing the runtime implementation. */
export const FIREFOX_ID = 'focusaurus@itsmattguenther';
export function manifestFor(base, target) {
  if (!['chrome', 'firefox'].includes(target)) throw new Error(`Unknown browser: ${target}`);
  const manifest = structuredClone(base);
  if (target === 'firefox') {
    delete manifest.minimum_chrome_version;
    manifest.background = { scripts: [base.background.service_worker], type: 'module' };
    manifest.browser_specific_settings = { gecko: {
      id: FIREFOX_ID,
      strict_min_version: '153.0',
      data_collection_permissions: { required: ['none'] },
    } };
  }
  return manifest;
}
