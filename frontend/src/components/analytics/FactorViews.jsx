import React from 'react';
import { Link } from 'react-router-dom';
import { StatTile, InfoTip } from '../ui';
import { fmtNum, fmtPct, signClass } from '../../utils/format';
import { trSector } from '../../utils/sectors';

const pct = (v, d = 1, sign = false) => (v == null ? '—' : fmtPct(v * 100, d, { sign }));

function Loading() {
  return <div className="text-muted" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="spinner" /> Faktörler hesaplanıyor… İlk açılışta tüm BIST fiyat geçmişi yüklendiği için 20 saniye kadar sürebilir.</div>;
}

export function FactorsView({ f }) {
  if (!f) return <Loading />;
  if (f.empty) return <p className="text-muted">Analiz için pozisyon yok.</p>;
  const maxBeta = Math.max(...f.exposures.map(e => Math.abs(e.beta)), 0.2);
  const explained = f.exposures.reduce((a, e) => a + e.contribution, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="stat-grid">
        <StatTile label="Açıklanan risk (R²)" tip="Portföyün günlük getirisindeki değişimin ne kadarının dört faktörle açıklandığı." value={pct(f.r2, 0)} sub={`${f.observations} işlem günü · ${f.period}`} />
        <StatTile label="Faktör riski" value={pct(f.risk_split.factor, 0)} sub="Piyasa ve stil faktörlerinden gelen" />
        <StatTile label="Şirkete özgü risk" value={pct(f.risk_split.specific, 0)} sub="Faktörlerle açıklanamayan kısım" />
        <StatTile label="1 yıllık getiri" value={pct(f.total_return, 1, true)} tone={f.total_return >= 0 ? 'up' : 'down'} sub={`Faktörler ${pct(explained, 1, true)} · kalan ${pct(f.alpha_contribution, 1, true)}`} />
      </div>
      <div className="panel" style={{ marginBottom: 0 }}>
        <div className="panel-header">Faktör maruziyeti ve getiri katkısı</div>
        <div className="panel-content" style={{ padding: 0, flex: 'none' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Faktör</th>
                <th style={{ width: '30%' }}>Maruziyet (beta) <InfoTip text="Faktör 1 birim hareket ettiğinde portföyün ne kadar hareket ettiği. 0 = bağımsız, negatif = ters yönde." size={10} /></th>
                <th>Faktörün getirisi</th>
                <th>Portföye katkısı <InfoTip text="Maruziyet × faktör getirisi. Bu yıl portföy getirisinin ne kadarının o faktörden geldiği." size={10} /></th>
              </tr>
            </thead>
            <tbody>
              {f.exposures.map(e => {
                const width = (Math.abs(e.beta) / maxBeta) * 50;
                return (
                  <tr key={e.factor}>
                    <td style={{ fontFamily: 'var(--font-body)', color: 'var(--text-primary)' }}>{e.label}</td>
                    <td>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px', gap: 8, alignItems: 'center' }}>
                        <div className="diverge-track">
                          <span className="zero" />
                          <span className="fill" style={{ background: 'var(--gold)', left: e.beta >= 0 ? '50%' : `${50 - width}%`, width: `${width}%` }} />
                        </div>
                        <span>{fmtNum(e.beta, 2)}</span>
                      </div>
                    </td>
                    <td className={signClass(e.factor_return)}>{pct(e.factor_return, 1, true)}</td>
                    <td className={signClass(e.contribution)}>{pct(e.contribution, 1, true)}</td>
                  </tr>
                );
              })}
              <tr>
                <td style={{ fontFamily: 'var(--font-body)' }}>Faktörlerle açıklanamayan (seçim etkisi)</td>
                <td /><td />
                <td className={signClass(f.alpha_contribution)}>{pct(f.alpha_contribution, 1, true)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <ul className="text-muted" style={{ fontSize: 11, paddingLeft: 16, lineHeight: 1.6 }}>
        <li>Büyüklük: küçük şirketler eksi büyük şirketler. Momentum: son 12 ayın (son ay hariç) kazananları eksi kaybedenleri. Düşük oynaklık: sakin hisseler eksi oynak hisseler. Gruplar her ay yeniden kurulur.</li>
        {f.notes.map((n, i) => <li key={i}>{n}</li>)}
      </ul>
    </div>
  );
}

export function HedgesView({ f }) {
  if (!f) return <Loading />;
  if (f.empty) return <p className="text-muted">Analiz için pozisyon yok.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {f.hedges.map(h => (
        <div key={h.id} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div className="card-eyebrow">{h.title}</div>
              <div className="card-body" style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>{h.action}{h.id === 'diversify' ? ':' : '.'}</div>
              {h.notional_tl != null && <div className="text-secondary" style={{ fontSize: 12.5, marginTop: 4 }}>Gereken açık pozisyon: yaklaşık <b className="text-gold">{fmtNum(h.notional_tl, 0)} TL</b></div>}
            </div>
            {h.vol_after != null && (
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ textAlign: 'right' }}>
                  <div className="eyebrow">Volatilite</div>
                  <div className="num" style={{ fontSize: 16, color: 'var(--text-primary)' }}>{pct(h.vol_before)} → <span className="text-up">{pct(h.vol_after)}</span></div>
                </div>
                {h.beta_before != null && (
                  <div style={{ textAlign: 'right' }}>
                    <div className="eyebrow">Beta</div>
                    <div className="num" style={{ fontSize: 16, color: 'var(--text-primary)' }}>{fmtNum(h.beta_before, 2)} → {fmtNum(h.beta_after, 2)}</div>
                  </div>
                )}
              </div>
            )}
          </div>
          {h.candidates && (
            <table className="data-table compact" style={{ marginTop: 10 }}>
              <thead><tr><th>Hisse</th><th style={{ textAlign: 'left' }}>Sektör</th><th>Portföyle korelasyon</th><th>Beta</th><th>Volatilite</th><th>%10 eklenirse portföy volatilitesi</th></tr></thead>
              <tbody>
                {h.candidates.map(c => (
                  <tr key={c.ticker}>
                    <td><Link to={`/hisse/${c.ticker}`} className="ticker-link">{c.ticker}</Link></td>
                    <td style={{ textAlign: 'left', fontFamily: 'var(--font-body)', color: 'var(--text-tertiary)' }}>{trSector(c.sector)}</td>
                    <td>{fmtNum(c.correlation, 2)}</td>
                    <td>{fmtNum(c.beta, 2)}</td>
                    <td>{pct(c.volatility)}</td>
                    <td className={c.vol_with_10pct < h.vol_before ? 'text-up' : ''}>{pct(c.vol_with_10pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-muted" style={{ fontSize: 11, marginTop: 8 }}>{h.note}</p>
        </div>
      ))}
      <p className="text-muted" style={{ fontSize: 11 }}>Bu öneriler risk etkisini göstermek içindir; alım-satım tavsiyesi değildir. Hesaplar son bir yılın günlük verisine dayanır.</p>
    </div>
  );
}
