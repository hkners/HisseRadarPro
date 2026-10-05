import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

// Polls unseen alert events every minute; shows a count, a short list and, when the user allowed it,
// a browser notification for events that arrived since the last poll.
export default function AlertBell() {
  const [state, setState] = useState({ unseen: 0, events: [] });
  const [open, setOpen] = useState(false);
  const lastId = useRef(null);
  const ref = useRef(null);

  useEffect(() => {
    let alive = true;
    const poll = () => fetch(`${API}/alerts/events/list?unseen_only=true&limit=8`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!alive || !d) return;
        const newest = d.events[0]?.id ?? null;
        if (lastId.current != null && newest != null && newest > lastId.current && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          d.events.filter(e => e.id > lastId.current).slice(0, 3).forEach(e => new Notification(`HisseRadar · ${e.ticker}`, { body: e.message }));
        }
        if (newest != null) lastId.current = Math.max(lastId.current ?? 0, newest);
        setState(d);
      })
      .catch(() => {});
    poll();
    const id = setInterval(poll, 60000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const markSeen = () => fetch(`${API}/alerts/events/seen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    .then(() => setState({ unseen: 0, events: [] })).catch(() => {});

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(o => !o)} aria-label="Bildirimler" title="Alarm bildirimleri" style={{ position: 'relative' }}>
        <Bell size={15} />
        {state.unseen > 0 && (
          <span style={{ position: 'absolute', top: 1, right: 1, minWidth: 15, height: 15, borderRadius: 8, background: 'var(--gold)', color: '#000', fontSize: 9.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
            {state.unseen > 99 ? '99+' : state.unseen}
          </span>
        )}
      </button>
      {open && (
        <div className="card" style={{ position: 'absolute', right: 0, top: 34, width: 340, zIndex: 50, padding: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span className="card-eyebrow" style={{ margin: 0 }}>Bildirimler</span>
            {state.unseen > 0 && <button type="button" className="btn btn-sm btn-ghost" onClick={markSeen}>Okundu say</button>}
          </div>
          {state.events.length === 0 && <p className="text-muted" style={{ fontSize: 12 }}>Yeni bildirim yok.</p>}
          {state.events.map(e => (
            <Link key={e.id} to={`/hisse/${e.ticker}`} onClick={() => setOpen(false)} style={{ display: 'block', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 12, color: 'var(--text-secondary)' }}>
              <span className="text-muted" style={{ fontSize: 10.5 }}>{e.triggered_at.replace('T', ' ').slice(5, 16)}</span> {e.message}
            </Link>
          ))}
          <Link to="/alarms" onClick={() => setOpen(false)} className="text-gold" style={{ fontSize: 11.5, display: 'inline-block', marginTop: 8 }}>Alarmları yönet</Link>
        </div>
      )}
    </div>
  );
}
