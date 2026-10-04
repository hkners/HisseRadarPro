import React from 'react';
import FootballField from './FootballField';
import { fmtPrice, fmtPct, upsidePct } from './valuationModel';
import { InfoTip } from '../ui';

function ScoreRow({ label, value, hint }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <span className="text-secondary" style={{ fontSize: 12 }}>{label}{hint && <InfoTip text={hint} size={10} />}</span>
      <span className="num" style={{ color: 'var(--text-primary)', fontSize: 12.5 }}>{value}</span>
    </div>
  );
}

export default function ValuationTab({ price, rows, valuation, consensus }) {
  const score = valuation?.score;
  const ratings = consensus?.ratings || { AL: 0, TUT: 0, SAT: 0 };
  const totalRatings = ratings.AL + ratings.TUT + ratings.SAT;

  return (
    <div className="valuation-tab">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">Football field · yöntemlere göre değer aralığı</div>
          <div className="panel-content" style={{ padding: '10px 16px 14px' }}>
            <FootballField rows={rows} price={price} />
            <p className="text-muted" style={{ fontSize: 11, marginTop: 12, lineHeight: 1.55 }}>
              Altın çubuk her yöntemin düşük–yüksek aralığını, beyaz çentik orta değeri, kesikli çizgi güncel fiyatı gösterir.
              Kurum satırındaki noktalar tek tek kurum hedefleridir; gri çubuk değerleme değil, son 52 haftanın fiyat bandıdır.
            </p>
          </div>
        </div>

        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">Yöntem tablosu</div>
          <div className="panel-content" style={{ padding: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Yöntem</th>
                  <th>Düşük</th>
                  <th>Orta</th>
                  <th>Yüksek</th>
                  <th>Ortaya göre potansiyel</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const up = upsidePct(r.mid, price);
                  return (
                    <tr key={r.key}>
                      <td>
                        <div style={{ color: 'var(--text-primary)' }}>{r.label}</div>
                        <div className="text-muted" style={{ fontSize: 10.5 }}>{r.detail}</div>
                      </td>
                      <td>{fmtPrice(r.low)}</td>
                      <td style={{ color: 'var(--text-primary)' }}>{fmtPrice(r.mid)}</td>
                      <td>{fmtPrice(r.high)}</td>
                      <td className={up == null ? '' : up >= 0 ? 'text-up' : 'text-down'}>{fmtPct(up)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">Değerleme skoru</div>
          <div className="panel-content">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
              <span className="num display-title" style={{ fontSize: 30, fontFamily: 'var(--font-mono)' }}>
                {score?.valuation_score != null ? score.valuation_score.toFixed(0) : '—'}
              </span>
              <span className="text-muted">/ 100 · yüksek = ucuz</span>
            </div>
            <ScoreRow
              label="Kendi geçmişine göre"
              hint="Güncel F/K, hissenin son 3 yıldaki F/K serisinin yüzde kaçlık diliminde. Düşük dilim = tarihine göre ucuz."
              value={score?.historical_percentile != null ? `%${score.historical_percentile.toFixed(0)} dilim` : '—'}
            />
            <ScoreRow
              label={`Sektöre göre F/K${score?.sector ? ` (${score.sector})` : ''}`}
              hint="Hissenin F/K'sının geniş sektör medyanına oranı. 1,0'ın altı sektöre göre ucuz demektir. Football field ise daha dar emsal grubunu kullanır."
              value={score?.sector_relative != null ? `${score.sector_relative.toFixed(2)}×` : '—'}
            />
            <ScoreRow label="Football field emsal grubu" value={valuation?.peer_group_name || '—'} />
            <ScoreRow label="Emsal sayısı" value={valuation?.peer_count ?? '—'} />
          </div>
        </div>

        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">Kurum görüşleri</div>
          <div className="panel-content">
            {totalRatings > 0 ? (
              <>
                <div style={{ display: 'flex', gap: 2, height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                  {ratings.AL > 0 && <div style={{ flex: ratings.AL, background: 'var(--positive)' }} />}
                  {ratings.TUT > 0 && <div style={{ flex: ratings.TUT, background: 'var(--warning)' }} />}
                  {ratings.SAT > 0 && <div style={{ flex: ratings.SAT, background: 'var(--negative)' }} />}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span className="chip chip-up">{ratings.AL} AL</span>
                  <span className="chip chip-warn">{ratings.TUT} TUT</span>
                  <span className="chip chip-down">{ratings.SAT} SAT</span>
                </div>
                <ScoreRow label="Ortalama hedef" value={fmtPrice(consensus.avgTarget)} />
                <ScoreRow label="Ortalamaya göre potansiyel" value={fmtPct(consensus.avgPotential)} />
              </>
            ) : (
              <span className="text-muted">Bu hisse için kurum raporu bulunmuyor.</span>
            )}
          </div>
        </div>

        <p className="text-muted" style={{ fontSize: 10.5, lineHeight: 1.55 }}>
          Emsal değerleri fiyat tahmini değildir: emsal grubunun çarpanlarını bu hissenin kâr ve defter değerine uygular.
          Defter değeri, PD/DD oranı ile güncel fiyattan türetilir.
          {valuation?.fundamentals_updated && <> Temel veriler: {String(valuation.fundamentals_updated).slice(0, 10)}.</>}
        </p>
      </div>
    </div>
  );
}
