import React, { useEffect, useState, Fragment } from 'react';
import { useParams, Link } from 'react-router-dom';
import { slugifyBroker } from '../utils/slugify';
import ImageWithFallback from '../components/ImageWithFallback';
import ReportDetail from '../components/ReportDetail';

export default function StockDetail() {
  const { ticker } = useParams();
  const [stock, setStock] = useState(null);
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState(null);

  useEffect(() => {
    // Fetch live price
    fetch(`${import.meta.env.VITE_API_URL}/stocks/${ticker}`)
      .then(res => res.json())
      .then(data => {
        setStock(data);
      });

    // Fetch scraped recommendations
    fetch(`${import.meta.env.VITE_API_URL}/recommendations/${ticker}`)
      .then(res => res.json())
      .then(data => {
        // Filter out extreme outliers (e.g. stock splits causing >500% target difference)
        const validRecs = data.filter(r => {
            const tgt = r.hedefFiyat;
            const mev = r.mevcutFiyat;
            if (!tgt || tgt === "Bilinmiyor" || !mev || mev === "Bilinmiyor") return true;
            try {
                const tVal = parseFloat(tgt.toString().replace(',', '.'));
                const mVal = parseFloat(mev.toString().replace(',', '.'));
                if (mVal > 0 && ((tVal - mVal) / mVal * 100) > 500) return false;
            } catch {}
            return true;
        });
        setRecs(validRecs);
        setLoading(false);
      });
  }, [ticker]);

  // Calc live potential
  const getLivePotentialVal = (target, live) => {
    if (!target || target === "Bilinmiyor" || !live || live === 0) return null;
    const tgt = parseFloat(target.toString().replace(',','.'));
    if (isNaN(tgt)) return null;
    return ((tgt - live) / live) * 100;
  };

  const getLivePotential = (target, live) => {
    const pot = getLivePotentialVal(target, live);
    if (pot === null) return "-";
    return pot >= 0 ? `+${pot.toFixed(2)}%` : `${pot.toFixed(2)}%`;
  };

  const toggleRow = (index) => {
    setExpandedRow(expandedRow === index ? null : index);
  };

  // Compute Consensus Snapshot
  const consensus = React.useMemo(() => {
    let targets = [];
    let ratings = { AL: 0, TUT: 0, SAT: 0 };
    recs.forEach(r => {
        const tgt = r.hedefFiyat;
        if (tgt && tgt !== "Bilinmiyor") {
            try { targets.push(parseFloat(tgt.toString().replace(',', '.'))); } catch {}
        }
        const potStr = String(r.potansiyel || "").toUpperCase();
        if (potStr.includes("END") && (potStr.includes("ÜZER") || potStr.includes("UZER"))) ratings.AL++;
        else if (potStr.includes("END") && potStr.includes("PARALEL")) ratings.TUT++;
        else if (potStr.includes("END") && potStr.includes("ALT")) ratings.SAT++;
        else if (potStr.includes("AL")) ratings.AL++;
        else if (potStr.includes("TUT")) ratings.TUT++;
        else if (potStr.includes("SAT")) ratings.SAT++;
    });
    
    const avgTarget = targets.length > 0 ? targets.reduce((a,b)=>a+b, 0) / targets.length : null;
    let avgPotential = null;
    if (avgTarget && stock && stock.price) {
        avgPotential = ((avgTarget - stock.price) / stock.price) * 100;
    }
    
    return { avgTarget, avgPotential, ratings, count: recs.length };
  }, [recs, stock]);

  return (
    <div>
      <div style={{ marginBottom: '15px' }}>
        <Link to="/" className="ticker-link text-neutral">&lt; BACK TO INDEX</Link>
      </div>

      <div className="flex-row">
        {/* Left Panel: Live Data */}
        <div className="panel" style={{ width: '300px' }}>
          <div className="panel-header" style={{ color: 'var(--text-highlight)', display: 'flex', alignItems: 'center', gap: '15px', fontSize: '1.2rem' }}>
            <ImageWithFallback 
              src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/${ticker}.png`} 
              alt={ticker} 
              fallbackName={ticker}
              size={48}
              style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#fff', objectFit: 'contain', padding: '2px' }}
            />
            <span>{ticker} A.Ş.</span>
          </div>
          <div className="panel-content">
            {stock ? (
              <div>
                <p className="text-muted" style={{ marginBottom: '10px' }}>LIVE QUOTE (BIST DELAYED)</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '15px' }}>
                  <div style={{ fontSize: '32px', color: '#fff', fontWeight: '700' }}>
                    {stock.price ? stock.price.toFixed(2) : "N/A"} <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{stock.currency}</span>
                  </div>
                  {stock.change_pct !== undefined && stock.change_pct !== null && stock.change_pct !== 0 && (
                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: stock.change_pct > 0 ? 'var(--color-up)' : 'var(--color-down)' }}>
                        {stock.change_pct > 0 ? '\u25b2' : '\u25bc'} {Math.abs(stock.change_pct).toFixed(2)}%
                    </div>
                  )}
                </div>
                
                <hr style={{ borderColor: 'var(--border-color)', margin: '20px 0' }} />
                
                <p className="text-highlight" style={{ fontWeight: 'bold', marginBottom: '15px' }}>CONSENSUS SNAPSHOT</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="text-muted">Avg Target Price:</span>
                        <span style={{ fontWeight: 'bold', color: '#fff' }}>{consensus.avgTarget ? consensus.avgTarget.toFixed(2) : 'N/A'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="text-muted">Avg Upside:</span>
                        <span style={{ fontWeight: 'bold', color: consensus.avgPotential !== null ? (consensus.avgPotential > 0 ? 'var(--color-up)' : 'var(--color-down)') : 'var(--text-muted)' }}>
                            {consensus.avgPotential !== null ? `${consensus.avgPotential > 0 ? '+' : ''}${consensus.avgPotential.toFixed(2)}%` : 'N/A'}
                        </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5px' }}>
                        <span className="text-muted">Rating Split:</span>
                        <div style={{ display: 'flex', gap: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                          {consensus.ratings.AL > 0 && <span style={{ background: 'var(--color-up)', color: '#000', padding: '2px 6px', borderRadius: '4px' }}>{consensus.ratings.AL} AL</span>}
                          {consensus.ratings.TUT > 0 && <span style={{ background: 'var(--color-warning)', color: '#000', padding: '2px 6px', borderRadius: '4px' }}>{consensus.ratings.TUT} TUT</span>}
                          {consensus.ratings.SAT > 0 && <span style={{ background: 'var(--color-down)', color: '#fff', padding: '2px 6px', borderRadius: '4px' }}>{consensus.ratings.SAT} SAT</span>}
                          {consensus.count === 0 && <span style={{ color: 'var(--text-muted)' }}>NO DATA</span>}
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: '20px' }}>
                    <ReportDetail r={{ ticker: ticker }} />
                </div>
              </div>
            ) : (
              <div className="text-highlight">FETCHING YFINANCE...</div>
            )}
          </div>
        </div>

        {/* Right Panel: Recommendations */}
        <div className="panel flex-1">
          <div className="panel-header">
            BROKERAGE TARGETS & CONSENSUS
          </div>
          <div className="panel-content">
            {loading ? (
              <div className="text-highlight">LOADING DATABASE...</div>
            ) : recs.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>BROKERAGE</th>
                    <th>DATE</th>
                    <th>REPORT PRICE</th>
                    <th>TARGET PRICE</th>
                    <th>ORIGINAL POTENTIAL</th>
                    <th>LIVE POTENTIAL</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {recs.map((r, i) => {
                    const isExpanded = expandedRow === i;
                    const livePotVal = stock && stock.price ? getLivePotentialVal(r.hedefFiyat, stock.price) : null;
                    const livePotStr = getLivePotential(r.hedefFiyat, stock?.price);
                    const livePotColor = livePotVal !== null ? (livePotVal >= 0 ? 'text-up' : 'text-down') : 'text-muted';
                    const isUnknown = (val) => !val || val === 'Bilinmiyor';
                    
                    const reportPrice = isUnknown(r.mevcutFiyat) ? null : parseFloat(String(r.mevcutFiyat).replace(',', '.'));
                    const targetPrice = isUnknown(r.hedefFiyat) ? null : parseFloat(String(r.hedefFiyat).replace(',', '.'));
                    const brokerSlug = slugifyBroker(r.kurum);
                    
                    return (
                      <Fragment key={i}>
                        <tr className="row-hoverable" onClick={() => toggleRow(i)}>
                          <td style={{ color: 'var(--text-highlight)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <ImageWithFallback 
                                src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/brokers/${brokerSlug}.png`} 
                                alt={r.kurum} 
                                fallbackName={r.kurum}
                                size={24}
                                style={{ width: '24px', height: '24px', borderRadius: '4px', background: '#fff', objectFit: 'contain', padding: '1px' }}
                              />
                              <Link to={`/kurum/${brokerSlug}`} onClick={(e) => e.stopPropagation()} className="ticker-link text-warning" style={{ fontWeight: 'bold' }}>
                                {r.kurum}
                              </Link>
                            </div>
                          </td>
                          <td>{r.tarih}</td>
                          <td>{reportPrice !== null ? reportPrice.toFixed(2) : '-'}</td>
                          <td style={{ fontWeight: '700', color: '#fff' }}>{targetPrice !== null ? targetPrice.toFixed(2) : '-'}</td>
                          <td className="text-neutral">{!isUnknown(r.potansiyel) ? r.potansiyel : '-'}</td>
                          <td className={livePotColor} style={{ fontWeight: '700' }}>
                            {livePotStr}
                          </td>
                          <td>
                            <button className="btn-read">
                              {isExpanded ? '[-] CLOSE' : '[+] READ'}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="accordion-row">
                            <td colSpan="7">
                              <div className="accordion-content">
                                <div style={{ color: 'var(--text-highlight)', marginBottom: '10px', fontWeight: 'bold' }}>
                                  RAPOR TAM METNİ ({r.tarih}):
                                </div>
                                {r.full_text ? r.full_text : "Metin bulunamadı veya eski formatta kaydedilmiş."}
                                <div style={{ marginTop: '15px' }}>
                                  <a href={r.link} target="_blank" rel="noreferrer" className="ticker-link text-neutral">
                                    [ORİJİNAL KAYNAĞA GİT]
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
              <div className="text-muted">NO RECOMMENDATIONS FOUND IN RECENT BATCH.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
