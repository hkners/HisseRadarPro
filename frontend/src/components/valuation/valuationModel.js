// Turns broker targets + /stocks/{t}/valuation into football-field rows.

const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const upsidePct = (value, price) =>
  value != null && price ? ((value - price) / price) * 100 : null;

export const fmtPrice = (v) =>
  v == null ? '—' : v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export { fmtPct } from '../../utils/format';

/** Latest target per broker, as numbers. `uniqueRecs` is already one report per broker. */
export function brokerTargets(uniqueRecs) {
  return uniqueRecs
    .map(r => ({ kurum: r.kurum, date: r.tarih, value: parseFloat(String(r.hedefFiyat ?? '').replace(',', '.')) }))
    .filter(t => Number.isFinite(t.value) && t.value > 0);
}

/**
 * Rows for the football field, each { key, label, low, mid, high, detail, points? }.
 * Methods without data are omitted rather than drawn empty.
 */
export function buildValuationRows({ targets, valuation }) {
  const rows = [];

  if (targets.length) {
    const values = targets.map(t => t.value);
    rows.push({
      key: 'brokers',
      label: 'Kurum hedefleri',
      low: Math.min(...values),
      mid: median(values),
      high: Math.max(...values),
      detail: `${targets.length} kurumun son hedef fiyatı · çentik medyan`,
      points: targets,
    });
  }

  const group = valuation?.peer_group_name;
  if (valuation?.pe) {
    const pe = valuation.pe;
    rows.push({
      key: 'pe',
      label: 'F/K emsal',
      low: pe.low, mid: pe.mid, high: pe.high,
      detail: `${group} F/K çeyrekleri (${pe.sector_p25}x · ${pe.sector_median}x · ${pe.sector_p75}x) × HBK ${pe.per_share.toFixed(2)} · ${pe.peers_used} emsal`,
    });
  }
  if (valuation?.pb) {
    const pb = valuation.pb;
    rows.push({
      key: 'pb',
      label: 'PD/DD emsal',
      low: pb.low, mid: pb.mid, high: pb.high,
      detail: `${group} PD/DD çeyrekleri (${pb.sector_p25}x · ${pb.sector_median}x · ${pb.sector_p75}x) × defter değeri ${pb.per_share.toFixed(2)} · ${pb.peers_used} emsal`,
    });
  }
  if (valuation?.week52) {
    const { low, high } = valuation.week52;
    rows.push({
      key: 'w52',
      label: '52 hafta bandı',
      low, mid: null, high,
      detail: 'Son 52 haftada görülen en düşük ve en yüksek fiyat',
    });
  }
  return rows;
}
