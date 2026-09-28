import React from 'react';

export default function TabMultiples({ fundamentals }) {
  if (!fundamentals) {
    return <div className="text-muted">Veriler yukleniyor...</div>;
  }

  const items = [
    { label: "F/K Oranı", desc: "Fiyat / Kazanç: Şirketin elde ettiği her 1 TL kâra karşılık ödenen fiyattır.", value: fundamentals.trailingPE },
    { label: "İleri F/K", desc: "Gelecek 12 aylık beklenen kâra göre Fiyat / Kazanç oranı.", value: fundamentals.forwardPE },
    { label: "PD/DD", desc: "Piyasa Değeri / Defter Değeri: Şirketin piyasa değerinin özkaynaklarına oranıdır.", value: fundamentals.priceToBook },
    { label: "Temettü Verimi", desc: "Ödenen yıllık temettünün hisse fiyatına oranıdır. Nakit akışı getirisini gösterir.", value: fundamentals.dividendYield ? (fundamentals.dividendYield * 100).toFixed(2) + '%' : '-' },
    { label: "FAVÖK Marjı", desc: "Faiz, Amortisman ve Vergi Öncesi Kârın (FAVÖK) toplam gelire oranı. Esas faaliyet karlılığını ölçer.", value: fundamentals.ebitdaMargins ? (fundamentals.ebitdaMargins * 100).toFixed(2) + '%' : '-' },
    { label: "Kâr Marjı", desc: "Net Kâr / Toplam Gelir: Satışların ne kadarının net kâra dönüştüğünü gösterir.", value: fundamentals.profitMargins ? (fundamentals.profitMargins * 100).toFixed(2) + '%' : '-' },
    { label: "Gelir Büyümesi", desc: "Son 1 yıllık dönemdeki toplam ciro artış hızı.", value: fundamentals.revenueGrowth ? (fundamentals.revenueGrowth * 100).toFixed(2) + '%' : '-' },
    { label: "ROE", desc: "Özsermaye Kârlılığı: Hissedarların yatırdığı her 1 TL için yaratılan kârdır.", value: fundamentals.returnOnEquity ? (fundamentals.returnOnEquity * 100).toFixed(2) + '%' : '-' },
  ];

  return (
    <div style={{ padding: '10px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
        {items.map((item, idx) => (
          <div key={idx} style={{ padding: '15px', background: '#111', borderRadius: '8px', border: '1px solid #333', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{item.label}</div>
              <span 
                title={item.desc}
                style={{ cursor: 'help', color: 'var(--color-cyan)', fontSize: '12px', background: 'rgba(0, 229, 255, 0.1)', padding: '2px 6px', borderRadius: '4px' }}
              >
                ?
              </span>
            </div>
            <div style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold' }}>
              {item.value !== null && item.value !== undefined && item.value !== '-' && typeof item.value === 'number' ? item.value.toFixed(2) : item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
