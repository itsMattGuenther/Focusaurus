/** Original illustrated character set. The same artwork is used in every
 * surface; color is preserved on both paper and lamplight backgrounds. */
export const MOODS = {
  asleep: { label: 'Asleep', because: 'Outside your work hours. Time to rest.' },
  locked_in: { label: 'Locked in', because: 'Settled into an uninterrupted stretch.' },
  focused: { label: 'Focused', because: 'A little room for the work ahead.' },
  bummed: { label: 'Understanding', because: 'Some days take a few more fresh starts.' },
  side_eye: { label: 'Knowing', because: 'A gentle reminder of what you came to do.' },
  stoked: { label: 'Delighted', because: 'A moment worth feeling good about.' },
  chill: { label: 'Relaxed', because: 'Ready when you are.' },
};
export const DEFAULT_MOOD = 'chill';
export const ICON_VIEWBOX = '102 12 94 94';
const escape = (s) => String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function dougSVG(mood = DEFAULT_MOOD, opts = {}) {
  const resolved = Object.hasOwn(MOODS, mood) ? mood : DEFAULT_MOOD;
  const { breathing = true, className = '', viewBox = '0 0 200 200', name = 'Doug', assetBase } = opts;
  const src = assetBase ? `${assetBase}/doug-${resolved}.webp` : new URL(`../../assets/art/doug-${resolved}.webp`, import.meta.url).href;
  return `<svg class="doug ${breathing ? 'doug--breathing' : ''} ${escape(className)}" viewBox="${escape(viewBox)}" xmlns="http://www.w3.org/2000/svg" data-mood="${resolved}" role="img" aria-label="${escape(name)} the Focusaurus, looking ${MOODS[resolved].label.toLowerCase()}"><g class="doug__body"><image href="${escape(src)}" width="200" height="200"/></g></svg>`;
}

export function renderDoug(el, mood = DEFAULT_MOOD, opts = {}) {
  const resolved = Object.hasOwn(MOODS, mood) ? mood : DEFAULT_MOOD;
  const name = opts.name || 'Doug';
  // Frequent state refreshes must not restart animation or image decoding.
  if (el.dataset.mood === resolved && el.dataset.name === name) return el.firstElementChild;
  el.dataset.mood = resolved; el.dataset.name = name;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', `doug ${opts.breathing === false ? '' : 'doug--breathing'} ${opts.className || ''}`);
  svg.setAttribute('viewBox', opts.viewBox || '0 0 200 200');
  svg.dataset.mood = resolved;
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${name} the Focusaurus, looking ${MOODS[resolved].label.toLowerCase()}`);
  const body = document.createElementNS(svgNS, 'g');
  body.setAttribute('class', 'doug__body');
  const art = document.createElementNS(svgNS, 'image');
  art.setAttribute('href', opts.assetBase ? `${opts.assetBase}/doug-${resolved}.webp` : new URL(`../../assets/art/doug-${resolved}.webp`, import.meta.url).href);
  art.setAttribute('width', '200'); art.setAttribute('height', '200');
  body.append(art); svg.append(body); el.replaceChildren(svg);
  return el.firstElementChild;
}
