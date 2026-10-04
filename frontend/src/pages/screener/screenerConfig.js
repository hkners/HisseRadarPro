// Presets and filters for the unified screener. Every rule is a plain predicate on a
// /api/screener/universe row, so counts, filtering and saved screens all share one definition.
// Rows must go through normalizeRows first: missing numbers become NaN so that every comparison
// on them is false (with null, `null < 10` would be true and leak rows into "below" filters).
import { BIST30, BIST100 } from '../../utils/bistIndices';
import { trSector } from '../../utils/sectors';

const NUMERIC_FIELDS = [
  'price', 'change_pct', 'market_cap', 'pe', 'pb', 'div_yield', 'roe', 'avg_target', 'upside',
  'r1m', 'r3m', 'r6m', 'r1y', 'dist_52w_high', 'sma200_dist', 'rsi14', 'vol30', 'turnover20', 'score',
];

export function normalizeRows(rows) {
  return rows.map(r => {
    const out = { ...r };
    for (const k of NUMERIC_FIELDS) if (out[k] == null) out[k] = NaN;
    return out;
  });
}

const B30 = new Set(BIST30);
const B100 = new Set(BIST100);
const has = (v) => v != null && Number.isFinite(v);
const daysSince = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 864e5 : Infinity);

export const PRESETS = [
  { id: 'mega', label: 'Büyük şirketler', tip: 'Piyasa değeri 100 milyar TL üzeri', test: r => r.market_cap >= 100e9 },
  { id: 'upside30', label: 'Potansiyel %30+', tip: 'Kurum hedeflerinin ortalaması fiyatın en az %30 üzerinde', test: r => r.upside >= 30 },
  { id: 'consensus5', label: '5+ kurum', tip: 'En az 5 farklı kurumun güncel raporu var', test: r => r.broker_count >= 5 },
  { id: 'model', label: 'Model portföyde', tip: 'En az bir kurumun model portföyünde', test: r => r.model_count >= 1 },
  { id: 'dividend', label: 'Temettü %3+', tip: 'Temettü verimi %3 ve üzeri', test: r => r.div_yield >= 3 },
  { id: 'value', label: 'Ucuz çarpanlar', tip: 'F/K 0–8 ve PD/DD 1,5 altı', test: r => has(r.pe) && r.pe > 0 && r.pe <= 8 && has(r.pb) && r.pb <= 1.5 },
  { id: 'momentum', label: 'Momentum', tip: '3 aylık getiri %15+ ve fiyat 200 günlük ortalamanın üstünde', test: r => r.r3m >= 15 && r.sma200_dist > 0 },
  { id: 'nearHigh', label: 'Zirveye yakın', tip: '52 haftalık zirvenin en fazla %5 altında', test: r => r.dist_52w_high >= -5 },
  { id: 'oversold', label: 'Aşırı satım', tip: 'RSI(14) 30 ve altı', test: r => r.rsi14 <= 30 },
  { id: 'highScore', label: 'Yüksek karar skoru', tip: 'Karar motoru skoru 70 ve üzeri', test: r => r.score >= 70 },
];

const opt = (v, label, test) => ({ v, label, test });

export const FILTER_GROUPS = [
  { id: 'descriptive', label: 'Tanımlayıcı' },
  { id: 'fundamental', label: 'Temel' },
  { id: 'broker', label: 'Kurum' },
  { id: 'technical', label: 'Teknik' },
];

