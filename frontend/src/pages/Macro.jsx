import React, { useEffect, useState } from 'react';
import { Globe, RefreshCw } from 'lucide-react';
import PageContainer from '../components/common/PageContainer';
import { Chip, TickerCell, EmptyState, Button } from '../components/ui';
import { fmtNum, fmtPct, signClass } from '../utils/format';
import { trSector } from '../utils/sectors';

const API = import.meta.env.VITE_API_URL || '/api';

const REGIME_TONE = { BULL: 'up', BEAR: 'down', NEUTRAL: 'warn' };
const sentenceCase = (s) => (s ? s.charAt(0) + s.slice(1).toLocaleLowerCase('tr') : '');

/** Each indicator: value text, a state chip (tone + label) and why it matters. */
function buildIndicators(d) {
  const i = d.index || {};
  const b = d.breadth;
  const s = d.sentiment;
  const rows = [
    {
      name: 'XU100 · 200 günlük ortalama',
      value: fmtPct(i.ma200_dist),
      state: i.ma200_dist > 0 ? ['up', 'Üzerinde'] : ['down', 'Altında'],
      why: 'Uzun vadeli trendin yönü. Altında kalması satış baskısının sürdüğünü gösterir.',
    },
    {
      name: 'XU100 · 50 günlük ortalama',
      value: fmtPct(i.ma50_dist),
      state: i.ma50_dist > 0 ? ['up', 'Üzerinde'] : ['down', 'Altında'],
      why: 'Orta vadeli momentum. 200 günlükle birlikte okunur.',
    },
    {
      name: 'XU100 getirisi · 1A / 3A / 1Y',
      value: `${fmtPct(i.r1m)} / ${fmtPct(i.r3m)} / ${fmtPct(i.r1y)}`,
      state: i.r1m >= 0 ? ['up', 'Pozitif ay'] : ['down', 'Negatif ay'],
      why: 'Kısa ve uzun vadeli performansın aynı yönde olup olmadığı.',
    },
    {
      name: 'XU100 · 30 günlük volatilite',
      value: fmtPct(i.vol30, 1, { sign: false }),
      state: i.vol30 > 30 ? ['down', 'Yüksek'] : i.vol30 < 18 ? ['up', 'Sakin'] : ['warn', 'Normal'],
      why: 'Yıllıklandırılmış oynaklık. Yükseldikçe pozisyon büyüklükleri küçültülür.',
    },
    {
      name: 'Yükselen / düşen hisse',
      value: `${b.up} / ${b.down}`,
      state: b.up > b.down * 1.2 ? ['up', 'Geniş katılım'] : b.down > b.up * 1.2 ? ['down', 'Geniş satış'] : ['warn', 'Dengeli'],
      why: 'Günlük hareketin tabana yayılıp yayılmadığı.',
    },
    {
      name: '200 günlük ortalamanın üzerindeki hisseler',
      value: fmtPct(b.above_sma200_pct, 1, { sign: false }),
      state: b.above_sma200_pct > 60 ? ['up', 'Güçlü'] : b.above_sma200_pct < 30 ? ['down', 'Zayıf'] : ['warn', 'Orta'],
      why: 'Piyasa genişliğinin en yaygın ölçüsü. %30 altı, düşüşün geneli kapsadığını gösterir.',
    },
    {
      name: 'Zirveye yakın / %30+ düşüşte',
      value: `${b.near_high_count} / ${b.deep_drawdown_count}`,
      state: b.near_high_count > b.deep_drawdown_count ? ['up', 'Lider hisseler var'] : ['down', 'Derin düzeltme'],
      why: '52 haftalık zirvesinin %5 yakınındaki ve %30+ altındaki hisse sayıları.',
    },
    {
      name: 'Aşırı satım (RSI ≤ 30)',
      value: fmtPct(b.oversold_pct, 1, { sign: false }),
      state: b.oversold_pct > 40 ? ['warn', 'Yaygın'] : b.oversold_pct < 10 ? ['up', 'Az'] : ['warn', 'Orta'],
      why: `Medyan RSI ${fmtNum(b.median_rsi, 1)}. Yaygın aşırı satım tepki ihtimalini artırır ama trendi teyit etmez.`,
    },
    {
      name: 'Kurum medyan hedef potansiyeli',
      value: fmtPct(s.median_upside),
      state: ['warn', `${s.covered} hisse`],
      why: `Son 30 günde ${s.fresh_reports_30d} hisse için yeni rapor geldi. Yüksek potansiyel, düşen fiyatlarla hedeflerin henüz güncellenmediğini de gösterebilir.`,
    },
  ];
  return rows;
}

