import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { InfoTip } from '../../components/ui';
import { VerdictChip, pts } from '../../components/ta/common';
import { fmtNum } from '../../utils/format';

const GROUP_ORDER = ['Trend', 'Kırılım', 'Göreli güç', 'Osilatör', 'Geri çekilme', 'Hacim'];

function YearBars({ yearly }) {
  const entries = Object.entries(yearly || {});
  const max = Math.max(0.005, ...entries.map(([, v]) => Math.abs(v)));
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 70 }}>
      {entries.map(([y, v]) => (
        <div key={y} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 34 }}>
          <div style={{ height: 50, display: 'flex', flexDirection: 'column', justifyContent: 'center', width: 14 }}>
            <div style={{ height: 25, display: 'flex', alignItems: 'flex-end' }}>
              {v > 0 && <div style={{ width: 14, height: `${(v / max) * 25}px`, background: 'var(--positive)', borderRadius: '2px 2px 0 0' }} />}
            </div>
            <div style={{ height: 25 }}>
              {v < 0 && <div style={{ width: 14, height: `${(-v / max) * 25}px`, background: 'var(--negative)', borderRadius: '0 0 2px 2px' }} />}
            </div>
          </div>
          <span className="text-muted" style={{ fontSize: 9.5 }}>{y}</span>
        </div>
      ))}
    </div>
  );
}

export default function SignalsTab({ data, onShowStocks }) {
  const [open, setOpen] = useState(null);
  const [onlyEvidence, setOnlyEvidence] = useState(false);
  const groups = useMemo(() => {
    const g = {};
    data.signals.filter(s => !onlyEvidence || ['guclu_pozitif', 'pozitif', 'negatif', 'guclu_negatif'].includes(s.verdict))
      .forEach(s => { (g[s.group] = g[s.group] || []).push(s); });
    return GROUP_ORDER.filter(k => g[k]).map(k => [k, g[k]]);
  }, [data, onlyEvidence]);
  const contradicted = data.signals.filter(s => s.classic_holds === false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="card">
        <div className="card-eyebrow">Nasıl okunur</div>
        <p className="card-body" style={{ fontSize: 13, lineHeight: 1.6 }}>
          Her sinyal {data.study.start} – {data.study.end} arasında günlük işlem hacmi 2 milyon TL üzerindeki BIST hisselerinde test edildi.
          Sinyalin ertesi günü kapanıştan alınıp tutulduğunda, aynı dönemde eşit ağırlıklı likit evrene göre ne kadar fazla ya da eksik getiri sağladığı gösteriliyor.
          t değeri aylara göre kümelenmiş istatistiktir: 2'nin üzeri anlamlı, 3'ün üzeri güçlü kabul edilir.
          {contradicted.length > 0 && <> Klasik yorumu BIST'te <b className="text-down">tersine</b> çalışan sinyaller: {contradicted.map(s => s.label).join(', ')}.</>}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className={`count-chip${onlyEvidence ? ' active' : ''}`} onClick={() => setOnlyEvidence(v => !v)}>Yalnızca anlamlı kanıtı olanlar</button>
      </div>
      {groups.map(([group, list]) => (
        <div key={group} className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">{group}</div>
          <div className="panel-content" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="data-table compact" style={{ minWidth: 1080 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Sinyal</th>
                  <th>Klasik yorum</th>
                  <th>5 gün</th><th>20 gün</th><th>60 gün</th>
                  <th>Ortalamayı geçen <InfoTip text="Sinyal veren hisselerin 20 günde eşit ağırlıklı evreni geçme oranı. BIST getirileri sağa çarpık olduğu için %50 altı normaldir; tüm hisselerde bu oran ~%40." size={9} /></th>
                  <th>t</th><th>Pozitif yıl</th>
                  <th>Yükselen piyasada</th><th>Düşen piyasada</th>
                  <th>Kanıt</th><th>Bugün</th>
                </tr>
              </thead>
              <tbody>
                {list.map(s => {
                  const h = s.horizons || {};
                  const h20 = h[20] || h['20'] || {};
                  const isOpen = open === s.key;
                  return (
                    <React.Fragment key={s.key}>
                      <tr className="row-hoverable" onClick={() => setOpen(isOpen ? null : s.key)} style={{ cursor: 'pointer' }}>
                        <td style={{ textAlign: 'left' }}>
                          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                            {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            <span style={{ color: 'var(--text-primary)' }}>{s.label}</span>
                            <span className="text-muted" style={{ fontSize: 10 }}>{s.kind === 'event' ? 'olay' : 'durum'}</span>
                          </span>
                        </td>
                        <td>{s.classic > 0 ? 'Yükseliş' : 'Düşüş'}</td>
                        {[5, 20, 60].map(k => {
                          const v = (h[k] || h[String(k)] || {}).mean;
                          return <td key={k} className={v > 0 ? 'text-up' : v < 0 ? 'text-down' : ''}>{pts(v)}</td>;
                        })}
                        <td>{h20.hit != null ? `%${Math.round(h20.hit * 100)}` : '—'}</td>
                        <td>{h20.t != null ? fmtNum(h20.t, 1) : '—'}</td>
                        <td>{h20.years_pos != null ? `%${Math.round(h20.years_pos * 100)}` : '—'}</td>
                        <td className={h20.regime_up > 0 ? 'text-up' : h20.regime_up < 0 ? 'text-down' : ''}>{pts(h20.regime_up)}</td>
                        <td className={h20.regime_down > 0 ? 'text-up' : h20.regime_down < 0 ? 'text-down' : ''}>{pts(h20.regime_down)}</td>
                        <td>
                          <VerdictChip verdict={s.verdict} />
                          {s.classic_holds === false && <div className="text-down" style={{ fontSize: 9.5, marginTop: 2 }}>klasik yorumun tersi</div>}
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          {s.active_count > 0
                            ? <button type="button" className="btn btn-sm btn-ghost" onClick={() => onShowStocks(s.key)}>{s.active_count} hisse</button>
                            : <span className="text-muted">—</span>}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="accordion-row">
                          <td colSpan={12} style={{ textAlign: 'left', padding: '10px 16px 14px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 20, alignItems: 'start' }}>
                              <div>
                                <p className="text-secondary" style={{ fontSize: 12.5, lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>{s.desc}</p>
                                <p className="text-muted" style={{ fontSize: 11, marginTop: 6, fontFamily: 'var(--font-body)' }}>
                                  {h20.n ? `${h20.n.toLocaleString('tr-TR')} gözlem, ${h20.days} gün.` : ''} Medyan fazla getiri {pts(h20.median)}.
                                  {data.directions?.[s.key] ? ` Modelde bu sinyal skoru yalnızca ${data.directions[s.key] > 0 ? 'yükseltebilir' : 'düşürebilir'}.` : ' Modelde bu sinyalin yönü serbest (eğitim verisinde anlamlı değil).'}
                                </p>
                                {s.active?.length > 0 && (
                                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                                    {s.active.slice(0, 30).map(t => <Link key={t} to={`/hisse/${t}?tab=teknik`} className="chip" style={{ fontSize: 10.5 }}>{t}</Link>)}
                                  </div>
                                )}
                              </div>
                              <div>
                                <div className="eyebrow" style={{ marginBottom: 4 }}>Yıllara göre 20 günlük fazla getiri</div>
                                <YearBars yearly={h20.yearly} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
