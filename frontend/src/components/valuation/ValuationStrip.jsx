import React from 'react';
import { ArrowRight } from 'lucide-react';
import { InfoTip } from '../ui';
import { fmtPrice, fmtPct, upsidePct } from './valuationModel';

function Cell({ label, tip, value, price, sub }) {
  const up = upsidePct(value, price);
  return (
    <div className="vstrip-cell">
      <span className="eyebrow">{label}{tip && <InfoTip text={tip} size={10} />}</span>
      <span className="vstrip-value">
        <span className="num">{fmtPrice(value)}</span>
        {up != null && (
          <span className={`num vstrip-up ${up >= 0 ? 'text-up' : 'text-down'}`}>{fmtPct(up)}</span>
        )}
      </span>
      {sub && <span className="vstrip-sub">{sub}</span>}
    </div>
  );
}

/** Summary row under the stock header: price vs. each valuation anchor, like a desk's one-line view. */
export default function ValuationStrip({ price, rows, score, peerGroup, onOpenDetail }) {
  const byKey = Object.fromEntries(rows.map(r => [r.key, r]));
  const brokers = byKey.brokers;
  const scoreVal = score?.valuation_score;

  return (
    <div className="vstrip">
      <div className="vstrip-cell">
        <span className="eyebrow">Piyasa fiyatı</span>
        <span className="vstrip-value"><span className="num">{fmtPrice(price)}</span></span>
      </div>
      <Cell
        label="Kurum medyanı"
        tip="Her kurumun en son hedef fiyatının medyanı. Yanındaki yüzde, güncel fiyata göre potansiyel."
        value={brokers?.mid}
        price={price}
        sub={brokers ? `${brokers.points.length} kurum · ${fmtPrice(brokers.low)}–${fmtPrice(brokers.high)}` : 'Rapor yok'}
      />
      <Cell
        label="F/K emsal"
        tip="Emsal grubunun medyan F/K'sı ile hissenin son 12 aylık hisse başı kârının çarpımı. Bir fiyat tahmini değildir."
        value={byKey.pe?.mid}
        price={price}
        sub={byKey.pe ? peerGroup : 'Yeterli emsal / kâr yok'}
      />
      <Cell
        label="PD/DD emsal"
        tip="Emsal grubunun medyan PD/DD'si ile hissenin hisse başı defter değerinin çarpımı. Bir fiyat tahmini değildir."
        value={byKey.pb?.mid}
        price={price}
        sub={byKey.pb ? peerGroup : 'Yeterli emsal yok'}
      />
      <div className="vstrip-cell">
        <span className="eyebrow">
          Değerleme skoru
          <InfoTip text="0–100. Yüksek = ucuz. %60 hissenin kendi 3 yıllık çarpan geçmişindeki dilimi, %40 sektör emsallerine göre çarpanı." size={10} />
        </span>
        <span className="vstrip-value">
          <span className="num">{scoreVal != null ? scoreVal.toFixed(0) : '—'}</span>
          {scoreVal != null && <span className="vstrip-sub" style={{ margin: 0 }}>/ 100</span>}
        </span>
        {scoreVal != null && (
          <span className="vstrip-meter"><span style={{ width: `${scoreVal}%` }} /></span>
        )}
      </div>
      <button type="button" className="vstrip-link" onClick={onOpenDetail}>
        Değerleme detayı <ArrowRight size={13} />
      </button>
    </div>
  );
}
