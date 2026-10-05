import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import PageContainer from '../components/common/PageContainer';
import { StatTile, InfoTip, Chip } from '../components/ui';
import { useTaData, BuildingNotice, pts, API } from '../components/ta/common';
import { Button } from '../components/ui';
import { ModelStats, DecileChart, CurveChart, YearlyTable } from '../components/ta/ModelEvidence';
import { fmtNum } from '../utils/format';

function LiveRecord({ live }) {
  if (!live || !live.snapshots) {
    return <p className="text-muted" style={{ fontSize: 12.5 }}>Henüz kayıt yok. Karar motoru her gün skorları kaydeder; ilk değerlendirme 20 işlem günü sonra yapılır.</p>;
  }
  if (!live.evaluated) {
    return (
      <div className="stat-grid">
        <StatTile label="Kayıtlı gün" value={live.snapshots} sub={`İlk kayıt ${live.first_snapshot}`} />
        <StatTile label="İlk değerlendirme" value={live.sessions_until_first != null ? `${live.sessions_until_first} işlem günü sonra` : '—'} sub="Bir kaydın sonucu 20 işlem günü sonra belli olur" />
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)', gap: 12 }}>
      <div className="stat-grid" style={{ gridTemplateColumns: '1fr' }}>
        <StatTile label="Değerlendirilen gün" value={live.evaluated} sub={`${live.snapshots} kayıttan · ilk ${live.first_snapshot}`} />
        <StatTile label="En iyi - en kötü dilim farkı" value={pts(live.top_minus_bottom)} tone={live.top_minus_bottom > 0 ? 'up' : 'down'} />
        <StatTile label="Sıralama korelasyonu (IC)" value={fmtNum(live.ic_mean, 3)} />
      </div>
      <DecileChart deciles={live.deciles} />
    </div>
  );
}

const METRICS = [
  { id: 'SCORE', label: 'HisseRadar skoru (o tarihteki)', def: 90 },
  { id: 'RSI', label: 'RSI (14)', def: 30 },
  { id: 'SMA', label: "Fiyatın SMA20'ye uzaklığı (%)", def: 0 },
  { id: 'POTENTIAL', label: 'Kurum hedef potansiyeli (%)', def: 50 },
];

