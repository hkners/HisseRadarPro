import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import ImageWithFallback from './ImageWithFallback';
import { slugifyBroker } from '../utils/slugify';
import FavoriteStar from './common/FavoriteStar';

export function ReportDetail({ r }) {
  const [history, setHistory] = useState([]);
  const [fundamentals, setFundamentals] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!r.ticker) {
      setLoading(false);
      return;
    }
    const fetchData = async () => {
      try {
        const baseUrl = import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://127.0.0.1:8015';
        const histRes = await fetch(`${baseUrl}/api/stocks/${r.ticker}/history`);
        if (histRes.ok) setHistory(await histRes.json());
        
        const fundRes = await fetch(`${baseUrl}/api/stocks/${r.ticker}/fundamentals`);
        if (fundRes.ok) {
          const fundData = await fundRes.json();
          setFundamentals(fundData.fundamentals);
        }
      } catch (err) {
        console.error("Failed to fetch stock details:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [r.ticker]);

  return (
    <div className="accordion-content">
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 300px' }}>
          <div style={{ fontWeight: 'bold', color: 'var(--text-highlight)', marginBottom: '8px' }}>
            {r.report_title || `${r.ticker || r.category} - Şirket Raporu`}
          </div>
          <div style={{ marginBottom: '8px' }}>
            <strong style={{ color: 'var(--gold)' }}>Özet:</strong> {r.summary || 'Özet bulunmuyor.'}
          </div>
          {r.catalysts && (
            <div style={{ marginBottom: '8px' }}>
              <strong style={{ color: 'var(--color-up)' }}>Katalizörler:</strong> {r.catalysts}
            </div>
          )}
          {(r.full_text || r.metin) && (
            <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-tertiary)', borderTop: '1px dashed var(--border-default)', paddingTop: '8px' }}>
              <strong>Metin Çıktısı:</strong>
              <p style={{ marginTop: '4px' }}>{r.full_text || r.metin}</p>
            </div>
          )}
        </div>
        
        {r.ticker && (
          <div style={{ flex: '1 1 300px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-up)', marginBottom: '10px' }}>
              GEÇMİŞ 1 YIL FİYAT & BİLANÇO
            </div>
            {loading ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Veriler Yükleniyor...</div>
            ) : (
              <>
                {history.length > 0 ? (
                  <div style={{ width: '100%', height: '150px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={history}>
                        <XAxis dataKey="date" hide />
                        <YAxis domain={['auto', 'auto']} hide />
                        <Tooltip 
                          contentStyle={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-default)' }}
                          itemStyle={{ color: 'var(--gold)' }}
                          labelStyle={{ color: 'var(--text-secondary)' }}
                        />
                        <Line type="monotone" dataKey="close" stroke="var(--gold)" dot={false} strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Grafik verisi bulunamadı.</div>
                )}
                
                {fundamentals && (
                  <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', fontSize: '11px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)' }}>
                      <span style={{ color: 'var(--text-tertiary)' }}>Sektör:</span>
                      <span style={{ color: 'var(--text-primary)' }}>{fundamentals.sector || 'N/A'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)' }}>
                      <span style={{ color: 'var(--text-tertiary)' }}>F/K (P/E):</span>
                      <span style={{ color: 'var(--text-primary)' }}>{fundamentals.trailingPE ? fundamentals.trailingPE.toFixed(2) : 'N/A'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)' }}>
                      <span style={{ color: 'var(--text-tertiary)' }}>PD/DD (P/B):</span>
                      <span style={{ color: 'var(--text-primary)' }}>{fundamentals.priceToBook ? fundamentals.priceToBook.toFixed(2) : 'N/A'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)' }}>
                      <span style={{ color: 'var(--text-tertiary)' }}>Temettü:</span>
                      <span style={{ color: 'var(--text-primary)' }}>{fundamentals.dividendYield ? (fundamentals.dividendYield * 100).toFixed(2) + '%' : 'N/A'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)' }}>
                      <span style={{ color: 'var(--text-tertiary)' }}>Piyasa Değeri:</span>
                      <span style={{ color: 'var(--text-primary)' }}>{fundamentals.marketCap ? (fundamentals.marketCap / 1e9).toFixed(2) + ' Mlyr ₺' : 'N/A'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-default)' }}>
                      <span style={{ color: 'var(--text-tertiary)' }}>Özsermaye K.:</span>
                      <span style={{ color: 'var(--text-primary)' }}>{fundamentals.returnOnEquity ? (fundamentals.returnOnEquity * 100).toFixed(2) + '%' : 'N/A'}</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReportRow({ r, isExpanded, onToggle }) {
  const isFintables = !r.pdf_url;
  const displayPotansiyel = (r.potansiyel !== undefined && r.potansiyel !== null ? r.potansiyel : null);
  const displayCurrentPrice = r.current_price;
  
  const upside = displayPotansiyel;
  const isPositive = upside !== null && upside >= 0;

  const getRatingStyle = (rating) => {
    const rStr = (rating || '').toUpperCase();
    if (rStr === 'AL' || rStr === 'BUY') {
      return { backgroundColor: 'rgba(63, 138, 107, 0.15)', color: 'var(--positive)', border: '1px solid var(--positive)' };
    }
    if (rStr === 'TUT' || rStr === 'HOLD' || rStr === 'NEUTRAL') {
      return { backgroundColor: 'rgba(200, 162, 74, 0.15)', color: 'var(--gold)', border: '1px solid var(--gold-border)' };
    }
    if (rStr === 'SAT' || rStr === 'SELL') {
      return { backgroundColor: 'rgba(192, 82, 78, 0.15)', color: 'var(--negative)', border: '1px solid var(--negative)' };
    }
    return { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-strong)' };
  };

  const hasFinancials = r.target_price > 0 || (r.rating && r.rating !== 'N/A' && r.rating.trim() !== '');

  const baseUrl = import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || '';

  return (
    <>
      <tr className="row-hoverable">
        <td style={{ textAlign: 'left', maxWidth: '250px' }}>
          <div style={{ marginBottom: '4px' }}>
            {r.ticker ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FavoriteStar ticker={r.ticker} style={{ marginRight: 0 }} />
                <ImageWithFallback 
                  src={`${baseUrl}/logos/${r.ticker}.png`}
                  alt={r.ticker}
                  fallbackName={r.ticker}
                  size={18}
                  style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#fff', objectFit: 'contain' }}
                />
                <span className="ticker-link" style={{ fontSize: '13px' }}>{r.ticker}</span>
              </span>
            ) : (
              <span style={{ fontSize: '10px', background: 'var(--bg-panel)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-color)', color: 'var(--text-highlight)' }}>
                {r.category ? r.category.toUpperCase() : 'RAPOR'}
              </span>
            )}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.report_title}>
            {r.report_title}
          </div>
        </td>
        <td style={{ textAlign: 'left', borderBottom: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ImageWithFallback 
              src={`${baseUrl}/logos/brokers/${slugifyBroker(r.broker)}.png`} 
              alt={r.broker} 
              fallbackName={r.broker}
              size={24}
              style={{ width: '24px', height: '24px', borderRadius: '4px', background: '#fff', objectFit: 'contain', padding: '1px' }}
            />
            <span style={{ fontWeight: 'bold' }}>{r.broker}</span>
          </div>
        </td>
        
        {!r.ticker || !hasFinancials ? (
          <td colSpan="4" style={{ textAlign: 'center', padding: '0 10px' }}>
            <div style={{ 
              background: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.02), rgba(255,255,255,0.02) 10px, transparent 10px, transparent 20px)',
              borderRadius: '4px',
              padding: '6px 0',
              border: '1px solid rgba(255,255,255,0.05)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              width: '80%'
            }}>
              
              <span style={{ fontSize: '11px', letterSpacing: '1px', color: 'var(--text-muted)' }}>
                {r.category ? r.category.toUpperCase() : 'RAPOR'} {r.ticker ? '- HEDEF FİYAT/TAVSİYE İÇERMEZ' : ''}
              </span>
            </div>
          </td>
        ) : (
          <>
            <td style={{ textAlign: 'right' }}>
              <span
                style={{
                  padding: '2px 6px',
                  borderRadius: '3px',
                  fontWeight: 'bold',
                  fontSize: '11px',
                  ...getRatingStyle(r.rating)
                }}
              >
                {r.rating || 'N/A'}
              </span>
            </td>
            <td>{displayCurrentPrice !== null ? displayCurrentPrice.toFixed(2) : '-'} {displayCurrentPrice !== null ? '₺' : ''}</td>
            <td style={{ fontWeight: 'bold', color: 'var(--text-highlight)' }}>
              {r.target_price !== null && r.target_price !== undefined ? r.target_price.toFixed(2) : 'N/A'} ₺
            </td>
            <td className={upside !== null ? (isPositive ? 'text-up' : 'text-down') : 'text-neutral'} style={{ fontWeight: 'bold' }}>
              {upside !== null ? `${isPositive ? '+' : ''}${upside.toFixed(2)}%` : '-'}
            </td>
          </>
        )}

        <td className="text-muted">{r.report_date}</td>
        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
          <button
            className="btn-read"
            style={{ 
              marginRight: '5px', 
              borderColor: (!r.full_text && !r.pdf_url) ? 'var(--color-up)' : 'var(--neon-cyan)',
              color: (!r.full_text && !r.pdf_url) ? 'var(--color-up)' : 'var(--neon-cyan)'
            }}
            onClick={onToggle}
          >
            {isExpanded ? '[X] CLOSE' : ((!r.full_text || r.full_text === "Metin bulunamadı.") && !r.pdf_url) ? 'FINTABLES' : 'DETAY'}
          </button>
          {r.pdf_url && (
            <a
              href={r.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-read"
              style={{ textDecoration: 'none', display: 'inline-block', borderColor: 'var(--text-muted)', color: 'var(--text-muted)' }}
            >
              PDF ↗
            </a>
          )}
        </td>
      </tr>
      {isExpanded && (
        <tr className="accordion-row">
          <td colSpan="8" style={{ padding: 0 }}>
            <ReportDetail r={r} />
          </td>
        </tr>
      )}
    </>
  );
}
