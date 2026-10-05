import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trash2, Plus } from 'lucide-react';
import PageContainer from '../components/common/PageContainer';
import { Button, Chip } from '../components/ui';
import { API, VERDICT } from '../components/ta/common';

const SCOPES = [
  { id: 'ticker', label: 'Tek hisse' },
  { id: 'PORTFOY', label: 'Portföyümdeki hisseler' },
  { id: '*', label: 'Tüm likit hisseler' },
];
const KIND_SCOPES = {
  price_above: ['ticker'], price_below: ['ticker'],
  change_above: ['ticker', 'PORTFOY'], change_below: ['ticker', 'PORTFOY'],
  score_above: ['ticker', 'PORTFOY'], score_below: ['ticker', 'PORTFOY'],
  decision: ['ticker', 'PORTFOY', '*'], signal: ['ticker', 'PORTFOY', '*'], portfolio_stop: ['PORTFOY'],
};
const PARAM = {
  price_above: { key: 'level', label: 'Fiyat (TL)' }, price_below: { key: 'level', label: 'Fiyat (TL)' },
  change_above: { key: 'pct', label: 'Günlük değişim (%)' }, change_below: { key: 'pct', label: 'Günlük değişim (%)' },
  score_above: { key: 'level', label: 'Skor (0-100)' }, score_below: { key: 'level', label: 'Skor (0-100)' },
};
const DECISIONS = ['GÜÇLÜ AL', 'KADEMELİ AL', 'BEKLE / İZLE', 'RİSKLİ / SAT'];

const describe = (a, kinds, signals) => {
  const scope = a.ticker === 'PORTFOY' ? 'Portföy' : a.ticker === '*' ? 'Tüm likit hisseler' : a.ticker;
  const p = a.params || {};
  let what = kinds[a.kind] || a.kind;
  if (p.level != null) what += ` ${p.level.toLocaleString('tr-TR')}`;
  if (p.pct != null) what += ` %${p.pct.toLocaleString('tr-TR')}`;
  if (p.decision) what += `: ${p.decision}`;
  if (p.signal) what += `: ${signals[p.signal]?.label || p.signal}`;
  return `${scope} · ${what}`;
};

function requestBrowserNotifications(setPerm) {
  if (!('Notification' in window)) return;
  Notification.requestPermission().then(setPerm);
}

