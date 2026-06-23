// format.js — compact number formatting used everywhere numbers display.
// Small integers plain, then K/M/B/T suffixes, then scientific past the suffixes.

const SUFFIXES = ['', 'K', 'M', 'B', 'T'];
const SCI_THRESHOLD = 1e15; // beyond T-suffix range -> scientific notation

export function format(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '0';

  const neg = n < 0;
  let v = Math.abs(n);

  let out;
  if (v < 1000) {
    // Small: show integers plainly; show up to 1 decimal for fractional values.
    out = v < 10 && !Number.isInteger(v) ? v.toFixed(1) : String(Math.floor(v));
  } else if (v < SCI_THRESHOLD) {
    const tier = Math.min(SUFFIXES.length - 1, Math.floor(Math.log10(v) / 3));
    const scaled = v / Math.pow(1000, tier);
    // 2 sig-figs after the lead digit keeps it compact (e.g. 1.23M).
    out = `${scaled.toFixed(scaled < 100 ? 2 : 0)}${SUFFIXES[tier]}`;
  } else {
    out = v.toExponential(2).replace('e+', 'e'); // e.g. 1.23e18
  }

  return neg ? `-${out}` : out;
}
