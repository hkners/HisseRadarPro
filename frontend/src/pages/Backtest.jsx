import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowUp, Plus, Trash2, Play, Search, Briefcase, AlertTriangle, History, FileDown } from 'lucide-react';
import { exportTables } from '../utils/download';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { Button, PillTabs, StatTile, Chip, InfoTip, TickerCell } from '../components/ui';
import { fetchWithCache } from '../utils/apiCache';
import { fmtNum, fmtPct, signClass } from '../utils/format';
import { seriesPalette, palette, fonts } from '../theme';
import { DEFAULT_SPEC, EXAMPLES, describeSpec, decodeSpec } from './backtest/strategy';

const API = import.meta.env.VITE_API_URL || '/api';
const SAVED_KEY = 'hr.backtests';
const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

const loadSaved = () => { try { return JSON.parse(localStorage.getItem(SAVED_KEY)) || []; } catch { return []; } };
const storeSaved = (list) => { try { localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, 40))); } catch { /* storage unavailable */ } };
const pct = (v, d = 1, sign = true) => (v == null ? '—' : fmtPct(v * 100, d, { sign }));

function Field({ label, tip, children }) {
  return (
    <label className="filter-field">
      <span className="eyebrow">{label}{tip && <InfoTip text={tip} size={10} />}</span>
      {children}
    </label>
  );
}

