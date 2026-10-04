import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { slugifyBroker } from '../utils/slugify';
import ImageWithFallback from '../components/ImageWithFallback';
import PageContainer from '../components/common/PageContainer';

export default function Brokerages() {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL'); // 'ALL', 'COVERAGE_30', 'HIGH_POTENTIAL', 'BUY_HEAVY'
  const [sortConfig, setSortConfig] = useState({ key: 'count', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || '/api'}/kurum-stats`)
      .then(res => res.json())
      .then(json => {
        setStats(Array.isArray(json) ? json : []);
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

  const filteredStats = useMemo(() => {
    let result = stats;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(k => k.kurum && k.kurum.toLowerCase().includes(q));
    }

    if (filter === 'COVERAGE_30') {
      result = result.filter(k => (k.count || 0) >= 30);
    } else if (filter === 'HIGH_POTENTIAL') {
      result = result.filter(k => (k.avg_potential || 0) >= 50);
    } else if (filter === 'BUY_HEAVY') {
      result = result.filter(k => (k.ratings?.AL || 0) > (k.ratings?.TUT || 0));
    }

    return result;
  }, [stats, search, filter]);

  const sortedStats = useMemo(() => {
    let sortableItems = [...filteredStats];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        if (sortConfig.key === 'kurum') {
          return sortConfig.direction === 'asc'
            ? String(valA || '').localeCompare(String(valB || ''), 'tr')
            : String(valB || '').localeCompare(String(valA || ''), 'tr');
        }

        if (valA === null || valA === undefined) valA = (sortConfig.direction === 'desc' ? -999999 : 999999);
        if (valB === null || valB === undefined) valB = (sortConfig.direction === 'desc' ? -999999 : 999999);

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [filteredStats, sortConfig]);

  const totalReports = useMemo(() => {
    return stats.reduce((acc, k) => acc + (k.count || 0), 0);
  }, [stats]);

  const avgOverallPotential = useMemo(() => {
    if (stats.length === 0) return '0.0';
    const withPot = stats.filter(k => typeof k.avg_potential === 'number');
    if (withPot.length === 0) return '0.0';
    const sum = withPot.reduce((acc, k) => acc + k.avg_potential, 0);
    return (sum / withPot.length).toFixed(1);
  }, [stats]);

  const totalPages = Math.ceil(sortedStats.length / itemsPerPage) || 1;
  const paginatedStats = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedStats.slice(start, start + itemsPerPage);
  }, [sortedStats, currentPage, itemsPerPage]);

  return (
    <PageContainer
      title="Kurumlar"
      badge={{
        label: `${sortedStats.length} KURUM`,
        background: 'rgba(200, 162, 74, 0.15)',
        color: 'var(--color-cyan)',
        borderColor: 'rgba(200, 162, 74, 0.35)'
      }}
      subtitle="Araştırma ve model portföy yayımlayan kurumlar: kapsam, görüş dağılımı ve ortalama potansiyel."
      statusDot="var(--color-cyan)"
      headerRight={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
          <span style={{ color: 'var(--text-muted)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', padding: '2px 8px', borderRadius: '4px' }}>
            Toplam: <strong style={{ color: 'var(--text-primary)' }}>{totalReports}</strong> Rapor
          </span>
          <span style={{ color: 'var(--text-muted)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', padding: '2px 8px', borderRadius: '4px' }}>
            Ort. Potansiyel: <strong style={{ color: 'var(--color-up)' }}>%{avgOverallPotential}</strong>
          </span>
        </div>
      }
    >
      <div className="panel flex-1" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, marginBottom: 0 }}>
        <div className="panel-content" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: '8px 10px' }}>
          
          {/* Controls and Filters Ribbon */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Aracı Kurum Ara..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                style={{
                  width: '220px',
                  height: '28px',
                  padding: '3px 10px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  borderRadius: '4px',
                  fontSize: '11px',
                  outline: 'none'
                }}
              />
              <button 
                onClick={() => { setFilter('ALL'); setSearch(''); setCurrentPage(1); }}
                className={`action-button ${filter === 'ALL' && !search ? 'active' : ''}`}
              >
                Tümü
              </button>
              <button 
                onClick={() => { setFilter('COVERAGE_30'); setCurrentPage(1); }}
                className={`action-button ${filter === 'COVERAGE_30' ? 'active-green' : ''}`}
              >
                Geniş kapsam (30+)
              </button>
              <button 
                onClick={() => { setFilter('HIGH_POTENTIAL'); setCurrentPage(1); }}
                className={`action-button ${filter === 'HIGH_POTENTIAL' ? 'active-purple' : ''}`}
              >
                Yüksek potansiyel (%50+)
              </button>
              <button 
                onClick={() => { setFilter('BUY_HEAVY'); setCurrentPage(1); }}
                className={`action-button ${filter === 'BUY_HEAVY' ? 'active-warning' : ''}`}
              >
                AL ağırlıklı
              </button>
              <button 
                onClick={() => { setFilter('ALL'); setSearch(''); setCurrentPage(1); }}
                className="action-button"
              >
                Sıfırla
              </button>
            </div>
          </div>

          <div className="table-responsive stable-scroll" style={{ flex: 1, overflowY: 'auto', borderBottom: '1px solid var(--border-color)' }}>
            <table className="data-table data-table-fixed compact-terminal-table" style={{ width: '100%' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-panel)', zIndex: 2, boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                <tr>
                  <th style={{ width: '4.5%', textAlign: 'center' }}></th>
                  <th style={{ width: '22.5%', cursor: 'pointer', textAlign: 'left' }} onClick={() => handleSort('kurum')}>
                    ARACI KURUM {sortConfig.key === 'kurum' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                  </th>
                  <th style={{ width: '9.5%', cursor: 'pointer', textAlign: 'center' }} onClick={() => handleSort('count')}>
                    KAPSAM {sortConfig.key === 'count' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                  </th>
                  <th style={{ width: '26.5%', textAlign: 'center' }}>
                    TAVSİYE DAĞILIMI
                  </th>
                  <th style={{ width: '13.5%', cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('avg_potential')}>
                    ORT. POTANSİYEL {sortConfig.key === 'avg_potential' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                  </th>
                  <th style={{ width: '10%', textAlign: 'center' }}>
                    İŞLEM
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && stats.length === 0 ? (
                  Array.from({ length: 18 }).map((_, i) => (
                    <tr key={`skel-${i}`}>
                      <td style={{ textAlign: 'center' }}>
                        <div className="skeleton-bar" style={{ width: '26px', height: '26px', borderRadius: '50%', margin: '0 auto' }} />
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        <div className="skeleton-bar" style={{ width: '120px', height: '14px' }} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="skeleton-bar" style={{ width: '45px', height: '14px', margin: '0 auto' }} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="skeleton-bar" style={{ width: '160px', height: '14px', margin: '0 auto' }} />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="skeleton-bar" style={{ width: '55px', height: '14px', marginLeft: 'auto' }} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="skeleton-bar" style={{ width: '55px', height: '20px', margin: '0 auto' }} />
                      </td>
                    </tr>
                  ))
                ) : paginatedStats.length > 0 ? (
                  paginatedStats.map(k => {
                    const slug = slugifyBroker(k.kurum);
                    const al = k.ratings?.AL || 0;
                    const tut = k.ratings?.TUT || 0;
                    const sat = k.ratings?.SAT || 0;
                    const totalRatings = al + tut + sat;
                    const alPct = totalRatings > 0 ? (al / totalRatings) * 100 : 0;
                    const tutPct = totalRatings > 0 ? (tut / totalRatings) * 100 : 0;
                    const satPct = totalRatings > 0 ? (sat / totalRatings) * 100 : 0;

                    return (
                      <tr key={k.kurum} className="row-hoverable">
                        <td style={{ textAlign: 'center', width: '4.5%' }}>
                          <ImageWithFallback 
                            src={`${import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://127.0.0.1:8015'}/logos/brokers/${slug}.png`} 
                            alt={k.kurum} 
                            fallbackName={k.kurum}
                            size={26}
                            style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#fff', objectFit: 'contain', margin: '0 auto', display: 'block' }}
                          />
                        </td>
                        <td style={{ textAlign: 'left', width: '22.5%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <Link 
                            to={`/kurum/${k.kurum.replace(/\s+/g, '-').toLowerCase()}`} 
                            className="ticker-link" 
                            style={{ fontSize: '13px', fontWeight: 'bold' }}
                          >
                            {k.kurum}
                          </Link>
                        </td>
                        <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                          <span style={{ fontWeight: 'bold', color: 'var(--text-highlight)', fontSize: '13px' }}>{k.count}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '3px' }}>Hisse</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {totalRatings > 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                              <div style={{ flex: 1, maxWidth: '130px', height: '4px', borderRadius: '2px', overflow: 'hidden', background: 'rgba(255,255,255,0.06)', display: 'flex' }}>
                                {alPct > 0 && <div style={{ width: `${alPct}%`, background: 'var(--color-up)' }} />}
                                {tutPct > 0 && <div style={{ width: `${tutPct}%`, background: 'var(--color-warning)' }} />}
                                {satPct > 0 && <div style={{ width: `${satPct}%`, background: 'var(--color-down)' }} />}
                              </div>
                              <div style={{ display: 'flex', gap: '5px', fontSize: '11px', fontWeight: 'bold', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                <span style={{ color: 'var(--color-up)' }}>{al} AL</span>
                                <span style={{ color: 'var(--color-warning)' }}>{tut} TUT</span>
                                {sat > 0 ? (
                                  <span style={{ color: 'var(--color-down)' }}>{sat} SAT</span>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)', opacity: 0.35 }}>0 SAT</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>--</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '13px', fontVariantNumeric: 'tabular-nums', color: k.avg_potential > 0 ? 'var(--color-up)' : 'var(--color-down)' }}>
                          {typeof k.avg_potential === 'number' ? `${k.avg_potential > 0 ? '+' : ''}${k.avg_potential.toFixed(2)}%` : '—'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <Link 
                            to={`/kurum/${k.kurum.replace(/\s+/g, '-').toLowerCase()}`} 
                            className="action-button" 
                            style={{ padding: '3px 8px', fontSize: '10.5px' }}
                          >
                            Raporlar
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                      Kriterlere uygun aracı kurum bulunamadı.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-color)', fontSize: '11.5px', flexShrink: 0 }}>
            <div style={{ color: 'var(--text-muted)' }}>
              Gösterilen: {sortedStats.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, sortedStats.length)} / Toplam: {sortedStats.length}
            </div>
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              <button 
                className="action-button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{ opacity: currentPage === 1 ? 0.4 : 1, cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
              >
                &lt; Önceki
              </button>
              <span style={{ padding: '3px 8px', color: 'var(--text-highlight)', fontWeight: 'bold' }}>
                Sayfa {currentPage} / {totalPages || 1}
              </span>
              <button 
                className="action-button"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                style={{ opacity: (currentPage === totalPages || totalPages === 0) ? 0.4 : 1, cursor: (currentPage === totalPages || totalPages === 0) ? 'not-allowed' : 'pointer' }}
              >
                Sonraki &gt;
              </button>
            </div>
          </div>

        </div>
      </div>
    </PageContainer>
  );
}