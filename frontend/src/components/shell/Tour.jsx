import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { tourForPath, TOUR_EVENT } from './tours';

const SEEN_KEY = 'hr.tour.seen';
const OFF_KEY = 'hr.tour.disabled';

const readSeen = () => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY)) || []); } catch { return new Set(); } };
const markSeen = (id) => { try { const s = readSeen(); s.add(id); localStorage.setItem(SEEN_KEY, JSON.stringify([...s])); } catch { /* storage unavailable */ } };
const isDisabled = () => { try { return localStorage.getItem(OFF_KEY) === '1'; } catch { return false; } };

/** First-visit page tour: a small step card in the bottom-left corner, optionally outlining one element. */
export default function Tour() {
  const { pathname } = useLocation();
  const [tour, setTour] = useState(null);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);

  // Auto-start once per page type, a moment after the page has rendered.
  useEffect(() => {
    setTour(null);
    const t = tourForPath(pathname);
    if (!t || isDisabled() || readSeen().has(t.id)) return undefined;
    const timer = setTimeout(() => { setStep(0); setTour(t); }, 700);
    return () => clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    const onStart = () => {
      const t = tourForPath(window.location.pathname);
      if (t) { setStep(0); setTour(t); }
    };
    window.addEventListener(TOUR_EVENT, onStart);
    return () => window.removeEventListener(TOUR_EVENT, onStart);
  }, []);

  const current = tour?.steps[step];

  // Keep the highlight ring on the target while it moves (scroll, resize, late renders).
  useEffect(() => {
    if (!current?.target) { setRect(null); return undefined; }
    let frame;
    const track = () => {
      const el = document.querySelector(current.target);
      const r = el?.getBoundingClientRect();
      setRect(prev => {
        if (!r || r.width === 0) return null;
        if (prev && prev.top === r.top && prev.left === r.left && prev.width === r.width && prev.height === r.height) return prev;
        return { top: r.top, left: r.left, width: r.width, height: r.height };
      });
      frame = requestAnimationFrame(track);
    };
    track();
    return () => cancelAnimationFrame(frame);
  }, [current]);

  const close = useCallback(() => {
    if (tour) markSeen(tour.id);
    setTour(null);
  }, [tour]);

  const disableAll = () => {
    try { localStorage.setItem(OFF_KEY, '1'); } catch { /* storage unavailable */ }
    close();
  };

  useEffect(() => {
    if (!tour) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight' && step < tour.steps.length - 1) setStep(s => s + 1);
      if (e.key === 'ArrowLeft' && step > 0) setStep(s => s - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tour, step, close]);

  if (!tour || !current) return null;
  const last = step === tour.steps.length - 1;

  return (
    <>
      {rect && (
        <div
          className="tour-ring"
          style={{ top: rect.top - 5, left: rect.left - 5, width: rect.width + 10, height: rect.height + 10 }}
          aria-hidden="true"
        />
      )}
      <div className="tour-card" role="dialog" aria-label="Sayfa tanıtımı">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="eyebrow" style={{ color: 'var(--gold)' }}>Tanıtım · {step + 1} / {tour.steps.length}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={close} aria-label="Turu kapat"><X size={13} /></button>
        </div>
        <div className="tour-title">{current.title}</div>
        <p className="tour-body">{current.body}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={close}>Atla</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={disableAll}>Bir daha gösterme</button>
          <span style={{ flex: 1 }} />
          {step > 0 && <button type="button" className="btn btn-sm" onClick={() => setStep(s => s - 1)}>Geri</button>}
          <button type="button" className="btn btn-primary btn-sm" onClick={() => (last ? close() : setStep(s => s + 1))}>
            {last ? 'Bitir' : 'İleri'}
          </button>
        </div>
      </div>
    </>
  );
}
