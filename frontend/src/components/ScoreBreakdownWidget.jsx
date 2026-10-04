import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

const getPillarColor = (percentage) => {
  if (percentage >= 75) return 'var(--positive)';
  if (percentage >= 50) return 'var(--gold)';
  if (percentage >= 35) return 'var(--warning)';
  if (percentage >= 20) return '#ff7700';
  return 'var(--negative)';
};

export default function ScoreBreakdownWidget({ 
  ticker, 
  initialData, 
  compact = false, 
  showCockpitLink = true 
}) {
  const [data, setData] = useState(initialData || null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ticker) return;
    let isMounted = true;
    const apiBase = import.meta.env.VITE_API_URL || '/api';
    
    fetch(`${apiBase}/stocks/${ticker}/score-breakdown`)
      .then(res => {
        if (!res.ok) throw new Error('Skor dökümü alınamadı');
        return res.json();
      })
      .then(json => {
        if (isMounted) {
          setData(json);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => { isMounted = false; };
  }, [ticker]);

  if (loading) {
    return (
      <div style={{ padding: compact ? '6px' : '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>
        <div className="skeleton-bar" style={{ width: '100%', height: '16px', marginBottom: '6px' }} />
        <div className="skeleton-bar" style={{ width: '80%', height: '12px', margin: '0 auto' }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: '6px', color: 'var(--color-down)', fontSize: '11px' }}>
        Bileşen verisi yüklenemedi: {error || 'Bilinmeyen hata'}
      </div>
    );
  }

  const { score, raw_score, decision, decision_color, components, disagreement } = data;

  return (
    <div style={{
      background: compact ? 'rgba(18, 18, 20, 0.85)' : 'var(--bg-secondary)',
      border: '1px solid var(--border-color)',
      borderRadius: '5px',
      padding: compact ? '8px 10px' : '14px 18px',
      boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      width: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box',
      overflowX: 'hidden'
    }}>
      {/* ─── HEADER: Title & Score Badge ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: compact ? '11px' : '13px', fontWeight: 'bold', color: 'var(--text-highlight)', letterSpacing: '0.3px' }}>
            KARAR SKORU DÖKÜMÜ
          </span>
          <span style={{
            background: decision_color || 'var(--warning)',
            color: ['var(--negative)', 'var(--negative)', 'var(--negative)', 'var(--negative)'].includes(decision_color) ? 'var(--text-primary)' : '#000',
            fontSize: '9.5px',
            fontWeight: '900',
            padding: '1px 6px',
            borderRadius: '3px',
            letterSpacing: '0.2px',
            whiteSpace: 'nowrap'
          }}>
            {decision} ({score}p)
          </span>
          {raw_score !== undefined && (
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              Ham: {raw_score.toFixed(1)}/100
            </span>
          )}
        </div>

        {compact && showCockpitLink && (
          <Link to={`/hisse/${ticker}`} className="action-button" style={{ padding: '2px 6px', fontSize: '9.5px' }}>
            Kokpit ↗
          </Link>
        )}
      </div>

      {/* ─── DISAGREEMENT ALERT BANNER ─── */}
      {disagreement?.is_disagreeing && (
        <div style={{
          background: 'rgba(201, 136, 58, 0.12)',
          border: '1px solid rgba(201, 136, 58, 0.45)',
          borderRadius: '4px',
          padding: '5px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '10px',
          lineHeight: 1.3
        }}>
          <span style={{ fontSize: '12px', flexShrink: 0 }}><AlertTriangle size={12} /></span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
            <span style={{ fontWeight: 'bold', color: 'var(--warning)' }}>
              İki Motor Farklı Görüşte
            </span>
            <span style={{ color: 'var(--text-primary)', fontSize: '9px', wordBreak: 'break-word' }}>
              {disagreement.reason}
            </span>
          </div>
        </div>
      )}

      {/* ─── 5 PILLARS HORIZONTAL PROGRESS BARS ─── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: compact ? '6px' : '9px',
        width: '100%'
      }}>
        {components.map((comp) => {
          const color = getPillarColor(comp.percentage);
          const isNegative = comp.points < 0;
          return (
            <div key={comp.key} style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '10px', minWidth: 0 }}>
                <span style={{ color: 'var(--text-primary)', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={comp.name}>
                  {comp.name}
                </span>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'baseline', flexShrink: 0 }}>
                  <span style={{ color: isNegative ? 'var(--color-down)' : color, fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>
                    {comp.points > 0 ? `+${comp.points.toFixed(1)}` : comp.points.toFixed(1)} pt
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '8.5px' }}>
                    /{comp.max_points}
                  </span>
                </div>
              </div>

              {/* Progress Track */}
              <div style={{
                width: '100%',
                height: '5px',
                background: 'rgba(255, 255, 255, 0.08)',
                borderRadius: '3px',
                overflow: 'hidden',
                position: 'relative'
              }}>
                <div style={{
                  width: `${Math.min(100, Math.max(0, comp.percentage))}%`,
                  height: '100%',
                  background: isNegative 
                    ? 'linear-gradient(90deg, var(--negative), #ff0055)' 
                    : `linear-gradient(90deg, ${color}88, ${color})`,
                  borderRadius: '3px',
                  transition: 'width 0.4s ease'
                }} />
              </div>

              {/* Detail label */}
              <div style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', gap: '4px', minWidth: 0 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={comp.details}>
                  {comp.details}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  %{comp.percentage.toFixed(0)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── FOOTER BREAKDOWN SUMMATION ─── */}
      <div style={{
        borderTop: '1px solid var(--border-color)',
        paddingTop: '5px',
        fontSize: '9px',
        color: 'var(--text-muted)',
        lineHeight: 1.4,
        wordBreak: 'break-word'
      }}>
        <div>
          <span style={{ fontWeight: 'bold', color: 'var(--text-highlight)' }}>Formül: </span>
          +2.0 + {components.map(c => (c.points > 0 ? `+${c.points.toFixed(1)}` : `${c.points.toFixed(1)}`)).join(' ')} = <strong style={{ color: 'var(--text-primary)' }}>{raw_score?.toFixed(1)} pt</strong> → <strong style={{ color: decision_color }}>{score}p</strong>
        </div>
      </div>
    </div>
  );
}
