// Stock-level technical analysis: model score and its drivers, stage, levels, risk and active signals
// with their BIST evidence, on a chart drawn from our own price history.
import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, CrosshairMode, CandlestickSeries, LineSeries, HistogramSeries, LineStyle } from 'lightweight-charts';
import { Bell } from 'lucide-react';
import { Button, StatTile, InfoTip } from '../ui';
import { useTaData, BuildingNotice, StageChip, VerdictChip, ScoreBar, STAGE, pts, pct } from './common';
import { fmtNum } from '../../utils/format';
import { palette, seriesPalette } from '../../theme';

const MA_COLORS = { sma50: seriesPalette[0], sma150: seriesPalette[1], sma200: seriesPalette[2] };

function PriceChart({ candles, row }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !candles?.length) return undefined;
    const chart = createChart(ref.current, {
      height: 380,
      layout: { background: { type: ColorType.Solid, color: palette.bgRaised }, textColor: palette.textTertiary, fontSize: 11 },
      grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
      rightPriceScale: { borderColor: palette.border },
      timeScale: { borderColor: palette.border },
      crosshair: { mode: CrosshairMode.Normal },
      autoSize: true,
    });
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: palette.positive, downColor: palette.negative, wickUpColor: palette.positive, wickDownColor: palette.negative, borderVisible: false,
    });
    candle.setData(candles.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
    Object.entries(MA_COLORS).forEach(([k, color]) => {
      const s = chart.addSeries(LineSeries, { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(candles.filter(c => c[k] != null).map(c => ({ time: c.time, value: c[k] })));
    });
    const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    vol.setData(candles.map(c => ({ time: c.time, value: c.volume, color: c.close >= c.open ? 'rgba(63,138,107,0.35)' : 'rgba(192,82,78,0.35)' })));
    (row.levels?.supports || []).forEach(l => candle.createPriceLine({ price: l.price, color: palette.positive, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Destek (${l.touches})` }));
    (row.levels?.resistances || []).forEach(l => candle.createPriceLine({ price: l.price, color: palette.negative, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Direnç (${l.touches})` }));
    if (row.stop) candle.createPriceLine({ price: row.stop, color: palette.warning, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: 'Stop' });
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles, row]);
  return (
    <div>
      <div ref={ref} style={{ width: '100%', height: 380 }} />
      <div style={{ display: 'flex', gap: 14, fontSize: 11, marginTop: 6, flexWrap: 'wrap' }} className="text-secondary">
        <span><span style={{ display: 'inline-block', width: 10, height: 2, background: MA_COLORS.sma50, verticalAlign: 'middle', marginRight: 5 }} />SMA50</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 2, background: MA_COLORS.sma150, verticalAlign: 'middle', marginRight: 5 }} />SMA150 (evre)</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 2, background: MA_COLORS.sma200, verticalAlign: 'middle', marginRight: 5 }} />SMA200</span>
        <span className="text-up">kesik yeşil: destek</span><span className="text-down">kesik kırmızı: direnç</span><span style={{ color: 'var(--warning)' }}>düz: önerilen stop</span>
        <span className="text-muted">Fiyatlar bölünme ve bedelsizlere göre düzeltilmiştir.</span>
      </div>
    </div>
  );
}

