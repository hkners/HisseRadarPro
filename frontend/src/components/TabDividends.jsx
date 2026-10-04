import React from 'react';

export default function TabDividends({ fundamentals }) {
  if (!fundamentals) {
    return <div className="text-muted">Veriler yukleniyor...</div>;
  }

  const renderList = (dataKey, title, valueLabel, desc) => {
    const data = fundamentals[dataKey];
    if (!data || !data.dates || data.dates.length === 0) {
      return <div className="text-muted" style={{ marginBottom: '20px' }}>{title} verisi bulunamadı.</div>;
    }

    return (
      <div style={{ marginBottom: '30px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
          <h4 style={{ color: 'var(--color-cyan)', margin: 0 }}>{title}</h4>
          <span 
            title={desc}
            style={{ cursor: 'help', color: 'var(--color-cyan)', fontSize: '12px', background: 'rgba(200, 162, 74, 0.1)', padding: '2px 6px', borderRadius: '4px', marginLeft: '10px' }}
          >
            ?
          </span>
        </div>
        
        <table className="data-table" style={{ width: '50%', minWidth: '300px', textAlign: 'left' }}>
          <thead>
            <tr>
              <th>Tarih</th>
              <th>{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.dates.map((date, idx) => (
              <tr key={idx} className="row-hoverable">
                <td>{date}</td>
                <td style={{ fontWeight: 'bold' }}>{data.values[idx] !== null ? data.values[idx].toFixed(4) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={{ padding: '10px' }}>
      {renderList('dividends', 'Temettü Geçmişi', 'Hisse Başı Temettü (TL)', 'Şirketin geçmişte ortaklarına dağıttığı nakit kâr paylarıdır.')}
      {renderList('splits', 'Sermaye Artırımları / Bölünmeler', 'Bölünme Oranı', 'Şirketin bedelli veya bedelsiz olarak hisse senedi sayısını artırmasıdır.')}
    </div>
  );
}
