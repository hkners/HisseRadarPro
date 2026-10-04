import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ImageWithFallback from '../components/ImageWithFallback';
import PageContainer from '../components/common/PageContainer';
import { usePolling } from '../hooks/usePolling';

export default function ViopScreener() {
  const { data: fetchedData, loading } = usePolling(`${import.meta.env.VITE_API_URL}/viop/screener`, 0);
  const data = fetchedData || [];

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  const [searchTerm, setSearchTerm] = useState('');

  const filteredData = data.filter(item => 
      item.contract.toLowerCase().includes(searchTerm.toLowerCase()) || 
      item.ticker.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatCurrency = (val) => {
    if (val === null || val === undefined || isNaN(val)) return '-';
    return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
  };

  const formatPct = (val) => {
    if (val === null || val === undefined || isNaN(val)) return '-';
    return val.toFixed(2) + '%';
  };

  return (
    <PageContainer 
      title="VİOP"
      badge={{ label: `${filteredData.length} SÖZLEŞME` }}
      subtitle="Vadeli kontratlarda arbitraj getirisi ve açık pozisyon analizi."
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', marginBottom: '0', background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '10px', flexWrap: 'wrap' }}>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>
              Vadeli İşlem ve Opsiyon Piyasası'ndaki (VİOP) pay vadeli sözleşmelerinin spot fiyata göre arbitraj getirisini ve açık pozisyon sayısı (APS) değişimini analiz edin.
            </p>
            <div style={{ minWidth: '220px' }}>
              <input 
                type="text" 
                placeholder="Sözleşme Ara (Örn: THYAO)..." 
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                style={{ 
                  width: '100%', 
                  padding: '5px 10px', 
                  borderRadius: '4px', 
                  border: '1px solid var(--border-color)', 
                  background: 'rgba(0,0,0,0.3)', 
                  color: 'var(--text-primary)', 
                  outline: 'none',
                  fontSize: '11px'
                }}
              />
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              Veriler yükleniyor...
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div className="table-responsive" style={{ flex: 1, overflowY: 'auto', borderBottom: '1px solid var(--border-color)' }}>
                <table className="data-table">
                <thead>
                  <tr>
                    <th></th>
                    <th style={{ textAlign: 'left' }}>SÖZLEŞME</th>
                    <th>SPOT FİYAT</th>
                    <th>VADELİ FİYAT</th>
                    <th>TEORİK FİYAT</th>
                    <th style={{ color: 'var(--color-warning)' }}>YILLIK GETİRİ</th>
                    <th>APS</th>
                    <th>APS DEĞİŞİM</th>
                    <th style={{ textAlign: 'center' }}>SİNYAL / TREND</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((item, idx) => (
                    <tr key={item.contract} className="row-hoverable" style={{ background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                      <td style={{ textAlign: 'center', width: '30px' }}>
                        <ImageWithFallback
                          src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/${item.ticker}.png`}
                          alt={item.ticker}
                          fallbackName={item.ticker}
                          size={24}
                          style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#fff', objectFit: 'contain' }}
                        />
                      </td>
                      <td style={{ fontWeight: 'bold' }}>
                        <div style={{ color: 'var(--color-cyan)' }}>{item.contract}</div>
                        <div style={{ fontSize: '0.7rem' }}>
                          <Link to={`/hisse/${item.ticker}`} className="ticker-link">{item.ticker} Vade: {item.days_to_expiry} Gün</Link>
                        </div>
                      </td>
                      <td style={{ fontWeight: 'bold' }}>
                        {formatCurrency(item.spot_price)}
                        <span style={{ fontSize: '10px', marginLeft: '6px', color: item.spot_change > 0 ? 'var(--color-up)' : item.spot_change < 0 ? 'var(--color-red)' : 'var(--text-muted)'}}>
                          {item.spot_change > 0 ? '▲' : item.spot_change < 0 ? '▼' : ''} {Math.abs(item.spot_change).toFixed(2)}%
                        </span>
                      </td>
                      <td style={{ fontWeight: 'bold' }}>{formatCurrency(item.market_price)}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{formatCurrency(item.theo_price)}</td>
                      <td style={{ fontWeight: 'bold', color: item.arbitrage_yield > 40 ? 'var(--color-warning)' : 'var(--text-highlight)' }}>
                        {formatPct(item.arbitrage_yield)}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{item.aps.toLocaleString('tr-TR')}</td>
                      <td style={{ fontWeight: 'bold', color: item.aps_change_pct > 0 ? 'var(--color-up)' : item.aps_change_pct < 0 ? 'var(--color-red)' : 'var(--text-muted)'}}>
                        {item.aps_change_pct > 0 ? '+' : ''}{formatPct(item.aps_change_pct)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          background: 'rgba(0,0,0,0.3)',
                          border: `1px solid ${item.trend_color}`,
                          color: item.trend_color,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 'bold'
                        }}>
                          {item.trend}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredData.length === 0 && (
                      <tr>
                          <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                              Eşleşen sözleşme bulunamadı. Lütfen arama kriterinizi değiştirin.
                          </td>
                      </tr>
                  )}
                </tbody>
              </table>
            </div>

            {filteredData.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
                    <button 
                        className="btn-read" 
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        style={{ opacity: currentPage === 1 ? 0.5 : 1, cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                    >
                        &larr; Önceki Sayfa
                    </button>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Sayfa {currentPage} / {Math.ceil(filteredData.length / itemsPerPage)} <br/>
                        <span style={{ fontSize: '10px' }}>(Toplam {filteredData.length} Sözleşme)</span>
                    </span>
                    <button 
                        className="btn-read" 
                        disabled={currentPage >= Math.ceil(filteredData.length / itemsPerPage)}
                        onClick={() => setCurrentPage(p => p + 1)}
                        style={{ opacity: currentPage >= Math.ceil(filteredData.length / itemsPerPage) ? 0.5 : 1, cursor: currentPage >= Math.ceil(filteredData.length / itemsPerPage) ? 'not-allowed' : 'pointer' }}
                    >
                        Sonraki Sayfa &rarr;
                    </button>
                </div>
            )}
          </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
