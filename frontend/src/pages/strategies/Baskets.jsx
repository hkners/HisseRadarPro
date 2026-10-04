import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Plus, Trash2, Briefcase, ArrowLeftRight } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { Button, Chip, InfoTip } from '../../components/ui';
import { fmtPct, signClass } from '../../utils/format';
import { seriesPalette } from '../../theme';

const API = import.meta.env.VITE_API_URL || '/api';
const FOLLOW_KEY = 'hr.followed.baskets';
const readFollowed = () => { try { return new Set(JSON.parse(localStorage.getItem(FOLLOW_KEY)) || []); } catch { return new Set(); } };
const pct = (v, d = 1) => (v == null ? '—' : fmtPct(v * 100, d));
const SOURCE = { house: 'Hazır', studio: 'Studio', manual: 'Senin' };

function Spark({ series }) {
  return (
    <div style={{ width: 110, height: 30 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series}>
          <YAxis hide domain={['auto', 'auto']} />
          <Line type="monotone" dataKey="basket" stroke={seriesPalette[0]} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="bench" stroke={seriesPalette[1]} strokeWidth={1} strokeOpacity={0.6} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function NewBasket({ onCreated, onCancel }) {
  const [name, setName] = useState('');
  const [tickers, setTickers] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const list = tickers.split(/[\s,;]+/).map(t => t.trim().toUpperCase()).filter(Boolean);
    const r = await fetch(`${API}/baskets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description, tickers: list }) });
    const d = await r.json();
    if (!r.ok) { setError(d.detail || 'Sepet oluşturulamadı.'); return; }
    onCreated();
  };
  return (
    <form className="card" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="card-eyebrow">Yeni sepet</div>
      <div className="filter-grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
        <label className="filter-field"><span className="eyebrow">Ad</span><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Örn. Temettü şampiyonları" required minLength={2} /></label>
        <label className="filter-field"><span className="eyebrow">Hisseler</span><input className="input" value={tickers} onChange={e => setTickers(e.target.value.toUpperCase())} placeholder="TUPRS, FROTO, TTRAK, DOAS" required /></label>
      </div>
      <label className="filter-field"><span className="eyebrow">Açıklama (isteğe bağlı)</span><input className="input" value={description} onChange={e => setDescription(e.target.value)} /></label>
      {error && <span className="text-down" style={{ fontSize: 12 }}>{error}</span>}
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="primary" type="submit" disabled={!name.trim() || !tickers.trim()}>Sepeti oluştur</Button>
        <Button variant="ghost" onClick={onCancel}>Vazgeç</Button>
        <span className="text-muted" style={{ fontSize: 11, alignSelf: 'center' }}>Hisseler eşit ağırlıklı olur.</span>
      </div>
    </form>
  );
}

export default function Baskets({ onNotice }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  const [creating, setCreating] = useState(false);
  const [onlyFollowed, setOnlyFollowed] = useState(false);
  const [followed, setFollowed] = useState(readFollowed);

  const load = (refresh = false) => {
    fetch(`${API}/baskets${refresh ? '?refresh=true' : ''}`).then(r => r.json()).then(setData).catch(e => setError(e.message));
  };
  useEffect(() => { load(); }, []);

  const toggleFollow = (id) => setFollowed(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    try { localStorage.setItem(FOLLOW_KEY, JSON.stringify([...next])); } catch { /* storage unavailable */ }
    return next;
  });
  const remove = async (id) => { await fetch(`${API}/baskets/${id}`, { method: 'DELETE' }); load(true); };
  const toPaper = async (b) => {
    const stocks = await fetch(`${API}/stocks`).then(r => r.json()).catch(() => null);
    const prices = Object.fromEntries((stocks?.stocks || []).map(s => [s.ticker, s.price]));
    const members = b.perf?.members || [];
    const transactions = members.filter(m => prices[m.ticker] > 0)
      .map(m => ({ ticker: m.ticker, tx_type: 'BUY', quantity: Math.floor((100000 * m.weight) / prices[m.ticker]), price: prices[m.ticker] }))
      .filter(t => t.quantity > 0);
    const r = await fetch(`${API}/portfolio/batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transactions, account: 'paper' }) });
    onNotice(r.ok ? `${b.name}: ${transactions.length} hisse sepet ağırlıklarıyla kâğıt hesaba eklendi (100.000 TL).` : 'Kâğıt hesaba eklenemedi.');
  };

  const list = useMemo(() => (data?.baskets || []).filter(b => !onlyFollowed || followed.has(b.id)), [data, onlyFollowed, followed]);
  const asOf = data?.baskets?.find(b => b.perf)?.perf?.as_of;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className={`count-chip${onlyFollowed ? ' active' : ''}`} onClick={() => setOnlyFollowed(v => !v)}>Takip ettiklerim <span className="count">{followed.size}</span></button>
        <span style={{ flex: 1 }} />
        <Button variant="primary" onClick={() => setCreating(true)}><Plus size={13} /> Yeni sepet</Button>
      </div>
      {creating && <NewBasket onCreated={() => { setCreating(false); load(true); onNotice('Sepet oluşturuldu.'); }} onCancel={() => setCreating(false)} />}
      {error && <div className="text-down">Sepetler yüklenemedi: {error}</div>}
      {!data && !error && <div className="text-muted">Sepetler hesaplanıyor…</div>}
      {data && (
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-content" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th>Sepet</th><th>Seyir (1Y)</th><th>1A</th><th>3A</th><th>Yılbaşından beri</th><th>1Y</th>
                  <th>Volatilite</th><th>Maks. düşüş</th><th />
                </tr>
              </thead>
              <tbody>
                {list.map(b => {
                  const p = b.perf;
                  const isOpen = open === b.id;
                  return (
                    <React.Fragment key={b.id}>
                      <tr className="row-hoverable" onClick={() => setOpen(isOpen ? null : b.id)}>
                        <td>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            <div>
                              <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{b.name}</div>
                              <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                                <Chip tone={b.house ? 'default' : 'gold'}>{SOURCE[b.source] || 'Senin'}</Chip>
                                <span className="text-muted" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)' }}>{b.tickers.slice(0, 4).join(' · ')}{b.tickers.length > 4 ? ` +${b.tickers.length - 4}` : ''}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>{p && <Spark series={p.series} />}</td>
                        <td className={signClass(p?.r1m)}>{pct(p?.r1m)}</td>
                        <td className={signClass(p?.r3m)}>{pct(p?.r3m)}</td>
                        <td className={signClass(p?.ytd)}>{pct(p?.ytd)}</td>
                        <td className={signClass(p?.r1y)}>{pct(p?.r1y)}</td>
                        <td>{p ? fmtPct(p.volatility * 100, 1, { sign: false }) : '—'}</td>
                        <td className="text-down">{pct(p?.max_drawdown)}</td>
                        <td onClick={e => e.stopPropagation()}>
                          <Button size="sm" variant={followed.has(b.id) ? 'outline-gold' : 'default'} onClick={() => toggleFollow(b.id)}>{followed.has(b.id) ? 'Takipte' : 'Takip et'}</Button>
                        </td>
                      </tr>
                      {isOpen && p && (
                        <tr className="accordion-row">
                          <td colSpan={9} style={{ padding: '12px 18px 16px', textAlign: 'left' }}>
                            {b.description && <p className="text-secondary" style={{ fontFamily: 'var(--font-body)', fontSize: 13, marginBottom: 10 }}>{b.description}</p>}
                            <table className="data-table compact" style={{ maxWidth: 640 }}>
                              <thead><tr><th>Hisse</th><th>Ağırlık</th><th>1A</th><th>3A</th><th>1Y</th></tr></thead>
                              <tbody>
                                {p.members.map(mm => (
                                  <tr key={mm.ticker} className="row-hoverable" onClick={() => navigate(`/hisse/${mm.ticker}`)}>
                                    <td><span className="ticker-link">{mm.ticker}</span></td>
                                    <td>{fmtPct(mm.weight * 100, 1, { sign: false })}</td>
                                    <td className={signClass(mm.r1m)}>{pct(mm.r1m)}</td>
                                    <td className={signClass(mm.r3m)}>{pct(mm.r3m)}</td>
                                    <td className={signClass(mm.r1y)}>{pct(mm.r1y)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                              <Button size="sm" variant="outline-gold" onClick={() => toPaper(b)}><Briefcase size={12} /> Kâğıt portföye aktar</Button>
                              <Button size="sm" onClick={() => navigate(`/compare?t=${[...p.members.slice(0, 3).map(mm => mm.ticker), 'XU100'].join(',')}&d=365`)}><ArrowLeftRight size={12} /> İlk üçü XU100 ile karşılaştır</Button>
                              {!b.house && <Button size="sm" variant="ghost" style={{ color: 'var(--negative)' }} onClick={() => remove(b.id)}><Trash2 size={12} /> Sepeti sil</Button>}
                            </div>
                            <p className="text-muted" style={{ fontSize: 10.5, marginTop: 8, fontFamily: 'var(--font-body)' }}>
                              XU100 aynı dönemde: 1Y {pct(p.bench_r1y)} · yılbaşından beri {pct(p.bench_ytd)}.
                              {b.missing?.length > 0 && ` Fiyat geçmişi olmayan: ${b.missing.join(', ')}.`}
                              {b.created_at && ` Oluşturulma: ${b.created_at}${p.since_created != null ? ` · o günden beri ${pct(p.since_created)}` : ''}.`}
                            </p>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {list.length === 0 && <tr><td colSpan={9} className="text-muted" style={{ textAlign: 'center', padding: 24 }}>Takip ettiğin sepet yok.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
        Sepet getirileri gösterge niteliğindedir <InfoTip text="Her sepet bugünkü üyeleriyle ve sabit ağırlıklarla geriye doğru hesaplanır; üyeleri zaman içinde değişmiş bir sepet gerçekte farklı sonuç verirdi." size={10} />: bugünkü üyeler ve ağırlıklarla geçmiş bir yıla uygulanır, her gün yeniden dengelenir.
        {asOf && ` Son fiyat verisi ${asOf}.`} Yatırım tavsiyesi değildir.
      </p>
    </div>
  );
}
