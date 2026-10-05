import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileDown, Search } from 'lucide-react';
import { Button, InfoTip } from '../../components/ui';
import { ScoreBar, StageChip, VERDICT, pct, pts } from '../../components/ta/common';
import { trSector } from '../../utils/sectors';
import { exportTables } from '../../utils/download';
import { fmtNum } from '../../utils/format';

const PRESETS = [
  { id: 'all', label: 'Tümü', test: () => true },
  { id: 'leaders', label: 'Lider adaylar', tip: '2. evre, trend şablonu en az 7/8, göreli güç 80+.', test: r => r.stage === 2 && r.template >= 7 && r.rs_rating >= 80 },
  { id: 'breakouts', label: 'Kırılımlar', tip: 'Son 5 seansta 52 hafta zirvesi, 55 günlük kanal veya hacimli kırılım.', test: r => r.signals.some(s => ['hi52_breakout', 'donchian55', 'breakout_volume', 'squeeze_breakout'].includes(s)) },
  { id: 'squeeze', label: 'Sıkışma', tip: 'Bollinger genişliği 6 ayın en dar %10\'unda: büyük hareket öncesi sessizlik.', test: r => r.squeeze },
  { id: 'pullbacks', label: 'Yükselişte geri çekilme', tip: '2. evrede SMA50\'ye ya da kısa vadeli aşırı satıma geri çekilenler.', test: r => r.signals.some(s => ['pullback_sma50', 'rsi2_dip_uptrend'].includes(s)) },
  { id: 'avoid', label: 'Kaçınılacaklar', tip: 'Skoru en düşük %10: tarihsel olarak piyasanın en çok gerisinde kalan dilim.', test: r => r.score != null && r.score < 10 },
];

const COLS = [
  { key: 'ticker', label: 'Hisse', align: 'left' },
  { key: 'score', label: 'Skor', tip: 'Teknik modelin likit hisseler arasındaki yüzdelik sırası (0-100).' },
  { key: 'expected_excess_20d', label: '20g beklenti', tip: 'Bu skor diliminin 2019\'dan beri örneklem dışı ortalama 20 günlük fazla getirisi.' },
  { key: 'stage', label: 'Evre' },
  { key: 'rs_rating', label: 'RS', tip: 'Göreli güç notu (1-99): 3-6-9-12 aylık ağırlıklı getiri sırası.' },
  { key: 'template', label: 'Şablon', tip: 'Minervini trend şablonunun 8 koşulundan kaçı sağlanıyor.' },
  { key: 'dist_hi52', label: '52h zirveye' },
  { key: 'adx', label: 'ADX' },
  { key: 'rsi14', label: 'RSI' },
  { key: 'vol_ratio', label: 'Hacim', tip: 'Son 20 günün ortalama hacmi / son 60 günün.' },
  { key: 'support_pct', label: 'Destek' },
  { key: 'resistance_pct', label: 'Direnç' },
  { key: 'signals', label: 'Aktif sinyaller', align: 'left', sortable: false },
];