/** `options` of 'sector' are filled from the data at runtime. */
export const FILTERS = [
  { id: 'sector', group: 'descriptive', label: 'Sektör', options: [] },
  {
    id: 'index', group: 'descriptive', label: 'Endeks', options: [
      opt('b30', 'BIST 30', r => B30.has(r.ticker)),
      opt('b100', 'BIST 100', r => B100.has(r.ticker)),
      opt('notb100', 'BIST 100 dışı', r => !B100.has(r.ticker)),
    ],
  },
  {
    id: 'mcap', group: 'descriptive', label: 'Piyasa değeri', options: [
      opt('lt1', '1 Mr TL altı', r => r.market_cap < 1e9),
      opt('1to10', '1–10 Mr TL', r => r.market_cap >= 1e9 && r.market_cap < 10e9),
      opt('10to100', '10–100 Mr TL', r => r.market_cap >= 10e9 && r.market_cap < 100e9),
      opt('gt100', '100 Mr TL üzeri', r => r.market_cap >= 100e9),
    ],
  },
  {
    id: 'price', group: 'descriptive', label: 'Fiyat', options: [
      opt('lt10', '10 TL altı', r => r.price < 10),
      opt('10to50', '10–50 TL', r => r.price >= 10 && r.price < 50),
      opt('50to200', '50–200 TL', r => r.price >= 50 && r.price < 200),
      opt('gt200', '200 TL üzeri', r => r.price >= 200),
    ],
  },
  {
    id: 'turnover', group: 'descriptive', label: 'Ort. işlem hacmi (20g)', tip: 'Son 20 günün ortalama günlük TL işlem hacmi', options: [
      opt('gt10m', '10 Mn TL üzeri', r => r.turnover20 >= 10e6),
      opt('gt100m', '100 Mn TL üzeri', r => r.turnover20 >= 100e6),
      opt('gt1b', '1 Mr TL üzeri', r => r.turnover20 >= 1e9),
    ],
  },

  {
    id: 'pe', group: 'fundamental', label: 'F/K', options: [
      opt('pos', 'Pozitif', r => r.pe > 0),
      opt('lt5', '5 altı', r => r.pe > 0 && r.pe < 5),
      opt('lt10', '10 altı', r => r.pe > 0 && r.pe < 10),
      opt('lt15', '15 altı', r => r.pe > 0 && r.pe < 15),
      opt('gt25', '25 üzeri', r => r.pe > 25),
    ],
  },
  {
    id: 'pb', group: 'fundamental', label: 'PD/DD', options: [
      opt('lt1', '1 altı', r => r.pb > 0 && r.pb < 1),
      opt('lt2', '2 altı', r => r.pb > 0 && r.pb < 2),
      opt('lt5', '5 altı', r => r.pb > 0 && r.pb < 5),
      opt('gt5', '5 üzeri', r => r.pb >= 5),
    ],
  },
  {
    id: 'div', group: 'fundamental', label: 'Temettü verimi', options: [
      opt('pos', 'Temettü veren', r => r.div_yield > 0),
      opt('gt2', '%2 üzeri', r => r.div_yield >= 2),
      opt('gt5', '%5 üzeri', r => r.div_yield >= 5),
    ],
  },
  {
    id: 'roe', group: 'fundamental', label: 'Özkaynak kârlılığı', options: [
      opt('neg', 'Negatif', r => r.roe < 0),
      opt('pos', 'Pozitif', r => r.roe > 0),
      opt('gt15', '%15 üzeri', r => r.roe >= 15),
      opt('gt30', '%30 üzeri', r => r.roe >= 30),
    ],
  },

  {
    id: 'brokers', group: 'broker', label: 'Kurum sayısı', options: [
      opt('none', 'Raporu yok', r => !r.broker_count),
      opt('ge1', 'En az 1', r => r.broker_count >= 1),
      opt('ge3', 'En az 3', r => r.broker_count >= 3),
      opt('ge5', 'En az 5', r => r.broker_count >= 5),
      opt('ge10', 'En az 10', r => r.broker_count >= 10),
    ],
  },
  {
    id: 'upside', group: 'broker', label: 'Kurum potansiyeli', tip: 'Kurumların son hedef fiyat ortalamasının güncel fiyata göre farkı', options: [
      opt('neg', 'Negatif', r => r.upside < 0),
      opt('gt0', 'Pozitif', r => r.upside > 0),
      opt('gt15', '%15 üzeri', r => r.upside >= 15),
      opt('gt30', '%30 üzeri', r => r.upside >= 30),
      opt('gt50', '%50 üzeri', r => r.upside >= 50),
    ],
  },
  {
    id: 'models', group: 'broker', label: 'Model portföy', options: [
      opt('none', 'Hiçbirinde yok', r => !r.model_count),
      opt('ge1', 'En az 1 kurumda', r => r.model_count >= 1),
      opt('ge3', 'En az 3 kurumda', r => r.model_count >= 3),
    ],
  },
  {
    id: 'fresh', group: 'broker', label: 'Son rapor', options: [
      opt('30', 'Son 30 gün', r => daysSince(r.last_report) <= 30),
      opt('90', 'Son 90 gün', r => daysSince(r.last_report) <= 90),
    ],
  },

  {
    id: 'r1m', group: 'technical', label: '1 ay getiri', options: [
      opt('pos', 'Pozitif', r => r.r1m > 0),
      opt('gt10', '%10 üzeri', r => r.r1m >= 10),
      opt('neg', 'Negatif', r => r.r1m < 0),
      opt('ltm10', '-%10 altı', r => r.r1m <= -10),
    ],
  },
  {
    id: 'r1y', group: 'technical', label: '1 yıl getiri', options: [
      opt('pos', 'Pozitif', r => r.r1y > 0),
      opt('gt50', '%50 üzeri', r => r.r1y >= 50),
      opt('neg', 'Negatif', r => r.r1y < 0),
    ],
  },
  {
    id: 'high52', group: 'technical', label: '52H zirveye uzaklık', options: [
      opt('lt5', '%5 içinde', r => r.dist_52w_high >= -5),
      opt('lt10', '%10 içinde', r => r.dist_52w_high >= -10),
      opt('gt30', '%30+ aşağıda', r => r.dist_52w_high <= -30),
    ],
  },
  {
    id: 'sma200', group: 'technical', label: '200 günlük ortalama', options: [
      opt('above', 'Üstünde', r => r.sma200_dist > 0),
      opt('below', 'Altında', r => r.sma200_dist < 0),
    ],
  },
  {
    id: 'rsi', group: 'technical', label: 'RSI (14)', options: [
      opt('lt30', '30 altı (aşırı satım)', r => r.rsi14 < 30),
      opt('mid', '30–70', r => r.rsi14 >= 30 && r.rsi14 <= 70),
      opt('gt70', '70 üzeri (aşırı alım)', r => r.rsi14 > 70),
    ],
  },
  {
    id: 'vol', group: 'technical', label: 'Volatilite (30g)', tip: 'Yıllıklandırılmış 30 günlük oynaklık', options: [
      opt('lt30', '%30 altı', r => r.vol30 < 30),
      opt('30to50', '%30–50', r => r.vol30 >= 30 && r.vol30 <= 50),
      opt('gt50', '%50 üzeri', r => r.vol30 > 50),
    ],
  },
  {
    id: 'score', group: 'technical', label: 'Karar skoru', options: [
      opt('ge70', '70 ve üzeri', r => r.score >= 70),
      opt('ge50', '50 ve üzeri', r => r.score >= 50),
      opt('lt30', '30 altı', r => r.score < 30),
    ],
  },
];

