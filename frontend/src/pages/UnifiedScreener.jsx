import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, RotateCcw, Save, History, Search, X, AlertTriangle, FileDown } from 'lucide-react';
import { exportTables } from '../utils/download';
import PageContainer from '../components/common/PageContainer';
import FavoriteStar from '../components/common/FavoriteStar';
import ImageWithFallback from '../components/ImageWithFallback';
import AddToPortfolioModal from '../components/AddToPortfolioModal';
import { PillTabs, InfoTip, TickerCell, Button } from '../components/ui';
import { fetchWithCache, getCachedData } from '../utils/apiCache';
import { fmtNum, fmtPct, fmtTL, signClass } from '../utils/format';
import { trSector } from '../utils/sectors';
import {
  PRESETS, FILTER_GROUPS, EMPTY_STATE, buildPredicate, normalizeRows, withSectorOptions, screenToBacktest,
} from './screener/screenerConfig';
import { encodeSpec } from './backtest/strategy';

const API = import.meta.env.VITE_API_URL || '/api';
const UNIVERSE_URL = `${API}/screener/universe`;
const LOGO_BASE = `${API.replace(/\/api$/, '')}/logos`;
const SCREENS_KEY = 'hr.screens';
const PAGE_SIZE = 100;
const FLAG_LABELS = { market_cap: 'piyasa değeri', pb: 'PD/DD', pe: 'F/K', price: 'fiyat' };

const COLUMN_GROUPS = [
  { label: '', span: 5 },
  { label: 'TEMEL', span: 4 },
  { label: 'KURUM', span: 3 },
  { label: 'PERFORMANS', span: 4 },
  { label: 'TEKNİK', span: 3 },
  { label: '', span: 1 },
];

const COLUMNS = [
  { key: 'ticker', label: 'Hisse', align: 'left', sortValue: r => r.ticker },
  { key: 'sector', label: 'Sektör', align: 'left', sortValue: r => trSector(r.sector) },
  { key: 'market_cap', label: 'Piy. değ.', render: r => fmtTL(r.market_cap) },
  { key: 'price', label: 'Fiyat', render: r => fmtNum(r.price) },
  { key: 'change_pct', label: 'Gün', render: r => <span className={signClass(r.change_pct)}>{fmtPct(r.change_pct, 2)}</span> },
  { key: 'pe', label: 'F/K', render: r => (r.pe > 0 ? fmtNum(r.pe, 1) : '—') },
  { key: 'pb', label: 'PD/DD', render: r => fmtNum(r.pb, 2) },
  { key: 'div_yield', label: 'Temettü', render: r => (r.div_yield > 0 ? fmtPct(r.div_yield, 1, { sign: false }) : '—') },
  { key: 'roe', label: 'ROE', tip: 'Özkaynak kârlılığı', render: r => <span className={signClass(r.roe)}>{fmtPct(r.roe, 1, { sign: false })}</span> },
  { key: 'broker_count', label: 'Kurum', tip: 'Güncel raporu olan kurum sayısı', render: r => r.broker_count || '—' },
  { key: 'upside', label: 'Potansiyel', tip: 'Kurum hedef ortalamasının fiyata göre farkı', render: r => <span className={signClass(r.upside)}>{fmtPct(r.upside)}</span> },
  { key: 'model_count', label: 'Model', tip: 'Kaç kurumun model portföyünde', render: r => (r.model_count ? <span className="chip chip-gold">{r.model_count}</span> : '—') },
  { key: 'r1m', label: '1A', render: r => <span className={signClass(r.r1m)}>{fmtPct(r.r1m)}</span> },
  { key: 'r3m', label: '3A', render: r => <span className={signClass(r.r3m)}>{fmtPct(r.r3m)}</span> },
  { key: 'r1y', label: '1Y', render: r => <span className={signClass(r.r1y)}>{fmtPct(r.r1y)}</span> },
  { key: 'dist_52w_high', label: '52H zirve', tip: '52 haftalık zirveye uzaklık', render: r => fmtPct(r.dist_52w_high) },
  { key: 'rsi14', label: 'RSI', render: r => <span className={r.rsi14 < 30 ? 'text-up' : r.rsi14 > 70 ? 'text-down' : ''}>{fmtNum(r.rsi14, 0)}</span> },
  { key: 'vol30', label: 'Vol.', tip: 'Yıllıklandırılmış 30 günlük oynaklık', render: r => fmtPct(r.vol30, 0, { sign: false }) },
  { key: 'score', label: 'Skor', tip: 'Karar motoru skoru (0–100)', render: r => <ScoreCell score={r.score} decision={r.decision} /> },
];

