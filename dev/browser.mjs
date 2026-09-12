/** Use an explicitly selected Chromium binary in an isolated test profile. */
export const browserOptions = {
  channel: 'chromium',
  ...(process.env.FOCUSAURUS_CHROMIUM_PATH ? { executablePath: process.env.FOCUSAURUS_CHROMIUM_PATH } : {}),
};