export function withSectorOptions(rows) {
  const sectors = [...new Set(rows.map(r => r.sector).filter(Boolean))].sort((a, b) => trSector(a).localeCompare(trSector(b), 'tr'));
  return FILTERS.map(f => f.id !== 'sector' ? f : {
    ...f,
    options: sectors.map(s => opt(s, trSector(s), r => r.sector === s)),
  });
}

/** state: { presets: string[], filters: {filterId: optionValue}, query: string } */
export function buildPredicate(state, filters) {
  const presetTests = PRESETS.filter(p => state.presets.includes(p.id)).map(p => p.test);
  const filterTests = Object.entries(state.filters)
    .map(([id, v]) => filters.find(f => f.id === id)?.options.find(o => o.v === v)?.test)
    .filter(Boolean);
  const q = (state.query || '').trim().toLocaleUpperCase('tr');
  return (r) =>
    (!q || r.ticker.includes(q) || (r.name || '').toLocaleUpperCase('tr').includes(q)) &&
    presetTests.every(t => t(r)) &&
    filterTests.every(t => t(r));
}

export const EMPTY_STATE = { presets: [], filters: {}, query: '' };

// ---------------------------------------------------------------------------
// Screener -> backtest. Only price/volume rules have history; fundamental and broker rules are
// reported back as "not testable" instead of being silently dropped or approximated.
const F = (factor, op, value) => ({ factor, op, value });
const BACKTEST_RULES = {
  'preset:momentum': { filters: [F('ret_3m', '>=', 15), F('sma200_dist', '>', 0)] },
  'preset:nearHigh': { filters: [F('dist_52w_high', '>=', -5)] },
  'preset:oversold': { filters: [F('rsi14', '<=', 30)] },
  'index:b30': { universe: 'bist30' },
  'index:b100': { universe: 'bist100' },
  'price:lt10': { filters: [F('price', '<', 10)] },
  'price:10to50': { filters: [F('price', '>=', 10), F('price', '<', 50)] },
  'price:50to200': { filters: [F('price', '>=', 50), F('price', '<', 200)] },
  'price:gt200': { filters: [F('price', '>=', 200)] },
  'turnover:gt10m': { min_turnover_tl: 10e6 },
  'turnover:gt100m': { min_turnover_tl: 100e6 },
  'turnover:gt1b': { min_turnover_tl: 1e9 },
  'r1m:pos': { filters: [F('ret_1m', '>', 0)] },
  'r1m:gt10': { filters: [F('ret_1m', '>=', 10)] },
  'r1m:neg': { filters: [F('ret_1m', '<', 0)] },
  'r1m:ltm10': { filters: [F('ret_1m', '<=', -10)] },
  'r1y:pos': { filters: [F('ret_12m', '>', 0)] },
  'r1y:gt50': { filters: [F('ret_12m', '>=', 50)] },
  'r1y:neg': { filters: [F('ret_12m', '<', 0)] },
  'high52:lt5': { filters: [F('dist_52w_high', '>=', -5)] },
  'high52:lt10': { filters: [F('dist_52w_high', '>=', -10)] },
  'high52:gt30': { filters: [F('dist_52w_high', '<=', -30)] },
  'sma200:above': { filters: [F('sma200_dist', '>', 0)] },
  'sma200:below': { filters: [F('sma200_dist', '<', 0)] },
  'rsi:lt30': { filters: [F('rsi14', '<', 30)] },
  'rsi:mid': { filters: [F('rsi14', '>=', 30), F('rsi14', '<=', 70)] },
  'rsi:gt70': { filters: [F('rsi14', '>', 70)] },
  'vol:lt30': { filters: [F('vol_30', '<', 30)] },
  'vol:30to50': { filters: [F('vol_30', '>=', 30), F('vol_30', '<=', 50)] },
  'vol:gt50': { filters: [F('vol_30', '>', 50)] },
};

