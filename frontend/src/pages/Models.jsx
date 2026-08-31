import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ImageWithFallback from '../components/ImageWithFallback';
import slugifyBroker from '../utils/slugify';

export default function Models() {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/models`)
      .then(res => res.json())
      .then(json => {
        setModels(json);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="panel flex-1">
      <div className="panel-header" style={{ color: 'var(--color-warning)' }}>
        CANLI MODEL PORTFÖYLER (FINTABLES)
      </div>
      <div className="panel-content">
        <p className="text-muted" style={{ marginBottom: '20px' }}>
          &gt; Fintables veritabanı kullanılarak kurumların aktif model portföylerindeki hisseler canlı olarak derlenmektedir.
        </p>

        {loading ? (
          <div style={{ color: 'var(--text-highlight)' }}>YÜKLENİYOR...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '15px' }}>
            {models.length === 0 && (
              <div style={{
                border: '1px dashed #333',
                padding: '40px',
                textAlign: 'center',
                color: 'var(--text-muted)',
              }}>
                <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', color: 'var(--color-neutral)' }}>
                  // NO MODEL PORTFOLIO DATA
                </div>
                <div style={{ fontSize: '12px' }}>
                  Guncel model portfoy verisi bulunamadi.
                </div>
              </div>
            )}
            
            {models.filter(m => m.stocks && m.stocks.length > 0).map(m => (
              <div key={m.id} style={{ border: '1px solid var(--border-color)', background: 'var(--panel-bg)' }}>
                {/* Header for Broker */}
                <div 
                  onClick={() => navigate(`/kurum/${m.kurum.replace(/\s+/g, '-').toLowerCase()}`)}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    padding: '12px 15px', 
                    borderBottom: '1px solid var(--border-color)',
                    background: 'rgba(0,0,0,0.2)',
                    cursor: 'pointer'
                  }}
                  className="row-hoverable"
                >
                  <div style={{ marginRight: '15px' }}>
                    <ImageWithFallback 
                      src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/brokers/${slugifyBroker(m.kurum)}.png`} 
                      alt={m.kurum} 
                      style={{ width: '40px', height: '40px', objectFit: 'contain', borderRadius: '4px' }} 
                      name={m.kurum}
                    />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--color-warning)' }}>{m.kurum}</h3>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{m.title} - {m.tarih}</div>
                  </div>
                </div>

                {/* Table of Stocks */}
                {m.stocks && m.stocks.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table" style={{ width: '100%', textAlign: 'left', border: 'none' }}>
                      <thead>
                          <tr>
                              <th style={{ paddingLeft: '10px' }}>HİSSE</th>
                              <th style={{ textAlign: 'right' }}>HEDEF</th>
                              <th style={{ textAlign: 'right', paddingRight: '10px' }}>POTANSİYEL</th>
                          </tr>
                      </thead>
                      <tbody>
                          {m.stocks.map((s, idx) => {
                              const isPositive = s.potansiyel && !s.potansiyel.toString().startsWith('-');
                              return (
                                  <tr 
                                    key={idx} 
                                    className="row-hoverable" 
                                    style={{ borderBottom: idx === m.stocks.length - 1 ? 'none' : '1px solid #1a1a1a', cursor: 'pointer' }}
                                    onClick={() => navigate(`/hisse/${s.hisse}`)}
                                  >
                                      <td style={{ paddingLeft: '10px', fontWeight: 'bold', color: 'var(--text-highlight)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <ImageWithFallback 
                                            src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/${s.hisse}.png`} 
                                            alt={s.hisse} 
                                            style={{ width: '16px', height: '16px', objectFit: 'contain', borderRadius: '2px' }} 
                                            name={s.hisse}
                                          />
                                          <span style={{ fontSize: '0.9rem' }}>{s.hisse}</span>
                                        </div>
                                      </td>

                                      <td style={{ textAlign: 'right', color: 'var(--text-highlight)', fontSize: '0.9rem' }}>
                                        {s.hedefFiyat && s.hedefFiyat !== 'N/A' ? `${s.hedefFiyat} ₺` : '--'}
                                      </td>
                                      <td style={{ textAlign: 'right', paddingRight: '10px', fontWeight: 'bold', color: isPositive ? 'var(--color-up)' : 'var(--color-down)', fontSize: '0.9rem' }}>
                                        {s.potansiyel && s.potansiyel !== 'N/A' ? `${isPositive ? '+' : ''}${s.potansiyel}%` : '--'}
                                      </td>
                                  </tr>
                              );
                          })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}