function RuleEditor({ spec, setSpec, factors }) {
  const set = (patch) => setSpec(s => ({ ...s, ...patch }));
  const setFilter = (i, patch) => set({ filters: spec.filters.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PillTabs tabs={[{ id: 'rank', label: 'Sıralama stratejisi' }, { id: 'timing', label: 'Zamanlama stratejisi' }]} value={spec.kind} onChange={kind => set({ kind })} />
      <div className="filter-grid">
        {spec.kind === 'rank' ? (
          <>
            <Field label="Evren">
              <select className="input" value={spec.universe} onChange={e => set({ universe: e.target.value })}>
                <option value="all">Tüm hisseler</option><option value="bist100">BIST 100</option><option value="bist30">BIST 30</option>
              </select>
            </Field>
            <Field label="Sıralama ölçütü" tip={factors.find(f => f.id === spec.rank_factor)?.help}>
              <select className="input" value={spec.rank_factor} onChange={e => set({ rank_factor: e.target.value, rank_order: null })}>
                {factors.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </Field>
            <Field label="Sıra">
              <select className="input" value={spec.rank_order || factors.find(f => f.id === spec.rank_factor)?.order || 'desc'} onChange={e => set({ rank_order: e.target.value })}>
                <option value="desc">En yüksekler</option><option value="asc">En düşükler</option>
              </select>
            </Field>
            <Field label="Hisse sayısı">
              <input className="input" type="number" min={1} max={100} value={spec.top_n} onChange={e => set({ top_n: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })} />
            </Field>
            <Field label="Ağırlık">
              <select className="input" value={spec.weighting} onChange={e => set({ weighting: e.target.value })}>
                <option value="equal">Eşit</option><option value="inverse_vol">Volatiliteyle ters orantılı</option>
              </select>
            </Field>
            <Field label="Min. işlem hacmi" tip="Son 20 günlük ortalama TL işlem hacmi bunun altındaki hisseler alınmaz.">
              <select className="input" value={spec.min_turnover_tl} onChange={e => set({ min_turnover_tl: Number(e.target.value) })}>
                <option value={0}>Sınır yok</option><option value={1000000}>1 Mn TL</option><option value={5000000}>5 Mn TL</option><option value={20000000}>20 Mn TL</option><option value={100000000}>100 Mn TL</option>
              </select>
            </Field>
          </>
        ) : (
          <>
            <Field label="Varlık">
              <input className="input" value={spec.timing_asset} onChange={e => set({ timing_asset: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Ortalama">
              <select className="input" value={spec.sma_window} onChange={e => set({ sma_window: Number(e.target.value) })}>
                {[20, 50, 100, 150, 200].map(n => <option key={n} value={n}>{n} günlük</option>)}
              </select>
            </Field>
          </>
        )}
        <Field label="Dengeleme">
          <select className="input" value={spec.rebalance} onChange={e => set({ rebalance: e.target.value })}>
            {spec.kind === 'timing' && <option value="daily">Günlük</option>}
            <option value="weekly">Haftalık</option><option value="monthly">Aylık</option><option value="quarterly">Çeyreklik</option>
          </select>
        </Field>
        <Field label="Başlangıç">
          <input className="input" type="date" value={spec.start || ''} min="2001-01-01" onChange={e => set({ start: e.target.value })} />
        </Field>
        <Field label="İşlem maliyeti (baz puan)" tip="Her alım ve satımda düşülen komisyon + kayma. 20 baz puan = %0,20.">
          <input className="input" type="number" min={0} max={200} value={spec.cost_bps} onChange={e => set({ cost_bps: Number(e.target.value) || 0 })} />
        </Field>
        <Field label="Nakit faizi (yıllık %)" tip="Nakitte beklenen sürede kazanılacak varsayılan faiz. Türkiye'de mevduat getirisi yüksek olduğundan zamanlama stratejilerinde önemlidir.">
          <input className="input" type="number" min={0} max={150} step={1} value={Math.round(spec.cash_rate * 100)} onChange={e => set({ cash_rate: (Number(e.target.value) || 0) / 100 })} />
        </Field>
      </div>

      {spec.kind === 'rank' && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Filtreler</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {spec.filters.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select className="input" style={{ width: 230 }} value={f.factor} onChange={e => setFilter(i, { factor: e.target.value })}>
                  {factors.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
                <select className="input" style={{ width: 70 }} value={f.op} onChange={e => setFilter(i, { op: e.target.value })}>
                  {['>', '>=', '<', '<='].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <input className="input" type="number" style={{ width: 110 }} value={f.value} onChange={e => setFilter(i, { value: Number(e.target.value) })} />
                <span className="text-muted" style={{ fontSize: 11 }}>{factors.find(x => x.id === f.factor)?.unit}</span>
                <Button size="sm" variant="ghost" onClick={() => set({ filters: spec.filters.filter((_, j) => j !== i) })} aria-label="Filtreyi kaldır"><Trash2 size={12} /></Button>
              </div>
            ))}
            <div><Button size="sm" onClick={() => set({ filters: [...spec.filters, { factor: 'sma200_dist', op: '>', value: 0 }] })}><Plus size={12} /> Filtre ekle</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function EquityChart({ series, benchName }) {
  return (
    <>
      <div style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 70, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={palette.grid} vertical={false} />
            <XAxis dataKey="date" tickFormatter={d => d.slice(0, 4)} stroke={palette.textTertiary} tick={{ fontSize: 10.5, fontFamily: fonts.mono }} tickLine={false} axisLine={{ stroke: palette.border }} minTickGap={40} />
            <YAxis scale="log" domain={['auto', 'auto']} stroke={palette.textTertiary} tick={{ fontSize: 10.5, fontFamily: fonts.mono }} tickLine={false} axisLine={false} width={52} tickFormatter={v => fmtNum(v, 0)} />
            <ReferenceLine y={100} stroke={palette.textTertiary} strokeDasharray="3 3" />
            <Tooltip
              contentStyle={{ background: palette.bgElevated, border: `1px solid ${palette.border}`, borderRadius: 6, fontSize: 12 }}
              labelStyle={{ color: palette.textPrimary }}
              formatter={(v, n) => [fmtNum(v, 1), n === 'strategy' ? 'Strateji' : benchName]}
            />
            <Line type="monotone" dataKey="strategy" stroke={seriesPalette[0]} strokeWidth={2} dot={false} isAnimationActive={false}
              label={({ index, x, y }) => (index === series.length - 1 ? <text x={x + 6} y={y + 4} fill={palette.textSecondary} fontSize={11}>Strateji</text> : null)} />
            <Line type="monotone" dataKey="benchmark" stroke={seriesPalette[1]} strokeWidth={2} dot={false} isAnimationActive={false}
              label={({ index, x, y }) => (index === series.length - 1 ? <text x={x + 6} y={y + 4} fill={palette.textSecondary} fontSize={11}>{benchName.split(' ')[0]}</text> : null)} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div style={{ height: 90 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 4, right: 70, left: 0, bottom: 0 }}>
            <XAxis dataKey="date" hide />
            <YAxis stroke={palette.textTertiary} tick={{ fontSize: 10, fontFamily: fonts.mono }} tickLine={false} axisLine={false} width={52} tickFormatter={v => `%${Math.round(v * 100)}`} />
            <Tooltip contentStyle={{ background: palette.bgElevated, border: `1px solid ${palette.border}`, borderRadius: 6, fontSize: 12 }} formatter={v => [fmtPct(v * 100), 'Düşüş']} />
            <Area type="monotone" dataKey="drawdown" stroke={palette.negative} fill={palette.negative} fillOpacity={0.25} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

function MonthlyTable({ monthly }) {
  const years = Object.keys(monthly).sort().reverse();
  const cell = (v) => {
    if (v == null) return { background: 'transparent' };
    const a = Math.min(1, Math.abs(v) / 0.15);
    return { background: `color-mix(in srgb, ${v >= 0 ? 'var(--positive)' : 'var(--negative)'} ${Math.round(a * 55)}%, transparent)` };
  };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table compact" style={{ minWidth: 760 }}>
        <thead><tr><th>Yıl</th>{MONTHS.map(m => <th key={m}>{m}</th>)}<th>Yıl</th></tr></thead>
        <tbody>
          {years.map(y => {
            const months = monthly[y];
            const yearRet = Object.values(months).reduce((acc, v) => acc * (1 + v), 1) - 1;
            return (
              <tr key={y}>
                <td className="font-mono">{y}</td>
                {MONTHS.map((_, i) => {
                  const v = months[String(i + 1)];
                  return <td key={i} style={{ ...cell(v), color: 'var(--text-primary)' }}>{v == null ? '' : fmtPct(v * 100, 1, { sign: false })}</td>;
                })}
                <td className={signClass(yearRet)} style={{ fontWeight: 600 }}>{fmtPct(yearRet * 100)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Backtest() {
  const [params, setParams] = useSearchParams();
  const [factors, setFactors] = useState([]);
  const [text, setText] = useState('');
  const [spec, setSpec] = useState(null);
  const [parseInfo, setParseInfo] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(loadSaved);
  const [query, setQuery] = useState('');
  const [paperMsg, setPaperMsg] = useState('');

  useEffect(() => {
    fetchWithCache(`${API}/backtest/factors`, { ttl: 3600000 }).then(setFactors).catch(() => {});
  }, []);

  const run = (s, label) => {
    setBusy('run');
    setError('');
    setPaperMsg('');
    fetch(`${API}/backtest/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.detail || `HTTP ${r.status}`); return j; })
      .then(res => {
        setResult(res);
        const entry = {
          id: String(Date.now()),
          name: s.name || label || 'Adsız strateji',
          spec: s,
          at: new Date().toISOString().slice(0, 10),
          cagr: res.metrics?.cagr,
          mdd: res.metrics?.max_drawdown,
        };
        const next = [entry, ...saved.filter(x => JSON.stringify(x.spec) !== JSON.stringify(s))];
        setSaved(next);
        storeSaved(next);
      })
      .catch(e => setError(e.message))
      .finally(() => setBusy(''));
  };

  // Deep link from the screener: /backtest?spec=<json>&note=<unsupported rules>
  useEffect(() => {
    const raw = params.get('spec');
    if (!raw) return;
    const s = decodeSpec(raw);
    if (s) {
      setSpec(s);
      const note = params.get('note');
      setParseInfo(note ? { assumptions: ['Tarayıcıdaki teknik kurallar filtreye, sıralama 3 aylık getiriye çevrildi.'], unsupported: note.split('|') } : null);
      run(s, 'Tarayıcıdan');
    }
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parse = () => {
    if (!text.trim()) return;
    setBusy('parse');
    setError('');
    setResult(null);
    fetch(`${API}/backtest/parse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.detail || `HTTP ${r.status}`); return j; })
      .then(d => {
        const s = { ...DEFAULT_SPEC, ...d.spec };
        setSpec(s);
        setParseInfo({ assumptions: d.assumptions, unsupported: d.unsupported });
        run(s, text.slice(0, 60));
      })
      .catch(e => { setError(e.message); setBusy(''); });
  };

  const openExample = (ex) => { setSpec(ex.spec); setParseInfo(null); setText(''); run(ex.spec, ex.title); };
  const openSaved = (entry) => { setSpec({ ...DEFAULT_SPEC, ...entry.spec }); setParseInfo(null); run({ ...DEFAULT_SPEC, ...entry.spec }, entry.name); };
  const removeSaved = (id) => { const next = saved.filter(x => x.id !== id); setSaved(next); storeSaved(next); };
  const reset = () => { setSpec(null); setResult(null); setParseInfo(null); setText(''); setError(''); };

  // Send the latest holdings to the paper account as an equal-weight 100k TL book.
  const toPaper = async () => {
    const tickers = result?.last_holdings?.holdings || [];
    if (!tickers.length) return;
    const stocks = await fetchWithCache(`${API}/stocks`).catch(() => null);
    const prices = Object.fromEntries((stocks?.stocks || []).map(s => [s.ticker, s.price]));
    const budget = 100000 / tickers.length;
    const transactions = tickers
      .filter(t => prices[t] > 0)
      .map(t => ({ ticker: t, tx_type: 'BUY', quantity: Math.floor(budget / prices[t]), price: prices[t] }))
      .filter(t => t.quantity > 0);
    const r = await fetch(`${API}/portfolio/batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transactions, account: 'paper' }) });
    setPaperMsg(r.ok ? `${transactions.length} hisse 100.000 TL'lik eşit ağırlıklı olarak kâğıt hesaba eklendi.` : 'Kâğıt hesaba eklenemedi.');
  };

  const exportResult = () => {
    if (!result) return;
    const m0 = result.metrics, b0 = result.benchmark_metrics;
    const metricRows = [
      ['Yıllık getiri', 'cagr'], ['Toplam getiri', 'total_return'], ['Yıllık volatilite', 'volatility'], ['Maksimum düşüş', 'max_drawdown'],
      ['En iyi ay', 'best_month'], ['En kötü ay', 'worst_month'], ['Pozitif ay oranı', 'positive_months'], ['Yılbaşından beri', 'ytd'],
    ].map(([label, k]) => ({ label, strategy: m0[k], benchmark: b0[k] }));
    metricRows.push({ label: 'Sharpe', strategy: m0.sharpe, benchmark: b0.sharpe });
    const monthly = Object.entries(result.monthly).map(([year, months]) => ({ year, ...Object.fromEntries(MONTHS.map((_, i) => [`m${i + 1}`, months[String(i + 1)] ?? null])) }));
    exportTables(`backtest-${(spec?.name || 'strateji').replace(/\s+/g, '-')}`, `${spec?.name || 'Backtest'} · ${result.start} – ${result.end}`, [
      { name: 'Özet', columns: [{ key: 'label', label: 'Ölçüt' }, { key: 'strategy', label: 'Strateji', format: 'pct' }, { key: 'benchmark', label: result.benchmark_name, format: 'pct' }], rows: metricRows },
      { name: 'Kural', columns: [{ key: 'text', label: 'Açıklama' }], rows: [{ text: describeSpec(spec, factors) }, ...result.assumptions.map(a => ({ text: a })), ...result.warnings.map(w => ({ text: `Uyarı: ${w}` }))] },
      { name: 'Aylık getiriler', columns: [{ key: 'year', label: 'Yıl' }, ...MONTHS.map((mo, i) => ({ key: `m${i + 1}`, label: mo, format: 'pct' }))], rows: monthly },
      { name: 'Büyüme eğrisi', columns: [{ key: 'date', label: 'Tarih' }, { key: 'strategy', label: 'Strateji (100 tabanlı)', format: 'num' }, { key: 'benchmark', label: `${result.benchmark_name} (100 tabanlı)`, format: 'num' }, { key: 'drawdown', label: 'Düşüş', format: 'pct' }], rows: result.series },
      { name: 'Dengelemeler', columns: [{ key: 'date', label: 'Tarih' }, { key: 'holdings_text', label: 'Pozisyonlar' }, { key: 'turnover', label: 'Devir', format: 'pct' }], rows: result.rebalances.map(r => ({ ...r, holdings_text: r.holdings.join(', ') || 'Nakit' })) },
    ]).catch(e => setError(e.message));
  };

  const filteredSaved = useMemo(() => saved.filter(s => s.name.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr'))), [saved, query]);
  const m = result?.metrics;
  const b = result?.benchmark_metrics;

  return (
    <div className="bt-layout">
      <aside className="bt-list">
        <Button variant="primary" onClick={reset} style={{ width: '100%' }}><Plus size={13} /> Yeni backtest</Button>
        <label className="search-trigger" style={{ width: '100%', cursor: 'text', padding: '5px 9px' }}>
          <Search size={13} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Backtestlerde ara" style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 12.5, width: '100%' }} />
        </label>
        <div className="eyebrow" style={{ marginTop: 6 }}>Geçmiş</div>
        {filteredSaved.length === 0 && <p className="text-muted" style={{ fontSize: 11.5 }}>Çalıştırdığın backtestler burada saklanır (bu tarayıcıda).</p>}
        {filteredSaved.map(s => (
          <div key={s.id} className="bt-item" onClick={() => openSaved(s)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
              <span className="bt-item-name">{s.name}</span>
              <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0 4px' }} onClick={e => { e.stopPropagation(); removeSaved(s.id); }} aria-label="Sil"><Trash2 size={11} /></button>
            </div>
            <span className="text-muted" style={{ fontSize: 10.5 }}>{s.at} · yıllık <span className={signClass(s.cagr)}>{pct(s.cagr)}</span> · düşüş {pct(s.mdd)}</span>
          </div>
        ))}
      </aside>

      <main className="bt-main">
        {!spec && (
          <div style={{ maxWidth: 820, margin: '0 auto', width: '100%', paddingTop: 24 }}>
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
              <div className="icon-ring" style={{ width: 40, height: 40, margin: '0 auto 10px', display: 'grid', placeItems: 'center', borderRadius: '50%', border: '1px solid var(--gold-border)', color: 'var(--gold)' }}><History size={18} /></div>
              <h1 className="font-display" style={{ fontSize: 26, color: 'var(--text-primary)', fontWeight: 600 }}>Neyi <span className="text-gold">test</span> etmek istiyorsun?</h1>
              <p className="text-secondary" style={{ fontSize: 13, marginTop: 6 }}>
                Bir stratejiyi düz Türkçe anlat. Kurallar tek cümle olarak geri gelir; her ayarı değiştirebilir, neyin varsayıldığını görür ve gerçek geçmiş veride çalıştırırsın.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginBottom: 14 }}>
              {EXAMPLES.map(ex => (
                <button key={ex.title} type="button" className="card bt-example" onClick={() => openExample(ex)}>
                  <div className="card-title" style={{ fontSize: 13 }}>{ex.title}</div>
                  <div className="text-muted" style={{ fontSize: 11.5 }}>{ex.tag}</div>
                </button>
              ))}
            </div>
            <div className="card" style={{ padding: 10 }}>
              <textarea
                className="input"
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); parse(); } }}
                placeholder="Bir strateji anlat… örn. BIST 100'de son 6 ayda en çok yükselen ve 200 günlük ortalamanın üzerindeki 15 hisseyi her ay al"
                style={{ width: '100%', minHeight: 70, border: 'none', background: 'transparent', resize: 'vertical', fontSize: 13.5 }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="text-muted" style={{ fontSize: 11 }}>BIST hisseleri ve XU100 · günlük kapanışlar 2000'den beri · Enter ile gönder</span>
                <Button variant="primary" size="sm" onClick={parse} disabled={!text.trim() || busy === 'parse'}>
                  {busy === 'parse' ? 'Yorumlanıyor…' : <><ArrowUp size={13} /> Kurallara çevir</>}
                </Button>
              </div>
            </div>
            {error && <div className="notice" style={{ marginTop: 10, borderColor: 'rgba(192, 82, 78, 0.5)', background: 'var(--negative-tint)' }}>{error}</div>}
            <p className="text-muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 12 }}>
              Backtestler kuralları geçmişe uygular. Tavsiye değildir; geçmiş sonuçlar gelecek sonuçları öngörmez.
            </p>
          </div>
        )}

        {spec && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 20 }}>
            <div className="card">
              <div className="card-eyebrow">Kural</div>
              <div style={{ fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: 12 }}>{describeSpec(spec, factors)}</div>
              {factors.length > 0 && <RuleEditor spec={spec} setSpec={setSpec} factors={factors} />}
              <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
                <Button variant="primary" onClick={() => run(spec)} disabled={busy === 'run'}>
                  <Play size={13} /> {busy === 'run' ? 'Çalışıyor…' : 'Backtest\'i çalıştır'}
                </Button>
                <input className="input" style={{ width: 220 }} placeholder="Strateji adı (isteğe bağlı)" value={spec.name || ''} onChange={e => setSpec(s => ({ ...s, name: e.target.value }))} />
              </div>
              {parseInfo && (parseInfo.assumptions?.length > 0 || parseInfo.unsupported?.length > 0) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
                  {parseInfo.assumptions?.length > 0 && (
                    <div>
                      <div className="eyebrow" style={{ marginBottom: 4 }}>Varsayılanlar</div>
                      <ul className="text-secondary" style={{ fontSize: 12, paddingLeft: 16, lineHeight: 1.6 }}>{parseInfo.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
                    </div>
                  )}
                  {parseInfo.unsupported?.length > 0 && (
                    <div>
                      <div className="eyebrow" style={{ marginBottom: 4, color: 'var(--warning)' }}>Test edilemeyenler</div>
                      <ul className="text-secondary" style={{ fontSize: 12, paddingLeft: 16, lineHeight: 1.6 }}>{parseInfo.unsupported.map((a, i) => <li key={i}>{a}</li>)}</ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && <div className="notice" style={{ borderColor: 'rgba(192, 82, 78, 0.5)', background: 'var(--negative-tint)' }}>{error}</div>}
            {busy === 'run' && !result && <div className="text-muted">Backtest çalışıyor… İlk çalıştırma fiyat verisi yüklendiği için 20 saniye kadar sürebilir.</div>}

            {result && (
              <>
                <div className="stat-grid">
                  <StatTile label="Yıllık getiri" value={pct(m.cagr)} tone={m.cagr >= 0 ? 'up' : 'down'} sub={`${result.benchmark_name}: ${pct(b.cagr)}`} />
                  <StatTile label="Toplam getiri" value={pct(m.total_return, 0)} sub={`${result.start} – ${result.end}`} />
                  <StatTile label="Reel yıllık getiri" tip="TÜFE ile enflasyondan arındırılmış yıllık getiri: paranın satın alma gücü ne kadar arttı." value={pct(m.cagr_real)} tone={m.cagr_real >= 0 ? 'up' : 'down'} sub={`${result.benchmark_name}: ${pct(b.cagr_real)}`} />
                  <StatTile label="Dolar bazında yıllık getiri" tip="USD/TRY ile dolara çevrilmiş yıllık getiri." value={pct(m.cagr_usd)} tone={m.cagr_usd >= 0 ? 'up' : 'down'} sub={`${result.benchmark_name}: ${pct(b.cagr_usd)}`} />
                  <StatTile label="Maksimum düşüş" value={pct(m.max_drawdown)} tone="down" sub={`${result.benchmark_name}: ${pct(b.max_drawdown)}`} />
                  <StatTile label="Yıllık volatilite" value={pct(m.volatility, 1, false)} sub={`Sharpe ${fmtNum(m.sharpe, 2)}`} />
                  <StatTile label="Pozitif ay oranı" value={pct(m.positive_months, 0, false)} sub={`En iyi ${pct(m.best_month)} · en kötü ${pct(m.worst_month)}`} />
                  <StatTile label="Dengeleme" value={result.rebalance_count} sub={`Ort. devir ${pct(result.avg_turnover, 0, false)} · yatırım oranı ${pct(result.avg_exposure, 0, false)}`} />
                </div>

                <div className="panel" style={{ marginBottom: 0 }}>
                  <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Büyüme (başlangıç = 100, log ölçek) ve düşüş</span>
                    <span style={{ display: 'flex', gap: 12, textTransform: 'none', letterSpacing: 0 }}>
                      <span><span style={{ display: 'inline-block', width: 12, height: 3, background: seriesPalette[0], marginRight: 5, verticalAlign: 'middle' }} />Strateji</span>
                      <span><span style={{ display: 'inline-block', width: 12, height: 3, background: seriesPalette[1], marginRight: 5, verticalAlign: 'middle' }} />{result.benchmark_name}</span>
                    </span>
                  </div>
                  <div className="panel-content" style={{ flex: 'none' }}>
                    <EquityChart series={result.series} benchName={result.benchmark_name} />
                  </div>
                </div>

                {result.warnings?.length > 0 && (
                  <div className="card" style={{ borderColor: 'rgba(201, 136, 58, 0.45)' }}>
                    <div className="card-eyebrow" style={{ color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={12} /> Bu sonucu okurken</div>
                    <ul className="text-secondary" style={{ fontSize: 12, paddingLeft: 16, lineHeight: 1.7 }}>{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                  </div>
                )}

                <div className="panel" style={{ marginBottom: 0 }}>
                  <div className="panel-header">Aylık getiriler</div>
                  <div className="panel-content" style={{ flex: 'none' }}><MonthlyTable monthly={result.monthly} /></div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
                  <div className="panel" style={{ marginBottom: 0 }}>
                    <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Son dengeleme · {result.last_holdings?.date} <button type="button" className="btn btn-sm btn-ghost" onClick={exportResult} title="Tüm sonuçları Excel'e indir"><FileDown size={12} /> Excel</button></span>
                      {result.spec.kind === 'rank' && result.last_holdings?.holdings?.length > 0 && (
                        <Button size="sm" variant="outline-gold" onClick={toPaper}><Briefcase size={12} /> Kâğıt portföye aktar</Button>
                      )}
                    </div>
                    <div className="panel-content" style={{ flex: 'none' }}>
                      {paperMsg && <div className="notice" style={{ marginBottom: 8 }}>{paperMsg}</div>}
                      {result.last_holdings?.holdings?.length ? (
                        <table className="data-table compact">
                          <thead><tr><th>Hisse</th><th>Ölçüt değeri</th></tr></thead>
                          <tbody>
                            {result.last_holdings.holdings.map(t => (
                              <tr key={t}><td><TickerCell ticker={t} /></td><td>{fmtNum(result.last_holdings.factor_values?.[t], 1)}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      ) : <span className="text-muted">{result.spec.kind === 'timing' ? 'Son karar: nakit.' : 'Son dengelemede kurallara uyan hisse yoktu; portföy nakitte.'}</span>}
                    </div>
                  </div>
                  <div className="panel" style={{ marginBottom: 0 }}>
                    <div className="panel-header">Varsayımlar</div>
                    <div className="panel-content" style={{ flex: 'none' }}>
                      <ul className="text-secondary" style={{ fontSize: 12, paddingLeft: 16, lineHeight: 1.7 }}>{result.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
                    </div>
                  </div>
                </div>

                <div className="panel" style={{ marginBottom: 0 }}>
                  <div className="panel-header">Dengeleme kaydı · son 24</div>
                  <div className="panel-content" style={{ flex: 'none', padding: 0 }}>
                    <table className="data-table compact">
                      <thead><tr><th>Tarih</th><th style={{ textAlign: 'left' }}>Pozisyonlar</th><th>Devir</th></tr></thead>
                      <tbody>
                        {result.rebalances.map(r => (
                          <tr key={r.date}>
                            <td className="font-mono">{r.date}</td>
                            <td style={{ textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'normal' }}>{r.holdings.length ? r.holdings.join(' · ') : 'Nakit'}</td>
                            <td>{pct(r.turnover, 0, false)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <p className="text-muted" style={{ fontSize: 11 }}>
                  <Chip>Backtest</Chip> Sonuçlar kuralların geçmişe uygulanmasıdır; tavsiye değildir ve gelecek sonuçları öngörmez.
                </p>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
