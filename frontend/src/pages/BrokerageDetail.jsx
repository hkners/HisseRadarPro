import React, { useEffect, useState, Fragment } from 'react';
import { useParams, Link } from 'react-router-dom';
import { slugifyBroker } from '../utils/slugify';
import ImageWithFallback from '../components/ImageWithFallback';

export default function BrokerageDetail() {
  const { kurumName } = useParams();
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState(null);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/kurum/${kurumName}`)
      .then(res => res.json())
      .then(data => {
        setRecs(data);
        setLoading(false);
      });
  }, [kurumName]);

  const toggleRow = (index) => {
    setExpandedRow(expandedRow === index ? null : index);
  };

  const displayName = kurumName.replace(/-/g, ' ').toUpperCase();
  const brokerSlug = slugifyBroker(kurumName.replace(/-/g, ' '));

  const getPotentialColor = (potStr) => {
    if (!potStr) return 'var(--text-muted)';
    const num = parseFloat(potStr.replace('%', '').replace(',', '.'));
    if (isNaN(num)) return 'var(--text-muted)';
    if (num > 50) return '#00ff00';
    if (num > 20) return '#55cc55';
    if (num > 0) return '#88aa88';
    if (num < -20) return '#ff0000';
    if (num < 0) return '#cc5555';
    return 'var(--color-neutral)';
  };

  const totalRecs = recs.length;
  const matchedRecs = recs.filter(r => r.ticker).length;

  return (
    <div>
      <div style={{ marginBottom: '15px' }}>
        <Link to="/brokerages" className="ticker-link text-neutral">&lt; BACK TO INDEX</Link>
      </div>

      <div className="panel flex-1">
        <div className="panel-header" style={{ color: 'var(--text-highlight)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ImageWithFallback 
            src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/brokers/${brokerSlug}.png`} 
            alt={displayName} 
            fallbackName={displayName}
            size={24}
            style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#fff', objectFit: 'contain' }}
          />
          BROKERAGE ANALYSIS: {displayName}
        </div>
        <div className="panel-content">
          <div style={{ display: 'flex', gap: '30px', marginBottom: '15px', fontSize: '13px' }}>
            <span className="text-muted">
              TOTAL RECOMMENDATIONS: <span className="text-up" style={{ fontWeight: '700' }}>{totalRecs}</span>
            </span>
            <span className="text-muted">
              TICKER MATCHED: <span style={{ fontWeight: '700', color: matchedRecs === totalRecs ? 'var(--color-up)' : 'var(--color-warning)' }}>{matchedRecs}/{totalRecs}</span>
            </span>
          </div>

          {loading ? (
            <div className="text-highlight">LOADING DATABASE...</div>
          ) : recs.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th></th>
                  <th>TICKER</th>
                  <th>COMPANY</th>
                  <th>DATE</th>
                  <th>REPORT PRICE</th>
                  <th>TARGET PRICE</th>
                  <th>LIVE PRICE</th>
                  <th>POTENTIAL</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {recs.map((r, i) => {
                  const isExpanded = expandedRow === i;
                  const tickerDisplay = r.ticker || r.hisse;
                  const linkTarget = r.ticker ? `/hisse/${r.ticker}` : '#';
                  const isUnknown = (val) => !val || val === 'Bilinmiyor';
                  const reportPrice = isUnknown(r.mevcutFiyat) ? null : parseFloat(String(r.mevcutFiyat).replace(',','.'));
                  const targetPrice = isUnknown(r.hedefFiyat) ? null : parseFloat(String(r.hedefFiyat).replace(',','.'));
                  // Calculate live potential if we have both live_price and target
                  let livePotential = null;
                  if (r.live_price && targetPrice) {
                    livePotential = ((targetPrice - r.live_price) / r.live_price * 100).toFixed(1);
                  }
                  
                  return (
                    <Fragment key={i}>
                      <tr className="row-hoverable" onClick={() => toggleRow(i)}>
                        <td style={{ width: '36px', textAlign: 'center' }}>
                          <ImageWithFallback 
                            src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/${r.ticker || 'UNKNOWN'}.png`} 
                            alt={tickerDisplay} 
                            fallbackName={tickerDisplay}
                            size={24}
                            style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#fff', objectFit: 'contain', verticalAlign: 'middle' }}
                          />
                        </td>
                        <td>
                          <Link to={linkTarget} className="ticker-link" onClick={(e) => e.stopPropagation()}>
                            <span style={{ fontWeight: 'bold', color: r.ticker ? 'var(--text-highlight)' : 'var(--color-warning)' }}>
                              {tickerDisplay}
                            </span>
                          </Link>
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                          {r.hisse}
                        </td>
                        <td>{r.tarih}</td>
                        <td>{reportPrice !== null ? reportPrice.toFixed(2) : <span style={{color:'var(--text-muted)'}}>-</span>}</td>
                        <td style={{ fontWeight: '700', color: '#fff' }}>{targetPrice !== null ? targetPrice.toFixed(2) : <span style={{color:'var(--text-muted)'}}>-</span>}</td>
                        <td style={{ fontWeight: '700' }}>
                          {r.live_price ? (
                            <span>
                              <span style={{ color: 'var(--text-highlight)' }}>{r.live_price.toFixed(2)}</span>
                              {r.live_change_pct !== null && r.live_change_pct !== undefined && (
                                <span style={{ 
                                  color: r.live_change_pct > 0 ? 'var(--color-up)' : r.live_change_pct < 0 ? 'var(--color-down)' : 'var(--color-neutral)',
                                  fontSize: '0.75rem', marginLeft: '4px'
                                }}>
                                  {r.live_change_pct > 0 ? '\u25b2' : r.live_change_pct < 0 ? '\u25bc' : ''}{Math.abs(r.live_change_pct).toFixed(1)}%
                                </span>
                              )}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>N/A</span>
                          )}
                        </td>
                        <td style={{ fontWeight: '700' }}>
                          {livePotential !== null ? (
                            <span style={{ color: getPotentialColor(livePotential + '%') }}>
                              %{livePotential > 0 ? '+' : ''}{livePotential}
                            </span>
                          ) : !isUnknown(r.potansiyel) ? (
                            <span style={{ color: getPotentialColor(r.potansiyel) }}>
                              {r.potansiyel}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>-</span>
                          )}
                        </td>
                        <td>
                          <button className="btn-read">
                            {isExpanded ? '[-] CLOSE' : '[+] READ'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="accordion-row">
                          <td colSpan="9">
                            <div className="accordion-content">
                              <div style={{ color: 'var(--text-highlight)', marginBottom: '10px', fontWeight: 'bold' }}>
                                RAPOR TAM METN\u0130 ({r.tarih}):
                              </div>
                              {r.full_text ? r.full_text : "Metin bulunamad\u0131."}
                              <div style={{ marginTop: '15px' }}>
                                <a href={r.link} target="_blank" rel="noreferrer" className="ticker-link text-neutral">
                                  [OR\u0130J\u0130NAL KAYNA\u011eA G\u0130T]
                                </a>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-muted">NO DATA FOUND FOR THIS BROKERAGE.</div>
          )}
        </div>
      </div>
    </div>
  );
}