function Diverging({ items }) {
  const max = Math.max(0.002, ...items.map(g => Math.abs(g.effect)));
  return (
    <div>
      {items.map(g => {
        const w = (Math.abs(g.effect) / max) * 50;
        return (
          <div key={g.key || g.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 160px 86px', gap: 10, alignItems: 'center', padding: '5px 0' }}>
            <span className="text-secondary" style={{ fontSize: 12.5 }}>{g.label}</span>
            <span className="diverge-track">
              <span className="zero" />
              <span className="fill" style={{ background: g.effect >= 0 ? 'var(--positive)' : 'var(--negative)', left: g.effect >= 0 ? '50%' : `${50 - w}%`, width: `${w}%` }} />
            </span>
            <span className={g.effect >= 0 ? 'text-up' : 'text-down'} style={{ fontSize: 11.5, textAlign: 'right' }}>{pts(g.effect)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function TechnicalPanel({ ticker }) {
  const { data, error, building } = useTaData(`/ta/stock/${ticker}`);
  if (building) return <BuildingNotice building={building} />;
  if (error) return <div className="text-muted" style={{ padding: 16 }}>{error}</div>;
  if (!data) return <div className="text-muted" style={{ padding: 16 }}>Teknik analiz yükleniyor…</div>;
  const r = data.row;
  const levelRows = [
    ...(r.levels?.resistances || []).slice().reverse().map(l => ({ ...l, kind: 'Direnç' })),
    { kind: 'Fiyat', price: r.price, dist_pct: 0, dist_atr: 0, touches: null },
    ...(r.levels?.supports || []).map(l => ({ ...l, kind: 'Destek' })),
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!r.liquid && <div className="notice">Bu hissenin işlem hacmi düşük (20 günlük ortalama 2 milyon TL altı). Model likit hisselerle eğitildi; skor ve sinyal istatistikleri bu hisse için daha az güvenilir.</div>}
      <div className="stat-grid">
        <StatTile label="Teknik skor" tip="Teknik modelin likit hisseler arasındaki yüzdelik sırası. 90+ en iyi %10." value={<ScoreBar score={r.score} width={80} />} sub={r.decile ? `${r.decile}. dilim · tarihsel 20 gün ${pts(r.expected_excess_20d)}` : ''} />
        <StatTile label="Evre (Weinstein)" value={<StageChip stage={r.stage} />} sub={STAGE[r.stage]?.long} />
        <StatTile label="Göreli güç / şablon" tip="Göreli güç notu 1-99. Şablon: Minervini trend şablonunun 8 koşulundan sağlananlar." value={`${r.rs_rating ?? '—'} · ${r.template ?? '—'}/8`} sub={`52 hafta zirveye ${pct(r.dist_hi52)}, dibin ${pct(r.above_lo52)} üstünde`} />
        <StatTile label="Trend gücü (ADX)" value={fmtNum(r.adx, 0)} sub={r.plus_di != null ? (r.plus_di > r.minus_di ? 'Yön yukarı (+DI > -DI)' : 'Yön aşağı (-DI > +DI)') : ''} />
        <StatTile label="Günlük oynaklık (ATR)" value={pct(r.atr_pct, 1, false)} sub={r.squeeze ? 'Bollinger sıkışması var' : `RSI ${fmtNum(r.rsi14, 0)}`} />
        <StatTile label="Önerilen stop" tip="En yakın desteğin yarım ATR altı (1-3 ATR uzaktaysa), değilse fiyatın 2,5 ATR altı." value={r.stop ? `${fmtNum(r.stop, 2)} TL` : '—'} sub={pct(r.stop_pct)} tone="down" />
      </div>

      <div className="panel" style={{ marginBottom: 0 }}>
        <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Fiyat, ortalamalar ve seviyeler (son 1 yıl)</span>
          <Button size="sm" to={`/alarms?ticker=${ticker}`}><Bell size={12} /> Alarm kur</Button>
        </div>
        <div className="panel-content" style={{ flex: 'none' }}><PriceChart candles={data.candles} row={r} /></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">Skoru ne belirliyor <InfoTip text="Her girdi nötr değerine çekildiğinde modelin 20 günlük tahmininin ne kadar değiştiği. Model doğrusal olmadığından katkılar yaklaşık; toplamları tahmine tam eşit değildir." size={10} /></div>
          <div className="panel-content" style={{ flex: 'none' }}>
            <Diverging items={r.groups || []} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 4 }}>Yükseltenler</div>
                {(r.drivers_pos || []).map(d => <div key={d.key} style={{ fontSize: 12 }} className="text-secondary">{d.label} <span className="text-up">{pts(d.effect)}</span></div>)}
                {!r.drivers_pos?.length && <span className="text-muted" style={{ fontSize: 12 }}>—</span>}
              </div>
              <div>
                <div className="eyebrow" style={{ marginBottom: 4 }}>Düşürenler</div>
                {(r.drivers_neg || []).map(d => <div key={d.key} style={{ fontSize: 12 }} className="text-secondary">{d.label} <span className="text-down">{pts(d.effect)}</span></div>)}
                {!r.drivers_neg?.length && <span className="text-muted" style={{ fontSize: 12 }}>—</span>}
              </div>
            </div>
          </div>
        </div>
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">Destek ve direnç <InfoTip text="Son ~250 seansın 5 çubuklu tepe ve diplerinden; 1 ATR içindeki noktalar tek seviyede birleştirildi. Parantez: seviyeye kaç kez dönüldüğü." size={10} /></div>
          <div className="panel-content" style={{ padding: 0, flex: 'none' }}>
            <table className="data-table compact">
              <thead><tr><th style={{ textAlign: 'left' }}>Seviye</th><th>Fiyat</th><th>Uzaklık</th><th>ATR</th><th>Dokunma</th></tr></thead>
              <tbody>
                {levelRows.map((l, i) => (
                  <tr key={i} style={l.kind === 'Fiyat' ? { background: 'var(--gold-tint)' } : undefined}>
                    <td style={{ textAlign: 'left' }} className={l.kind === 'Destek' ? 'text-up' : l.kind === 'Direnç' ? 'text-down' : 'text-gold'}>{l.kind}</td>
                    <td>{fmtNum(l.price, 2)}</td>
                    <td>{l.kind === 'Fiyat' ? '—' : pct(l.dist_pct)}</td>
                    <td>{l.kind === 'Fiyat' ? '—' : fmtNum(l.dist_atr, 1)}</td>
                    <td>{l.touches ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 0 }}>
        <div className="panel-header">Aktif sinyaller ve BIST kanıtı</div>
        <div className="panel-content" style={{ padding: 0, flex: 'none' }}>
          {data.signals.length === 0 ? <p className="text-muted" style={{ padding: 12 }}>Şu an aktif sinyal yok.</p> : (
            <table className="data-table compact">
              <thead><tr><th style={{ textAlign: 'left' }}>Sinyal</th><th style={{ textAlign: 'left' }}>Ne anlama geliyor</th><th>Tarihsel 20 gün</th><th>Kanıt</th></tr></thead>
              <tbody>
                {data.signals.map(s => (
                  <tr key={s.key}>
                    <td style={{ textAlign: 'left', color: 'var(--text-primary)' }}>{s.label}<div className="text-muted" style={{ fontSize: 10 }}>{s.group} · {s.kind === 'event' ? 'son 5 seansta' : 'şu an'}</div></td>
                    <td style={{ textAlign: 'left', fontFamily: 'var(--font-body)', fontSize: 11.5, maxWidth: 420, whiteSpace: 'normal' }} className="text-secondary">{s.desc}</td>
                    <td className={s.mean20 > 0 ? 'text-up' : s.mean20 < 0 ? 'text-down' : ''}>{pts(s.mean20)}</td>
                    <td><VerdictChip verdict={s.verdict} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <p className="text-muted" style={{ fontSize: 11 }}>Son veri {data.as_of}. Teknik analiz yatırım tavsiyesi değildir; tarihsel sonuçlar geleceği garanti etmez.</p>
    </div>
  );
}
