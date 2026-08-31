import React from 'react';

export default function TabDividends({ fundamentals }) {
  if (!fundamentals) {
    return <div className="text-muted">Veriler yukleniyor...</div>;
  }

  const renderList = (dataKey, title, valueLabel) => {
    const data = fundamentals[dataKey];
    if (!data || !data.dates || data.dates.length === 0) {
      return <div className="text-muted" style={{ marginBottom: '20px' }}>{title} verisi bulunamadi.</div>;
    }

    return (
      <div style={{ marginBottom: '30px' }}>
        <h4 style={{ color: 'var(--color-cyan)', marginBottom: '10px' }}>{title}</h4>
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
      {renderList('dividends', 'Temettu Gecmisi', 'Hisse Basi Temettu (TL)')}
      {renderList('splits', 'Sermaye Artirimlari / Bolunmeler', 'Bolunme Orani')}
    </div>
  );
}
