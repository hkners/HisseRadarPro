// Strategy spec helpers shared by the Backtest page and the screener's "Backtest et" button.

export const DEFAULT_SPEC = {
  name: '',
  kind: 'rank',
  universe: 'all',
  rank_factor: 'mom_12_1',
  rank_order: null,
  top_n: 20,
  filters: [],
  weighting: 'equal',
  timing_asset: 'XU100',
  sma_window: 200,
  rebalance: 'monthly',
  start: '2012-01-01',
  end: null,
  cost_bps: 20,
  min_turnover_tl: 5000000,
  cash_rate: 0,
};

export const EXAMPLES = [
  {
    title: 'XU100 200 günlük ortalamanın üstündeyse XU100, değilse nakit',
    tag: 'Trend takibi · günlük',
    spec: { ...DEFAULT_SPEC, name: 'XU100 trend filtresi', kind: 'timing', timing_asset: 'XU100', sma_window: 200, rebalance: 'daily', start: '2022-09-01' },
  },
  {
    title: '12-1 momentum, ilk 20',
    tag: 'Momentum · aylık',
    spec: { ...DEFAULT_SPEC, name: '12-1 momentum ilk 20', rank_factor: 'mom_12_1', top_n: 20, rebalance: 'monthly' },
  },
  {
    title: 'En düşük volatiliteli 30 hisse',
    tag: 'Düşük volatilite · çeyreklik',
    spec: { ...DEFAULT_SPEC, name: 'Düşük volatilite 30', rank_factor: 'vol_90', rank_order: 'asc', top_n: 30, rebalance: 'quarterly' },
  },
  {
    title: '12 aylık getiriye göre ilk 20',
    tag: 'Momentum · 2012\'den beri',
    spec: { ...DEFAULT_SPEC, name: '12 aylık getiri ilk 20', rank_factor: 'ret_12m', top_n: 20, rebalance: 'monthly' },
  },
];

const UNIVERSE_TEXT = { all: 'tüm BIST hisseleri', bist30: 'BIST 30', bist100: 'BIST 100' };
const REBALANCE_TEXT = { daily: 'Her gün', weekly: 'Her hafta', monthly: 'Her ay', quarterly: 'Her çeyrek' };
const OP_TEXT = { '>': 'üzerinde', '>=': 've üzerinde', '<': 'altında', '<=': 've altında' };

const fmtVal = (f, v, factors) => {
  const unit = factors[f]?.unit;
  if (unit === '%') return `%${String(v).replace('.', ',')}`;
  if (unit === 'TL') return `${Number(v).toLocaleString('tr-TR')} TL`;
  return String(v).replace('.', ',');
};

/** One readable sentence for a spec, e.g. "Her ay, BIST 100 içinde ... en yüksek 15 hisseyi eşit ağırlıkla al." */
export function describeSpec(spec, factorList = []) {
  const factors = Object.fromEntries(factorList.map(f => [f.id, f]));
  const label = (id) => (factors[id]?.label || id).toLocaleLowerCase('tr');
  if (spec.kind === 'timing') {
    return `${REBALANCE_TEXT[spec.rebalance]} kontrol et: ${spec.timing_asset}, ${spec.sma_window} günlük ortalamasının üzerindeyse ${spec.timing_asset} tut, değilse nakitte bekle.`;
  }
  const order = spec.rank_order || factors[spec.rank_factor]?.order || 'desc';
  const filters = (spec.filters || []).map(f => `${label(f.factor)} ${fmtVal(f.factor, f.value, factors)} ${OP_TEXT[f.op]}`);
  const where = filters.length ? `, ${filters.join(' ve ')} olan hisselerden` : '';
  return `${REBALANCE_TEXT[spec.rebalance]}, ${UNIVERSE_TEXT[spec.universe]} içinde${where} ${label(spec.rank_factor)} ${order === 'desc' ? 'en yüksek' : 'en düşük'} ${spec.top_n} hisseyi ${spec.weighting === 'equal' ? 'eşit ağırlıkla' : 'volatiliteyle ters orantılı ağırlıkla'} al.`;
}

export const encodeSpec = (spec) => encodeURIComponent(JSON.stringify(spec));
/** `raw` comes from URLSearchParams.get(), which has already percent-decoded it. */
export const decodeSpec = (raw) => {
  try { return { ...DEFAULT_SPEC, ...JSON.parse(raw) }; } catch { return null; }
};
