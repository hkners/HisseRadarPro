import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, ArrowRight } from 'lucide-react';
import PageContainer from '../components/common/PageContainer';
import { PillTabs, InfoTip, TickerCell, Button } from '../components/ui';
import { fetchWithCache, getCachedData } from '../utils/apiCache';
import { fmtNum, fmtPct, fmtTL, signClass } from '../utils/format';
import { trSector } from '../utils/sectors';
import { normalizeRows } from './screener/screenerConfig';

const API = import.meta.env.VITE_API_URL || '/api';
const UNIVERSE_URL = `${API}/screener/universe`;

const finite = (v) => Number.isFinite(v);
const median = (vals) => {
  const s = vals.filter(finite).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
/** Market-cap weighted mean of `key` over rows that have both values. */
const capWeighted = (rows, key) => {
  let num = 0, den = 0;
  for (const r of rows) if (finite(r[key]) && finite(r.market_cap)) { num += r[key] * r.market_cap; den += r.market_cap; }
  return den ? num / den : NaN;
};

function aggregate(rows, groupKey) {
  const groups = new Map();
  for (const r of rows) {
    const g = r[groupKey];
    if (!g) continue;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  }
  return [...groups.entries()].map(([name, list]) => {
    const covered = list.filter(r => r.broker_count > 0);
    return {
      name,
      sector: list[0].sector,
      count: list.length,
      market_cap: list.reduce((a, r) => a + (finite(r.market_cap) ? r.market_cap : 0), 0),
      coverage: covered.length / list.length,
      covered: covered.length,
      upside: median(covered.map(r => r.upside)),
      pe: median(list.map(r => (r.pe > 0 ? r.pe : NaN))),
      pb: median(list.map(r => r.pb)),
      div: median(list.map(r => (r.div_yield > 0 ? r.div_yield : NaN))),
      r3m: capWeighted(list, 'r3m'),
      r1y: capWeighted(list, 'r1y'),
      score: median(list.map(r => r.score)),
      rows: [...list].sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0)),
    };
  });
}

const COLUMNS = [
  { key: 'name', label: 'Grup', align: 'left' },
  { key: 'count', label: 'Hisse' },
  { key: 'market_cap', label: 'Piy. değ.', tip: 'Gruptaki hisselerin toplam piyasa değeri' },
  { key: 'coverage', label: 'Kurum kapsamı', tip: 'En az bir güncel kurum raporu olan hisselerin oranı' },
  { key: 'upside', label: 'Kurum potansiyeli', tip: 'Raporu olan hisselerde kurum hedef potansiyelinin medyanı' },
  { key: 'pe', label: 'Medyan F/K', tip: 'Pozitif F/K’lı hisselerin medyanı' },
  { key: 'pb', label: 'Medyan PD/DD' },
  { key: 'div', label: 'Temettü', tip: 'Temettü veren hisselerde verim medyanı' },
  { key: 'r3m', label: '3A getiri', tip: 'Piyasa değeri ağırlıklı 3 aylık getiri' },
  { key: 'r1y', label: '1Y getiri', tip: 'Piyasa değeri ağırlıklı 1 yıllık getiri' },
  { key: 'score', label: 'Skor', tip: 'Gruptaki hisselerin karar skoru medyanı' },
];

