// Shared pieces of the technical analysis views: evidence verdicts, stages, score colours and a data hook
// that waits while the backend builds the model (HTTP 503 with a "building" status).
import React, { useEffect, useRef, useState } from 'react';
import { Chip } from '../ui';
import { fmtPct } from '../../utils/format';

export const API = import.meta.env.VITE_API_URL || '/api';

export const VERDICT = {
  guclu_pozitif: { tone: 'up', label: 'Güçlü olumlu', solid: true },
  pozitif: { tone: 'up', label: 'Olumlu' },
  notr: { tone: 'default', label: 'Kanıt yok' },
  negatif: { tone: 'down', label: 'Olumsuz' },
  guclu_negatif: { tone: 'down', label: 'Güçlü olumsuz', solid: true },
  veri_yok: { tone: 'default', label: 'Yetersiz örnek' },
};

export function VerdictChip({ verdict, children }) {
  const v = VERDICT[verdict] || VERDICT.veri_yok;
  return <Chip tone={v.tone} solid={v.solid}>{children || v.label}</Chip>;
}

export const STAGE = {
  1: { label: '1. evre', long: 'Taban (yatay, düşüş sonrası)', tone: 'default' },
  2: { label: '2. evre', long: 'Yükseliş', tone: 'up' },
  3: { label: '3. evre', long: 'Tepe (yatay, yükseliş sonrası)', tone: 'warn' },
  4: { label: '4. evre', long: 'Düşüş', tone: 'down' },
};

export function StageChip({ stage, long = false }) {
  const s = STAGE[stage];
  if (!s) return <span className="text-muted">—</span>;
  return <Chip tone={s.tone}>{long ? `${s.label} · ${s.long}` : s.label}</Chip>;
}

export const scoreColor = (s) => (s == null ? 'var(--text-tertiary)' : s >= 90 ? 'var(--positive)' : s >= 70 ? 'var(--gold)' : s >= 30 ? 'var(--text-secondary)' : 'var(--negative)');

export function ScoreBar({ score, width = 64 }) {
  if (score == null) return <span className="text-muted">—</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width, height: 4, borderRadius: 2, background: 'var(--bg-elevated)', overflow: 'hidden', display: 'inline-block' }}>
        <span style={{ display: 'block', width: `${Math.max(2, score)}%`, height: '100%', background: scoreColor(score) }} />
      </span>
      <span className="num" style={{ color: scoreColor(score), minWidth: 26, textAlign: 'right' }}>{Math.round(score)}</span>
    </span>
  );
}

/** Excess return in percentage points (input is a fraction), e.g. 0.0123 -> "+1,23 puan". */
export const pts = (v, d = 2) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '-' : ''}${Math.abs(v * 100).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d })} puan`);
export const pct = (v, d = 1, sign = true) => (v == null ? '—' : fmtPct(v * 100, d, { sign }));

/** Fetches JSON; while the model is building (503) it retries every 8 s and exposes the build status. */
export function useTaData(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [building, setBuilding] = useState(null);
  const timer = useRef(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch(`${API}${path}`)
        .then(async r => {
          const body = await r.json().catch(() => ({}));
          if (r.status === 503) {
            if (!alive) return;
            setBuilding(body.detail || {});
            timer.current = setTimeout(load, 8000);
            return;
          }
          if (!r.ok) throw new Error(typeof body.detail === 'string' ? body.detail : `HTTP ${r.status}`);
          if (alive) { setData(body); setBuilding(null); }
        })
        .catch(e => alive && setError(e.message));
    };
    setData(null); setError('');
    load();
    return () => { alive = false; clearTimeout(timer.current); };
  }, [path]);
  return { data, error, building };
}

export function BuildingNotice({ building }) {
  return (
    <div className="notice" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <span className="spinner" />
      <span>
        Teknik analiz modeli hazırlanıyor{building?.building_for ? ` (${building.building_for} sn)` : ''}. Tüm BIST fiyat geçmişi
        işleniyor ve model yıllara göre yeniden eğitiliyor; bu yaklaşık bir dakika sürer, sayfa kendiliğinden yenilenecek.
      </span>
    </div>
  );
}
