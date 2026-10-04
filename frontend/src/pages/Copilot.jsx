import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { ArrowUp, Mic, MicOff, Plus, Search, Trash2, MessageSquare } from 'lucide-react';
import { Button } from '../components/ui';
import { fmtNum, fmtPct, signClass } from '../utils/format';

const API = import.meta.env.VITE_API_URL || '/api';
const CHATS_KEY = 'hr.copilot.chats';

const STARTERS = [
  'En çok hangi sektöre maruzum?',
  'Portföyümde riskin en büyük kaynağı hangi hisse?',
  'Pozisyonlarımdan hangisinin kurum hedefine göre potansiyeli en yüksek?',
  'Tek bir hisseye fazla mı ağırlık vermişim?',
];
const CHIPS = [
  { label: 'Fiyat', text: 'THYAO şu an nerede? Fiyat, kurum hedefi ve teknik görünüm' },
  { label: 'Neden', text: 'ASELS son bir ayda neden bu kadar hareket etti?' },
  { label: 'Karşılaştır', text: 'AKBNK ile GARAN son bir yılda nasıl karşılaştırılır?' },
  { label: 'Portföy', text: 'Portföyümün en büyük riski ne?' },
  { label: 'Tez', text: 'Faizler düşerse portföyüm nasıl etkilenir?' },
  { label: 'Strateji', text: 'BIST\'te momentum stratejisi işe yarıyor mu?' },
];
const USED_LINK = {
  stock: u => ({ to: `/hisse/${u.ticker}`, label: `${u.ticker} verileri` }),
  portfolio: () => ({ to: '/analytics', label: 'Portföy riski' }),
  macro: () => ({ to: '/macro', label: 'Piyasa göstergeleri' }),
  compare: u => ({ to: `/compare?t=${(u.tickers || []).join(',')}&d=365`, label: 'Karşılaştırma' }),
  strategy: () => ({ to: '/backtest', label: 'Backtest' }),
};

const loadChats = () => { try { return JSON.parse(localStorage.getItem(CHATS_KEY)) || []; } catch { return []; } };
const storeChats = (c) => { try { localStorage.setItem(CHATS_KEY, JSON.stringify(c.slice(0, 50))); } catch { /* storage unavailable */ } };
const SpeechRec = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

function AssistantMessage({ m, onAsk }) {
  return (
    <div className="cp-msg cp-assistant">
      <div className="markdown-body" style={{ fontSize: 13.5 }}><ReactMarkdown>{m.content}</ReactMarkdown></div>
      {m.tickers?.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {m.tickers.map(t => (
            <Link key={t.ticker} to={`/hisse/${t.ticker}`} className="cp-card">
              <span className="font-mono text-gold" style={{ fontWeight: 600 }}>{t.ticker}</span>
              <span className="num" style={{ color: 'var(--text-primary)' }}>{fmtNum(t.price)}</span>
              <span className={`num ${signClass(t.change_pct)}`}>{fmtPct(t.change_pct, 2)}</span>
              {t.upside != null && <span className="text-muted" style={{ fontSize: 11 }}>hedef <span className={signClass(t.upside)}>{fmtPct(t.upside)}</span></span>}
              {t.score != null && <span className="text-muted" style={{ fontSize: 11 }}>skor {t.score}</span>}
            </Link>
          ))}
        </div>
      )}
      {m.used?.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          <span className="eyebrow">Kullanılan veri</span>
          {m.used.map((u, i) => {
            const l = USED_LINK[u.type]?.(u);
            return l ? <Link key={i} to={l.to} className="chip chip-gold" style={{ textDecoration: 'none' }}>{l.label}</Link> : null;
          })}
        </div>
      )}
      {m.follow_ups?.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {m.follow_ups.map(f => <button key={f} type="button" className="count-chip" onClick={() => onAsk(f)}>{f}</button>)}
        </div>
      )}
    </div>
  );
}

