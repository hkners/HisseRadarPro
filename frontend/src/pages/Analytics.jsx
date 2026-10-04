import React, { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import PageContainer from '../components/common/PageContainer';
import { PillTabs, StatTile, TickerCell, Button, EmptyState, InfoTip } from '../components/ui';
import { fmtNum, fmtPct } from '../utils/format';
import { trSector } from '../utils/sectors';

const API = import.meta.env.VITE_API_URL || '/api';

const TABS = [
  { id: 'overview', label: 'Genel bakış' },
  { id: 'positions', label: 'Pozisyon riski' },
  { id: 'concentration', label: 'Yoğunlaşma' },
  { id: 'correlation', label: 'Korelasyon' },
  { id: 'scenarios', label: 'Senaryolar' },
  { id: 'optimization', label: 'Optimizasyon' },
];

// Analytics returns fractions (0.241); display as percent.
const pct = (v, digits = 1, sign = false) => (v == null ? '—' : fmtPct(v * 100, digits, { sign }));
const tl = (v) => (v == null ? '—' : `${fmtNum(v, 0)} TL`);
const toneOf = (v) => (v == null ? undefined : v >= 0 ? 'up' : 'down');

function Bar({ value, max }) {
  return (
    <div className="bar-track">
      <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} />
    </div>
  );
}

function Overview({ d }) {
  const o = d.overview;
  if (!o) return <p className="text-muted">Risk hesabı için yeterli fiyat geçmişi yok.</p>;
  const topRisk = [...d.positions].filter(p => p.risk_contribution != null).sort((a, b) => b.risk_contribution - a.risk_contribution)[0];
  const topSector = d.concentration.sectors[0];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="stat-grid">
        <StatTile label="Portföy değeri" value={tl(d.total_value)} sub={`${d.concentration.count} pozisyon`} />
        <StatTile
          label="Yıllık volatilite"
          tip="Günlük getirilerin standart sapması, yıllıklandırılmış. Bugünkü ağırlıklarla son bir yıl."
          value={pct(o.volatility)}
          sub={`XU100: ${pct(o.benchmark_volatility)}`}
        />
        <StatTile label="Beta" tip="Portföyün XU100'ün günlük hareketlerine duyarlılığı. 1,0 = endeksle aynı." value={fmtNum(o.beta, 2)} sub={o.beta > 1 ? 'Endeksten daha oynak' : 'Endeksten daha az oynak'} />
        <StatTile
          label="1 günlük VaR (%95)"
          tip="Tarihsel simülasyon: son bir yılın en kötü %5'lik günlerinin eşiği. 20 günden 1'inde bundan fazla kayıp beklenir."
          value={tl(o.var95_tl)}
          sub={`Portföyün ${pct(o.var95_pct)}'i · CVaR ${pct(o.cvar95_pct)}`}
          tone="down"
        />
        <StatTile label="Maksimum düşüş" tip="Bugünkü ağırlıklarla son bir yılda zirveden en derin düşüş." value={pct(o.max_drawdown)} tone="down" />
        <StatTile
          label="1 yıllık getiri"
          tip="Bugünkü ağırlıklar bir yıl önce kurulsaydı elde edilecek getiri. Geçmiş performanstır."
          value={pct(o.return_1y, 1, true)}
          sub={`XU100: ${pct(o.benchmark_return_1y, 1, true)}`}
          tone={toneOf(o.return_1y)}
        />
      </div>
      <div className="card">
        <div className="card-eyebrow">Özet</div>
        <div className="card-body" style={{ lineHeight: 1.7 }}>
          Portföy, endeksin {o.beta > 1 ? 'üzerinde' : 'altında'} bir oynaklık taşıyor (beta {fmtNum(o.beta, 2)}).
          {topRisk && <> Riskin en büyük kaynağı <b className="text-gold">{topRisk.ticker}</b>: ağırlığı {pct(topRisk.weight)}, toplam riskteki payı {pct(topRisk.risk_contribution)}.</>}
          {topSector && <> En büyük sektör <b className="text-gold">{trSector(topSector.sector)}</b> ({pct(topSector.weight)}).</>}
          {' '}Hisseler arası ortalama korelasyon {fmtNum(d.correlation?.average, 2)}.
        </div>
      </div>
    </div>
  );
}

