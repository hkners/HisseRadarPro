import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { X, Plus, ArrowLeftRight } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts';
import PageContainer from '../components/common/PageContainer';
import { PillTabs, Button, EmptyState } from '../components/ui';
import { fetchWithCache } from '../utils/apiCache';
import { fmtNum, fmtPct, signClass } from '../utils/format';
import { seriesPalette, palette, fonts } from '../theme';

const API = import.meta.env.VITE_API_URL || '/api';
const PERIODS = [
  { id: '30', label: '1A' }, { id: '91', label: '3A' }, { id: '182', label: '6A' },
  { id: '365', label: '1Y' }, { id: '1095', label: '3Y' }, { id: '1825', label: '5Y' },
];
const PRESETS = [
  { label: 'THYAO / PGSUS / XU100', tickers: ['THYAO', 'PGSUS', 'XU100'] },
  { label: 'Bankalar', tickers: ['AKBNK', 'GARAN', 'YKBNK', 'ISCTR'] },
  { label: 'BIMAS / MGROS / SOKM', tickers: ['BIMAS', 'MGROS', 'SOKM'] },
  { label: 'ASELS / XU100', tickers: ['ASELS', 'XU100'] },
];
const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const fmtDate = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
const fmtAxisDate = (iso, days) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return days > 400 ? `${MONTHS[m - 1]} ${String(y).slice(2)}` : `${d} ${MONTHS[m - 1]}`;
};