export default function ScreenerTab({ data, initialSignal }) {
  const navigate = useNavigate();
  const [preset, setPreset] = useState('all');
  const [q, setQ] = useState('');
  const [stages, setStages] = useState(new Set());
  const [sector, setSector] = useState('');
  const [signal, setSignal] = useState(initialSignal || '');
  const [minScore, setMinScore] = useState('');
  const [sort, setSort] = useState({ key: 'score', dir: 'desc' });

  const sectors = useMemo(() => [...new Set(data.rows.map(r => r.sector).filter(Boolean))].sort(), [data]);
  const presetTest = PRESETS.find(p => p.id === preset).test;
  const rows = useMemo(() => {
    const term = q.trim().toUpperCase();
    const out = data.rows.filter(r => presetTest(r)
      && (!term || r.ticker.includes(term))
      && (!stages.size || stages.has(r.stage))
      && (!sector || r.sector === sector)
      && (!signal || r.signals.includes(signal))
      && (minScore === '' || (r.score ?? -1) >= Number(minScore)));
    const k = sort.key;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return out.sort((a, b) => {
      const va = a[k], vb = b[k];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (typeof va === 'string' ? va.localeCompare(vb, 'tr') : va - vb) * dir;
    });
  }, [data, presetTest, q, stages, sector, signal, minScore, sort]);

  const toggleStage = (s) => setStages(prev => {
    const n = new Set(prev);
    if (n.has(s)) n.delete(s); else n.add(s);
    return n;
  });
  const sortBy = (key) => setSort(prev => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc' }));
  const signalOptions = Object.entries(data.signals).sort((a, b) => a[1].label.localeCompare(b[1].label, 'tr'));

  const doExport = () => exportTables('teknik-radar', `Teknik Radar · ${data.as_of}`, [{
    name: 'Tarama',
    columns: [
      { key: 'ticker', label: 'Hisse' }, { key: 'sector_tr', label: 'Sektör' }, { key: 'score', label: 'Skor', format: 'num' },
      { key: 'expected_excess_20d', label: '20 gün beklenen fazla getiri', format: 'pct' }, { key: 'stage', label: 'Evre', format: 'int' },
      { key: 'rs_rating', label: 'RS', format: 'int' }, { key: 'template', label: 'Şablon', format: 'int' },
      { key: 'dist_hi52', label: '52 hafta zirveye', format: 'pct' }, { key: 'adx', label: 'ADX', format: 'num' }, { key: 'rsi14', label: 'RSI', format: 'num' },
      { key: 'support_pct', label: 'Destek', format: 'pct' }, { key: 'resistance_pct', label: 'Direnç', format: 'pct' }, { key: 'signals_text', label: 'Sinyaller' },
    ],
    rows: rows.map(r => ({ ...r, sector_tr: trSector(r.sector), signals_text: r.signals.map(s => data.signals[s]?.label).join(', ') })),
  }]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {PRESETS.map(p => (
          <button key={p.id} type="button" className={`count-chip${preset === p.id ? ' active' : ''}`} onClick={() => setPreset(p.id)} title={p.tip}>
            {p.label} <span className="count">{data.rows.filter(p.test).length}</span>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label className="search-box" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', width: 150 }}>
          <Search size={13} className="text-muted" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Hisse ara" style={{ background: 'transparent', border: 0, outline: 0, color: 'inherit', width: '100%' }} />
        </label>
        {[1, 2, 3, 4].map(s => (
          <button key={s} type="button" className={`count-chip${stages.has(s) ? ' active' : ''}`} onClick={() => toggleStage(s)}>{s}. evre</button>
        ))}
        <select className="input" value={sector} onChange={e => setSector(e.target.value)} style={{ width: 170 }}>
          <option value="">Tüm sektörler</option>
          {sectors.map(s => <option key={s} value={s}>{trSector(s)}</option>)}
        </select>
        <select className="input" value={signal} onChange={e => setSignal(e.target.value)} style={{ width: 230 }}>
          <option value="">Sinyal filtresi yok</option>
          {signalOptions.map(([k, s]) => <option key={k} value={k}>{s.label} · {VERDICT[s.verdict]?.label}</option>)}
        </select>
        <input className="input" type="number" min="0" max="100" value={minScore} onChange={e => setMinScore(e.target.value)} placeholder="Min. skor" style={{ width: 100 }} />
        <span style={{ flex: 1 }} />
        <span className="text-muted" style={{ fontSize: 11.5 }}>{rows.length} hisse</span>
        <Button size="sm" onClick={doExport}><FileDown size={13} /> Excel</Button>
      </div>

      <div className="panel" style={{ marginBottom: 0 }}>
        <div className="panel-content" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="data-table compact" style={{ minWidth: 1180 }}>
            <thead>
              <tr>
                {COLS.map(c => (
                  <th key={c.key} style={{ textAlign: c.align || 'right', cursor: c.sortable === false ? 'default' : 'pointer', whiteSpace: 'nowrap' }}
                    onClick={() => c.sortable !== false && sortBy(c.key)}>
                    {c.label}{c.tip && <> <InfoTip text={c.tip} size={9} /></>}
                    {sort.key === c.key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 400).map(r => (
                <tr key={r.ticker} className="row-hoverable" onClick={() => navigate(`/hisse/${r.ticker}?tab=teknik`)} style={{ cursor: 'pointer' }}>
                  <td style={{ textAlign: 'left' }}>
                    <span className="ticker-link">{r.ticker}</span>
                    <div className="text-muted" style={{ fontSize: 10 }}>{trSector(r.sector)}</div>
                  </td>
                  <td><ScoreBar score={r.score} width={46} /></td>
                  <td className={r.expected_excess_20d > 0 ? 'text-up' : r.expected_excess_20d < 0 ? 'text-down' : ''}>{pts(r.expected_excess_20d)}</td>
                  <td><StageChip stage={r.stage} /></td>
                  <td>{r.rs_rating ?? '—'}</td>
                  <td>{r.template != null ? `${r.template}/8` : '—'}</td>
                  <td>{pct(r.dist_hi52)}</td>
                  <td>{fmtNum(r.adx, 0)}</td>
                  <td>{fmtNum(r.rsi14, 0)}</td>
                  <td className={r.vol_ratio >= 1.3 ? 'text-gold' : ''}>{fmtNum(r.vol_ratio, 2)}</td>
                  <td>{pct(r.support_pct)}</td>
                  <td>{pct(r.resistance_pct)}</td>
                  <td style={{ textAlign: 'left' }}>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', maxWidth: 360 }}>
                      {r.signals.slice(0, 4).map(s => {
                        const m = data.signals[s] || {};
                        const tone = VERDICT[m.verdict]?.tone || 'default';
                        return <span key={s} className={`chip${tone !== 'default' ? ` chip-${tone}` : ''}`} style={{ fontSize: 10 }} title={`${m.label}: ${VERDICT[m.verdict]?.label} (20g ${pts(m.mean20)})`}>{m.label}</span>;
                      })}
                      {r.signals.length > 4 && <span className="text-muted" style={{ fontSize: 10 }}>+{r.signals.length - 4}</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 400 && <p className="text-muted" style={{ fontSize: 11, padding: 8 }}>İlk 400 hisse gösteriliyor; filtreyi daraltın.</p>}
        </div>
      </div>
      <p className="text-muted" style={{ fontSize: 11 }}>Sinyal renkleri BIST kanıtını gösterir: yeşil geçmişte ortalamanın üstünde, kırmızı altında getiriyle gelen sinyal; gri anlamlı bir fark bulunamayan sinyal.</p>
    </div>
  );
}
