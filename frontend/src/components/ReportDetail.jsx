import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function ReportDetail({ r }) {
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
        const histRes = await fetch(`${import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://127.0.0.1:8015'}/api/stocks/${r.ticker}/history`);
        if (histRes.ok) setHistory(await histRes.json());
        
        const fundRes = await fetch(`${import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://127.0.0.1:8015'}/api/stocks/${r.ticker}/fundamentals`);
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
        
        {/* Only show the report summary section if we have report_title or summary (i.e. not in StockDetail page) */}
        {(r.report_title || r.summary || r.catalysts || r.full_text || r.metin) && (
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
        )}
        
        {r.ticker && (
          <div style={{ flex: '1 1 300px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--neon-green)', marginBottom: '10px' }}>
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
