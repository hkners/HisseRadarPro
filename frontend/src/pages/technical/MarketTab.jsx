import React, { useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
  ScatterChart, Scatter, ZAxis, LabelList,
} from 'recharts';
import { StatTile, InfoTip } from '../../components/ui';
import { STAGE, pct } from '../../components/ta/common';
import { seriesPalette, palette } from '../../theme';
import { trSector } from '../../utils/sectors';

const QUADRANT_COLOR = { Lider: palette.positive, 'Zayıflayan': palette.warning, Geride: palette.negative, Toparlanan: seriesPalette[1] };
const axis = { stroke: 'var(--text-muted)', fontSize: 10, tickLine: false, axisLine: false };
const tipStyle = { background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', fontSize: 12 };
const shortDate = (d) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : '');

function RotationChart({ sectors }) {
  const latest = sectors.map(s => ({ ...s, x: s.ratio, y: s.momentum, name: trSector(s.sector) }));
  const lo = Math.min(96, ...sectors.flatMap(s => s.tail.map(p => Math.min(p.ratio, p.mom)))) - 1;
  const hi = Math.max(104, ...sectors.flatMap(s => s.tail.map(p => Math.max(p.ratio, p.mom)))) + 1;
  return (
    <div style={{ height: 380 }}>
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 12, right: 24, bottom: 8, left: 0 }}>
          <CartesianGrid stroke={palette.grid} />
          <XAxis type="number" dataKey="x" name="Göreli güç" domain={[lo, hi]} {...axis} tickFormatter={v => v.toFixed(0)} />
          <YAxis type="number" dataKey="y" name="Momentum" domain={[lo, hi]} {...axis} tickFormatter={v => v.toFixed(0)} />
          <ZAxis range={[60, 60]} />
          <ReferenceLine x={100} stroke="var(--border-strong)" />
          <ReferenceLine y={100} stroke="var(--border-strong)" />
          {sectors.map(s => (
            <Scatter key={s.sector} data={s.tail.map(p => ({ x: p.ratio, y: p.mom }))} line={{ stroke: 'var(--text-muted)', strokeWidth: 1 }}
              shape={() => null} isAnimationActive={false} />
          ))}
          <Scatter data={latest} isAnimationActive={false}
            shape={(p) => <circle cx={p.cx} cy={p.cy} r={6} fill={QUADRANT_COLOR[p.payload.quadrant]} stroke="var(--bg-raised)" strokeWidth={2} />}>
            <LabelList dataKey="name" position="right" style={{ fill: 'var(--text-secondary)', fontSize: 10.5 }} />
          </Scatter>
          <Tooltip cursor={false} contentStyle={tipStyle} formatter={(v) => (typeof v === 'number' ? v.toFixed(1) : v)} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function MarketTab({ ov }) {
  const o = ov.overview;
  const stageTotal = Object.values(o.stages || {}).reduce((a, b) => a + b, 0) || 1;
  const hist = useMemo(() => o.breadth_history.map(p => ({ ...p, above200: p.above200 * 100, above50: p.above50 * 100 })), [o]);
  const sectors = [...ov.sectors].sort((a, b) => b.ratio - a.ratio);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="stat-grid">
        <StatTile label="SMA50 üzerindeki hisseler" tip="Likit hisselerin kendi 50 günlük ortalamasının üzerinde kapatan payı. Kısa-orta vadeli genişlik." value={pct(o.pct_above_sma50, 0, false)} sub={`${o.liquid_count} likit hisse`} tone={o.pct_above_sma50 >= 0.5 ? 'up' : 'down'} />
        <StatTile label="SMA200 üzerindeki hisseler" tip="Uzun vadeli genişlik. %40 altı zayıf, %60 üstü güçlü piyasa." value={pct(o.pct_above_sma200, 0, false)} tone={o.pct_above_sma200 >= 0.5 ? 'up' : 'down'} sub={`XU100 SMA200'e göre ${pct(o.bench_dist_sma200)}`} />
        <StatTile label="Yükseliş evresinde (2. evre)" value={pct(o.pct_stage2, 0, false)} sub={`Trend şablonu 7+/8: ${pct(o.pct_template, 0, false)}`} />
        <StatTile label="Yeni 52 hafta zirve / dip" value={`${o.new_highs} / ${o.new_lows}`} sub={`Son veri ${o.as_of}`} tone={o.new_highs >= o.new_lows ? 'up' : 'down'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 12 }}>
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">Piyasa genişliği (son 1 yıl)</div>
          <div className="panel-content" style={{ flex: 'none', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={hist} margin={{ top: 8, right: 16, bottom: 0, left: -10 }}>
                <CartesianGrid stroke={palette.grid} vertical={false} />
                <XAxis dataKey="date" {...axis} tickFormatter={shortDate} minTickGap={40} />
                <YAxis {...axis} domain={[0, 100]} tickFormatter={v => `%${v}`} />
                <ReferenceLine y={50} stroke="var(--border-strong)" strokeDasharray="3 3" />
                <Tooltip contentStyle={tipStyle} formatter={(v, n) => [`%${v.toFixed(0)}`, n]} labelFormatter={shortDate} />
                <Line type="monotone" dataKey="above200" name="SMA200 üzerinde" stroke={seriesPalette[0]} strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="above50" name="SMA50 üzerinde" stroke={seriesPalette[1]} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 14, fontSize: 11, marginTop: -4, paddingLeft: 30 }} className="text-secondary">
              <span><span style={{ display: 'inline-block', width: 10, height: 2, background: seriesPalette[0], verticalAlign: 'middle', marginRight: 5 }} />SMA200 üzerinde</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 2, background: seriesPalette[1], verticalAlign: 'middle', marginRight: 5 }} />SMA50 üzerinde</span>
            </div>
          </div>
        </div>
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">Evre dağılımı (Weinstein) <InfoTip text="Fiyatın 150 günlük ortalamasına ve ortalamanın eğimine göre. Eğim, enflasyon kaynaklı genel yükselişi ayıklamak için XU100'ün eğimine göre ölçülür." size={10} /></div>
          <div className="panel-content" style={{ flex: 'none' }}>
            {[2, 1, 3, 4].map(st => {
              const n = o.stages?.[st] || 0;
              const share = n / stageTotal;
              const color = { 1: 'var(--text-tertiary)', 2: 'var(--positive)', 3: 'var(--warning)', 4: 'var(--negative)' }[st];
              return (
                <div key={st} style={{ display: 'grid', gridTemplateColumns: '170px 1fr 70px', gap: 10, alignItems: 'center', padding: '7px 0' }}>
                  <span className="text-secondary" style={{ fontSize: 12.5 }}>{STAGE[st].label} · {STAGE[st].long}</span>
                  <span style={{ height: 8, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${share * 100}%`, background: color, borderRadius: 4 }} />
                  </span>
                  <span className="num" style={{ textAlign: 'right', fontSize: 12 }}>{n} · {pct(share, 0, false)}</span>
                </div>
              );
            })}
            <p className="text-muted" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.55 }}>
              BIST'te 4. evredeki hisseler sonraki 20 işlem gününde piyasa ortalamasının belirgin altında kaldı; bu evre sinyal karnesinde güçlü olumsuz kanıt taşıyor.
            </p>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 0 }}>
        <div className="panel-header">
          Sektör rotasyonu
          <InfoTip text="Her sektörün eşit ağırlıklı endeksi, likit hisselerin eşit ağırlıklı ortalamasına göre. Yatay eksen göreli güç (13 haftalık ortalamasına göre, 100 = piyasa ile aynı), dikey eksen bu gücün son 4 haftadaki değişimi. Çizgiler son 10 haftanın izi. Sektörler genelde saat yönünde döner: Toparlanan, Lider, Zayıflayan, Geride." size={10} />
        </div>
        <div className="panel-content" style={{ flex: 'none', display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 16 }}>
          <div>
            <RotationChart sectors={ov.sectors} />
            <div style={{ display: 'flex', gap: 14, fontSize: 11, paddingLeft: 30 }} className="text-secondary">
              {Object.entries(QUADRANT_COLOR).map(([q, c]) => (
                <span key={q}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: c, marginRight: 5 }} />{q}</span>
              ))}
            </div>
          </div>
          <table className="data-table compact">
            <thead><tr><th>Sektör</th><th>Durum</th><th>Göreli güç</th><th>Momentum</th><th>1A</th><th>3A</th></tr></thead>
            <tbody>
              {sectors.map(s => (
                <tr key={s.sector}>
                  <td>{trSector(s.sector)} <span className="text-muted" style={{ fontSize: 10.5 }}>({s.members})</span></td>
                  <td style={{ color: QUADRANT_COLOR[s.quadrant] }}>{s.quadrant}</td>
                  <td>{s.ratio.toFixed(1).replace('.', ',')}</td>
                  <td>{s.momentum.toFixed(1).replace('.', ',')}</td>
                  <td className={s.ret_1m >= 0 ? 'text-up' : 'text-down'}>{pct(s.ret_1m)}</td>
                  <td className={s.ret_3m >= 0 ? 'text-up' : 'text-down'}>{pct(s.ret_3m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
