import React, { useState, useEffect } from 'react';

export default function TradeSetupBox({ ticker, stock, consensus }) {
  const [setup, setSetup] = useState(null);
  const [aiThesis, setAiThesis] = useState(null);
  const [loadingThesis, setLoadingThesis] = useState(false);
  const [showThesis, setShowThesis] = useState(false);

  useEffect(() => {
    if (!ticker) return;

    // 1. Fetch quantitative trade setup
    fetch(`${import.meta.env.VITE_API_URL}/conviction/stock/${ticker}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) setSetup(data);
      })
      .catch(err => console.error("Error fetching conviction setup:", err));

    // 2. Fetch AI Bull/Bear thesis (cached)
    setLoadingThesis(true);
    fetch(`${import.meta.env.VITE_API_URL}/conviction/ai-thesis/${ticker}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) setAiThesis(data);
        setLoadingThesis(false);
      })
      .catch(() => setLoadingThesis(false));
  }, [ticker]);

  if (!setup) return null;

  const {
    score = 50,
    decision = "BEKLE",
    color = "var(--color-warning)",
    entry_zone = {},
    consensus_target,
    upside_pct = 0,
    stop_loss,
    stop_loss_pct = 5,
    risk_reward = 1.0,
    drivers = [],
    risk_statement,
    is_excessive_rr: propExcessive = false,
    high_conviction_anomaly = false,
    rr_warning: propWarning = null
  } = setup;

  const is_excessive_rr = propExcessive || (!high_conviction_anomaly && (risk_reward > 10.0 || upside_pct > 150.0));
  const rr_warning = propWarning || "Aşırı yüksek R:R - hedef fiyat doğrulaması gerekebilir";

  return (
    <div 
      className="panel-neon"
      style={{
        border: `1px solid ${color}`,
        borderRadius: '6px',
        padding: '10px 16px',
        background: 'linear-gradient(180deg, rgba(18, 18, 20, 0.95) 0%, rgba(18, 18, 20, 0.95) 100%)',
        marginBottom: '12px',
        boxShadow: `0 2px 12px ${color}15`,
        flexShrink: 0
      }}
    >
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: '900', letterSpacing: '0.8px', color: '#F4F2ED' }}>
            ALIM &amp; POZİSYON KURULUM KOKPİTİ
          </span>
          <div style={{ 
            background: color, 
            color: ['#C0524E', '#C0524E', '#C0524E', '#C0524E'].includes(color) ? '#F4F2ED' : '#000000', 
            fontSize: '10px', 
            fontWeight: '900', 
            padding: '2px 8px', 
            borderRadius: '3px',
            letterSpacing: '0.4px'
          }}>
            {decision}
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Karar Skoru: <strong style={{ color: '#F4F2ED' }}>{score}</strong>/100
          </span>
          {is_excessive_rr && (
            <span style={{
              fontSize: '10px',
              color: '#C9883A',
              background: 'rgba(201, 136, 58, 0.15)',
              border: '1px solid rgba(201, 136, 58, 0.4)',
              padding: '2px 8px',
              borderRadius: '4px',
              fontWeight: 'bold',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }} title="Aşırı yüksek R:R - hedef fiyat doğrulaması gerekebilir (bölünme / sermaye artırımı veya aşırı dar stop payı riski)">
              Aşırı yüksek R:R - hedef fiyat doğrulaması gerekebilir
            </span>
          )}
          {high_conviction_anomaly && (
            <span style={{
              fontSize: '10px',
              color: '#3F8A6B',
              background: 'rgba(63, 138, 107, 0.15)',
              border: '1px solid rgba(63, 138, 107, 0.4)',
              padding: '2px 8px',
              borderRadius: '4px',
              fontWeight: 'bold',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }} title="Yüksek Konsensüs ve Pozitif Trend (False-Positive Koruması Aktif)">
              Yüksek Potansiyel - Çoklu Kurum Onaylı
            </span>
          )}
        </div>

        <button
          onClick={() => setShowThesis(!showThesis)}
          style={{
            background: showThesis ? 'rgba(200, 162, 74, 0.15)' : 'transparent',
            border: '1px solid rgba(200, 162, 74, 0.3)',
            color: '#C8A24A',
            fontSize: '11px',
            padding: '3px 10px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          {showThesis ? '▲ AI Tezini Gizle' : '▼ AI Tezini İncele (3 Boğa / 2 Ayı)'}
        </button>
      </div>

      {/* 4-Box Key Metrics Grid - Sleek single-strip layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '8px', marginBottom: showThesis ? '10px' : '0' }}>
        {/* Box 1: Entry Zone */}
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '7px 12px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 'bold' }}>İDEAL ALIM ARALIĞI</div>
          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#C8A24A', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
            {entry_zone.low || '-'} - {entry_zone.high || '-'} TL
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px' }}>
            Güncel fiyat destek bandı
          </div>
        </div>

        {/* Box 2: Target */}
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '7px 12px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 'bold' }}>KONSENSÜS HEDEF</div>
          <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--color-up)', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
            {consensus_target ? consensus_target.toFixed(2) : '-'} TL
          </div>
          <div style={{ fontSize: '10px', color: 'var(--color-up)', fontWeight: 'bold', marginTop: '1px' }}>
            +%{upside_pct ? upside_pct.toFixed(1) : '0.0'} Getiri Potansiyeli
          </div>
        </div>

        {/* Box 3: Stop Loss */}
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '7px 12px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 'bold' }}>ÖNERİLEN STOP-LOSS</div>
          <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--color-red)', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
            {stop_loss ? stop_loss.toFixed(2) : '-'} TL
          </div>
          <div style={{ fontSize: '10px', color: 'var(--color-red)', fontWeight: 'bold', marginTop: '1px' }}>
            -%{stop_loss_pct ? stop_loss_pct.toFixed(1) : '0.0'} Maksimum Risk
          </div>
        </div>

        {/* Box 4: Risk / Reward */}
        <div style={{ 
          background: is_excessive_rr ? 'rgba(201, 136, 58, 0.08)' : 'rgba(0,0,0,0.3)', 
          padding: '7px 12px', 
          borderRadius: '4px', 
          border: is_excessive_rr ? '1px solid rgba(201, 136, 58, 0.4)' : '1px solid rgba(255,255,255,0.05)' 
        }}>
          <div style={{ fontSize: '10px', color: is_excessive_rr ? '#C9883A' : 'var(--text-muted)', fontWeight: 'bold' }}>
            RİSK / KAZANÇ (R:R)
          </div>
          <div style={{ fontSize: '14px', fontWeight: 'bold', color: is_excessive_rr ? '#C9883A' : (risk_reward >= 3.0 ? '#3F8A6B' : '#C8A24A'), marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
            1 : {risk_reward}
          </div>
          <div style={{ fontSize: '10px', color: is_excessive_rr ? '#C9883A' : (risk_reward >= 3.0 ? 'var(--color-up)' : 'var(--text-muted)'), fontWeight: 'bold', marginTop: '1px' }}>
            {is_excessive_rr ? 'Hedef Doğrulaması Gerekli' : (risk_reward >= 3.0 ? 'Pozitif Asimetri (Uygun)' : 'Orta Risk/Ödül')}
          </div>
        </div>
      </div>

      {/* AI Bull & Bear Thesis (Optional Accordion) */}
      {showThesis && (
        <div style={{ 
          background: 'rgba(0,0,0,0.25)', 
          border: '1px solid rgba(200, 162, 74, 0.2)', 
          borderRadius: '6px', 
          padding: '12px 16px',
          marginTop: '10px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#C8A24A' }}>
              [AI TEZİ] 3 BOĞA (ALIM GEREKÇESİ) vs 2 AYI (RİSK) ANALİZİ
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              {loadingThesis ? 'Yapay zeka tezi derleniyor...' : aiThesis?.source === 'gemini' ? 'Gemini AI Destekli' : 'Kural Tabanlı Özet'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '15px' }}>
            {/* Bull Points */}
            <div>
              <div style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--color-up)', marginBottom: '4px' }}>
                [+] BOĞA ARGÜMANLARI (Neden Yükselir?):
              </div>
              <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '11px', color: 'var(--text-primary)', lineHeight: '1.5' }}>
                {(aiThesis?.bull_cases || drivers).slice(0, 3).map((item, idx) => (
                  <li key={idx} style={{ marginBottom: '4px' }}>{item}</li>
                ))}
              </ul>
            </div>

            {/* Bear Points */}
            <div>
              <div style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--color-red)', marginBottom: '4px' }}>
                [-] AYI ARGÜMANLARI & TEHDİTLER (Risk Faktörleri):
              </div>
              <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '11px', color: '#ff9999', lineHeight: '1.5' }}>
                {(aiThesis?.bear_cases || [risk_statement]).filter(Boolean).slice(0, 2).map((item, idx) => (
                  <li key={idx} style={{ marginBottom: '4px' }}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
