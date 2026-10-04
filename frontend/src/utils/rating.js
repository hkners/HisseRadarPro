// Mirrors backend services/ticker_resolver.parse_rating: AL / TUT / SAT / OTHER.
// Whole-word matching, so "Endekse Paralel" or "Endeks Altı" are never read as "AL".
const FOLD = { Ç: 'C', Ğ: 'G', İ: 'I', I: 'I', Ö: 'O', Ş: 'S', Ü: 'U', ç: 'C', ğ: 'G', ı: 'I', i: 'I', ö: 'O', ş: 'S', ü: 'U' };
const BUY = new Set(['AL', 'BUY', 'EKLE', 'ARTIR', 'OUTPERFORM', 'OVERWEIGHT', 'ACCUMULATE']);
const HOLD = new Set(['TUT', 'HOLD', 'NOTR', 'NEUTRAL', 'MARKETPERFORM', 'PARALEL']);
const SELL = new Set(['SAT', 'SELL', 'AZALT', 'UNDERPERFORM', 'UNDERWEIGHT', 'REDUCE']);

export function classifyRating(text) {
  if (!text) return 'OTHER';
  const s = String(text).replace(/[ÇĞİIÖŞÜçğıiöşü]/g, c => FOLD[c]).toUpperCase();
  if (s.includes('ENDEKS') || s.includes('PIYASA')) {
    if (s.includes('UST') || s.includes('UZER')) return 'AL';
    if (s.includes('PARALEL') || s.includes('NOTR')) return 'TUT';
    if (s.includes('ALT')) return 'SAT';
  }
  const words = s.split(/[^A-Z]+/);
  if (words.some(w => SELL.has(w))) return 'SAT';
  if (words.some(w => BUY.has(w))) return 'AL';
  if (words.some(w => HOLD.has(w))) return 'TUT';
  return 'OTHER';
}
