// Out-of-sample evidence of the technical model, shared by the Teknik Radar "Model" tab and the score card.
import React from 'react';
import {
  ResponsiveContainer, BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts';
import { StatTile, InfoTip } from '../ui';
import { pts, pct } from './common';
import { fmtNum } from '../../utils/format';
import { seriesPalette, palette } from '../../theme';

const axis = { stroke: 'var(--text-muted)', fontSize: 10, tickLine: false, axisLine: false };
const tipStyle = { background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', fontSize: 12 };

export function ModelStats({ m }) {
  const top = m.deciles?.[9]?.mean, bottom = m.deciles?.[0]?.mean;
  const yearly = Object.values(m.yearly || {});
  return (
    <div className="stat-grid">
      <StatTile label="En iyi %10 (20 gün)" tip="Skoru en yüksek %10'luk dilimin, sonraki 20 işlem gününde eşit ağırlıklı likit evrene göre ortalama fazla getirisi. Her yıl, o yılı hiç görmemiş bir modelle hesaplandı." value={pts(top)} tone={top > 0 ? 'up' : 'down'} sub={`${yearly.filter(y => y.top > 0).length}/${yearly.length} yılda pozitif`} />
      <StatTile label="En kötü %10 (20 gün)" value={pts(bottom)} tone={bottom < 0 ? 'down' : 'up'} sub={`${yearly.filter(y => y.bottom < 0).length}/${yearly.length} yılda negatif`} />
      <StatTile label="Sıralama korelasyonu (IC)" tip="Skor sırası ile sonraki 20 günlük getiri sırası arasındaki ortalama korelasyon. Hisse seçiminde 0,05 üzeri güçlü kabul edilir." value={fmtNum(m.ic_mean, 3)} sub={`t = ${fmtNum(m.ic_t, 1)} · ayların %${Math.round((m.ic_positive_months || 0) * 100)}'inde pozitif`} />
      <StatTile label="Yıllık getiri (maliyet sonrası)" tip="Her ay başı en iyi %10 alınıp ay boyunca tutulduğunda; işlem başına %0,20 maliyet düşülür. Nominal TL." value={pct(m.cagr_top, 0)} sub={`Evren ${pct(m.cagr_universe, 0)} · en kötü %10 ${pct(m.cagr_bottom, 0)}`} tone={m.cagr_top > m.cagr_universe ? 'up' : 'down'} />
    </div>
  );
}

export function DecileChart({ deciles, height = 220 }) {
  const data = (deciles || []).map(d => ({ ...d, v: d.mean * 100 }));
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
          <CartesianGrid stroke={palette.grid} vertical={false} />
          <XAxis dataKey="decile" {...axis} tickFormatter={d => `${d}.`} />
          <YAxis {...axis} tickFormatter={v => v.toFixed(1)} />
          <ReferenceLine y={0} stroke="var(--border-strong)" />
          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} contentStyle={tipStyle}
            formatter={(v) => [`${v > 0 ? '+' : ''}${v.toFixed(2).replace('.', ',')} puan`, '20 günlük fazla getiri']} labelFormatter={d => `${d}. dilim`} />
          <Bar dataKey="v" radius={[3, 3, 3, 3]} isAnimationActive={false}>
            {data.map(d => <Cell key={d.decile} fill={d.v >= 0 ? palette.positive : palette.negative} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CurveChart({ curve, height = 260 }) {
  const series = [
    { key: 'top', label: 'En iyi %10', color: seriesPalette[0] },
    { key: 'universe', label: 'Likit evren (eşit ağırlık)', color: seriesPalette[1] },
    { key: 'bottom', label: 'En kötü %10', color: seriesPalette[2] },
  ];
  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer>
          <LineChart data={curve} margin={{ top: 8, right: 16, bottom: 0, left: -6 }}>
            <CartesianGrid stroke={palette.grid} vertical={false} />
            <XAxis dataKey="date" {...axis} tickFormatter={d => d.slice(0, 4)} minTickGap={50} />
            <YAxis {...axis} scale="log" domain={['auto', 'auto']} tickFormatter={v => fmtNum(v, 0)} allowDataOverflow />
            <Tooltip contentStyle={tipStyle} formatter={(v, n) => [fmtNum(v, 0), n]} />
            {series.map(s => <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} isAnimationActive={false} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', gap: 14, fontSize: 11, paddingLeft: 40 }} className="text-secondary">
        {series.map(s => <span key={s.key}><span style={{ display: 'inline-block', width: 10, height: 2, background: s.color, verticalAlign: 'middle', marginRight: 5 }} />{s.label}</span>)}
        <span className="text-muted">Başlangıç = 100, logaritmik ölçek</span>
      </div>
    </div>
  );
}

export function YearlyTable({ yearly }) {
  return (
    <table className="data-table compact">
      <thead><tr><th style={{ textAlign: 'left' }}>Yıl</th><th>En iyi %10</th><th>En kötü %10</th><th>Fark</th><th>IC</th></tr></thead>
      <tbody>
        {Object.entries(yearly || {}).map(([y, v]) => (
          <tr key={y}>
            <td style={{ textAlign: 'left' }}>{y}</td>
            <td className={v.top > 0 ? 'text-up' : 'text-down'}>{pts(v.top)}</td>
            <td className={v.bottom > 0 ? 'text-up' : 'text-down'}>{pts(v.bottom)}</td>
            <td className={v.top - v.bottom > 0 ? 'text-up' : 'text-down'}>{pts(v.top - v.bottom)}</td>
            <td>{fmtNum(v.ic, 3)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ImportanceList({ importance, limit = 14 }) {
  const list = (importance || []).slice(0, limit);
  const max = Math.max(...list.map(x => x.importance), 1e-9);
  return (
    <div>
      {list.map(x => (
        <div key={x.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px 74px', gap: 10, alignItems: 'center', padding: '5px 0' }}>
          <span style={{ fontSize: 12.5 }} className="text-secondary">
            {x.label} <span className="text-muted" style={{ fontSize: 10 }}>{x.kind === 'signal' ? 'sinyal' : 'gösterge'}</span>
          </span>
          <span style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${(x.importance / max) * 100}%`, background: 'var(--gold)' }} />
          </span>
          <span className="text-muted" style={{ fontSize: 10.5, textAlign: 'right' }}>
            {x.direction == null ? 'yön karışık' : x.direction > 0.2 ? 'yüksek iyi' : x.direction < -0.2 ? 'düşük iyi' : 'doğrusal değil'}
          </span>
        </div>
      ))}
      <p className="text-muted" style={{ fontSize: 10.5, marginTop: 6 }}>
        Önem: girdi nötr değere çekildiğinde tahminin ortalama ne kadar değiştiği (son 2 yıl). <InfoTip text="'Yüksek iyi': gösterge yükseldikçe skor artıyor. 'Düşük iyi': azaldıkça artıyor. 'Doğrusal değil': etkisi değere göre yön değiştiriyor (örneğin uç değerlerde)." size={9} />
      </p>
    </div>
  );
}
