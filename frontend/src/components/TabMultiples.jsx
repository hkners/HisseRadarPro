import React from 'react';

export default function TabMultiples({ fundamentals }) {
  if (!fundamentals) {
    return <div className="text-muted">Veriler yukleniyor...</div>;
  }

  const items = [
    { label: "F/K (Trailing PE)", value: fundamentals.trailingPE },
    { label: "İleri F/K (Forward PE)", value: fundamentals.forwardPE },
    { label: "PD/DD (Price to Book)", value: fundamentals.priceToBook },
    { label: "Temettü Verimi", value: fundamentals.dividendYield ? (fundamentals.dividendYield * 100).toFixed(2) + '%' : '-' },
    { label: "FAVÖK Marjı", value: fundamentals.ebitdaMargins ? (fundamentals.ebitdaMargins * 100).toFixed(2) + '%' : '-' },
    { label: "Kar Marjı", value: fundamentals.profitMargins ? (fundamentals.profitMargins * 100).toFixed(2) + '%' : '-' },
    { label: "Gelir Büyümesi", value: fundamentals.revenueGrowth ? (fundamentals.revenueGrowth * 100).toFixed(2) + '%' : '-' },
    { label: "Özsermaye Karlılığı (ROE)", value: fundamentals.returnOnEquity ? (fundamentals.returnOnEquity * 100).toFixed(2) + '%' : '-' },
  ];

  return (
    <div style={{ padding: '10px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
        {items.map((item, idx) => (
          <div key={idx} style={{ padding: '15px', background: '#111', borderRadius: '8px', border: '1px solid #333' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '5px' }}>{item.label}</div>
            <div style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold' }}>
              {item.value !== null && item.value !== undefined ? (typeof item.value === 'number' ? item.value.toFixed(2) : item.value) : '-'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
