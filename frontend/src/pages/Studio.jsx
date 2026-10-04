import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, Sparkles, ArrowRight, Briefcase, ArrowLeftRight, Layers } from 'lucide-react';
import { Button, StatTile, Chip, InfoTip } from '../components/ui';
import { fetchWithCache } from '../utils/apiCache';
import { fmtNum, fmtPct, signClass } from '../utils/format';
import { trSector } from '../utils/sectors';

const API = import.meta.env.VITE_API_URL || '/api';
const THESES_KEY = 'hr.studio.theses';

const EXAMPLES = [
  { title: 'TCMB faizi %30\'a iner', thesis: "TCMB 2027 sonuna kadar politika faizini yüzde 30'a indirir ve uzun vadeli tahvil faizleri de düşer.", note: 'Faiz indirim döngüsü' },
  { title: 'Savunma harcamaları artmaya devam eder', thesis: 'Türkiye ve Avrupa savunma bütçeleri önümüzdeki on yıl boyunca artmaya devam eder, savunma ihracatı büyür.', note: 'Savunma sanayii' },
  { title: 'TL reel olarak değer kaybeder', thesis: 'Türk lirası önümüzdeki yıl reel olarak değer kaybeder; ihracatçılar ve döviz geliri olan şirketler öne çıkar.', note: 'Kur ve ihracat' },
  { title: 'Turizmde rekor yıl', thesis: 'Turizm gelirleri ve yolcu sayısı önümüzdeki iki sezon rekor kırar.', note: 'Turizm ve havacılık' },
];

const loadTheses = () => { try { return JSON.parse(localStorage.getItem(THESES_KEY)) || []; } catch { return []; } };
const storeTheses = (t) => { try { localStorage.setItem(THESES_KEY, JSON.stringify(t.slice(0, 30))); } catch { /* storage unavailable */ } };
const pct = (v, d = 1) => (v == null ? '—' : fmtPct(v * 100, d, { sign: false }));
const DIR_ARROW = { düşer: '↓', azalır: '↓', yükselir: '↑', artar: '↑', değişmez: '→' };

function ImpactBar({ value }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3 }} aria-label={`Etki ${value}`}>
      {[1, 2, 3].map(i => (
        <span key={i} style={{ width: 14, height: 6, borderRadius: 2, background: Math.abs(value) >= i ? (value > 0 ? 'var(--positive)' : 'var(--negative)') : 'var(--border-default)' }} />
      ))}
    </span>
  );
}