function SectorMoves({ sectors }) {
  const max = Math.max(...sectors.map(s => Math.abs(s.today || 0)), 0.5);
  return (
    <div className="panel" style={{ marginBottom: 0 }}>
      <div className="panel-header">Bugün ne hareket etti · sektörler</div>
      <div className="panel-content">
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 190px) 1fr 64px 64px', gap: '6px 10px', alignItems: 'center' }}>
          <span className="eyebrow">Sektör</span><span /><span className="eyebrow" style={{ textAlign: 'right' }}>Bugün</span><span className="eyebrow" style={{ textAlign: 'right' }}>1 ay</span>
          {sectors.map(s => {
            const v = s.today || 0;
            const w = (Math.abs(v) / max) * 50;
            return (
              <React.Fragment key={s.sector}>
                <span style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>{trSector(s.sector)}</span>
                <div className="diverge-track">
                  <span className="zero" />
                  <span className="fill" style={{ background: v >= 0 ? 'var(--positive)' : 'var(--negative)', left: v >= 0 ? '50%' : `${50 - w}%`, width: `${w}%` }} />
                </div>
                <span className={`num ${signClass(s.today)}`} style={{ textAlign: 'right', fontSize: 12 }}>{fmtPct(s.today, 2)}</span>
                <span className={`num ${signClass(s.r1m)}`} style={{ textAlign: 'right', fontSize: 12 }}>{fmtPct(s.r1m)}</span>
              </React.Fragment>
            );
          })}
        </div>
        <p className="text-muted" style={{ fontSize: 10.5, marginTop: 8 }}>Piyasa değeri ağırlıklı değişim.</p>
      </div>
    </div>
  );
}

function MoverList({ title, items }) {
  return (
    <div className="panel" style={{ marginBottom: 0 }}>
      <div className="panel-header">{title}</div>
      <div className="panel-content" style={{ padding: 0 }}>
        <table className="data-table">
          <tbody>
            {items.map(m => (
              <tr key={m.ticker}>
                <td style={{ maxWidth: 220 }}><TickerCell ticker={m.ticker} name={m.name} /></td>
                <td>{fmtNum(m.price)}</td>
                <td className={signClass(m.change_pct)}>{fmtPct(m.change_pct, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Macro() {
  const [data, setData] = useState(null);
  const [brief, setBrief] = useState(null);
  const [error, setError] = useState(null);
  const [briefLoading, setBriefLoading] = useState(false);

  const loadBrief = (refresh = false) => {
    setBriefLoading(true);
    fetch(`${API}/macro/brief${refresh ? '?refresh=true' : ''}`)
      .then(r => r.json()).then(setBrief).catch(() => setBrief(null))
      .finally(() => setBriefLoading(false));
  };

  useEffect(() => {
    fetch(`${API}/macro`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch(e => setError(e.message));
    loadBrief();
  }, []);

  if (error) return <EmptyState icon={Globe} title="Makro verisi alınamadı">{error}</EmptyState>;

  return (
    <PageContainer
      title="Makro"
      subtitle="Günün piyasa rejimi, önemli göstergeler ve kısa bir brif. Tüm sayılar aynı anlık görüntüden hesaplanır."
      headerRight={data && <span className="text-muted" style={{ fontSize: 11.5 }}>Endeks verisi {data.index?.date} · anlık görüntü {data.as_of?.replace('T', ' ')}</span>}
      scrollable
    >
      {!data ? (
        <div className="text-muted" style={{ padding: 16 }}>Göstergeler hesaplanıyor…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 16 }}>
          <div className="card" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'center' }}>
            <div>
              <div className="card-eyebrow">Günün rejimi</div>
              <div className="display-title" style={{ fontSize: 24, marginBottom: 4 }}>{sentenceCase(data.regime.title)}</div>
              <div className="card-body">{data.regime.advice}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <Chip tone={REGIME_TONE[data.regime.status] || 'gold'}>{data.regime.status}</Chip>
              <span className="text-muted" style={{ fontSize: 11 }}>Pozisyon çarpanı {fmtNum(data.regime.exposure_multiplier, 2)}×</span>
            </div>
          </div>

          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="panel-content" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr><th>Gösterge</th><th>Şimdi</th><th style={{ textAlign: 'left' }}>Durum</th><th style={{ textAlign: 'left' }}>Neden önemli</th></tr>
                </thead>
                <tbody>
                  {buildIndicators(data).map(r => (
                    <tr key={r.name}>
                      <td style={{ color: 'var(--text-primary)' }}>{r.name}</td>
                      <td style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{r.value}</td>
                      <td style={{ textAlign: 'left' }}><Chip tone={r.state[0]}>{r.state[1]}</Chip></td>
                      <td style={{ textAlign: 'left', fontFamily: 'var(--font-body)', color: 'var(--text-tertiary)', fontSize: 12 }}>{r.why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
            <SectorMoves sectors={data.sectors} />
            <MoverList title="En çok yükselen · en büyük 100" items={data.gainers} />
            <MoverList title="En çok düşen · en büyük 100" items={data.losers} />
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div className="card-eyebrow" style={{ margin: 0 }}>Brif</div>
              <Button size="sm" variant="ghost" onClick={() => loadBrief(true)} disabled={briefLoading}>
                <RefreshCw size={12} /> Yeniden yaz
              </Button>
            </div>
            {brief ? (
              <>
                <div className="markdown-body" style={{ whiteSpace: 'pre-wrap', fontSize: 13.5 }}>{brief.text}</div>
                <div className="text-muted" style={{ fontSize: 10.5, marginTop: 8 }}>
                  {brief.source === 'ai'
                    ? 'Yapay zekâ tarafından yalnızca yukarıdaki göstergelerden yazıldı. Yatırım tavsiyesi değildir.'
                    : 'Yapay zekâ servisine şu an ulaşılamadığı için göstergelerden otomatik derlenen özet gösteriliyor.'}
                </div>
              </>
            ) : (
              <span className="text-muted">{briefLoading ? 'Brif hazırlanıyor…' : 'Brif alınamadı.'}</span>
            )}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