export default function Industries() {
  const [raw, setRaw] = useState(() => getCachedData(UNIVERSE_URL));
  const [error, setError] = useState(null);
  const [level, setLevel] = useState('sector');
  const [sort, setSort] = useState({ key: 'market_cap', dir: 'desc' });
  const [open, setOpen] = useState(null);

  useEffect(() => {
    fetchWithCache(UNIVERSE_URL, { ttl: 120000 }).then(setRaw).catch(e => setError(e.message));
  }, []);

  const rows = useMemo(() => normalizeRows(raw?.rows || []), [raw]);
  const groups = useMemo(() => {
    const list = aggregate(rows, level === 'sector' ? 'sector' : 'industry')
      .filter(g => level === 'sector' || g.count >= 3);
    const dir = sort.dir === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      const va = a[sort.key], vb = b[sort.key];
      if (typeof va === 'string') return va.localeCompare(vb, 'tr') * dir;
      if (!finite(va) || !finite(vb)) return finite(va) ? -1 : finite(vb) ? 1 : 0;
      return (va - vb) * dir;
    });
  }, [rows, level, sort]);

  const onSort = (key) => setSort(s => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));
  const label = (g) => (level === 'sector' ? trSector(g.name) : g.name);

  return (
    <PageContainer
      title="Sektörler"
      badge={raw ? `${groups.length} grup` : undefined}
      subtitle="Sektörleri değerleme, kurum görüşü ve getiriyle yan yana karşılaştır. Satıra tıklayınca hisseleri açılır."
      headerRight={
        <PillTabs
          tabs={[{ id: 'sector', label: 'Sektör' }, { id: 'industry', label: 'Alt sektör' }]}
          value={level}
          onChange={(v) => { setLevel(v); setOpen(null); }}
        />
      }
      scrollable
    >
      {error && !raw && <div className="text-down" style={{ padding: 16 }}>Veri alınamadı: {error}</div>}
      {!raw && !error && <div className="text-muted" style={{ padding: 16 }}>Sektör verisi hazırlanıyor…</div>}
      {raw && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-content" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: 1100 }}>
              <thead>
                <tr>
                  {COLUMNS.map(c => (
                    <th key={c.key} style={{ textAlign: c.align || 'right', cursor: 'pointer' }} onClick={() => onSort(c.key)}>
                      {c.key === 'name' ? (level === 'sector' ? 'Sektör' : 'Alt sektör') : c.label}
                      {c.tip && <InfoTip text={c.tip} size={10} />}
                      <span style={{ color: sort.key === c.key ? 'var(--gold)' : 'transparent', marginLeft: 3 }}>{sort.dir === 'asc' ? '▲' : '▼'}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map(g => {
                  const isOpen = open === g.name;
                  return (
                    <React.Fragment key={g.name}>
                      <tr className="row-hoverable" onClick={() => setOpen(isOpen ? null : g.name)}>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)' }}>
                            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            {label(g)}
                          </span>
                          {level === 'industry' && <div className="text-muted" style={{ fontSize: 10.5, paddingLeft: 19 }}>{trSector(g.sector)}</div>}
                        </td>
                        <td>{g.count}</td>
                        <td>{fmtTL(g.market_cap)}</td>
                        <td>{fmtPct(g.coverage * 100, 0, { sign: false })}</td>
                        <td className={signClass(g.upside)}>{fmtPct(g.upside)}</td>
                        <td>{finite(g.pe) ? fmtNum(g.pe, 1) : '—'}</td>
                        <td>{finite(g.pb) ? fmtNum(g.pb, 2) : '—'}</td>
                        <td>{fmtPct(g.div, 1, { sign: false })}</td>
                        <td className={signClass(g.r3m)}>{fmtPct(g.r3m)}</td>
                        <td className={signClass(g.r1y)}>{fmtPct(g.r1y)}</td>
                        <td>{finite(g.score) ? fmtNum(g.score, 0) : '—'}</td>
                      </tr>
                      {isOpen && (
                        <tr className="accordion-row">
                          <td colSpan={COLUMNS.length} style={{ padding: '10px 16px 14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <span className="eyebrow">{label(g)} · piyasa değerine göre ilk {Math.min(10, g.rows.length)} hisse</span>
                              {level === 'sector' && (
                                <Button size="sm" variant="outline-gold" to={`/screener?sector=${encodeURIComponent(g.name)}`}>
                                  Tarayıcıda aç <ArrowRight size={12} />
                                </Button>
                              )}
                            </div>
                            <table className="data-table compact">
                              <thead>
                                <tr><th>Hisse</th><th>Piy. değ.</th><th>Fiyat</th><th>F/K</th><th>PD/DD</th><th>Kurum</th><th>Potansiyel</th><th>3A</th><th>1Y</th><th>Skor</th></tr>
                              </thead>
                              <tbody>
                                {g.rows.slice(0, 10).map(r => (
                                  <tr key={r.ticker}>
                                    <td style={{ maxWidth: 260 }}><TickerCell ticker={r.ticker} name={r.name} /></td>
                                    <td>{fmtTL(r.market_cap)}</td>
                                    <td>{fmtNum(r.price)}</td>
                                    <td>{r.pe > 0 ? fmtNum(r.pe, 1) : '—'}</td>
                                    <td>{fmtNum(r.pb, 2)}</td>
                                    <td>{r.broker_count || '—'}</td>
                                    <td className={signClass(r.upside)}>{fmtPct(r.upside)}</td>
                                    <td className={signClass(r.r3m)}>{fmtPct(r.r3m)}</td>
                                    <td className={signClass(r.r1y)}>{fmtPct(r.r1y)}</td>
                                    <td>{finite(r.score) ? r.score : '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {level === 'industry' && (
            <p className="text-muted" style={{ fontSize: 11, padding: '8px 12px' }}>
              Alt sektör adları veri sağlayıcının (yfinance) sınıflamasıdır; en az 3 hissesi olan gruplar gösterilir.
            </p>
          )}
        </div>
      )}
    </PageContainer>
  );
}