export default function Alerts() {
  const [params] = useSearchParams();
  const [alerts, setAlerts] = useState([]);
  const [kinds, setKinds] = useState({});
  const [events, setEvents] = useState([]);
  const [signals, setSignals] = useState({});
  const [scope, setScope] = useState('ticker');
  const [ticker, setTicker] = useState((params.get('ticker') || '').toUpperCase());
  const [kind, setKind] = useState('price_below');
  const [value, setValue] = useState('');
  const [decision, setDecision] = useState('GÜÇLÜ AL');
  const [signal, setSignal] = useState('hi52_breakout');
  const [repeat, setRepeat] = useState(false);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');

  const load = () => {
    fetch(`${API}/alerts`).then(r => r.json()).then(d => { setAlerts(d.alerts || []); setKinds(d.kinds || {}); }).catch(() => {});
    fetch(`${API}/alerts/events/list?limit=100`).then(r => r.json()).then(d => setEvents(d.events || [])).catch(() => {});
  };
  useEffect(() => {
    load();
    fetch(`${API}/ta/screener`).then(r => (r.ok ? r.json() : null)).then(d => d && setSignals(d.signals)).catch(() => {});
    fetch(`${API}/alerts/events/seen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
  }, []);

  const kindOptions = useMemo(() => Object.entries(kinds).filter(([k]) => KIND_SCOPES[k]?.includes(scope)), [kinds, scope]);
  useEffect(() => {
    if (kindOptions.length && !kindOptions.some(([k]) => k === kind)) setKind(kindOptions[0][0]);
  }, [kindOptions, kind]);

  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    const p = PARAM[kind] ? { [PARAM[kind].key]: Number(String(value).replace(',', '.')) } : kind === 'decision' ? { decision } : kind === 'signal' ? { signal } : {};
    const r = await fetch(`${API}/alerts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker: scope === 'ticker' ? ticker : scope, kind, params: p, note, repeat }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(typeof d.detail === 'string' ? d.detail : 'Alarm kurulamadı.'); return; }
    setMsg('Alarm kuruldu.'); setValue(''); setNote('');
    load();
  };
  const remove = async (id) => { await fetch(`${API}/alerts/${id}`, { method: 'DELETE' }); load(); };
  const toggle = async (a) => {
    await fetch(`${API}/alerts/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !a.active }) });
    load();
  };
  const signalOptions = Object.entries(signals).sort((a, b) => a[1].label.localeCompare(b[1].label, 'tr'));

  return (
    <PageContainer title="Alarmlar" subtitle="Fiyat, skor, karar ve teknik sinyal alarmları. Fiyat alarmları dakikada bir, sinyal alarmları her yeni seans verisiyle kontrol edilir." scrollable
      headerRight={perm !== 'granted' && perm !== 'unsupported' && <Button size="sm" onClick={() => requestBrowserNotifications(setPerm)}>Tarayıcı bildirimlerini aç</Button>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 380px) minmax(0, 1fr)', gap: 12, paddingBottom: 16 }}>
        <form className="card" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10, alignSelf: 'start' }}>
          <div className="card-eyebrow">Yeni alarm</div>
          <label className="filter-field"><span className="eyebrow">Kapsam</span>
            <select className="input" value={scope} onChange={e => setScope(e.target.value)}>
              {SCOPES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          {scope === 'ticker' && (
            <label className="filter-field"><span className="eyebrow">Hisse</span>
              <input className="input" value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="ASELS" required />
            </label>
          )}
          <label className="filter-field"><span className="eyebrow">Koşul</span>
            <select className="input" value={kind} onChange={e => setKind(e.target.value)}>
              {kindOptions.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
          {PARAM[kind] && (
            <label className="filter-field"><span className="eyebrow">{PARAM[kind].label}</span>
              <input className="input" value={value} onChange={e => setValue(e.target.value)} inputMode="decimal" required />
            </label>
          )}
          {kind === 'decision' && (
            <label className="filter-field"><span className="eyebrow">Karar</span>
              <select className="input" value={decision} onChange={e => setDecision(e.target.value)}>{DECISIONS.map(d => <option key={d}>{d}</option>)}</select>
            </label>
          )}
          {kind === 'signal' && (
            <label className="filter-field"><span className="eyebrow">Sinyal</span>
              <select className="input" value={signal} onChange={e => setSignal(e.target.value)}>
                {signalOptions.map(([k, s]) => <option key={k} value={k}>{s.label} · {VERDICT[s.verdict]?.label}</option>)}
              </select>
            </label>
          )}
          {kind === 'portfolio_stop' && <p className="text-muted" style={{ fontSize: 11.5 }}>Portföydeki bir hisse, teknik analizdeki önerilen stop seviyesinin altına inerse haber verir.</p>}
          <label className="filter-field"><span className="eyebrow">Not (isteğe bağlı)</span>
            <input className="input" value={note} onChange={e => setNote(e.target.value)} maxLength={200} />
          </label>
          {scope === 'ticker' && (
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}>
              <input type="checkbox" checked={repeat} onChange={e => setRepeat(e.target.checked)} /> Tekrarla (günde en fazla bir kez)
            </label>
          )}
          {scope !== 'ticker' && <p className="text-muted" style={{ fontSize: 11 }}>Çoklu hisse alarmları her hisse için günde en fazla bir kez tetiklenir.</p>}
          <Button variant="primary" type="submit"><Plus size={13} /> Alarmı kur</Button>
          {msg && <span className={msg.includes('kuruldu') ? 'text-up' : 'text-down'} style={{ fontSize: 12 }}>{msg}</span>}
        </form>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="panel-header">Kurulu alarmlar ({alerts.length})</div>
            <div className="panel-content" style={{ padding: 0, flex: 'none' }}>
              <table className="data-table compact">
                <thead><tr><th style={{ textAlign: 'left' }}>Alarm</th><th>Tür</th><th>Son tetiklenme</th><th>Durum</th><th /></tr></thead>
                <tbody>
                  {alerts.map(a => (
                    <tr key={a.id}>
                      <td style={{ textAlign: 'left' }}>{describe(a, kinds, signals)}{a.note && <div className="text-muted" style={{ fontSize: 10.5 }}>{a.note}</div>}</td>
                      <td>{a.repeat ? 'Tekrarlı' : 'Tek sefer'}</td>
                      <td>{a.last_triggered ? a.last_triggered.replace('T', ' ').slice(0, 16) : '—'}</td>
                      <td><button type="button" className="btn btn-sm btn-ghost" onClick={() => toggle(a)}>{a.active ? <Chip tone="up">Açık</Chip> : <Chip>Kapalı</Chip>}</button></td>
                      <td><button type="button" className="btn btn-sm btn-ghost" onClick={() => remove(a.id)} aria-label="Sil"><Trash2 size={13} /></button></td>
                    </tr>
                  ))}
                  {alerts.length === 0 && <tr><td colSpan={5} className="text-muted" style={{ textAlign: 'center', padding: 18 }}>Henüz alarm yok.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="panel-header">Bildirimler</div>
            <div className="panel-content" style={{ padding: 0, flex: 'none' }}>
              <table className="data-table compact">
                <thead><tr><th style={{ textAlign: 'left' }}>Zaman</th><th style={{ textAlign: 'left' }}>Hisse</th><th style={{ textAlign: 'left' }}>Mesaj</th></tr></thead>
                <tbody>
                  {events.map(e => (
                    <tr key={e.id}>
                      <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{e.triggered_at.replace('T', ' ').slice(0, 16)}</td>
                      <td style={{ textAlign: 'left' }}><Link to={`/hisse/${e.ticker}`} className="ticker-link">{e.ticker}</Link></td>
                      <td style={{ textAlign: 'left', fontFamily: 'var(--font-body)', whiteSpace: 'normal' }}>{e.message}</td>
                    </tr>
                  ))}
                  {events.length === 0 && <tr><td colSpan={3} className="text-muted" style={{ textAlign: 'center', padding: 18 }}>Henüz bildirim yok.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
