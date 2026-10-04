import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Briefcase, History } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import PageContainer from '../components/common/PageContainer';
import { PillTabs, Chip, Button, InfoTip } from '../components/ui';
import { fetchWithCache } from '../utils/apiCache';
import { fmtPct, signClass } from '../utils/format';
import { seriesPalette } from '../theme';
import { encodeSpec } from './backtest/strategy';

const API = import.meta.env.VITE_API_URL || '/api';
const FOLLOW_KEY = 'hr.followed.strategies';
const REB = { daily: 'Günlük', weekly: 'Haftalık', monthly: 'Aylık', quarterly: 'Çeyreklik' };

const readFollowed = () => { try { return new Set(JSON.parse(localStorage.getItem(FOLLOW_KEY)) || []); } catch { return new Set(); } };
const pct = (v, d = 1) => (v == null ? '—' : fmtPct(v * 100, d));
const pts = (v) => (v == null ? '—' : `${v >= 0 ? '+' : '-'}${Math.abs(v * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} puan`);

function Sparkline({ series }) {
  return (
    <div style={{ width: 120, height: 32 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series}>
          <YAxis hide scale="log" domain={['auto', 'auto']} />
          <Line type="monotone" dataKey="strategy" stroke={seriesPalette[0]} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="benchmark" stroke={seriesPalette[1]} strokeWidth={1} dot={false} isAnimationActive={false} strokeOpacity={0.6} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Strategies() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const [open, setOpen] = useState(null);
  const [followed, setFollowed] = useState(readFollowed);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    fetchWithCache(`${API}/backtest/house`, { ttl: 600000 })
      .then(setData)
      .catch(e => setError(e.message));
  }, []);

  const toggleFollow = (id) => {
    setFollowed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(FOLLOW_KEY, JSON.stringify([...next])); } catch { /* storage unavailable */ }
      return next;
    });
  };

  const toPaper = async (s) => {
    if (!s.holdings.length) return;
    const stocks = await fetchWithCache(`${API}/stocks`).catch(() => null);
    const prices = Object.fromEntries((stocks?.stocks || []).map(x => [x.ticker, x.price]));
    const budget = 100000 / s.holdings.length;
    const transactions = s.holdings
      .filter(t => prices[t] > 0)
      .map(t => ({ ticker: t, tx_type: 'BUY', quantity: Math.floor(budget / prices[t]), price: prices[t] }))
      .filter(t => t.quantity > 0);
    const r = await fetch(`${API}/portfolio/batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transactions, account: 'paper' }) });
    setNotice(r.ok ? `${s.name}: ${transactions.length} hisse 100.000 TL'lik eşit ağırlıklı olarak kâğıt hesaba eklendi.` : 'Kâğıt hesaba eklenemedi.');
  };

  const list = useMemo(() => (data?.strategies || []).filter(s => tab === 'all' || followed.has(s.id)), [data, tab, followed]);
  const bench = data?.strategies?.find(s => s.start === '2012-01-02');

  return (
    <PageContainer
      title="Strateji Merkezi"
      badge={data ? `${data.strategies.length} strateji` : undefined}
      subtitle="Kurallı stratejilerin geçmiş performansı ve bugünkü pozisyonları. Beğendiğini takip et ya da kâğıt portföyde dene."
      headerRight={
        <>
          <PillTabs tabs={[{ id: 'all', label: 'Tüm stratejiler' }, { id: 'followed', label: `Takip ettiklerim (${followed.size})` }]} value={tab} onChange={setTab} />
          <Button variant="outline-gold" to="/backtest"><History size={13} /> Kendi stratejini kur</Button>
        </>
      }
      scrollable
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 16 }}>
        {notice && <div className="notice"><span>{notice}</span><Button size="sm" variant="ghost" onClick={() => setNotice('')}>Kapat</Button></div>}
        {error && <div className="notice" style={{ borderColor: 'rgba(192, 82, 78, 0.5)', background: 'var(--negative-tint)' }}>Stratejiler yüklenemedi: {error}</div>}
        {!data && !error && <div className="text-muted">Stratejiler hesaplanıyor… İlk açılışta yarım dakika kadar sürebilir.</div>}

        {data && (
          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="panel-content" style={{ padding: 0, overflowX: 'auto' }}>
              <table className="data-table" style={{ minWidth: 980 }}>
                <thead>
                  <tr>
                    <th>Strateji</th>
                    <th>Seyir</th>
                    <th>Yıllık getiri</th>
                    <th>Kıyasa göre <InfoTip text="Stratejinin yıllık getirisi eksi kıyasın (XU100 ya da eşit ağırlıklı evren) yıllık getirisi." size={10} /></th>
                    <th>Maks. düşüş</th>
                    <th>Yılbaşından beri</th>
                    <th>Dengeleme</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.map(s => {
                    const isOpen = open === s.id;
                    const isFollowed = followed.has(s.id);
                    return (
                      <React.Fragment key={s.id}>
                        <tr className="row-hoverable" onClick={() => setOpen(isOpen ? null : s.id)}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                              <div>
                                <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{s.name}</div>
                                <div style={{ display: 'flex', gap: 4, marginTop: 2 }}><Chip>Hazır</Chip><Chip tone="gold">{s.tag}</Chip></div>
                              </div>
                            </div>
                          </td>
                          <td><Sparkline series={s.series} /></td>
                          <td>
                            <div className={signClass(s.cagr)}>{pct(s.cagr)}</div>
                            <div className="text-muted" style={{ fontSize: 10.5, fontFamily: 'var(--font-body)' }}>{s.start.slice(0, 4)}'ten beri</div>
                          </td>
                          <td className={signClass(s.excess_cagr)}>{pts(s.excess_cagr)}</td>
                          <td className="text-down">{pct(s.max_drawdown)}</td>
                          <td>
                            <div className={signClass(s.ytd)}>{pct(s.ytd)}</div>
                            <div className="text-muted" style={{ fontSize: 10.5, fontFamily: 'var(--font-body)' }}>backtest</div>
                          </td>
                          <td style={{ fontFamily: 'var(--font-body)' }}>{REB[s.rebalance]}</td>
                          <td onClick={e => e.stopPropagation()}>
                            <Button size="sm" variant={isFollowed ? 'outline-gold' : 'default'} onClick={() => toggleFollow(s.id)}>
                              {isFollowed ? 'Takipte' : 'Takip et'}
                            </Button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="accordion-row">
                            <td colSpan={8} style={{ padding: '12px 18px 16px', textAlign: 'left' }}>
                              <p className="text-secondary" style={{ fontSize: 13, marginBottom: 10, fontFamily: 'var(--font-body)' }}>{s.summary}</p>
                              <div className="eyebrow" style={{ marginBottom: 6 }}>Bugünkü pozisyonlar · son dengeleme {s.last_rebalance}</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                                {s.holdings.length
                                  ? s.holdings.map(t => (
                                    <button key={t} type="button" className="count-chip" onClick={() => navigate(`/hisse/${t}`)}><span className="font-mono" style={{ color: 'var(--gold)' }}>{t}</span></button>
                                  ))
                                  : <span className="text-muted" style={{ fontFamily: 'var(--font-body)' }}>Strateji şu an nakitte.</span>}
                              </div>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <Button size="sm" onClick={() => navigate(`/backtest?spec=${encodeSpec({ ...s.spec, name: s.name })}`)}><History size={12} /> Backtest'te aç ve değiştir</Button>
                                {s.holdings.length > 0 && <Button size="sm" variant="outline-gold" onClick={() => toPaper(s)}><Briefcase size={12} /> Kâğıt portföye aktar</Button>}
                              </div>
                              <p className="text-muted" style={{ fontSize: 10.5, marginTop: 10, fontFamily: 'var(--font-body)' }}>
                                Kıyas: {s.benchmark_name} ({pct(s.benchmark_cagr)} yıllık). {s.warnings.filter(w => !w.startsWith('XU100 verisi')).join(' ')}
                              </p>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {bench && tab === 'all' && (
                    <tr>
                      <td><span className="text-secondary">Kıyas · {bench.benchmark_name}</span></td>
                      <td />
                      <td className={signClass(bench.benchmark_cagr)}>{pct(bench.benchmark_cagr)}</td>
                      <td>—</td><td>—</td>
                      <td className={signClass(bench.benchmark_ytd)}>{pct(bench.benchmark_ytd)}</td>
                      <td /><td />
                    </tr>
                  )}
                  {list.length === 0 && (
                    <tr><td colSpan={8} className="text-muted" style={{ textAlign: 'center', padding: 24 }}>Henüz takip ettiğin strateji yok. Listeden "Takip et" ile ekleyebilirsin.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <p className="text-muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
          Tüm getiriler kuralların geçmiş fiyatlara uygulandığı backtest sonuçlarıdır; canlı işlem kaydı değildir. Nominal TL cinsindendir, işlem maliyeti (%0,20) düşülmüştür.
          Borsadan çıkmış hisseler veri setinde olmadığı için sonuçlar gerçekte olacağından iyi görünebilir. Yatırım tavsiyesi değildir.
        </p>
      </div>
    </PageContainer>
  );
}
