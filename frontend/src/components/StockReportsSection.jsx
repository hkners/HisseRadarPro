import React, { useState, useMemo, Fragment } from 'react';
import { Link } from 'react-router-dom';
import ImageWithFallback from './ImageWithFallback';
import { slugifyBroker } from '../utils/slugify';
import { classifyRating } from '../utils/rating';

export default function StockReportsSection({
  recs = [],
  groupedRecs = { unique: [], history: {} },
  stock,
  loading,
  compactMode = false
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL' | 'FRESH' | 'MODEL' | 'BUY_ONLY' | 'POS_POT'
  const [sortColumn, setSortColumn] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [expandedRow, setExpandedRow] = useState(null);

  const getLivePotentialVal = (target, live) => {
    if (!target || target === "Bilinmiyor" || !live || live === 0) return null;
    const tgt = parseFloat(String(target).replace(',', '.'));
    if (isNaN(tgt)) return null;
    return ((tgt - live) / live) * 100;
  };

  const getLivePotentialStr = (target, live) => {
    const pot = getLivePotentialVal(target, live);
    if (pot === null) return "-";
    return pot >= 0 ? `+${pot.toFixed(1)}%` : `${pot.toFixed(1)}%`;
  };

  const formatPotential = (pot) => {
    if (pot === null || pot === undefined || pot === "N/A" || pot === "Bilinmiyor" || pot === "None") return "-";
    const val = parseFloat(String(pot).replace(',', '.'));
    if (isNaN(val)) return "-";
    return val >= 0 ? `+${val.toFixed(1)}%` : `${val.toFixed(1)}%`;
  };

  const toggleRow = (index) => {
    setExpandedRow(expandedRow === index ? null : index);
  };

  const handleSort = (col) => {
    if (sortColumn === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDir('desc');
    }
  };

  // Base list of unique latest reports per broker
  const uniqueReports = groupedRecs.unique || [];

  // Summary Stats
  const stats = useMemo(() => {
    if (uniqueReports.length === 0) return null;

    let highest = { target: -Infinity, kurum: '' };
    let lowest = { target: Infinity, kurum: '' };
    let targets = [];
    let modelCount = 0;
    let freshCount = 0;
    const now = new Date();

    uniqueReports.forEach(r => {
      const tgt = parseFloat(String(r.hedefFiyat).replace(',', '.'));
      if (!isNaN(tgt) && tgt > 0) {
        targets.push(tgt);
        if (tgt > highest.target) highest = { target: tgt, kurum: r.kurum };
        if (tgt < lowest.target) lowest = { target: tgt, kurum: r.kurum };
      }
      if (r.is_model) modelCount++;
      if (r.tarih) {
        const diffDays = (now - new Date(r.tarih)) / (1000 * 60 * 60 * 24);
        if (diffDays <= 30) freshCount++;
      }
    });

    const avgTarget = targets.length > 0 ? targets.reduce((a, b) => a + b, 0) / targets.length : null;
    const avgPotential = avgTarget && stock?.price ? ((avgTarget - stock.price) / stock.price) * 100 : null;

    return {
      total: uniqueReports.length,
      avgTarget,
      avgPotential,
      highest: highest.target > -Infinity ? highest : null,
      lowest: lowest.target < Infinity ? lowest : null,
      modelCount,
      freshCount
    };
  }, [uniqueReports, stock]);

  // Filtered reports
  const filteredReports = useMemo(() => {
    let list = [...uniqueReports];
    const now = new Date();

    // 1. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(r => r.kurum && r.kurum.toLowerCase().includes(q));
    }

    // 2. Active Quick Filter
    if (activeFilter === 'FRESH') {
      list = list.filter(r => {
        if (!r.tarih) return false;
        return (now - new Date(r.tarih)) / (1000 * 60 * 60 * 24) <= 30;
      });
    } else if (activeFilter === 'MODEL') {
      list = list.filter(r => r.is_model);
    } else if (activeFilter === 'BUY_ONLY') {
      list = list.filter(r => {
        return classifyRating(r.rating || r.tavsiye) === 'AL';
      });
    } else if (activeFilter === 'POS_POT') {
      list = list.filter(r => {
        const pot = stock?.price ? getLivePotentialVal(r.hedefFiyat, stock.price) : null;
        return pot !== null && pot > 0;
      });
    }

    // 3. Sorting
    const parseNum = (val) => {
      if (!val || val === 'Bilinmiyor' || val === 'N/A' || val === 'None') return null;
      const n = parseFloat(String(val).replace(',', '.'));
      return isNaN(n) ? null : n;
    };

    list.sort((a, b) => {
      let vA, vB;
      if (sortColumn === 'date') {
        vA = a.tarih || '';
        vB = b.tarih || '';
        return sortDir === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA);
      }
      if (sortColumn === 'reportPrice') {
        vA = parseNum(a.mevcutFiyat);
        vB = parseNum(b.mevcutFiyat);
      } else if (sortColumn === 'targetPrice') {
        vA = parseNum(a.hedefFiyat);
        vB = parseNum(b.hedefFiyat);
      } else if (sortColumn === 'originalPot') {
        vA = parseNum(a.potansiyel);
        vB = parseNum(b.potansiyel);
      } else if (sortColumn === 'livePot') {
        vA = stock?.price ? getLivePotentialVal(a.hedefFiyat, stock.price) : null;
        vB = stock?.price ? getLivePotentialVal(b.hedefFiyat, stock.price) : null;
      }
      if (vA === null && vB === null) return 0;
      if (vA === null) return 1;
      if (vB === null) return -1;
      return sortDir === 'asc' ? vA - vB : vB - vA;
    });

    return list;
  }, [uniqueReports, searchQuery, activeFilter, sortColumn, sortDir, stock]);

  // Find best and worst in current filtered list for highlighting
  const { bestIdx, worstIdx } = useMemo(() => {
    let best = -Infinity, worst = Infinity, bestI = -1, worstI = -1;
    filteredReports.forEach((r, i) => {
      const pot = stock?.price ? getLivePotentialVal(r.hedefFiyat, stock.price) : null;
      if (pot !== null) {
        if (pot > best) { best = pot; bestI = i; }
        if (pot < worst) { worst = pot; worstI = i; }
      }
    });
    return { bestIdx: bestI, worstIdx: worstI };
  }, [filteredReports, stock]);

  return (
    <div
      className="panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: compactMode ? '100%' : 'auto',
        flexShrink: 0,
        overflow: 'hidden'
      }}
    >
      {/* ─── HEADER & SUMMARY STATS ─── */}
      <div
        className="panel-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '6px',
          padding: compactMode ? '6px 10px' : '8px 12px',
          borderBottom: '1px solid var(--border-color)'
        }}
      >
        <span style={{ color: 'var(--text-highlight)', fontWeight: '900', letterSpacing: '0.4px', fontSize: compactMode ? '11px' : '12px' }}>
          KURUM RAPORLARI ({filteredReports.length}/{uniqueReports.length})
        </span>

        {stats && (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', fontSize: '10px' }}>
            <span style={{ color: 'var(--text-muted)' }}>
              Ort: <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{stats.avgTarget ? stats.avgTarget.toFixed(1) + ' TL' : '-'}</strong>
              {stats.avgPotential !== null && (
                <span style={{ color: stats.avgPotential >= 0 ? 'var(--color-up)' : 'var(--color-down)', marginLeft: '3px', fontWeight: 'bold' }}>
                  ({stats.avgPotential >= 0 ? '+' : ''}{stats.avgPotential.toFixed(0)}%)
                </span>
              )}
            </span>

            {stats.modelCount > 0 && (
              <span style={{ background: 'rgba(201, 136, 58, 0.15)', color: 'var(--warning)', border: '1px solid rgba(201, 136, 58, 0.3)', padding: '0 4px', borderRadius: '2px', fontWeight: 'bold' }}>
                {stats.modelCount} Model
              </span>
            )}
          </div>
        )}
      </div>

      <div
        className="panel-content"
        style={{
          padding: compactMode ? '6px 8px' : '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden'
        }}
      >
        {/* ─── FILTER AND SEARCH TOOLBAR ─── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
          {/* Filter Pills */}
          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
            {[
              { id: 'ALL', label: `Tümü (${uniqueReports.length})` },
              { id: 'FRESH', label: `Taze (${stats?.freshCount || 0})` },
              { id: 'MODEL', label: `Model (${stats?.modelCount || 0})` },
              { id: 'BUY_ONLY', label: 'AL' },
              { id: 'POS_POT', label: 'Pozitif' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setActiveFilter(f.id)}
                className="action-button"
                style={{
                  background: activeFilter === f.id ? 'var(--color-cyan)' : 'rgba(255,255,255,0.03)',
                  color: activeFilter === f.id ? '#000' : 'var(--text-muted)',
                  border: `1px solid ${activeFilter === f.id ? 'var(--color-cyan)' : 'var(--border-color)'}`,
                  fontSize: '10px',
                  fontWeight: activeFilter === f.id ? 'bold' : 'normal',
                  padding: '2px 6px',
                  borderRadius: '3px'
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Kurum Arama */}
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Kurum ara..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="search-box"
              style={{ width: compactMode ? '105px' : '140px', padding: '2px 6px', fontSize: '10px' }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '5px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '9px'
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* ─── DATA TABLE ─── */}
        {loading ? (
          <div className="text-highlight" style={{ textAlign: 'center', padding: '20px', fontSize: '12px' }}>
            VERİLER YÜKLENİYOR...
          </div>
        ) : filteredReports.length > 0 ? (
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
            <table className="data-table" style={{ fontSize: '11px', width: '100%', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: compactMode ? '38%' : '26%' }} />
                <col style={{ width: compactMode ? '16%' : '14%' }} />
                {!compactMode && <col style={{ width: '15%' }} />}
                <col style={{ width: compactMode ? '15%' : '15%' }} />
                {!compactMode && <col style={{ width: '15%' }} />}
                <col style={{ width: compactMode ? '16%' : '15%' }} />
                <col style={{ width: compactMode ? '15%' : '15%' }} />
              </colgroup>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-panel)', zIndex: 2 }}>
                <tr>
                  <th style={{ padding: '5px 4px' }}>KURUM</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'center', padding: '5px 2px' }} onClick={() => handleSort('date')}>
                    TARİH {sortColumn === 'date' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  {!compactMode && (
                    <th style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'right' }} onClick={() => handleSort('reportPrice')}>
                      RAPOR FİY.
                    </th>
                  )}
                  <th style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'right', padding: '5px 3px' }} onClick={() => handleSort('targetPrice')}>
                    HEDEF {sortColumn === 'targetPrice' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  {!compactMode && (
                    <th style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'center' }} onClick={() => handleSort('originalPot')}>
                      ORİJ. POT.
                    </th>
                  )}
                  <th style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'center', padding: '5px 2px' }} onClick={() => handleSort('livePot')}>
                    POT. {sortColumn === 'livePot' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th style={{ textAlign: 'center', padding: '5px 2px' }}>İŞLEM</th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.map((r, i) => {
                  const isExpanded = expandedRow === i;
                  const livePotVal = stock?.price ? getLivePotentialVal(r.hedefFiyat, stock.price) : null;
                  const livePotStr = getLivePotentialStr(r.hedefFiyat, stock?.price);
                  const livePotColor = livePotVal !== null ? (livePotVal >= 0 ? 'text-up' : 'text-down') : 'text-muted';
                  const isUnknown = (val) => !val || val === 'Bilinmiyor' || val === 'N/A' || val === 'None';

                  let reportPrice = isUnknown(r.mevcutFiyat) ? null : parseFloat(String(r.mevcutFiyat).replace(',', '.'));
                  let targetPrice = isUnknown(r.hedefFiyat) ? null : parseFloat(String(r.hedefFiyat).replace(',', '.'));
                  if (isNaN(reportPrice)) reportPrice = null;
                  if (isNaN(targetPrice)) targetPrice = null;

                  const brokerSlug = slugifyBroker(r.kurum);
                  const isBest = i === bestIdx && filteredReports.length > 1;
                  const isWorst = i === worstIdx && filteredReports.length > 1 && bestIdx !== worstIdx;
                  const rowBg = isBest ? 'rgba(63, 138, 107, 0.07)' : isWorst ? 'rgba(192, 82, 78, 0.07)' : undefined;

                  return (
                    <Fragment key={i}>
                      <tr className="row-hoverable" onClick={() => toggleRow(i)} style={{ cursor: 'pointer', background: rowBg }}>
                        <td style={{ color: 'var(--text-highlight)', overflow: 'hidden', padding: compactMode ? '4px 3px' : '6px 8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0, overflow: 'hidden' }}>
                            <ImageWithFallback
                              src={`${import.meta.env.VITE_API_URL.replace(/\/api$/, '')}/logos/brokers/${brokerSlug}.png`}
                              alt={r.kurum}
                              fallbackName={r.kurum}
                              size={18}
                              style={{ width: '18px', height: '18px', borderRadius: '3px', background: '#fff', objectFit: 'contain', padding: '1px', flexShrink: 0 }}
                            />
                            <Link
                              to={`/kurum/${r.kurum.replace(/\s+/g, '-').toLowerCase()}`}
                              onClick={(e) => e.stopPropagation()}
                              className="ticker-link text-warning"
                              style={{ fontWeight: 'bold', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}
                              title={r.kurum}
                            >
                              {r.kurum}
                            </Link>
                            {r.is_model && (
                              <span style={{ fontSize: '7.5px', fontWeight: 'bold', background: 'rgba(201, 136, 58, 0.15)', color: 'var(--warning)', border: '1px solid rgba(201, 136, 58, 0.3)', padding: '0 2px', borderRadius: '2px', flexShrink: 0 }}>
                                MOD
                              </span>
                            )}
                          </div>
                        </td>

                        <td style={{ fontSize: '10px', whiteSpace: 'nowrap', textAlign: 'center', padding: compactMode ? '4px 2px' : '6px 8px' }}>
                          {r.tarih ? r.tarih.slice(5) : '-'}
                          {r.tarih && (() => {
                            const age = (new Date() - new Date(r.tarih)) / (1000 * 60 * 60 * 24);
                            if (age <= 30) return <span style={{ fontSize: '7px', background: 'rgba(63, 138, 107, 0.15)', color: 'var(--positive)', padding: '1px 3px', borderRadius: '2px', marginLeft: '3px', fontWeight: 'bold' }}>T</span>;
                            return null;
                          })()}
                        </td>

                        {!compactMode && (
                          <td style={{ textAlign: 'right', fontSize: '11px', fontVariantNumeric: 'tabular-nums', padding: '6px 8px' }}>
                            {reportPrice !== null ? reportPrice.toFixed(2) : '-'}
                          </td>
                        )}

                        <td style={{ fontWeight: '700', color: 'var(--text-primary)', textAlign: 'right', fontSize: '11px', fontVariantNumeric: 'tabular-nums', padding: compactMode ? '4px 3px' : '6px 8px' }}>
                          {targetPrice !== null ? targetPrice.toFixed(1) : '-'}
                        </td>

                        {!compactMode && (
                          <td className="text-neutral" style={{ fontWeight: '700', textAlign: 'center', fontSize: '11px', fontVariantNumeric: 'tabular-nums', padding: '6px 8px' }}>
                            {formatPotential(r.potansiyel)}
                          </td>
                        )}

                        <td className={livePotColor} style={{ fontWeight: '700', textAlign: 'center', fontSize: '11px', fontVariantNumeric: 'tabular-nums', padding: compactMode ? '4px 2px' : '6px 8px' }}>
                          {livePotStr}
                        </td>

                        <td style={{ textAlign: 'center', padding: compactMode ? '4px 2px' : '6px 8px' }}>
                          <button
                            className="btn-read"
                            onClick={(e) => { e.stopPropagation(); toggleRow(i); }}
                            style={{
                              fontSize: '9.5px',
                              padding: '1px 4px',
                              whiteSpace: 'nowrap',
                              borderColor: (!r.full_text && !r.pdf_url) ? 'var(--color-up)' : 'var(--color-neutral)',
                              color: (!r.full_text && !r.pdf_url) ? 'var(--color-up)' : 'var(--color-neutral)'
                            }}
                          >
                            {isExpanded ? '✕' : 'DETAY'}
                          </button>
                        </td>
                      </tr>

                      {/* ─── EXPANDABLE DETAIL ACCORDION ─── */}
                      {isExpanded && (
                        <tr className="accordion-row">
                          <td colSpan={compactMode ? 5 : 7}>
                            <div className="accordion-content" style={{ padding: '10px 12px', background: 'rgba(10, 14, 20, 0.98)', borderTop: '1px solid rgba(200, 162, 74, 0.2)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <div style={{ color: 'var(--text-highlight)', fontWeight: 'bold', fontSize: '11px' }}>
                                  {r.kurum.toUpperCase()} ({r.tarih}):
                                </div>
                                {r.tavsiye && (
                                  <span style={{ fontSize: '10px', fontWeight: 'bold', background: 'rgba(200, 162, 74, 0.1)', color: 'var(--color-cyan)', padding: '1px 6px', borderRadius: '3px' }}>
                                    {r.tavsiye}
                                  </span>
                                )}
                              </div>

                              <div style={{ color: 'var(--text-main)', fontSize: '11px', lineHeight: '1.5', marginBottom: '10px' }}>
                                {(!r.full_text || r.full_text === "Metin bulunamadı.") && (!r.metin || r.metin === "Metin bulunamadı.") ? (
                                  <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                    Fintables üzerinden aracı kurum model portföy tablosundan aktarılmıştır.
                                  </span>
                                ) : (
                                  r.full_text || r.metin
                                )}
                              </div>

                              {r.pdf_url && (
                                <div style={{ marginBottom: '8px' }}>
                                  <a href={r.pdf_url} target="_blank" rel="noreferrer" className="ticker-link text-neutral" style={{ fontSize: '11px' }}>
                                    Orijinal raporu aç / PDF ↗
                                  </a>
                                </div>
                              )}

                              {/* Historical Revisions */}
                              {groupedRecs.history[r.kurum] && (
                                <div style={{ marginTop: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                                  <div style={{ color: 'var(--text-muted)', fontWeight: 'bold', fontSize: '10px', marginBottom: '6px' }}>
                                    {r.kurum.toUpperCase()} ESKİ HEDEFLER
                                  </div>
                                  <table style={{ width: '100%', fontSize: '10px', color: 'var(--text-muted)', borderCollapse: 'collapse' }}>
                                    <tbody>
                                      {groupedRecs.history[r.kurum].map((hist, hIdx) => (
                                        <tr key={hIdx} style={{ borderBottom: '1px dotted rgba(255,255,255,0.05)' }}>
                                          <td style={{ padding: '3px 0' }}>{hist.tarih}</td>
                                          <td style={{ padding: '3px 0', textDecoration: 'line-through', color: 'var(--text-tertiary)' }}>{hist.hedefFiyat}</td>
                                          <td style={{ padding: '3px 0' }}>{hist.mevcutFiyat}</td>
                                          <td style={{ padding: '3px 0' }}>{hist.tavsiye}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-muted" style={{ textAlign: 'center', padding: '16px', fontSize: '11px' }}>
            Seçilen filtrelere uygun rapor bulunamadı.
          </div>
        )}
      </div>
    </div>
  );
}