export default function Copilot() {
  const [chats, setChats] = useState(loadChats);
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  const active = chats.find(c => c.id === activeId) || null;
  const messages = active?.messages || [];

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, busy]);

  const saveChats = (next) => { setChats(next); storeChats(next); };

  const ask = async (text) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput('');
    const userMsg = { role: 'user', content: q };
    let chat = active;
    let next;
    if (!chat) {
      chat = { id: String(Date.now()), title: q.slice(0, 60), messages: [userMsg], at: new Date().toISOString() };
      next = [chat, ...chats];
      setActiveId(chat.id);
    } else {
      chat = { ...chat, messages: [...chat.messages, userMsg], at: new Date().toISOString() };
      next = [chat, ...chats.filter(c => c.id !== chat.id)];
    }
    saveChats(next);
    setBusy(true);
    try {
      const r = await fetch(`${API}/copilot/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chat.messages.map(({ role, content }) => ({ role, content })) }),
      });
      const d = await r.json();
      const reply = r.ok
        ? { role: 'assistant', content: d.answer, follow_ups: d.follow_ups, used: d.used, tickers: d.tickers }
        : { role: 'assistant', content: d.detail || 'Cevap alınamadı.' };
      const updated = { ...chat, messages: [...chat.messages, reply] };
      saveChats([updated, ...next.filter(c => c.id !== chat.id)]);
    } catch {
      const updated = { ...chat, messages: [...chat.messages, { role: 'assistant', content: 'Sunucuya ulaşılamadı. Backend çalışıyor mu?' }] };
      saveChats([updated, ...next.filter(c => c.id !== chat.id)]);
    } finally {
      setBusy(false);
    }
  };

  const toggleMic = () => {
    if (!SpeechRec) return;
    if (listening) { recRef.current?.stop(); return; }
    const rec = new SpeechRec();
    rec.lang = 'tr-TR';
    rec.interimResults = true;
    rec.onresult = (e) => setInput(Array.from(e.results).map(r => r[0].transcript).join(' '));
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const removeChat = (id) => { saveChats(chats.filter(c => c.id !== id)); if (id === activeId) setActiveId(null); };
  const filtered = useMemo(() => chats.filter(c => c.title.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr'))), [chats, query]);

  return (
    <div className="bt-layout">
      <aside className="bt-list">
        <Button variant="primary" onClick={() => { setActiveId(null); inputRef.current?.focus(); }} style={{ width: '100%' }}><Plus size={13} /> Yeni sohbet</Button>
        <label className="search-trigger" style={{ width: '100%', cursor: 'text', padding: '5px 9px' }}>
          <Search size={13} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Sohbetlerde ara" style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 12.5, width: '100%' }} />
        </label>
        <div className="eyebrow" style={{ marginTop: 6 }}>Son sohbetler</div>
        {filtered.length === 0 && <p className="text-muted" style={{ fontSize: 11.5 }}>Henüz sohbet yok. Bir soru sorarak başla; sohbetler bu tarayıcıda saklanır.</p>}
        {filtered.map(c => (
          <div key={c.id} className={`bt-item${c.id === activeId ? ' active-item' : ''}`} onClick={() => setActiveId(c.id)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
              <span className="bt-item-name">{c.title}</span>
              <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0 4px' }} onClick={e => { e.stopPropagation(); removeChat(c.id); }} aria-label="Sohbeti sil"><Trash2 size={11} /></button>
            </div>
            <span className="text-muted" style={{ fontSize: 10.5 }}>{c.at?.slice(0, 10)} · {c.messages.length} mesaj</span>
          </div>
        ))}
      </aside>

      <main className="cp-main">
        <div className="cp-thread">
          {messages.length === 0 && (
            <div style={{ maxWidth: 640, margin: 'auto', textAlign: 'center', padding: '40px 0' }}>
              <div style={{ width: 40, height: 40, margin: '0 auto 10px', display: 'grid', placeItems: 'center', borderRadius: '50%', border: '1px solid var(--gold-border)', color: 'var(--gold)' }}><MessageSquare size={18} /></div>
              <h1 className="display-title" style={{ fontSize: 22 }}>Portföyün ya da herhangi bir hisse hakkında sor</h1>
              <p className="text-secondary" style={{ fontSize: 12.5, margin: '6px 0 16px' }}>Cevaplar uygulamanın kendi verisinden yazılır: portföyün, kurum raporları, fiyatlar ve piyasa göstergeleri.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {STARTERS.map(s => <button key={s} type="button" className="card bt-example" style={{ padding: '10px 14px' }} onClick={() => ask(s)}>{s}</button>)}
              </div>
            </div>
          )}
          {messages.map((m, i) => (m.role === 'user'
            ? <div key={i} className="cp-msg cp-user">{m.content}</div>
            : <AssistantMessage key={i} m={m} onAsk={ask} />))}
          {busy && <div className="cp-msg cp-assistant text-muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="spinner" /> Veriler toplanıyor ve cevap yazılıyor…</div>}
          <div ref={endRef} />
        </div>

        <div className="cp-composer">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            {CHIPS.map(c => <button key={c.label} type="button" className="count-chip" onClick={() => { setInput(c.text); inputRef.current?.focus(); }}>{c.label}</button>)}
          </div>
          <div className="card" style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: 8 }}>
            <textarea
              ref={inputRef}
              className="input"
              rows={2}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
              placeholder="Portföyün veya bir hisse hakkında sor…"
              style={{ flex: 1, border: 'none', background: 'transparent', resize: 'none', fontSize: 13.5 }}
            />
            {SpeechRec && (
              <Button variant="ghost" size="sm" onClick={toggleMic} title={listening ? 'Dinlemeyi durdur' : 'Sesle sor'} aria-label="Sesle sor">
                {listening ? <MicOff size={15} style={{ color: 'var(--negative)' }} /> : <Mic size={15} />}
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={() => ask()} disabled={!input.trim() || busy} aria-label="Gönder"><ArrowUp size={14} /></Button>
          </div>
          <div className="text-muted" style={{ fontSize: 10.5, marginTop: 4 }}>Enter gönderir · Shift+Enter yeni satır{SpeechRec ? ' · mikrofonla sesli sorabilirsin' : ''} · Yatırım tavsiyesi değildir.</div>
        </div>
      </main>
    </div>
  );
}