function Positions({ d }) {
  const maxW = Math.max(...d.positions.map(p => p.weight || 0), 0.01);
  const maxR = Math.max(...d.positions.map(p => p.risk_contribution || 0), 0.01);
  const scale = Math.max(maxW, maxR);
  return (
    <div className="panel" style={{ marginBottom: 0 }}>
      <div className="panel-content" style={{ padding: 0 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Hisse</th>
              <th style={{ textAlign: 'left' }}>Sektör</th>
              <th>Değer</th>
              <th>Volatilite</th>
              <th>Beta</th>
              <th style={{ width: '22%' }}>Ağırlık</th>
              <th style={{ width: '22%' }}>Risk payı <InfoTip text="Pozisyonun portföy varyansına katkısı. Ağırlığından büyükse portföye ağırlığından fazla risk taşıyor demektir." size={10} /></th>
            </tr>
          </thead>
          <tbody>
            {d.positions.map(p => {
              const heavy = p.risk_contribution != null && p.risk_contribution > p.weight * 1.15;
              return (
                <tr key={p.ticker}>
                  <td><TickerCell ticker={p.ticker} /></td>
                  <td style={{ textAlign: 'left', fontFamily: 'var(--font-body)', color: 'var(--text-tertiary)' }}>{trSector(p.sector)}</td>
                  <td>{tl(p.value)}</td>
                  <td>{pct(p.volatility)}</td>
                  <td>{fmtNum(p.beta, 2)}</td>
                  <td><div style={{ display: 'grid', gridTemplateColumns: '1fr 52px', gap: 8, alignItems: 'center' }}><Bar value={p.weight} max={scale} />{pct(p.weight)}</div></td>
                  <td>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px', gap: 8, alignItems: 'center' }}>
                      <Bar value={p.risk_contribution || 0} max={scale} />
                      <span className={heavy ? 'text-warning' : ''}>{pct(p.risk_contribution)}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Concentration({ d }) {
  const c = d.concentration;
  const max = Math.max(...c.sectors.map(s => s.weight), 0.01);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 12, alignItems: 'start' }}>
      <div className="panel" style={{ marginBottom: 0 }}>
        <div className="panel-header">Sektör ağırlıkları</div>
        <div className="panel-content">
          {c.sectors.map(s => (
            <div key={s.sector} className="bar-row">
              <span style={{ color: 'var(--text-primary)', fontSize: 12.5 }}>{trSector(s.sector)}</span>
              <Bar value={s.weight} max={max} />
              <span className="num" style={{ textAlign: 'right' }}>{pct(s.weight)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="stat-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <StatTile label="En büyük pozisyon" value={pct(c.top1)} />
        <StatTile label="İlk 3 pozisyon" value={pct(c.top3)} />
        <StatTile label="HHI" tip="Herfindahl endeksi: ağırlıkların karelerinin toplamı. 0,10 altı dağınık, 0,25 üstü yoğun kabul edilir." value={fmtNum(c.hhi, 3)} />
        <StatTile label="Etkin pozisyon sayısı" tip="1 / HHI. Portföyün kaç eşit ağırlıklı hisseye denk geldiği." value={fmtNum(c.effective_n, 1)} sub={`Gerçek: ${c.count}`} />
      </div>
    </div>
  );
}

function Correlation({ d }) {
  const corr = d.correlation;
  if (!corr || corr.tickers.length < 2) return <p className="text-muted">Korelasyon için en az iki pozisyon gerekir.</p>;
  const n = corr.tickers.length;
  // Sequential gold for positive correlation, neutral grey for negative; the number is always printed.
  const cellBg = (v, i, j) => {
    if (i === j) return 'var(--bg-elevated)';
    if (v >= 0) return `color-mix(in srgb, var(--gold) ${Math.round(v * 55)}%, var(--bg-raised))`;
    return `color-mix(in srgb, var(--text-tertiary) ${Math.round(-v * 60)}%, var(--bg-raised))`;
  };
  return (
    <div className="panel" style={{ marginBottom: 0 }}>
      <div className="panel-header">Günlük getiri korelasyonu · son bir yıl</div>
      <div className="panel-content" style={{ overflowX: 'auto' }}>
        <div className="corr-grid" style={{ gridTemplateColumns: `64px repeat(${n}, minmax(48px, 1fr))`, minWidth: 64 + n * 50 }}>
          <span />
          {corr.tickers.map(t => <span key={t} className="corr-head">{t}</span>)}
          {corr.matrix.map((row, i) => (
            <React.Fragment key={corr.tickers[i]}>
              <span className="corr-head" style={{ justifyItems: 'start' }}>{corr.tickers[i]}</span>
              {row.map((v, j) => (
                <span key={j} className="corr-cell" style={{ background: cellBg(v, i, j) }} title={`${corr.tickers[i]} / ${corr.tickers[j]}: ${fmtNum(v, 2)}`}>
                  {i === j ? '—' : fmtNum(v, 2)}
                </span>
              ))}
            </React.Fragment>
          ))}
        </div>
        <p className="text-muted" style={{ fontSize: 11, marginTop: 10 }}>
          1'e yakın değerler iki hissenin birlikte hareket ettiğini gösterir; yüksek korelasyonlu çiftler çeşitlendirme sağlamaz. Ortalama: {fmtNum(corr.average, 2)}.
        </p>
      </div>
    </div>
  );
}

function Scenarios({ d }) {
  const list = d.scenarios || [];
  const max = Math.max(...list.map(s => Math.abs(s.pnl_pct || 0)), 0.01);
  return (
    <div className="panel" style={{ marginBottom: 0 }}>
      <div className="panel-content" style={{ padding: 0 }}>
        <table className="data-table">
          <thead>
            <tr><th>Senaryo</th><th style={{ width: '34%' }}>Etki</th><th>Portföy</th><th>TL</th></tr>
          </thead>
          <tbody>
            {list.map(s => {
              const v = s.pnl_pct || 0;
              const width = (Math.abs(v) / max) * 50;
              return (
                <tr key={s.id}>
                  <td>
                    <div style={{ color: 'var(--text-primary)' }}>{s.sector ? `${trSector(s.sector)} −%15` : s.name}</div>
                    <div className="text-muted" style={{ fontSize: 11 }}>{s.detail}</div>
                  </td>
                  <td>
                    <div className="diverge-track">
                      <span className="zero" />
                      <span className="fill" style={{ background: v >= 0 ? 'var(--positive)' : 'var(--negative)', left: v >= 0 ? '50%' : `${50 - width}%`, width: `${width}%` }} />
                    </div>
                  </td>
                  <td className={v >= 0 ? 'text-up' : 'text-down'}>{pct(v, 1, true)}</td>
                  <td className={v >= 0 ? 'text-up' : 'text-down'}>{tl(s.pnl_tl)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-muted" style={{ fontSize: 11, padding: '8px 12px' }}>
        Endeks senaryoları her hissenin son bir yıllık betasını kullanır; gerçek tepkiler farklı olabilir. Geçmiş senaryolar bugünkü ağırlıklara uygulanmıştır.
      </p>
    </div>
  );
}

function Optimization({ d }) {
  const o = d.optimization;
  if (!o) return <p className="text-muted">Optimizasyon için yeterli veri yok.</p>;
  const max = Math.max(...o.weights.flatMap(w => [w.current, w.suggested]), 0.01);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="stat-grid">
        <StatTile label="Mevcut volatilite" value={pct(o.current_volatility)} />
        <StatTile label="Önerilen ağırlıklarla" value={pct(o.suggested_volatility)} tone={o.suggested_volatility < o.current_volatility ? 'up' : undefined} sub="Ters volatilite ağırlıklandırma" />
      </div>
      <div className="panel" style={{ marginBottom: 0 }}>
        <div className="panel-header">Mevcut ve önerilen ağırlık</div>
        <div className="panel-content">
          {o.weights.map(w => (
            <div key={w.ticker} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 56px 1fr 56px', gap: 10, alignItems: 'center', padding: '4px 0' }}>
              <span className="ticker-link">{w.ticker}</span>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${(w.current / max) * 100}%`, background: 'var(--border-strong)' }} /></div>
              <span className="num text-secondary" style={{ textAlign: 'right' }}>{pct(w.current)}</span>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${(w.suggested / max) * 100}%` }} /></div>
              <span className="num" style={{ textAlign: 'right', color: 'var(--gold)' }}>{pct(w.suggested)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11 }} className="text-muted">
            <span><span style={{ display: 'inline-block', width: 10, height: 6, background: 'var(--border-strong)', borderRadius: 2, marginRight: 5 }} />Mevcut</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 6, background: 'var(--gold)', borderRadius: 2, marginRight: 5 }} />Önerilen</span>
          </div>
        </div>
      </div>
      <p className="text-muted" style={{ fontSize: 11 }}>
        Ters volatilite yöntemi, oynaklığı yüksek hisselere daha az ağırlık vererek her pozisyonun riske katkısını eşitlemeye çalışır. Getiri beklentisini dikkate almaz; bir alım-satım önerisi değildir.
      </p>
    </div>
  );
}

export default function Analytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    fetch(`${API}/portfolio/analytics`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch(e => setError(e.message));
  }, []);

  const body = () => {
    if (error) return <EmptyState icon={ShieldAlert} title="Analiz yüklenemedi">{error}</EmptyState>;
    if (!data) return <div className="text-muted" style={{ padding: 16 }}>Risk analizi hesaplanıyor…</div>;
    if (data.empty) return <EmptyState icon={ShieldAlert} title="Analiz için pozisyon yok" actions={<Button variant="primary" to="/portfolio">Portföye hisse ekle</Button>} />;
    const views = { overview: Overview, positions: Positions, concentration: Concentration, correlation: Correlation, scenarios: Scenarios, optimization: Optimization };
    const View = views[tab];
    return <View d={data} />;
  };

  return (
    <PageContainer
      title="Risk & Analiz"
      badge={data?.is_demo ? 'Örnek portföy' : undefined}
      subtitle="Risk, yoğunlaşma, korelasyon ve senaryolar; bugünkü ağırlıklarla son bir yılın günlük verisinden."
      headerRight={data?.as_of && <span className="text-muted" style={{ fontSize: 11.5 }}>{data.observations} işlem günü · son veri {data.as_of}</span>}
      scrollable
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 16 }}>
        {data?.is_demo && (
          <div className="notice">
            <span>Portföyün boş olduğu için örnek bir portföy (10 BIST hissesi, 100.000 TL) gösteriliyor. Kendi pozisyonlarını eklediğinde tüm analiz onlara göre hesaplanır.</span>
            <Button size="sm" variant="primary" to="/portfolio">Pozisyon ekle</Button>
          </div>
        )}
        {data?.excluded?.length > 0 && (
          <div className="notice" style={{ borderColor: 'var(--border-default)', background: 'var(--bg-raised)' }}>
            <span>Yeterli fiyat geçmişi olmayan pozisyonlar risk hesabına katılmadı: {data.excluded.join(', ')}.</span>
          </div>
        )}
        <div><PillTabs tabs={TABS} value={tab} onChange={setTab} /></div>
        {body()}
      </div>
    </PageContainer>
  );
}
