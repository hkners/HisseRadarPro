import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import ImageWithFallback from './ImageWithFallback';
import { slugifyBroker } from '../utils/slugify';

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
            📌 {r.report_title || `${r.ticker || r.category} - Şirket Raporu`}
          </div>
          <div style={{ marginBottom: '8px' }}>
            <strong style={{ color: '#00e5ff' }}>Özet:</strong> {r.summary || 'Özet bulunmuyor.'}
          </div>
          {r.catalysts && (
            <div style={{ marginBottom: '8px' }}>
              <strong style={{ color: 'var(--color-up)' }}>Katalizörler:</strong> {r.catalysts}
            </div>
          )}
          {(r.full_text || r.metin) && (
            <div style={{ marginTop: '8px', fontSize: '11px', color: '#999', borderTop: '1px dashed #333', paddingTop: '8px' }}>
              <strong>Metin Çıktısı:</strong>
              <p style={{ marginTop: '4px' }}>{r.full_text || r.metin}</p>
            </div>
          )}
        </div>
        
        {r.ticker && (
          <div style={{ flex: '1 1 300px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-up)', marginBottom: '10px' }}>
              📊 GEÇMİŞ 1 YIL FİYAT & BİLANÇO
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
                          contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }}
                          itemStyle={{ color: '#00e5ff' }}
                          labelStyle={{ color: '#aaa' }}
                        />
                        <Line type="monotone" dataKey="close" stroke="#00e5ff" dot={false} strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Grafik verisi bulunamadı.</div>
                )}
                
                {fundamentals && (
                  <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', fontSize: '11px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #333' }}>
                      <span style={{ color: '#888' }}>Sektör:</span>
                      <span style={{ color: '#fff' }}>{fundamentals.sector || 'N/A'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #333' }}>
                      <span style={{ color: '#888' }}>F/K (P/E):</span>
                      <span style={{ color: '#fff' }}>{fundamentals.trailingPE ? fundamentals.trailingPE.toFixed(2) : 'N/A'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #333' }}>
                      <span style={{ color: '#888' }}>PD/DD (P/B):</span>
                      <span style={{ color: '#fff' }}>{fundamentals.priceToBook ? fundamentals.priceToBook.toFixed(2) : 'N/A'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #333' }}>
                      <span style={{ color: '#888' }}>Temettü:</span>
                      <span style={{ color: '#fff' }}>{fundamentals.dividendYield ? (fundamentals.dividendYield * 100).toFixed(2) + '%' : 'N/A'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #333' }}>
                      <span style={{ color: '#888' }}>Piyasa Değeri:</span>
                      <span style={{ color: '#fff' }}>{fundamentals.marketCap ? (fundamentals.marketCap / 1e9).toFixed(2) + ' Mlyr ₺' : 'N/A'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #333' }}>
                      <span style={{ color: '#888' }}>Özsermaye K.:</span>
                      <span style={{ color: '#fff' }}>{fundamentals.returnOnEquity ? (fundamentals.returnOnEquity * 100).toFixed(2) + '%' : 'N/A'}</span>
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
  const upside = r.potansiyel !== undefined && r.potansiyel !== null ? r.potansiyel : 0;
  const isPositive = upside >= 0;

  const getRatingStyle = (rating) => {
    const rStr = (rating || '').toUpperCase();
    if (rStr === 'AL' || rStr === 'BUY') {
      return { backgroundColor: 'rgba(0, 255, 0, 0.15)', color: '#00ff00', border: '1px solid #00ff00' };
    }
    if (rStr === 'TUT' || rStr === 'HOLD' || rStr === 'NEUTRAL') {
      return { backgroundColor: 'rgba(255, 204, 0, 0.15)', color: '#ffcc00', border: '1px solid #ffcc00' };
    }
    if (rStr === 'SAT' || rStr === 'SELL') {
      return { backgroundColor: 'rgba(255, 51, 51, 0.15)', color: '#ff3333', border: '1px solid #ff3333' };
    }
    return { backgroundColor: '#222', color: '#ccc', border: '1px solid #555' };
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
                <ImageWithFallback 
                  src={`${baseUrl}/logos/${r.ticker}.png`}
                  alt={r.ticker}
                  fallbackName={r.ticker}
                  size={18}
                  style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#fff', objectFit: 'contain' }}
                />
                <span className="ticker-link" style={{ fontSize: '14px' }}>{r.ticker}</span>
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
              <span style={{ fontSize: '12px' }}>📄</span>
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
            <td>{r.current_price ? r.current_price.toFixed(2) : 'N/A'} ₺</td>
            <td style={{ fontWeight: 'bold', color: 'var(--text-highlight)' }}>
              {r.target_price ? r.target_price.toFixed(2) : 'N/A'} ₺
            </td>
            <td className={isPositive ? 'text-up' : 'text-down'} style={{ fontWeight: 'bold' }}>
              {isPositive ? '+' : ''}{upside.toFixed(2)}%
            </td>
          </>
        )}

        <td className="text-muted">{r.report_date}</td>
        <td style={{ textAlign: 'center' }}>
          <button
            className="btn-read"
            style={{ marginRight: '5px' }}
            onClick={onToggle}
          >
            {isExpanded ? 'KAPAT' : 'DETAY'}
          </button>
          {r.pdf_url && (
            <a
              href={r.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-read"
              style={{ textDecoration: 'none', display: 'inline-block' }}
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
