import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import ImageWithFallback from './ImageWithFallback';
import FavoriteStar from './common/FavoriteStar';

/**
 * CockpitDetailModal
 * High-tech terminal modal for deep inspection of any stock setup or the AI Market Pulse.
 */
export default function CockpitDetailModal({ isOpen, onClose, data, type = 'STOCK' }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !data) return null;

  return (
    <div 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(3, 5, 8, 0.85)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: type === 'STOCK' ? '650px' : '580px',
          maxHeight: '90vh',
          backgroundColor: '#13171f',
          border: '1px solid #30363d',
          borderRadius: '8px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 20px rgba(0, 229, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeIn 0.15s ease-out'
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid #21262d',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#0d1117'
        }}>
          {type === 'STOCK' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FavoriteStar ticker={data.ticker} style={{ fontSize: '16px' }} />
              <ImageWithFallback
                src={`${import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://127.0.0.1:8015'}/logos/${data.ticker}.png`}
                alt={data.ticker}
                fallbackName={data.ticker}
                size={26}
                style={{ width: '26px', height: '26px', borderRadius: '4px', background: '#fff', objectFit: 'contain', padding: '1px' }}
              />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px', fontWeight: '800', color: '#fff' }}>{data.ticker}</span>
                  {data.model_count > 0 && (
                    <span style={{ fontSize: '10px', background: 'rgba(210, 153, 34, 0.15)', color: 'var(--color-warning)', border: '1px solid rgba(210, 153, 34, 0.3)', padding: '1px 5px', borderRadius: '3px', fontWeight: 'bold' }}>
                      MODEL ({data.model_count} Kurum)
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{data.company_name}</div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>🤖</span>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '800', color: 'var(--color-cyan)' }}>
                  BIST 100 AI PİYASA NABZI VE STRATEJİ RAPORU
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                  Yapay Zeka Destekli Derinlik &amp; Risk Analizi
                </div>
              </div>
            </div>
          )}

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '4px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {type === 'STOCK' ? (
            <>
              {/* Financial Metrics Strip */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '8px',
                background: 'rgba(0,0,0,0.4)',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #21262d',
                textAlign: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 'bold' }}>GÜNCEL FİYAT</div>
                  <div style={{ fontSize: '15px', fontWeight: '800', color: '#fff' }}>{data.price ? data.price.toFixed(2) : '-'} TL</div>
                  <div style={{ fontSize: '11px', color: data.change_pct >= 0 ? 'var(--color-up)' : 'var(--color-down)', fontWeight: 'bold' }}>
                    {data.change_pct >= 0 ? '+' : ''}{data.change_pct ? data.change_pct.toFixed(2) : '0.00'}%
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 'bold' }}>
                    HEDEF FİYAT {data.recent_reports_count ? <span style={{ color: 'var(--color-cyan)', fontSize: '9px' }}>({data.recent_reports_count} Güncel Rapor)</span> : ''}
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--color-up)' }}>{data.consensus_target ? data.consensus_target.toFixed(2) : '-'} TL</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-up)', fontWeight: 'bold' }}>
                    +%{data.upside_pct ? data.upside_pct.toFixed(1) : '0.0'} Potansiyel
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 'bold' }}>ZARAR KES (STOP)</div>
                  <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--color-red)' }}>{data.stop_loss ? data.stop_loss.toFixed(2) : '-'} TL</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-red)', fontWeight: 'bold' }}>
                    -%{data.stop_loss_pct ? data.stop_loss_pct.toFixed(1) : '0.0'} Risk
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '10px', color: (data.risk_reward > 10.0 || data.is_excessive_rr) ? '#ffab00' : 'var(--text-muted)', fontWeight: 'bold' }}>
                    {(data.risk_reward > 10.0 || data.is_excessive_rr) ? '⚠️ R:R UYARI' : 'RİSK / KAZANÇ (R:R)'}
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: '800', color: (data.risk_reward > 10.0 || data.is_excessive_rr) ? '#ffab00' : 'var(--color-cyan)' }}>
                    1 : {data.risk_reward}
                  </div>
                  <div style={{ fontSize: '10px', color: (data.risk_reward > 10.0 || data.is_excessive_rr) ? '#ffab00' : 'var(--text-muted)' }} title="Aşırı yüksek R:R - hedef fiyat doğrulaması gerekebilir">
                    {(data.risk_reward > 10.0 || data.is_excessive_rr) ? '⚠️ Hedef Doğrulaması Gerekli' : `Alım: ${data.entry_zone?.low} - ${data.entry_zone?.high} TL`}
                  </div>
                </div>
              </div>

              {/* Kurum Mutabakatı ve Karar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: '5px', border: '1px solid #21262d' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ 
                    background: data.color || 'var(--color-up)', 
                    color: ['#ff3366', '#ef4444', '#dc2626', '#f85149'].includes(data.color) ? '#ffffff' : '#000000', 
                    fontSize: '11px', 
                    fontWeight: '900', 
                    padding: '2px 8px', 
                    borderRadius: '4px' 
                  }}>
                    {data.decision}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-main)' }}>
                    Sistem Skoru: <strong style={{ color: '#fff' }}>{data.score}</strong> / 100
                  </span>
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--color-neutral)', fontWeight: 'bold' }}>
                  👥 {data.broker_count} Aracı Kurum Konsensüsü
                </div>
              </div>

              {/* Tüm Alım/Risk Gerekçeleri (Drivers) */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-highlight)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>{data.decision?.includes('SAT') || data.decision?.includes('RİSK') ? '⚠️' : '🎯'}</span>
                  <span>{data.decision?.includes('SAT') || data.decision?.includes('RİSK') ? 'SİSTEM ANALİZİ VE RİSK GEREKÇELERİ' : 'TÜM ALIM VE GÜVEN GEREKÇELERİ'} ({data.drivers?.length || 0} Madde):</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {data.drivers && data.drivers.length > 0 ? (
                    data.drivers.map((driver, idx) => (
                      <div 
                        key={idx} 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'flex-start', 
                          gap: '8px', 
                          background: ['#ff3366', '#ef4444'].includes(data.color) ? 'rgba(255, 51, 102, 0.08)' : 'rgba(63, 185, 80, 0.05)', 
                          borderLeft: `3px solid ${data.color || 'var(--color-up)'}`, 
                          padding: '7px 10px', 
                          borderRadius: '0 4px 4px 0',
                          fontSize: '11.5px',
                          color: '#e6edf3',
                          lineHeight: '1.4'
                        }}
                      >
                        <span style={{ color: data.color || 'var(--color-up)', fontWeight: 'bold' }}>
                          {['#ff3366', '#ef4444'].includes(data.color) ? '⚠' : '✓'}
                        </span>
                        <span>{driver}</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Belirtilmiş gerekçe bulunmuyor.</div>
                  )}
                </div>
              </div>

              {/* Risk Yönetimi ve Zarar Kes Stratejisi (TAM METİN) */}
              {data.risk_statement && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--color-red)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>⚠</span>
                    <span>RİSK VE ZARAR KES YÖNETİMİ:</span>
                  </div>
                  <div style={{
                    background: 'rgba(248, 81, 73, 0.08)',
                    border: '1px solid rgba(248, 81, 73, 0.25)',
                    borderLeft: '3px solid var(--color-red)',
                    padding: '8px 12px',
                    borderRadius: '0 4px 4px 0',
                    fontSize: '11.5px',
                    color: '#ff7b72',
                    lineHeight: '1.45'
                  }}>
                    {data.risk_statement}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* AI PULSE MODAL BODY */
            <>
              {/* Regime Badge & Stats */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(0,0,0,0.3)',
                padding: '10px 14px',
                borderRadius: '6px',
                border: `1px solid ${data.regime?.color || '#30363d'}`
              }}>
                <div>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: '900',
                    background: data.regime?.status === 'BULL' ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255, 82, 82, 0.15)',
                    color: data.regime?.status === 'BULL' ? 'var(--color-up)' : 'var(--color-red)',
                    marginRight: '8px'
                  }}>
                    {data.regime?.status === 'BULL' ? 'BOĞA' : data.regime?.status === 'BEAR' ? 'AYI PİYASASI' : 'YATAY'}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff' }}>
                    {data.regime?.badge || 'Piyasa Görünümü'}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '8px', fontSize: '11px', fontWeight: 'bold' }}>
                  <span style={{ color: 'var(--color-up)' }}>▲ {data.marketPulse?.up || 0}</span>
                  <span style={{ color: 'var(--color-neutral)' }}>► {data.marketPulse?.flat || 0}</span>
                  <span style={{ color: 'var(--color-red)' }}>▼ {data.marketPulse?.down || 0}</span>
                </div>
              </div>

              {/* Tactical Summary */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--color-warning)', marginBottom: '5px' }}>
                  🎯 GÜNCEL TAKTİK KARAR:
                </div>
                <div style={{
                  background: 'rgba(210, 153, 34, 0.08)',
                  borderLeft: '3px solid var(--color-warning)',
                  padding: '9px 12px',
                  borderRadius: '0 4px 4px 0',
                  fontSize: '12px',
                  color: '#e3b341',
                  lineHeight: '1.45'
                }}>
                  {data.regime?.advice || 'Piyasa genel baskı altında. Risk parametrelerine sadık kalın.'}
                </div>
              </div>

              {/* Full AI Analysis Text */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#00e5ff', marginBottom: '5px' }}>
                  🤖 YAPAY ZEKA PİYASA YORUMU (TAM METİN):
                </div>
                <div style={{
                  background: 'rgba(0, 229, 255, 0.06)',
                  border: '1px solid rgba(0, 229, 255, 0.2)',
                  borderLeft: '3px solid #00e5ff',
                  padding: '12px 14px',
                  borderRadius: '0 4px 4px 0',
                  fontSize: '12px',
                  color: '#c9d1d9',
                  lineHeight: '1.55',
                  whiteSpace: 'pre-wrap'
                }}>
                  {data.ai_market_pulse || 'Geniş piyasa analizi derleniyor...'}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid #21262d',
          backgroundColor: '#0d1117',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          {type === 'STOCK' ? (
            <Link
              to={`/hisse/${data.ticker}`}
              onClick={onClose}
              style={{
                background: 'var(--color-cyan)',
                color: '#000',
                padding: '6px 14px',
                borderRadius: '4px',
                fontWeight: 'bold',
                fontSize: '11px',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              Hisse Detay &amp; Grafik Sayfasına Git ➔
            </Link>
          ) : (
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              Veriler BIST canlı fiyatları ve aracı kurum raporlarıyla senkronizedir.
            </div>
          )}

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid #30363d',
              color: 'var(--text-main)',
              padding: '6px 14px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Kapat ✕
          </button>
        </div>
      </div>
    </div>
  );
}
