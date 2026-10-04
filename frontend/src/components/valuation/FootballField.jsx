import React, { useMemo, useState } from 'react';
import { fmtPrice, fmtPct, upsidePct } from './valuationModel';

// Rounds a raw tick step to 1/2/2.5/5 × 10^n so axis labels stay readable.
function niceStep(raw) {
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

/**
 * Horizontal range chart comparing valuation methods against the current price.
 * rows: [{ key, label, low, mid, high, detail, points? }]
 */
export default function FootballField({ rows, price }) {
  const [hover, setHover] = useState(null); // { row, x, y }

  const scale = useMemo(() => {
    const values = rows.flatMap(r => [r.low, r.high]).filter(v => v != null);
    if (price) values.push(price);
    if (!values.length) return null;
    let lo = Math.min(...values) * 0.92;
    let hi = Math.max(...values) * 1.06;
    // Keep extreme peer quartiles from flattening everything else.
    if (price) {
      lo = Math.max(lo, price * 0.25);
      hi = Math.min(hi, price * 3);
    }
    lo = Math.max(0, lo);
    const step = niceStep((hi - lo) / 5);
    const start = Math.floor(lo / step) * step;
    const end = Math.ceil(hi / step) * step;
    const ticks = [];
    for (let t = start; t <= end + step / 2; t += step) ticks.push(t);
    return { lo: start, hi: end, ticks, pos: v => ((v - start) / (end - start)) * 100 };
  }, [rows, price]);

  if (!scale || !rows.length) {
    return <div className="text-muted" style={{ padding: 24, textAlign: 'center' }}>Bu hisse için değerleme aralığı hesaplanacak yeterli veri yok.</div>;
  }

  const clamp = v => Math.max(0, Math.min(100, scale.pos(v)));
  const pricePos = price ? clamp(price) : null;

  return (
    <div className="ff" onMouseLeave={() => setHover(null)}>
      <div className="ff-grid">
        {rows.map(row => {
          const left = clamp(row.low);
          const right = clamp(row.high);
          const clippedHigh = scale.pos(row.high) > 100;
          const clippedLow = scale.pos(row.low) < 0;
          const isContext = row.key === 'w52';
          return (
            <React.Fragment key={row.key}>
              <div className="ff-label">
                <span className="ff-label-name">{row.label}</span>
                <span className="ff-label-range num">{fmtPrice(row.low)} – {fmtPrice(row.high)}</span>
              </div>
              <div
                className="ff-track"
                onMouseMove={e => {
                  const box = e.currentTarget.closest('.ff').getBoundingClientRect();
                  setHover({ row, x: e.clientX - box.left, y: e.clientY - box.top });
                }}
              >
                {scale.ticks.map(t => (
                  <span key={t} className="ff-gridline" style={{ left: `${scale.pos(t)}%` }} />
                ))}
                <span
                  className={`ff-bar${isContext ? ' ff-bar-context' : ''}`}
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(0.6, right - left)}%`,
                    borderTopLeftRadius: clippedLow ? 0 : undefined,
                    borderBottomLeftRadius: clippedLow ? 0 : undefined,
                    borderTopRightRadius: clippedHigh ? 0 : undefined,
                    borderBottomRightRadius: clippedHigh ? 0 : undefined,
                  }}
                />
                {row.points?.map((p, i) => (
                  <span key={i} className="ff-point" style={{ left: `${clamp(p.value)}%` }} />
                ))}
                {row.mid != null && <span className="ff-notch" style={{ left: `${clamp(row.mid)}%` }} />}
                {clippedHigh && <span className="ff-clip num">→ {fmtPrice(row.high)}</span>}
              </div>
            </React.Fragment>
          );
        })}

        <div />
        <div className="ff-axis">
          {scale.ticks.map(t => (
            <span key={t} className="num" style={{ left: `${scale.pos(t)}%` }}>{t.toLocaleString('tr-TR')}</span>
          ))}
        </div>
      </div>

      {pricePos != null && (
        <div className="ff-price-layer">
          <div />
          <div style={{ position: 'relative' }}>
            <span className="ff-price-line" style={{ left: `${pricePos}%` }} />
            <span className="ff-price-label num" style={{ left: `${pricePos}%` }}>Fiyat {fmtPrice(price)}</span>
          </div>
        </div>
      )}

      {hover && (
        <div className="ff-tooltip" style={{ left: hover.x + 14, top: hover.y + 10 }}>
          <div className="ff-tooltip-title">{hover.row.label}</div>
          <TooltipLine label="Düşük" value={hover.row.low} price={price} />
          {hover.row.mid != null && <TooltipLine label={hover.row.key === 'brokers' ? 'Medyan' : 'Orta'} value={hover.row.mid} price={price} />}
          <TooltipLine label="Yüksek" value={hover.row.high} price={price} />
          <div className="ff-tooltip-detail">{hover.row.detail}</div>
        </div>
      )}
    </div>
  );
}

function TooltipLine({ label, value, price }) {
  const up = upsidePct(value, price);
  return (
    <div className="ff-tooltip-line">
      <span>{label}</span>
      <span className="num" style={{ color: 'var(--text-primary)' }}>{fmtPrice(value)}</span>
      <span className="num" style={{ color: up == null ? undefined : up >= 0 ? 'var(--positive)' : 'var(--negative)' }}>{fmtPct(up)}</span>
    </div>
  );
}
