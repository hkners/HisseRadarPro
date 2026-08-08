import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { slugifyBroker } from '../utils/slugify';
import ImageWithFallback from '../components/ImageWithFallback';

export default function Brokerages() {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);

  const [sortConfig, setSortConfig] = useState({ key: 'count', direction: 'desc' });

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/kurum-stats`)
      .then(res => res.json())
      .then(json => {
        setStats(json);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const sortedStats = React.useMemo(() => {
    let sortableItems = [...stats];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];
        
        if (typeof valA === 'string' && typeof valB === 'string') {
            return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        
        if (valA === null || valA === undefined) valA = -999999;
        if (valB === null || valB === undefined) valB = -999999;
        
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [stats, sortConfig]);

  return (
    <div className="panel flex-1">
      <div className="panel-header" style={{ color: 'var(--color-warning)' }}>
        BROKERAGE DIRECTORY // INSTITUTIONAL COVERAGE STATS
      </div>
      <div className="panel-content">
        <p className="text-muted" style={{ marginBottom: '15px' }}>
          &gt; FULL LIST OF BROKERAGE FIRMS AND THEIR HISTORICAL REPORTING PERFORMANCE.
        </p>

        {loading ? (
          <div style={{ color: 'var(--text-highlight)' }}>LOADING BROKERAGE DATA...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '50px' }}></th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('kurum')}>BROKERAGE ↕</th>
                <th style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => handleSort('count')}>TOTAL REPORTS ↕</th>
                <th style={{ textAlign: 'center' }}>RATING HISTORY</th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_potential')}>AVG CLAIMED POTENTIAL ↕</th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_realized')}>REALIZED SUCCESS ↕</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {sortedStats.map(k => {
                const slug = slugifyBroker(k.kurum);
                return (
                  <tr key={k.kurum} className="row-hoverable">
                    <td style={{ textAlign: 'center' }}>
                      <ImageWithFallback 
                        src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/brokers/${slug}.png`} 
                        alt={k.kurum} 
                        fallbackName={k.kurum}
                        size={40}
                        style={{ width: '40px', height: '40px', borderRadius: '4px', background: '#fff', objectFit: 'contain', padding: '2px' }}
                      />
                    </td>
                    <td style={{ fontWeight: 'bold' }}>
                      <Link to={`/kurum/${k.kurum.replace(/\s+/g, '-').toLowerCase()}`} className="ticker-link text-warning" style={{ fontSize: '1.1rem' }}>
                        {k.kurum}
                      </Link>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 'bold', color: 'var(--color-neutral)' }}>{k.count}</td>
                    <td style={{ textAlign: 'center' }}>
                      {k.ratings && (
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold' }}>
                          {k.ratings.AL > 0 && <span style={{ background: 'var(--color-up)', color: '#000', padding: '2px 6px', borderRadius: '4px' }}>{k.ratings.AL} AL</span>}
                          {k.ratings.TUT > 0 && <span style={{ background: 'var(--color-warning)', color: '#000', padding: '2px 6px', borderRadius: '4px' }}>{k.ratings.TUT} TUT</span>}
                          {k.ratings.SAT > 0 && <span style={{ background: 'var(--color-down)', color: '#fff', padding: '2px 6px', borderRadius: '4px' }}>{k.ratings.SAT} SAT</span>}
                        </div>
                      )}
                    </td>
                    <td style={{ fontWeight: 'bold', color: 'var(--text-muted)' }}>
                      {k.avg_potential > 0 ? '+' : ''}{k.avg_potential.toFixed(2)}%
                    </td>
                    <td style={{ fontWeight: 'bold', color: k.avg_realized !== null ? (k.avg_realized > 0 ? 'var(--color-up)' : 'var(--color-down)') : 'var(--text-muted)' }}>
                      {k.avg_realized !== null ? `${k.avg_realized > 0 ? '+' : ''}${k.avg_realized.toFixed(2)}%` : 'N/A'}
                    </td>
                    <td>
                      <Link to={`/kurum/${k.kurum.replace(/\s+/g, '-').toLowerCase()}`} className="ticker-link text-neutral">
                        [VIEW REPORTS]
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {stats.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center' }}>NO DATA AVAILABLE.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}