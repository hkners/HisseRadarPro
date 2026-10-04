import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

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
              {r.report_title || `${r.ticker || r.category} - Şirket Raporu`}
            </div>
            <div style={{ marginBottom: '8px' }}>
              <strong style={{ color: 'var(--gold)' }}>Özet:</strong> {r.summary || ((!r.full_text || r.full_text === "Metin bulunamadı.") && !r.pdf_url ? 'Bu veri Fintables hedef fiyat & model portföy tablolarından entegre edilmiştir. Rapor özeti bulunmamaktadır.' : 'Özet bulunmuyor.')}
            </div>
            {r.catalysts && (
              <div style={{ marginBottom: '8px' }}>
                <strong style={{ color: 'var(--color-up)' }}>Katalizörler:</strong> {r.catalysts}
              </div>
            )}
            {((r.full_text || r.metin) && r.full_text !== "Metin bulunamadı.") ? (
              <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-tertiary)', borderTop: '1px dashed var(--border-default)', paddingTop: '8px' }}>
                <strong>Metin Çıktısı:</strong>
                <p style={{ marginTop: '4px' }}>{r.full_text || r.metin}</p>
              </div>
            ) : (!r.pdf_url && (!r.full_text || r.full_text === "Metin bulunamadı.")) ? (
              <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-tertiary)', borderTop: '1px dashed var(--border-default)', paddingTop: '8px', fontStyle: 'italic' }}>
                <strong>Bilgi:</strong>
                <p style={{ marginTop: '4px' }}>Bu veri Fintables üzerinden aracı kurumun hedef fiyat ve model portföy tablolarından otomatik olarak entegre edilmiştir. Aracı kurumun detaylı PDF rapor metnine ulaşılamamaktadır.</p>
              </div>
            ) : null}
          </div>
        )}
        
        {r.ticker && !r.hideChart && !r.hideFundamentals && (
          <div style={{ flex: '1 1 100%', background: 'var(--bg-secondary)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            {!r.hideFundamentals && (
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-neutral)', marginBottom: '10px' }}>
                GEÇMİŞ 1 YIL FİYAT & BİLANÇO
              </div>
            )}
            {loading ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Veriler Yükleniyor...</div>
            ) : (
              <>
                {fundamentals && fundamentals.quarterly_financials && fundamentals.quarterly_financials.dates ? (
                  <div style={{ width: '100%', height: '150px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={fundamentals.quarterly_financials.dates.map((d, i) => ({
                        date: d,
                        netIncome: fundamentals.quarterly_financials.net_income[i],
                        revenue: fundamentals.quarterly_financials.revenue[i]
                      }))}>
                        <XAxis dataKey="date" tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-default)', fontSize: '11px' }}
                          formatter={(val) => [(val / 1e6).toFixed(0) + 'M ₺']}
                        />
                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                        <Bar dataKey="revenue" fill="var(--gold)" name="Gelir" />
                        <Bar dataKey="netIncome" fill="var(--positive)" name="Net Kar" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : history.length > 0 && !r.hideChart ? (
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
                  !r.hideChart && <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Grafik verisi bulunamadı.</div>
                )}
                
                {!r.hideFundamentals && fundamentals && (
                  <div style={{ marginTop: '15px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '11px' }}>
                    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', padding: '8px 4px', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ color: 'var(--text-muted)', marginBottom: '4px', fontSize: '10px' }}>SEKTÖR</div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={fundamentals.sector || 'N/A'}>{fundamentals.sector || 'N/A'}</div>
                    </div>
                    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', padding: '8px 4px', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ color: 'var(--text-muted)', marginBottom: '4px', fontSize: '10px' }}>F/K</div>
                      <div style={{ color: 'var(--text-highlight)', fontWeight: 'bold' }}>{fundamentals.trailingPE ? fundamentals.trailingPE.toFixed(2) : 'N/A'}</div>
                    </div>
                    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', padding: '8px 4px', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ color: 'var(--text-muted)', marginBottom: '4px', fontSize: '10px' }}>PD/DD</div>
                      <div style={{ color: 'var(--text-highlight)', fontWeight: 'bold' }}>{fundamentals.priceToBook ? fundamentals.priceToBook.toFixed(2) : 'N/A'}</div>
                    </div>
                    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', padding: '8px 4px', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ color: 'var(--text-muted)', marginBottom: '4px', fontSize: '10px' }}>TEMETTÜ</div>
                      <div style={{ color: 'var(--color-up)', fontWeight: 'bold' }}>{fundamentals.dividendYield ? (fundamentals.dividendYield * 100).toFixed(2) + '%' : 'N/A'}</div>
                    </div>
                    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', padding: '8px 4px', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ color: 'var(--text-muted)', marginBottom: '4px', fontSize: '10px' }}>PİYASA DEĞERİ</div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{fundamentals.marketCap ? (fundamentals.marketCap / 1e9).toFixed(2) + 'B ₺' : 'N/A'}</div>
                    </div>
                    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', padding: '8px 4px', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ color: 'var(--text-muted)', marginBottom: '4px', fontSize: '10px' }}>ÖZSERMAYE KARL.</div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{fundamentals.returnOnEquity ? (fundamentals.returnOnEquity * 100).toFixed(2) + '%' : 'N/A'}</div>
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
