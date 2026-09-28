import React from 'react';
import { Link } from 'react-router-dom';
import ImageWithFallback from './ImageWithFallback';
import FavoriteStar from './common/FavoriteStar';

export default function ConvictionBuyCard({ stock, onOpenDetail }) {
  if (!stock) return null;

  const {
    ticker,
    company_name,
    price,
    change_pct,
    score,
    decision,
    color,
    consensus_target,
    upside_pct,
    entry_zone,
    stop_loss,
    stop_loss_pct,
    risk_reward,
    broker_count,
    model_count,
    drivers = [],
    risk_statement
  } = stock;

  return (
    <div 
      className="panel"
      style={{
        border: `1px solid ${color ? color : 'var(--border-color)'}`,
        borderRadius: '6px',
        padding: '10px 12px',
        background: 'var(--bg-panel)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '190px',
        gap: '6px'
      }}
    >
      {/* Top Header */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
            <FavoriteStar ticker={ticker} style={{ fontSize: '14px', flexShrink: 0 }} />
            <ImageWithFallback
              src={`${import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://127.0.0.1:8015'}/logos/${ticker}.png`}
              alt={ticker}
              fallbackName={ticker}
              size={22}
              style={{ width: '22px', height: '22px', borderRadius: '3px', background: '#fff', objectFit: 'contain', padding: '1px', flexShrink: 0 }}
            />
            <Link to={`/hisse/${ticker}`} style={{ fontSize: '14px', fontWeight: '800', color: '#fff', textDecoration: 'none', flexShrink: 0 }}>
              {ticker}
            </Link>
            {model_count > 0 && (
              <span style={{ fontSize: '9px', background: 'rgba(210, 153, 34, 0.15)', color: 'var(--color-warning)', border: '1px solid rgba(210, 153, 34, 0.3)', padding: '0 4px', borderRadius: '3px', fontWeight: 'bold', flexShrink: 0 }}>
                M({model_count})
              </span>
            )}
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={company_name}>
              {company_name}
            </span>
          </div>

          {/* Decision & Score Badge & Quick Detail Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            <span style={{ 
              background: color || 'var(--color-up)', 
              color: ['#ff3366', '#ef4444', '#dc2626', '#f85149'].includes(color) ? '#ffffff' : '#000000', 
              fontSize: '9.5px', 
              fontWeight: '800', 
              padding: '1px 5px', 
              borderRadius: '3px',
              display: 'inline-block'
            }}>
              {decision}
            </span>
            <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              <strong style={{ color: '#fff' }}>{Math.round(score)}</strong>p
            </span>
            <button
              onClick={() => onOpenDetail?.(stock)}
              style={{
                background: 'rgba(57, 197, 207, 0.15)',
                border: '1px solid rgba(57, 197, 207, 0.35)',
                color: 'var(--color-cyan)',
                fontSize: '9px',
                fontWeight: 'bold',
                padding: '1px 5px',
                borderRadius: '3px',
                cursor: 'pointer',
                marginLeft: '2px'
              }}
              title="Tüm gerekçeleri ve risk detayını göster"
            >
              🔍 Detay
            </button>
          </div>
        </div>

        {/* 4-Column Key Metrics Strip */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', 
          gap: '4px', 
          background: 'rgba(0,0,0,0.3)', 
          padding: '6px 4px', 
          borderRadius: '4px',
          marginBottom: '6px',
          border: '1px solid var(--border-color)',
          textAlign: 'center'
        }}>
          <div>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: '600' }}>FİYAT</div>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
              {price ? price.toFixed(2) : '-'}
            </div>
            <div style={{ fontSize: '10px', color: change_pct >= 0 ? 'var(--color-up)' : 'var(--color-down)', fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>
              {change_pct >= 0 ? '+' : ''}{change_pct ? change_pct.toFixed(1) : '0.0'}%
            </div>
          </div>

          <div>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: '600' }}>
              HEDEF {stock.recent_reports_count ? <span style={{ color: 'var(--color-cyan)', fontSize: '8px' }} title="Son aylardaki güncel kurum rapor sayısı">({stock.recent_reports_count})</span> : ''}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-up)', fontVariantNumeric: 'tabular-nums' }}>
              {consensus_target ? consensus_target.toFixed(1) : '-'}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--color-up)', fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>
              +%{upside_pct ? upside_pct.toFixed(1) : '0.0'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: '600' }}>STOP</div>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-red)', fontVariantNumeric: 'tabular-nums' }}>
              {stop_loss ? stop_loss.toFixed(1) : '-'}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--color-red)', fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>
              -%{stop_loss_pct ? stop_loss_pct.toFixed(1) : '0.0'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '9px', color: (stock.high_conviction_anomaly) ? '#00ff88' : ((risk_reward > 10.0 && !stock.high_conviction_anomaly) || stock.is_excessive_rr) ? '#ffab00' : 'var(--text-muted)', fontWeight: '600' }}>
              {(stock.high_conviction_anomaly) ? '✅ ONAYLI R:R' : ((risk_reward > 10.0 && !stock.high_conviction_anomaly) || stock.is_excessive_rr) ? '⚠️ R:R UYARI' : 'R:R / ALIM'}
            </div>
            <div style={{ fontSize: '11px', fontWeight: 'bold', color: (stock.high_conviction_anomaly) ? '#00ff88' : ((risk_reward > 10.0 && !stock.high_conviction_anomaly) || stock.is_excessive_rr) ? '#ffab00' : 'var(--color-cyan)', fontVariantNumeric: 'tabular-nums' }} title={(stock.high_conviction_anomaly) ? "Yüksek Potansiyel - Çoklu Kurum Onaylı" : ((risk_reward > 10.0 && !stock.high_conviction_anomaly) || stock.is_excessive_rr) ? "Aşırı yüksek R:R - hedef fiyat doğrulaması gerekebilir" : ""}>
              1:{risk_reward}
            </div>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {entry_zone?.low}-{entry_zone?.high}
            </div>
          </div>
        </div>

        {/* Compact Drivers (Top 2 salient points + more trigger) */}
        <div style={{ fontSize: '10.5px', color: 'var(--text-main)', marginBottom: '4px', lineHeight: '1.3' }}>
          {drivers.slice(0, 2).map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d}>
              <span style={{ color: 'var(--color-up)', fontSize: '9px', flexShrink: 0 }}>▸</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d}</span>
            </div>
          ))}

          {drivers.length > 2 && (
            <div 
              onClick={() => onOpenDetail?.(stock)}
              style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '3px', 
                color: 'var(--color-cyan)', 
                fontSize: '9.5px', 
                cursor: 'pointer',
                marginTop: '1px'
              }}
              title={drivers.slice(2).join(' • ')}
            >
              <span>+ {drivers.length - 2} gerekçe daha</span>
              <span style={{ fontSize: '8px' }}>▾ (detay)</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer: Broker Count + Unclipped Risk Pill + Action Link */}
      <div style={{ 
        borderTop: '1px solid rgba(255,255,255,0.06)', 
        paddingTop: '4px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        fontSize: '10px',
        gap: '4px'
      }}>
        <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: '9.5px' }}>
          👥 {broker_count} Kurum
        </span>
        {stop_loss && (
          <span 
            onClick={() => onOpenDetail?.(stock)}
            style={{ 
              color: 'var(--color-red)', 
              background: 'rgba(248, 81, 73, 0.1)',
              border: '1px solid rgba(248, 81, 73, 0.25)',
              padding: '1px 6px',
              borderRadius: '3px',
              fontSize: '9px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
              maxWidth: '130px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }} 
            title={risk_statement || `Önerilen zarar kes seviyesi: ${stop_loss} TL`}
          >
            ⚠ Stop: {stop_loss.toFixed(1)} TL
          </span>
        )}
        <Link 
          to={`/hisse/${ticker}`} 
          style={{
            fontSize: '10px',
            fontWeight: 'bold',
            color: 'var(--color-cyan)',
            textDecoration: 'none',
            flexShrink: 0
          }}
        >
          İncele &gt;
        </Link>
      </div>
    </div>
  );
}