function ScoreCell({ score, decision }) {
  if (!Number.isFinite(score)) return '—';
  const tone = score >= 70 ? 'var(--positive)' : score >= 45 ? 'var(--gold)' : 'var(--text-tertiary)';
  return <span title={decision || undefined} style={{ color: tone, fontWeight: 600 }}>{score}</span>;
}

function loadScreens() {
  try { return JSON.parse(localStorage.getItem(SCREENS_KEY)) || []; } catch { return []; }
}
function storeScreens(list) {
  try { localStorage.setItem(SCREENS_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
}

export default function UnifiedScreener() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [raw, setRaw] = useState(() => getCachedData(UNIVERSE_URL));
  const [error, setError] = useState(null);
  // Deep links such as /screener?sector=Energy (from the Sektörler page) preset a filter.
  const [state, setState] = useState(() => {
    const sector = searchParams.get('sector');
    return sector ? { ...EMPTY_STATE, filters: { sector } } : EMPTY_STATE;
  });
  const [group, setGroup] = useState('descriptive');
  const [sort, setSort] = useState({ key: 'market_cap', dir: 'desc' });
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [screens, setScreens] = useState(loadScreens);
  const [activeScreen, setActiveScreen] = useState('');
  const [naming, setNaming] = useState(null); // string while the save-name input is open
  const [portfolioTicker, setPortfolioTicker] = useState(null);

  useEffect(() => {
    fetchWithCache(UNIVERSE_URL, { ttl: 120000 })
      .then(d => { setRaw(d); setError(null); })
      .catch(e => setError(e.message));
  }, []);

  const rows = useMemo(() => normalizeRows(raw?.rows || []), [raw]);
  const filters = useMemo(() => withSectorOptions(rows), [rows]);
  const predicate = useMemo(() => buildPredicate(state, filters), [state, filters]);
  const matches = useMemo(() => rows.filter(predicate), [rows, predicate]);

  // "The number is what you get by clicking": count for each preset given everything else selected.
  const presetCounts = useMemo(() => {
    const out = {};
    for (const p of PRESETS) {
      if (state.presets.includes(p.id)) { out[p.id] = matches.length; continue; }
      out[p.id] = matches.filter(p.test).length;
    }
    return out;
  }, [matches, state.presets]);

  const sorted = useMemo(() => {
    const col = COLUMNS.find(c => c.key === sort.key);
    const get = col?.sortValue || (r => r[sort.key]);
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...matches].sort((a, b) => {
      const va = get(a), vb = get(b);
      const na = typeof va === 'number' && !Number.isFinite(va);
      const nb = typeof vb === 'number' && !Number.isFinite(vb);
      if (na || nb) return na === nb ? 0 : na ? 1 : -1; // missing values always last
      if (typeof va === 'string') return va.localeCompare(vb, 'tr') * dir;
      return (va - vb) * dir;
    });
  }, [matches, sort]);

  useEffect(() => { setLimit(PAGE_SIZE); }, [state, sort]);

  // Updates always derive from the latest state so quick successive clicks never overwrite each other.
  const update = (fn) => { setState(s => ({ ...s, ...(typeof fn === 'function' ? fn(s) : fn) })); setActiveScreen(''); };
  const togglePreset = (id) => update(s => ({ presets: s.presets.includes(id) ? s.presets.filter(p => p !== id) : [...s.presets, id] }));
  const setFilter = (id, v) => update(s => {
    const next = { ...s.filters };
    if (v) next[id] = v; else delete next[id];
    return { filters: next };
  });
  const reset = () => { setState(EMPTY_STATE); setActiveScreen(''); };

  const onSort = (key) => setSort(s => s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'ticker' || key === 'sector' ? 'asc' : 'desc' });

  const saveScreen = () => {
    const name = (naming || '').trim();
    if (!name) return;
    const entry = { id: String(Date.now()), name, state };
    const next = [...screens.filter(s => s.name !== name), entry];
    setScreens(next);
    storeScreens(next);
    setActiveScreen(entry.id);
    setNaming(null);
  };
  const openScreen = (id) => {
    setActiveScreen(id);
    const s = screens.find(x => x.id === id);
    setState(s ? { ...EMPTY_STATE, ...s.state } : EMPTY_STATE);
  };
  const deleteScreen = () => {
    const next = screens.filter(s => s.id !== activeScreen);
    setScreens(next);
    storeScreens(next);
    setActiveScreen('');
  };

  const activeFilterCount = state.presets.length + Object.keys(state.filters).length + (state.query ? 1 : 0);
  const visibleFilters = filters.filter(f => f.group === group);

  return (
    <PageContainer
      title="Tarayıcı"
      badge={raw ? `${matches.length} / ${rows.length} eşleşme` : undefined}
      subtitle="Hazır kurallar, temel, kurum ve teknik filtreler. Veriler günlük kapanış ve kurum raporlarından hesaplanır."
      headerRight={
        <>
          <label className="search-trigger" style={{ width: 220, cursor: 'text', padding: '5px 9px' }}>
            <Search size={13} />
            <input
              value={state.query}
              onChange={e => update({ query: e.target.value })}
              placeholder="Hisse veya şirket ara"
              style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 12.5, width: '100%' }}
            />
          </label>
          <select className="input" style={{ width: 170 }} value={activeScreen} onChange={e => openScreen(e.target.value)} aria-label="Kayıtlı taramalar">
            <option value="">Tarama: Yeni tarama</option>
            {screens.map(s => <option key={s.id} value={s.id}>Tarama: {s.name}</option>)}
          </select>
          {activeScreen && (
            <Button size="sm" variant="ghost" onClick={deleteScreen} title="Bu kayıtlı taramayı sil"><X size={13} /></Button>
          )}
          {naming === null ? (
            <Button variant="primary" onClick={() => setNaming(screens.find(s => s.id === activeScreen)?.name || '')} disabled={!activeFilterCount}>
              <Save size={13} /> Taramayı kaydet
            </Button>
          ) : (
            <form style={{ display: 'flex', gap: 6 }} onSubmit={e => { e.preventDefault(); saveScreen(); }}>
              <input autoFocus className="input" style={{ width: 150 }} placeholder="Tarama adı" value={naming} onChange={e => setNaming(e.target.value)} onKeyDown={e => e.key === 'Escape' && setNaming(null)} />
              <Button variant="primary" type="submit" disabled={!naming.trim()}>Kaydet</Button>
              <Button variant="ghost" onClick={() => setNaming(null)}>Vazgeç</Button>
            </form>
          )}
          <Button
            title="Taramanın fiyat tabanlı kurallarını geçmiş veride test et (3 aylık getiriye göre ilk 20, aylık)"
            disabled={!activeFilterCount}
            onClick={() => {
              const { spec, unsupported } = screenToBacktest(state, filters);
              const note = unsupported.length ? `&note=${encodeURIComponent(unsupported.join('|'))}` : '';
              navigate(`/backtest?spec=${encodeSpec(spec)}${note}`);
            }}
          >
            <History size={13} /> Backtest et
          </Button>
          <Button
            title="Taramanın tüm sonuçlarını Excel'e indir"
            disabled={!sorted.length}
            onClick={() => exportTables('hisseradar-tarama', 'Tarayıcı sonuçları', [{
              name: 'Tarama',
              columns: [
                { key: 'ticker', label: 'Hisse' }, { key: 'name', label: 'Şirket' }, { key: 'sector_tr', label: 'Sektör' },
                { key: 'market_cap', label: 'Piyasa değeri (TL)', format: 'int' }, { key: 'price', label: 'Fiyat', format: 'num' },
                { key: 'change_pct', label: 'Gün %', format: 'pct100' }, { key: 'pe', label: 'F/K', format: 'num' },
                { key: 'pb', label: 'PD/DD', format: 'num' }, { key: 'div_yield', label: 'Temettü %', format: 'pct100' },
                { key: 'roe', label: 'ROE %', format: 'pct100' }, { key: 'broker_count', label: 'Kurum', format: 'int' },
                { key: 'upside', label: 'Kurum potansiyeli %', format: 'pct100' }, { key: 'model_count', label: 'Model portföy', format: 'int' },
                { key: 'r1m', label: '1A %', format: 'pct100' }, { key: 'r3m', label: '3A %', format: 'pct100' }, { key: 'r1y', label: '1Y %', format: 'pct100' },
                { key: 'dist_52w_high', label: '52H zirveye %', format: 'pct100' }, { key: 'rsi14', label: 'RSI', format: 'num' },
                { key: 'vol30', label: 'Volatilite %', format: 'pct100' }, { key: 'score', label: 'Karar skoru', format: 'int' },
              ],
              rows: sorted.map(r => ({ ...r, sector_tr: trSector(r.sector) })),
            }]).catch(e => setError(e.message))}
          >
            <FileDown size={13} /> Excel
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
        {/* Preset rules */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {PRESETS.map(p => (
            <button key={p.id} type="button" title={p.tip} className={`count-chip${state.presets.includes(p.id) ? ' active' : ''}`} onClick={() => togglePreset(p.id)}>
              {p.label} <span className="count">{raw ? presetCounts[p.id] : '…'}</span>
            </button>
          ))}
          <span className="text-muted" style={{ fontSize: 11, marginLeft: 4 }}>Her çip kuralını aşağıdaki taramaya ekler; sayı, tıkladığında kalacak hisse sayısıdır.</span>
        </div>

        {/* Filter groups */}
        <div className="card" style={{ padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <PillTabs
              tabs={FILTER_GROUPS.map(g => {
                const n = filters.filter(f => f.group === g.id && state.filters[f.id]).length;
                return { id: g.id, label: n ? `${g.label} · ${n}` : g.label };
              })}
              value={group}
              onChange={setGroup}
            />
            <Button size="sm" variant="ghost" onClick={reset} disabled={!activeFilterCount}>
              <RotateCcw size={12} /> Tümünü sıfırla
            </Button>
          </div>
          <div className="filter-grid">
            {visibleFilters.map(f => (
              <label key={f.id} className="filter-field">
                <span className="eyebrow">{f.label}{f.tip && <InfoTip text={f.tip} size={10} />}</span>
                <select
                  className={`input${state.filters[f.id] ? ' input-active' : ''}`}
                  value={state.filters[f.id] || ''}
                  onChange={e => setFilter(f.id, e.target.value)}
                >
                  <option value="">Herhangi</option>
                  {f.options.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="panel" style={{ flex: 1, minHeight: 0, marginBottom: 0, overflow: 'hidden' }}>
          <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
            {error && !raw && <div className="text-down" style={{ padding: 16 }}>Tarama verisi alınamadı: {error}</div>}
            {!raw && !error && <div className="text-muted" style={{ padding: 16 }}>Tarama verisi hazırlanıyor… (ilk yükleme birkaç saniye sürebilir)</div>}
            {raw && (
              <table className="data-table screener-table">
                <thead>
                  <tr className="group-row">
                    {COLUMN_GROUPS.map((g, i) => <th key={i} colSpan={g.span}>{g.label}</th>)}
                  </tr>
                  <tr className="col-row">
                    {COLUMNS.map(c => (
                      <th key={c.key} style={{ textAlign: c.align || 'right', cursor: 'pointer' }} onClick={() => onSort(c.key)} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                        {c.label}
                        {c.tip && <InfoTip text={c.tip} size={10} />}
                        <span style={{ color: sort.key === c.key ? 'var(--gold)' : 'transparent', marginLeft: 3 }}>{sort.dir === 'asc' ? '▲' : '▼'}</span>
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sorted.slice(0, limit).map(r => (
                    <tr key={r.ticker} className="row-hoverable" onClick={() => navigate(`/hisse/${r.ticker}`)}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                          <ImageWithFallback
                            src={`${LOGO_BASE}/${r.ticker}.png`}
                            alt={r.ticker}
                            fallbackName={r.ticker}
                            size={22}
                            style={{ width: 22, height: 22, borderRadius: '50%', background: '#fff', objectFit: 'contain', flexShrink: 0 }}
                          />
                          <div onClick={e => e.stopPropagation()} style={{ minWidth: 0 }}>
                            <TickerCell ticker={r.ticker} name={r.name} />
                          </div>
                          {r.data_flags?.length > 0 && (
                            <span
                              title={`Veri kaynağındaki ${r.data_flags.map(f => FLAG_LABELS[f] || f).join(', ')} değeri tutarsız görünüyor; makul aralık dışındaki değerler gizlendi.`}
                              style={{ color: 'var(--warning)', display: 'inline-flex', flexShrink: 0 }}
                            >
                              <AlertTriangle size={13} />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="cell-text" title={r.industry || ''}>{trSector(r.sector)}</td>
                      {COLUMNS.slice(2).map(c => <td key={c.key}>{c.render ? c.render(r) : r[c.key]}</td>)}
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                          <FavoriteStar ticker={r.ticker} size={14} />
                          <Button size="sm" variant="outline-gold" onClick={() => setPortfolioTicker(r)} title="Portföye ekle">
                            <Plus size={12} /> Port
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {raw && matches.length === 0 && (
              <div className="text-muted" style={{ padding: 28, textAlign: 'center' }}>
                Bu kurallarla eşleşen hisse yok. Bir filtreyi gevşetmeyi ya da <button type="button" className="card-link" style={{ background: 'none', border: 'none', margin: 0 }} onClick={reset}>tümünü sıfırlamayı</button> dene.
              </div>
            )}
            {sorted.length > limit && (
              <div style={{ padding: 12, textAlign: 'center' }}>
                <Button onClick={() => setLimit(l => l + PAGE_SIZE)}>Daha fazla göster ({sorted.length - limit} kaldı)</Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <AddToPortfolioModal
        ticker={portfolioTicker?.ticker}
        currentPrice={Number.isFinite(portfolioTicker?.price) ? portfolioTicker.price : undefined}
        isOpen={!!portfolioTicker}
        onClose={() => setPortfolioTicker(null)}
        onSuccess={() => { }}
      />
    </PageContainer>
  );
}