function ChartTooltip({ active, payload, label, tickers }) {
  if (!active || !payload?.length) return null;
  const byKey = Object.fromEntries(payload.map(p => [p.dataKey, p.value]));
  return (
    <div className="ff-tooltip" style={{ position: 'static', minWidth: 180 }}>
      <div className="ff-tooltip-title">{fmtDate(label)}</div>
      {tickers.map((t, i) => (
        <div key={t} style={{ display: 'grid', gridTemplateColumns: '10px 1fr auto', gap: 8, alignItems: 'center' }}>
          <span style={{ width: 10, height: 2, background: seriesPalette[i] }} />
          <span>{t}</span>
          <span className={`num ${signClass((byKey[t] ?? 100) - 100)}`}>{fmtPct((byKey[t] ?? 100) - 100)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Compare() {
  const [params, setParams] = useSearchParams();
  const tickers = useMemo(() => (params.get('t') || 'THYAO,XU100').split(',').filter(Boolean).slice(0, 4), [params]);
  const days = params.get('d') || '365';
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState('');
  const [universe, setUniverse] = useState([]);

  const update = (next) => {
    const p = new URLSearchParams(params);
    if (next.tickers) p.set('t', next.tickers.join(','));
    if (next.days) p.set('d', next.days);
    setParams(p, { replace: true });
  };

  useEffect(() => {
    fetchWithCache(`${API}/stocks`).then(d => setUniverse((d?.stocks || []).map(s => s.ticker).sort())).catch(() => {});
  }, []);

  useEffect(() => {
    if (tickers.length < 2) { setData(null); return; }
    setLoading(true);
    setError(null);
    fetch(`${API}/compare?tickers=${tickers.join(',')}&days=${days}`)
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.detail || `HTTP ${r.status}`); return j; })
      .then(setData)
      .catch(e => { setError(e.message); setData(null); })
      .finally(() => setLoading(false));
  }, [tickers, days]);

  const options = useMemo(() => ['XU100', ...universe].filter(t => !tickers.includes(t)), [universe, tickers]);
  const addTicker = (t) => {
    const v = t.trim().toUpperCase();
    if (!v || tickers.includes(v) || tickers.length >= 4) return;
    update({ tickers: [...tickers, v] });
    setAdding('');
  };
  const removeTicker = (t) => update({ tickers: tickers.filter(x => x !== t) });

  const statsBy = Object.fromEntries((data?.stats || []).map(s => [s.ticker, s]));

  return (
    <PageContainer
      title="Karşılaştır"
      subtitle="İki ile dört varlığı aynı başlangıca (100) çekip karşılaştır; hangisinin ne zamandan beri önde olduğunu gör."
      headerRight={<PillTabs tabs={PERIODS} value={days} onChange={(d) => update({ days: d })} />}
      scrollable
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {tickers.map((t, i) => (
            <span key={t} className="count-chip active" style={{ cursor: 'default', borderColor: seriesPalette[i], color: 'var(--text-primary)', background: 'transparent' }}>
              <span style={{ width: 10, height: 3, borderRadius: 2, background: seriesPalette[i] }} />
              <span className="font-mono">{t}</span>
              <button type="button" onClick={() => removeTicker(t)} aria-label={`${t} kaldır`} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'inline-flex' }}>
                <X size={12} />
              </button>
            </span>
          ))}
          {tickers.length < 4 && (
            <form onSubmit={e => { e.preventDefault(); addTicker(adding); }} style={{ display: 'flex', gap: 6 }}>
              <input
                className="input"
                style={{ width: 150 }}
                list="compare-options"
                placeholder="Hisse veya XU100"
                value={adding}
                onChange={e => setAdding(e.target.value.toUpperCase())}
              />
              <datalist id="compare-options">
                {options.slice(0, 700).map(t => <option key={t} value={t} />)}
              </datalist>
              <Button type="submit" size="sm" disabled={!adding.trim()}><Plus size={12} /> Ekle</Button>
            </form>
          )}
          <span className="text-muted" style={{ fontSize: 11, marginLeft: 6 }}>Hazır:</span>
          {PRESETS.map(p => (
            <button key={p.label} type="button" className="count-chip" onClick={() => update({ tickers: p.tickers })}>{p.label}</button>
          ))}
        </div>

        {tickers.length < 2 && (
          <EmptyState icon={ArrowLeftRight} title="Karşılaştırmak için en az iki varlık seç">
            Yukarıdan bir hisse ya da XU100 ekle veya hazır karşılaştırmalardan birini aç.
          </EmptyState>
        )}
        {error && <div className="notice" style={{ borderColor: 'rgba(192, 82, 78, 0.5)', background: 'var(--negative-tint)' }}>{error}</div>}

        {data && (
          <>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div className="card-eyebrow">Kim önde</div>
              {data.pairs.map(p => {
                const lagger = p.leader === p.a ? p.b : p.a;
                return (
                  <div key={p.b} className="card-body" style={{ fontSize: 13.5 }}>
                    {/* Phrased so no Turkish case suffix has to follow a ticker or a date. */}
                    <b className="font-mono" style={{ color: 'var(--gold)' }}>{p.leader}</b>,{' '}
                    <b className="font-mono" style={{ color: 'var(--text-primary)' }}>{lagger}</b> karşısında önde
                    {p.led_whole_period ? ' · dönemin tamamında' : ` · ${fmtDate(p.since)} tarihinden beri`}
                    <span className="text-muted"> · fark {fmtNum(p.gap_points, 1)} puan · günlük getiri korelasyonu {fmtNum(p.correlation, 2)}</span>
                  </div>
                );
              })}
            </div>

            <div className="panel" style={{ marginBottom: 0 }}>
              <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Başlangıç = 100 · {fmtDate(data.start)} – {fmtDate(data.end)}</span>
                {loading && <span className="spinner" />}
              </div>
              <div className="panel-content" style={{ flex: 'none', height: 360, padding: '12px 8px 4px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.series} margin={{ top: 8, right: 64, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke={palette.grid} vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v) => fmtAxisDate(v, Number(days))}
                      stroke={palette.textTertiary}
                      tick={{ fontSize: 10.5, fontFamily: fonts.mono }}
                      tickLine={false}
                      axisLine={{ stroke: palette.border }}
                      minTickGap={48}
                    />
                    <YAxis
                      stroke={palette.textTertiary}
                      tick={{ fontSize: 10.5, fontFamily: fonts.mono }}
                      tickLine={false}
                      axisLine={false}
                      width={44}
                      domain={['auto', 'auto']}
                    />
                    <ReferenceLine y={100} stroke={palette.textTertiary} strokeDasharray="3 3" />
                    <Tooltip content={<ChartTooltip tickers={data.tickers} />} cursor={{ stroke: palette.textTertiary, strokeDasharray: '3 3' }} />
                    {data.tickers.map((t, i) => (
                      <Line
                        key={t}
                        type="monotone"
                        dataKey={t}
                        stroke={seriesPalette[i]}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, stroke: palette.bgRaised, strokeWidth: 2 }}
                        isAnimationActive={false}
                        label={({ index, x, y }) => (index === data.series.length - 1 ? (
                          <text x={x + 6} y={y + 4} fill={palette.textSecondary} fontSize={11} fontFamily={fonts.mono}>{t}</text>
                        ) : null)}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="panel" style={{ marginBottom: 0 }}>
              <div className="panel-content" style={{ padding: 0 }}>
                <table className="data-table">
                  <thead>
                    <tr><th>Varlık</th><th>Başlangıç</th><th>Son</th><th>Toplam getiri</th><th>Yıllık volatilite</th><th>Maks. düşüş</th></tr>
                  </thead>
                  <tbody>
                    {data.tickers.map((t, i) => {
                      const s = statsBy[t];
                      return (
                        <tr key={t}>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ width: 12, height: 3, borderRadius: 2, background: seriesPalette[i] }} />
                              <span className="font-mono" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{t}</span>
                            </span>
                          </td>
                          <td>{fmtNum(s.start_price)}</td>
                          <td>{fmtNum(s.end_price)}</td>
                          <td className={signClass(s.total_return)}>{fmtPct(s.total_return * 100)}</td>
                          <td>{fmtPct(s.volatility * 100, 1, { sign: false })}</td>
                          <td className="text-down">{fmtPct(s.max_drawdown * 100)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-muted" style={{ fontSize: 11 }}>Günlük kapanış fiyatları; temettü ve sermaye artırımı düzeltmesi veri kaynağına bağlıdır. Geçmiş performans gelecek sonuçları göstermez.</p>
          </>
        )}
      </div>
    </PageContainer>
  );
}