function Result({ r, onPaper, paperMsg, onSaveBasket }) {
  const navigate = useNavigate();
  const maxW = Math.max(...r.allocation.map(a => a.weight || 0), 0.01);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 20 }}>
      <div style={{ textAlign: 'center', padding: '6px 0 2px' }}>
        <h1 className="display-title" style={{ fontSize: 22 }}>{r.title}</h1>
        <p className="text-secondary" style={{ fontSize: 13, marginTop: 4 }}>{r.summary}</p>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          {r.drivers.map((d, i) => (
            <span key={i} className="chip chip-gold" title={d.note} style={{ textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>
              {d.name} {DIR_ARROW[d.direction] || ''} {d.direction}
            </span>
          ))}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 0 }}>
        <div className="panel-content" style={{ padding: 0, flex: 'none' }}>
          <table className="data-table studio-flow">
            <thead>
              <tr>
                <th>Etki kanalı <InfoTip text="Tezin bu şirketi hangi yoldan etkileyeceği. Yapay zekâ değerlendirmesidir, bir değerleme modeli değildir." size={10} /></th>
                <th style={{ textAlign: 'center' }}>Etki</th>
                <th>Dağılım</th>
              </tr>
            </thead>
            <tbody>
              {r.allocation.map(a => (
                <tr key={a.ticker}>
                  <td style={{ whiteSpace: 'normal' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <Link to={`/hisse/${a.ticker}`} className="ticker-link">{a.ticker}</Link>
                      <span className="text-muted" style={{ fontSize: 11 }}>{trSector(a.sector)}</span>
                    </div>
                    <div className="text-secondary" style={{ fontSize: 12.5, marginTop: 2 }}>{a.channel}</div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <ImpactBar value={a.impact} />
                    <div className="text-muted" style={{ fontSize: 10.5, fontFamily: 'var(--font-body)' }}>{a.confidence} güven</div>
                  </td>
                  <td style={{ width: 200 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 56px', gap: 8, alignItems: 'center' }}>
                      <div className="bar-track"><div className="bar-fill" style={{ width: `${(a.weight / maxW) * 100}%` }} /></div>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{pct(a.weight)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ textAlign: 'center' }}>
        <div className="card-eyebrow">Sepet</div>
        <div className="stat-grid" style={{ marginTop: 6 }}>
          <StatTile label="Hisse" value={r.stats.holdings} sub={`${r.scored_count} aday değerlendirildi · ${r.candidate_count} likit hisse tarandı`} />
          <StatTile label="Beklenen volatilite" tip="Son bir yılın günlük getirileriyle bu ağırlıkların yıllıklandırılmış oynaklığı." value={pct(r.stats.expected_volatility)} />
          <StatTile label="Beta (XU100)" value={fmtNum(r.stats.beta, 2)} />
          <StatTile label="Ort. korelasyon" tip="Sepetteki hisseler arasındaki ortalama günlük getiri korelasyonu. Yüksekse sepet tek bir riske bağlıdır." value={fmtNum(r.stats.average_correlation, 2)} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={onPaper} disabled={!r.allocation.length}><Briefcase size={13} /> Kâğıt portföye aktar (100.000 TL)</Button>
          <Button onClick={onSaveBasket} disabled={!r.allocation.length}><Layers size={13} /> Sepet olarak kaydet ve takip et</Button>
          <Button onClick={() => navigate(`/compare?t=${[...r.allocation.slice(0, 3).map(a => a.ticker), 'XU100'].join(',')}&d=365`)}><ArrowLeftRight size={13} /> İlk üçü XU100 ile karşılaştır</Button>
        </div>
        {paperMsg && <div className="notice" style={{ marginTop: 10, justifyContent: 'center' }}>{paperMsg}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">Dışarıda kalan adaylar · {r.excluded.length}</div>
          <div className="panel-content" style={{ padding: 0, flex: 'none' }}>
            <table className="data-table compact">
              <thead><tr><th>Hisse</th><th style={{ textAlign: 'center' }}>Etki</th><th style={{ textAlign: 'left' }}>Neden</th></tr></thead>
              <tbody>
                {r.excluded.map(e => (
                  <tr key={e.ticker} title={e.channel}>
                    <td><Link to={`/hisse/${e.ticker}`} className="ticker-link">{e.ticker}</Link></td>
                    <td style={{ textAlign: 'center' }}><span className={signClass(e.impact)}>{e.impact > 0 ? `+${e.impact}` : e.impact}</span></td>
                    <td style={{ textAlign: 'left', fontFamily: 'var(--font-body)', whiteSpace: 'normal', color: 'var(--text-secondary)' }}>{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="panel-header">Risk payı <InfoTip text="Her hissenin sepetin toplam varyansındaki payı. Ağırlığından büyükse sepete ağırlığından fazla risk taşır." size={10} /></div>
            <div className="panel-content" style={{ flex: 'none' }}>
              {r.allocation.map(a => (
                <div key={a.ticker} className="bar-row" style={{ gridTemplateColumns: '64px 1fr 56px' }}>
                  <span className="font-mono text-gold">{a.ticker}</span>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(100, (a.risk_contribution || 0) / maxW * 100)}%` }} /></div>
                  <span className="num" style={{ textAlign: 'right' }}>{pct(a.risk_contribution)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card" style={{ borderColor: 'rgba(201, 136, 58, 0.45)' }}>
            <div className="card-eyebrow" style={{ color: 'var(--warning)' }}>Tezi bozabilecekler</div>
            <ul className="text-secondary" style={{ fontSize: 12.5, paddingLeft: 16, lineHeight: 1.7 }}>{r.risks.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        </div>
      </div>
      <p className="text-muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
        Etki puanları ve kanallar yapay zekânın değerlendirmesidir; bir değerleme modeli ya da fiyat tahmini değildir. Ağırlıklar etki puanı ve
        volatiliteye göre hesaplanır, tek hisse en fazla %20 olabilir. Risk rakamları son bir yılın günlük verisinden gelir. Yatırım tavsiyesi değildir.
      </p>
    </div>
  );
}

export default function Studio() {
  const [theses, setTheses] = useState(loadTheses);
  const [activeId, setActiveId] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [paperMsg, setPaperMsg] = useState('');

  const active = theses.find(t => t.id === activeId);

  const run = async (thesis) => {
    const t = (thesis ?? text).trim();
    if (t.length < 8 || busy) return;
    setBusy(true);
    setError('');
    setPaperMsg('');
    try {
      const r = await fetch(`${API}/studio/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thesis: t }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
      const entry = { id: String(Date.now()), title: d.title, thesis: t, result: d, at: new Date().toISOString().slice(0, 10) };
      const next = [entry, ...theses];
      setTheses(next);
      storeTheses(next);
      setActiveId(entry.id);
      setText('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toPaper = async () => {
    const alloc = active?.result?.allocation || [];
    const stocks = await fetchWithCache(`${API}/stocks`).catch(() => null);
    const prices = Object.fromEntries((stocks?.stocks || []).map(s => [s.ticker, s.price]));
    const transactions = alloc
      .filter(a => prices[a.ticker] > 0)
      .map(a => ({ ticker: a.ticker, tx_type: 'BUY', quantity: Math.floor((100000 * a.weight) / prices[a.ticker]), price: prices[a.ticker] }))
      .filter(t => t.quantity > 0);
    const r = await fetch(`${API}/portfolio/batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transactions, account: 'paper' }) });
    setPaperMsg(r.ok ? `${transactions.length} hisse tez ağırlıklarıyla kâğıt hesaba eklendi.` : 'Kâğıt hesaba eklenemedi.');
  };

  const saveBasket = async () => {
    const res = active?.result;
    if (!res?.allocation?.length) return;
    const r = await fetch(`${API}/baskets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: res.title.slice(0, 80),
        description: (res.summary || active.thesis).slice(0, 400),
        tickers: res.allocation.map(a => a.ticker),
        weights: res.allocation.map(a => a.weight),
        source: 'studio',
      }),
    });
    setPaperMsg(r.ok ? 'Sepet kaydedildi. Strateji Merkezi > Sepetleri takip et bölümünden izleyebilirsin.' : 'Sepet kaydedilemedi.');
  };

  const remove = (id) => { const next = theses.filter(t => t.id !== id); setTheses(next); storeTheses(next); if (id === activeId) setActiveId(null); };
  const filtered = useMemo(() => theses.filter(t => (t.title + t.thesis).toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr'))), [theses, query]);

  return (
    <div className="bt-layout">
      <aside className="bt-list">
        <Button variant="primary" onClick={() => { setActiveId(null); setError(''); }} style={{ width: '100%' }}><Plus size={13} /> Yeni tez</Button>
        <label className="search-trigger" style={{ width: '100%', cursor: 'text', padding: '5px 9px' }}>
          <Search size={13} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tezlerinde ara" style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 12.5, width: '100%' }} />
        </label>
        <div className="eyebrow" style={{ marginTop: 6 }}>Tezlerin</div>
        {filtered.length === 0 && <p className="text-muted" style={{ fontSize: 11.5 }}>Oluşturduğun tezler burada saklanır (bu tarayıcıda).</p>}
        {filtered.map(t => (
          <div key={t.id} className={`bt-item${t.id === activeId ? ' active-item' : ''}`} onClick={() => setActiveId(t.id)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
              <span className="bt-item-name">{t.title}</span>
              <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0 4px' }} onClick={e => { e.stopPropagation(); remove(t.id); }} aria-label="Tezi sil"><Trash2 size={11} /></button>
            </div>
            <span className="text-muted" style={{ fontSize: 10.5 }}>{t.at} · {t.result?.allocation?.length || 0} hisse</span>
          </div>
        ))}
      </aside>

      <main className="bt-main">
        {active ? (
          <>
            <div className="text-muted" style={{ fontSize: 12, marginBottom: 6 }}>Tez: "{active.thesis}" · {active.at}</div>
            <Result r={active.result} onPaper={toPaper} paperMsg={paperMsg} onSaveBasket={saveBasket} />
          </>
        ) : (
          <div style={{ maxWidth: 760, margin: '0 auto', width: '100%', paddingTop: 30 }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, margin: '0 auto 10px', display: 'grid', placeItems: 'center', borderRadius: '50%', border: '1px solid var(--gold-border)', color: 'var(--gold)' }}><Sparkles size={18} /></div>
              <h1 className="display-title" style={{ fontSize: 26 }}>Yatırım fikrin ne?</h1>
              <p className="text-secondary" style={{ fontSize: 13, marginTop: 6 }}>Geleceğe dair bir görüşü düz Türkçe yaz. Studio onu makro sürücülere, etkilenen BIST hisselerine ve ağırlıklı bir sepete çevirir; neyin neden dışarıda kaldığını da gösterir.</p>
            </div>
            <div className="card" style={{ padding: 10 }}>
              <textarea
                className="input"
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(); } }}
                placeholder="Örn. Su kıtlığı arıttığında su arıtma ve sulama teknolojilerine talep artar"
                style={{ width: '100%', minHeight: 80, border: 'none', background: 'transparent', resize: 'vertical', fontSize: 14 }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="text-muted" style={{ fontSize: 11 }}>Likit ~220 BIST hissesi taranır · Enter ile oluştur</span>
                <Button variant="primary" onClick={() => run()} disabled={text.trim().length < 8 || busy}>
                  {busy ? <><span className="spinner" /> Tez işleniyor…</> : <>Oluştur <ArrowRight size={13} /></>}
                </Button>
              </div>
            </div>
            {error && <div className="notice" style={{ marginTop: 10, borderColor: 'rgba(192, 82, 78, 0.5)', background: 'var(--negative-tint)' }}>{error}</div>}
            <div className="eyebrow" style={{ margin: '18px 0 8px' }}>Örnek tezler</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              {EXAMPLES.map(ex => (
                <button key={ex.title} type="button" className="card bt-example" onClick={() => run(ex.thesis)} disabled={busy}>
                  <div className="card-eyebrow">{ex.note}</div>
                  <div className="card-title" style={{ fontSize: 13.5 }}>{ex.title}</div>
                  <div className="card-body" style={{ fontSize: 12 }}>{ex.thesis}</div>
                  <span className="card-link">Sepeti oluştur <ArrowRight size={12} /></span>
                </button>
              ))}
            </div>
            <p className="text-muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 14 }}>
              <Chip>Yapay zekâ</Chip> Etki değerlendirmeleri yapay zekâdan gelir; ağırlıklar ve risk hesapları gerçek fiyat verisinden. Yatırım tavsiyesi değildir.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