/** Returns { spec, unsupported: [label] } for the current screen; rank by 3-month return, top 20, monthly. */
export function screenToBacktest(state, filters) {
  const spec = {
    name: 'Tarayıcıdan', kind: 'rank', universe: 'all', rank_factor: 'ret_3m', rank_order: 'desc', top_n: 20,
    filters: [], weighting: 'equal', rebalance: 'monthly', start: '2012-01-01', cost_bps: 20, min_turnover_tl: 5e6, cash_rate: 0,
  };
  const unsupported = [];
  const apply = (rule) => {
    if (rule.filters) spec.filters.push(...rule.filters);
    if (rule.universe) spec.universe = rule.universe;
    if (rule.min_turnover_tl) spec.min_turnover_tl = rule.min_turnover_tl;
  };
  for (const id of state.presets) {
    const rule = BACKTEST_RULES[`preset:${id}`];
    if (rule) apply(rule); else unsupported.push(PRESETS.find(p => p.id === id)?.label || id);
  }
  for (const [id, v] of Object.entries(state.filters)) {
    const rule = BACKTEST_RULES[`${id}:${v}`];
    const f = filters.find(x => x.id === id);
    if (rule) apply(rule); else unsupported.push(`${f?.label || id}: ${f?.options.find(o => o.v === v)?.label || v}`);
  }
  if (state.query) unsupported.push(`Arama: "${state.query}"`);
  return { spec, unsupported };
}