function PointInTime() {
  const [days, setDays] = useState(90);
  const [metric, setMetric] = useState('SCORE');
  const [condition, setCondition] = useState('GREATER');
  const [threshold, setThreshold] = useState(90);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = () => {
    setBusy(true);
    fetch(`${API}/ta/point-in-time?days=${days}&metric=${metric}&condition=${condition}&threshold=${threshold}`)
      .then(r => r.json()).then(setRes).catch(() => setRes(null)).finally(() => setBusy(false));
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="filter-field"><span className="eyebrow">Ne kadar önce</span>
          <select className="input" value={days} onChange={e => setDays(Number(e.target.value))}>
            {[30, 60, 90, 180, 365, 730].map(d => <option key={d} value={d}>{d} gün</option>)}
          </select>
        </label>
        <label className="filter-field"><span className="eyebrow">Ölçüt</span>
          <select className="input" value={metric} onChange={e => { setMetric(e.target.value); setThreshold(METRICS.find(m => m.id === e.target.value).def); }}>
            {METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        <label className="filter-field"><span className="eyebrow">Koşul</span>
          <select className="input" value={condition} onChange={e => setCondition(e.target.value)}>
            <option value="GREATER">büyükse</option><option value="LESS">küçükse</option>
          </select>
        </label>
        <label className="filter-field"><span className="eyebrow">Eşik</span>
          <input className="input" type="number" value={threshold} onChange={e => setThreshold(e.target.value)} style={{ width: 90 }} />
        </label>
        <Button variant="primary" onClick={run} disabled={busy}>{busy ? 'Hesaplanıyor…' : 'Test et'}</Button>
      </div>
      {res && (
        <div>
          <div className="stat-grid">
            <StatTile label="Seçilen hisse" value={res.total_trades} sub={res.start_date ? `${res.start_date} → ${res.end_date}` : ''} />
            <StatTile label="Ortalama getiri" value={`${res.avg_return_pct > 0 ? '+' : ''}${fmtNum(res.avg_return_pct, 1)}%`} sub={`XU100 ${fmtNum(res.benchmark_return_pct, 1)}% · likit hisseler ${fmtNum(res.universe_return_pct, 1)}%`} tone={res.avg_excess_pct >= 0 ? 'up' : 'down'} />
            <StatTile label="XU100'e göre" value={res.avg_excess_pct != null ? `${res.avg_excess_pct > 0 ? '+' : ''}${fmtNum(res.avg_excess_pct, 1)} puan` : '—'} tone={res.avg_excess_pct >= 0 ? 'up' : 'down'} />
            <StatTile label="XU100'ü geçen" value={`%${fmtNum(res.win_rate_pct, 0)}`} />
          </div>
          {res.note && <p className="text-muted" style={{ fontSize: 11, marginTop: 6 }}>{res.note}</p>}
          <p className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
            Bu test listeyi o günden bu yana hiç güncellemeden tutar. Skor 20 işlem günlük bir ufuk için tasarlandı ve zamanla eskir;
            uzun sürelerde listeyi her ay yenilemenin sonucu için yukarıdaki aylık dengelenen dilim eğrisine bakın.
          </p>
          {res.trades?.length > 0 && (
            <table className="data-table compact" style={{ marginTop: 8 }}>
              <thead><tr><th style={{ textAlign: 'left' }}>Hisse</th><th>O günkü değer</th><th>Alış</th><th>Bugün</th><th>Getiri</th><th>XU100'e göre</th></tr></thead>
              <tbody>
                {res.trades.slice(0, 40).map(t => (
                  <tr key={t.ticker}>
                    <td style={{ textAlign: 'left' }}><Link to={`/hisse/${t.ticker}`} className="ticker-link">{t.ticker}</Link></td>
                    <td>{fmtNum(t.hist_alpha, 1)}</td><td>{fmtNum(t.buy_price, 2)}</td><td>{fmtNum(t.sell_price, 2)}</td>
                    <td className={t.return_pct >= 0 ? 'text-up' : 'text-down'}>{fmtNum(t.return_pct, 1)}%</td>
                    <td className={t.excess_vs_xu100_pct >= 0 ? 'text-up' : 'text-down'}>{fmtNum(t.excess_vs_xu100_pct, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function AnalystTest({ a }) {
  if (!a?.available) return <p className="text-muted" style={{ fontSize: 12.5 }}>{a?.reason || 'Test için yeterli rapor geçmişi yok.'}</p>;
  return (
    <div>
      <p className="text-secondary" style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 10 }}>
        {a.period} arasında {a.dates} tarih ve {a.observations.toLocaleString('tr-TR')} hisse-gün gözlemi: her tarihte kurum verisinden türetilen ölçütlerin,
        sonraki 20 işlem günündeki fazla getiriyle ilişkisi. "Model ötesinde" sütunu, teknik modelin açıkladığı kısım çıkarıldıktan sonra kalan ilişkidir.
        Bir ölçüt orada |t| ≥ 2'yi geçerse skora eklenmeye aday olarak işaretlenir.
      </p>
      <table className="data-table compact">
        <thead><tr><th style={{ textAlign: 'left' }}>Ölçüt</th><th>Tek başına IC</th><th>t</th><th>Model ötesinde IC</th><th>t</th><th>Durum</th></tr></thead>
        <tbody>
          {a.features.map(f => (
            <tr key={f.key}>
              <td style={{ textAlign: 'left' }}>{f.label}</td>
              <td>{fmtNum(f.raw.ic, 3)}</td><td>{fmtNum(f.raw.t, 1)}</td>
              <td>{fmtNum(f.beyond_model.ic, 3)}</td><td>{fmtNum(f.beyond_model.t, 1)}</td>
              <td>{f.candidate ? <Chip tone="up">Skora aday</Chip> : <Chip>Bilgi katmıyor</Chip>}{f.beyond_model.dates < 12 && <div className="text-muted" style={{ fontSize: 10 }}>{f.beyond_model.dates} tarih: az veri</div>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {a.upside_quintiles?.length > 0 && (
        <p className="text-muted" style={{ fontSize: 11.5, marginTop: 8 }}>
          Konsensüs potansiyeline göre beşte birlik dilimlerin sonraki 20 günlük fazla getirisi (düşükten yükseğe):{' '}
          {a.upside_quintiles.map(q => `${q.quintile}. ${q.mean_pct > 0 ? '+' : ''}${q.mean_pct.toFixed(2).replace('.', ',')}`).join(' · ')} puan.
        </p>
      )}
    </div>
  );
}

export default function Scorecard() {
  const { data, error, building } = useTaData('/ta/scorecard');
  return (
    <PageContainer
      title="Skor Karnesi"
      subtitle="HisseRadar skoru gerçekten işe yarıyor mu: örneklem dışı geçmiş, canlı kayıt ve skora neyin girip neyin girmediği."
      badge={data ? `Veri ${data.as_of}` : undefined}
      scrollable
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 16 }}>
        {building && <BuildingNotice building={building} />}
        {error && <div className="notice">Karne yüklenemedi: {error}</div>}
        {data && (
          <>
            <div className="card">
              <div className="card-eyebrow">Skor nasıl oluşuyor</div>
              <p className="card-body" style={{ fontSize: 13, lineHeight: 1.65 }}>
                Skor, BIST fiyat ve hacim geçmişinden öğrenen teknik modelin likit hisseler arasındaki yüzdelik sırasıdır.
                Skora yalnızca geçmişte işe yaradığı model hiç görmeden test edilerek gösterilen bilgi girer. Kurum hedefleri, değerleme ve model portföyler
                hisse sayfalarında bağlam olarak gösterilir ama skoru değiştirmez; kurum verisi her model güncellemesinde aşağıdaki testten yeniden geçer.
                Ayrıntılı yöntem ve sinyal karneleri <Link to="/technical-screener?sekme=model" className="text-gold">Teknik Radar</Link> sayfasında.
              </p>
            </div>

            <div className="panel" style={{ marginBottom: 0 }}>
              <div className="panel-header">1. Örneklem dışı geçmiş ({data.model.oos_start?.slice(0, 4)} – {data.model.oos_end?.slice(0, 4)}) <InfoTip text="Her yıl, o yılı hiç görmemiş (yıl başından 90 gün öncesine kadar eğitilmiş) bir modelle skorlandı." size={10} /></div>
              <div className="panel-content" style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <ModelStats m={data.model} />
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }}>
                  <div><div className="eyebrow" style={{ marginBottom: 6 }}>Skor dilimine göre sonraki 20 gün</div><DecileChart deciles={data.model.deciles} /></div>
                  <div><div className="eyebrow" style={{ marginBottom: 6 }}>Aylık dengelenen dilimler</div><CurveChart curve={data.model.curve} height={220} /></div>
                </div>
                <YearlyTable yearly={data.model.yearly} />
              </div>
            </div>

            <div className="panel" style={{ marginBottom: 0 }}>
              <div className="panel-header">2. Canlı kayıt <InfoTip text="Karar motorunun her gün kaydettiği skorlar; 20 işlem günü dolan kayıtlar gerçek sonuçla karşılaştırılır. Eski skor modelinin kayıtları dahil edilmez." size={10} /></div>
              <div className="panel-content" style={{ flex: 'none' }}><LiveRecord live={data.live} /></div>
            </div>

            <div className="panel" style={{ marginBottom: 0 }}>
              <div className="panel-header">3. Geçmiş tarih testi <InfoTip text="Geçmişteki bir günün kapanışında kuralı sağlayan likit hisseler bugüne kadar tutulsaydı ne olurdu. Fiyatlar bölünmelere göre düzeltilmiş; skor o tarihte bilinen değerdir (ileriye bakma yok)." size={10} /></div>
              <div className="panel-content" style={{ flex: 'none' }}><PointInTime /></div>
            </div>

            <div className="panel" style={{ marginBottom: 0 }}>
              <div className="panel-header">4. Kurum verisi skora bilgi katıyor mu</div>
              <div className="panel-content" style={{ flex: 'none' }}><AnalystTest a={data.analyst} /></div>
            </div>
            <p className="text-muted" style={{ fontSize: 11 }}>Getiriler nominal TL'dir ve işlem maliyeti (%0,20) dışında vergi ve kayma içermez. Geçmiş performans geleceğin garantisi değildir; yatırım tavsiyesi değildir.</p>
          </>
        )}
      </div>
    </PageContainer>
  );
}
