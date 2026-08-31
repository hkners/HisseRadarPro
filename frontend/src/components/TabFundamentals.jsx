import React, { useState } from 'react';

export default function TabFundamentals({ fundamentals }) {
  const [activeSubTab, setActiveSubTab] = useState('income_statement');

  if (!fundamentals) {
    return <div className="text-muted">Finansal veriler yukleniyor veya bulunamadi...</div>;
  }

  const renderTable = (dataKey) => {
    const data = fundamentals[dataKey];
    if (!data || !data.dates || data.dates.length === 0) {
      return <div className="text-muted">Bu veri seti icin icerik bulunamadi.</div>;
    }

    const { dates, ...rows } = data;
    const rowKeys = Object.keys(rows);

    return (
      <div style={{ overflowX: 'auto', marginTop: '20px' }}>
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', minWidth: '250px', position: 'sticky', left: 0, background: '#111', zIndex: 1 }}>Kalem (Milyon TL)</th>
              {dates.map((date, idx) => (
                <th key={idx}>{date}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowKeys.map((key, i) => (
              <tr key={i} className="row-hoverable">
                <td style={{ textAlign: 'left', position: 'sticky', left: 0, background: '#111', zIndex: 1, borderRight: '1px solid #333' }}>
                  {key}
                </td>
                {rows[key].map((val, idx) => {
                  let displayVal = "-";
                  if (val !== null && val !== undefined) {
                    displayVal = (val / 1000000).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
                  }
                  return (
                    <td key={idx} style={{ color: val && val < 0 ? 'var(--color-down)' : '#ddd' }}>
                      {displayVal}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
        <button 
          onClick={() => setActiveSubTab('income_statement')}
          style={{ background: 'none', border: 'none', color: activeSubTab === 'income_statement' ? 'var(--color-cyan)' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
        >
          GELIR TABLOSU
        </button>
        <button 
          onClick={() => setActiveSubTab('balance_sheet')}
          style={{ background: 'none', border: 'none', color: activeSubTab === 'balance_sheet' ? 'var(--color-cyan)' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
        >
          BILANCO
        </button>
        <button 
          onClick={() => setActiveSubTab('cash_flow')}
          style={{ background: 'none', border: 'none', color: activeSubTab === 'cash_flow' ? 'var(--color-cyan)' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
        >
          NAKIT AKIM
        </button>
      </div>
      
      {renderTable(activeSubTab)}
    </div>
  );
}
