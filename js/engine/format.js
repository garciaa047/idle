// format.js — compact number formatting used everywhere numbers display.
// Small integers plain, then a suffix ladder (K, M, B, T, Qa, …, Dc), then
// scientific notation past the ladder, all at ~3 significant figures.

const SUFFIXES = [
  '', 'K', 'M', 'B', 'T',   // 1e0  1e3  1e6  1e9  1e12
  'Qa', 'Qi', 'Sx', 'Sp',   // 1e15 1e18 1e21 1e24
  'Oc', 'No', 'Dc',         // 1e27 1e30 1e33
];
// Beyond the last suffix (1e33 = Dc) switch to scientific (e.g. 1.23e36).
const SCI_THRESHOLD = Math.pow(1000, SUFFIXES.length); // = 1e36

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
    // ~3 significant figures: more decimals for the small lead digits.
    const decimals = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
    out = `${scaled.toFixed(decimals)}${SUFFIXES[tier]}`;
  } else {
    out = v.toExponential(2).replace('e+', 'e'); // e.g. 1.23e36
  }

  return neg ? `-${out}` : out;
}
