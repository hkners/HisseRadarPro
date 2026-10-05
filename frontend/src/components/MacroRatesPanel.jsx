// TCMB inflation and policy rate, the real rate, USD/TRY and gram gold, from official TCMB tables and
// market data (services/macro_data.py).
import React, { useEffect, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { StatTile } from './ui';
import { fmtNum, fmtPct } from '../utils/format';
import { seriesPalette, palette } from '../theme';

const API = import.meta.env.VITE_API_URL || '/api';
const axis = { stroke: 'var(--text-muted)', fontSize: 10, tickLine: false, axisLine: false };
const tipStyle = { background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', fontSize: 12 };
const SERIES = [
  { key: 'inflation', label: 'Yıllık enflasyon (TÜFE)', color: seriesPalette[2] },
  { key: 'policy', label: 'Politika faizi', color: seriesPalette[1] },
  { key: 'real_rate', label: 'Reel faiz', color: seriesPalette[0] },
];

export default function MacroRatesPanel() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch(`${API}/macro/rates`).then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))).then(setD).catch(e => setErr(e.message));
  }, []);
  if (err) return <div className="text-muted" style={{ fontSize: 12 }}>TCMB verileri alınamadı: {err}</div>;
  if (!d) return <div className="text-muted" style={{ fontSize: 12 }}>TCMB verileri yükleniyor…</div>;
  const inf = d.inflation || {}, pol = d.policy || {}, usd = d.usdtry || {};
  return (
    <div className="panel" style={{ marginBottom: 0 }}>
      <div className="panel-header">Enflasyon, faiz ve kur</div>
      <div className="panel-content" style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="stat-grid">
          <StatTile label={`Yıllık enflasyon (${inf.period || '—'})`} tip="TÜİK TÜFE, TCMB tablosundan." value={fmtPct(inf.yoy, 2, { sign: false })}
            sub={`Aylık ${fmtPct(inf.mom, 2, { sign: false })} · son 3 ayın yıllıklandırılmışı ${fmtPct(inf.mom_3m_annualised, 1, { sign: false })}`} />
          <StatTile label="Politika faizi" tip="TCMB bir hafta vadeli repo ihale faizi." value={fmtPct(pol.rate, 2, { sign: false })} sub={pol.since ? `${pol.since} tarihinden beri` : ''} />
          <StatTile label="Reel faiz" tip="(1 + politika faizi) / (1 + yıllık enflasyon) - 1. Pozitif reel faiz TL'de tutmayı cazip kılar ve genelde hisse değerlemelerini baskılar." value={fmtPct(d.real_rate, 2)} tone={d.real_rate >= 0 ? 'up' : 'down'} />
          <StatTile label="USD/TRY" value={fmtNum(usd.value, 4)} sub={`1 ay ${fmtPct((usd.chg_1m || 0) * 100, 1)} · 1 yıl ${fmtPct((usd.chg_1y || 0) * 100, 1)}`} />
          <StatTile label="Gram altın" value={`${fmtNum(d.gold?.value, 0)} TL`} sub={d.gold?.date} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 16 }}>
          <div>
            <div style={{ height: 240 }}>
              <ResponsiveContainer>
                <LineChart data={d.history} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
                  <CartesianGrid stroke={palette.grid} vertical={false} />
                  <XAxis dataKey="month" {...axis} minTickGap={40} />
                  <YAxis {...axis} tickFormatter={v => `%${v}`} />
                  <ReferenceLine y={0} stroke="var(--border-strong)" />
                  <Tooltip contentStyle={tipStyle} formatter={(v, n) => [v == null ? '—' : `%${v.toFixed(1).replace('.', ',')}`, n]} />
                  {SERIES.map(s => <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />)}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 11, paddingLeft: 30 }} className="text-secondary">
              {SERIES.map(s => <span key={s.key}><span style={{ display: 'inline-block', width: 10, height: 2, background: s.color, verticalAlign: 'middle', marginRight: 5 }} />{s.label}</span>)}
            </div>
          </div>
          <div>
            <div style={{ height: 240 }}>
              <ResponsiveContainer>
                <LineChart data={d.history} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
                  <CartesianGrid stroke={palette.grid} vertical={false} />
                  <XAxis dataKey="month" {...axis} minTickGap={40} />
                  <YAxis {...axis} scale="log" domain={['auto', 'auto']} tickFormatter={v => fmtNum(v, 0)} allowDataOverflow />
                  <Tooltip contentStyle={tipStyle} formatter={v => [fmtNum(v, 2), 'USD/TRY']} />
                  <Line dataKey="usdtry" name="USD/TRY" stroke={seriesPalette[0]} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="text-secondary" style={{ fontSize: 11, paddingLeft: 30 }}>USD/TRY (ay sonu, logaritmik ölçek)</div>
          </div>
        </div>
        <p className="text-muted" style={{ fontSize: 11 }}>
          Kaynak: TCMB enflasyon ve politika faizi tabloları, piyasa kuru ve ons altın. Ekim ayı enflasyonu açıklanana kadar reel hesaplarda son açıklanan ay kullanılır.
        </p>
      </div>
    </div>
  );
}
