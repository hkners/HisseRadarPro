import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import ImageWithFallback from '../components/ImageWithFallback';
import slugifyBroker from '../utils/slugify';
import { getCachedData, setCachedData } from '../utils/apiCache';
import PageContainer from '../components/common/PageContainer';
import FavoriteStar from '../components/common/FavoriteStar';
import { useFavorites } from '../hooks/useFavorites';

const BIST30 = [
  'AKBNK', 'ALARK', 'ARCLK', 'ASELS', 'ASTOR', 'BIMAS', 'BRSAN', 'DOAS',
  'EKGYO', 'ENKAI', 'EREGL', 'FROTO', 'GARAN', 'GUBRF', 'HEKTS', 'ISCTR',
  'KCHOL', 'KONTR', 'KRDMD', 'OYAKC', 'PETKM', 'PGSUS', 'SAHOL',
  'SASA', 'SISE', 'TCELL', 'THYAO', 'TOASO', 'TRALT', 'TUPRS', 'YKBNK'
];

export default function Models() {
  const modelsUrl = `${import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://127.0.0.1:8015'}/api/models`;
  const stocksUrl = `${import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://127.0.0.1:8015'}/api/stocks`;

  const cachedModels = getCachedData(modelsUrl);
  const cachedStocks = getCachedData(stocksUrl);

  const [rawModels, setRawModels] = useState(cachedModels || []);
  const [prices, setPrices] = useState(() => {
    if (cachedStocks && cachedStocks.stocks) {
      const map = {};
      cachedStocks.stocks.forEach(s => { if (s.ticker) map[s.ticker] = s.price; });
      return map;
    }
    return {};
  });
  const [changes, setChanges] = useState(() => {
    if (cachedStocks && cachedStocks.stocks) {
      const map = {};
      cachedStocks.stocks.forEach(s => { if (s.ticker) map[s.ticker] = s.change_pct; });
      return map;
    }
    return {};
  });

  const [loading, setLoading] = useState(!cachedModels);
  const [activeTab, setActiveTab] = useState('CONSENSUS'); // 'CONSENSUS' | 'BY_BROKER' | 'ALL_POSITIONS'
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'FAVORITES' | 'HIGH_POT' | 'BIST30'
  const [selectedBroker, setSelectedBroker] = useState('ALL');
  const [expandedBrokers, setExpandedBrokers] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const [sortConfig, setSortConfig] = useState({ key: 'broker_count', direction: 'desc' });
  const { favorites } = useFavorites();

  // Fetch models
  useEffect(() => {
    fetch(modelsUrl)
      .then(res => res.json())
      .then(json => {
        const data = Array.isArray(json) ? json : [];
        setCachedData(modelsUrl, data);
        setRawModels(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Models fetch error:", err);
        setLoading(false);
      });
  }, [modelsUrl]);

  // Fetch live prices
  useEffect(() => {
    fetch(stocksUrl)
      .then(res => res.json())
      .then(json => {
        if (json && Array.isArray(json.stocks)) {
          setCachedData(stocksUrl, json);
          const pMap = {};
          const chMap = {};
          json.stocks.forEach(s => {
            if (s.ticker) {
              pMap[s.ticker] = s.price;
              chMap[s.ticker] = s.change_pct;
            }
          });
          setPrices(pMap);
          setChanges(chMap);
        }
      })
      .catch(() => {});
  }, [stocksUrl]);

  // Clean and deduplicate models (keep latest stock per broker)
  const cleanModels = useMemo(() => {
    return rawModels.map(m => {
      const uniqueStockMap = {};
      (m.stocks || []).forEach(s => {
        const ticker = (s.hisse || s.ticker || '').toUpperCase().trim();
        if (!ticker) return;

        const target = parseFloat(s.hedefFiyat !== undefined ? s.hedefFiyat : s.target);
        const reportPrice = parseFloat(s.mevcutFiyat !== undefined ? s.mevcutFiyat : s.reportPrice);
        const pot = parseFloat(s.potansiyel !== undefined ? s.potansiyel : s.potential);

        const currentEntry = {
          ...s,
          ticker,
          targetPrice: !isNaN(target) && target > 0 ? target : null,
          reportPrice: !isNaN(reportPrice) && reportPrice > 0 ? reportPrice : null,
          reportedPotential: !isNaN(pot) ? pot : null,
          tarih: s.tarih || ''
        };

        if (!uniqueStockMap[ticker] || (s.tarih || '') > (uniqueStockMap[ticker].tarih || '')) {
          uniqueStockMap[ticker] = currentEntry;
        }
      });

      const deduplicatedStocks = Object.values(uniqueStockMap);

      // Sort alphabetically by ticker
      deduplicatedStocks.sort((a, b) => a.ticker.localeCompare(b.ticker));

      // Calculate avg potential for broker model
      const validPots = deduplicatedStocks.map(s => {
        const live = prices[s.ticker];
        if (s.targetPrice && live && live > 0) {
          return ((s.targetPrice - live) / live) * 100;
        }
        return s.reportedPotential;
      }).filter(p => p !== null && !isNaN(p));

      const avgPotential = validPots.length > 0 
        ? (validPots.reduce((a, b) => a + b, 0) / validPots.length) 
        : 0;

      return {
        ...m,
        stocks: deduplicatedStocks,
        uniqueCount: deduplicatedStocks.length,
        avgPotential
      };
    }).filter(m => m.uniqueCount > 0);
  }, [rawModels, prices]);

  // Compute Consensus Super Model Portfolio (stocks present in multiple broker portfolios)
  const superPortfolio = useMemo(() => {
    const stockMap = {};

    cleanModels.forEach(m => {
      const brokerName = m.kurum;
      m.stocks.forEach(s => {
        const t = s.ticker;
        if (!t) return;

        if (!stockMap[t]) {
          stockMap[t] = {
            ticker: t,
            brokers: [],
            targets: [],
            reportedPots: []
          };
        }

        if (!stockMap[t].brokers.includes(brokerName)) {
          stockMap[t].brokers.push(brokerName);
        }

        if (s.targetPrice) {
          stockMap[t].targets.push(s.targetPrice);
        }
        if (s.reportedPotential !== null) {
          stockMap[t].reportedPots.push(s.reportedPotential);
        }
      });
    });

    return Object.values(stockMap).map(item => {
      const livePrice = prices[item.ticker] || null;
      const liveChange = changes[item.ticker] !== undefined ? changes[item.ticker] : null;

      const avgTarget = item.targets.length > 0 
        ? (item.targets.reduce((a, b) => a + b, 0) / item.targets.length) 
        : null;

      let avgPotential = null;
      if (avgTarget && livePrice && livePrice > 0) {
        avgPotential = ((avgTarget - livePrice) / livePrice) * 100;
      } else if (item.reportedPots.length > 0) {
        avgPotential = item.reportedPots.reduce((a, b) => a + b, 0) / item.reportedPots.length;
      }

      return {
        ticker: item.ticker,
        brokers: item.brokers,
        brokerCount: item.brokers.length,
        livePrice,
        liveChange,
        avgTarget,
        avgPotential
      };
    }).filter(item => item.brokerCount >= 2);
  }, [cleanModels, prices, changes]);

  // Compute All Flat Positions
  const allPositions = useMemo(() => {
    const list = [];
    cleanModels.forEach(m => {
      m.stocks.forEach(s => {
        const livePrice = prices[s.ticker] || null;
        const liveChange = changes[s.ticker] !== undefined ? changes[s.ticker] : null;

        let activePot = s.reportedPotential;
        if (s.targetPrice && livePrice && livePrice > 0) {
          activePot = ((s.targetPrice - livePrice) / livePrice) * 100;
        }

        list.push({
          id: `${m.kurum}-${s.ticker}`,
          broker: m.kurum,
          ticker: s.ticker,
          tarih: s.tarih,
          targetPrice: s.targetPrice,
          livePrice,
          liveChange,
          potential: activePot
        });
      });
    });
    return list;
  }, [cleanModels, prices, changes]);

  // Reset page when tab/filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, search, filter, selectedBroker]);

  // Sorting handler
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Helper for potential colors
  const getPotentialColor = (pot) => {
    if (pot === null || pot === undefined || isNaN(pot)) return 'var(--text-muted)';
    if (pot >= 40) return 'var(--color-up)';
    if (pot >= 20) return 'var(--color-cyan)';
    if (pot > 0) return 'var(--color-neutral)';
    return 'var(--color-down)';
  };

  // Filtered Consensus Data
  const filteredConsensus = useMemo(() => {
    let list = superPortfolio;

    if (search.trim()) {
      const q = search.toUpperCase();
      list = list.filter(item => 
        item.ticker.includes(q) || 
        item.brokers.some(b => b.toUpperCase().includes(q))
      );
    }

    if (filter === 'FAVORITES') {
      list = list.filter(item => favorites.includes(item.ticker));
    } else if (filter === 'HIGH_POT') {
      list = list.filter(item => item.avgPotential !== null && item.avgPotential >= 40);
    } else if (filter === 'BIST30') {
      list = list.filter(item => BIST30.includes(item.ticker));
    }

    list = [...list].sort((a, b) => {
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];

      if (sortConfig.key === 'broker_count') {
        valA = a.brokerCount;
        valB = b.brokerCount;
      } else if (sortConfig.key === 'ticker') {
        valA = a.ticker;
        valB = b.ticker;
      } else if (sortConfig.key === 'price') {
        valA = a.livePrice || -999999;
        valB = b.livePrice || -999999;
      } else if (sortConfig.key === 'target') {
        valA = a.avgTarget || -999999;
        valB = b.avgTarget || -999999;
      } else if (sortConfig.key === 'potential') {
        valA = a.avgPotential || -999999;
        valB = b.avgPotential || -999999;
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortConfig.direction === 'asc' ? valA.localeCompare(valB, 'tr') : valB.localeCompare(valA, 'tr');
      }
      return sortConfig.direction === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });

    return list;
  }, [superPortfolio, search, filter, favorites, sortConfig]);

  // Filtered All Positions Data
  const filteredAllPositions = useMemo(() => {
    let list = allPositions;

    if (search.trim()) {
      const q = search.toUpperCase();
      list = list.filter(item => 
        item.ticker.includes(q) || 
        item.broker.toUpperCase().includes(q)
      );
    }

    if (filter === 'FAVORITES') {
      list = list.filter(item => favorites.includes(item.ticker));
    } else if (filter === 'HIGH_POT') {
      list = list.filter(item => item.potential !== null && item.potential >= 40);
    } else if (filter === 'BIST30') {
      list = list.filter(item => BIST30.includes(item.ticker));
    }

    if (selectedBroker !== 'ALL') {
      list = list.filter(item => item.broker === selectedBroker);
    }

    list = [...list].sort((a, b) => {
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];

      if (sortConfig.key === 'ticker') {
        valA = a.ticker;
        valB = b.ticker;
      } else if (sortConfig.key === 'broker') {
        valA = a.broker;
        valB = b.broker;
      } else if (sortConfig.key === 'price') {
        valA = a.livePrice || -999999;
        valB = b.livePrice || -999999;
      } else if (sortConfig.key === 'target') {
        valA = a.targetPrice || -999999;
        valB = b.targetPrice || -999999;
      } else if (sortConfig.key === 'potential') {
        valA = a.potential || -999999;
        valB = b.potential || -999999;
      } else if (sortConfig.key === 'tarih') {
        valA = a.tarih || '';
        valB = b.tarih || '';
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortConfig.direction === 'asc' ? valA.localeCompare(valB, 'tr') : valB.localeCompare(valA, 'tr');
      }
      return sortConfig.direction === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });

    return list;
  }, [allPositions, search, filter, selectedBroker, favorites, sortConfig]);

  // Filtered By-Broker Models
  const filteredBrokers = useMemo(() => {
    let list = cleanModels;

    if (search.trim()) {
      const q = search.toUpperCase();
      list = list.filter(m => 
        m.kurum.toUpperCase().includes(q) ||
        m.stocks.some(s => s.ticker.includes(q))
      );
    }

    if (selectedBroker !== 'ALL') {
      list = list.filter(m => m.kurum === selectedBroker);
    }

    return list;
  }, [cleanModels, search, selectedBroker]);

  // Toggle broker accordion expansion
  const toggleBroker = (kurum) => {
    setExpandedBrokers(prev => ({
      ...prev,
      [kurum]: !prev[kurum]
    }));
  };

  // Pagination for Consensus Table
  const totalConsensusPages = Math.ceil(filteredConsensus.length / itemsPerPage) || 1;
  const paginatedConsensus = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredConsensus.slice(start, start + itemsPerPage);
  }, [filteredConsensus, currentPage, itemsPerPage]);

  // Pagination for All Positions Table
  const totalPositionsPages = Math.ceil(filteredAllPositions.length / itemsPerPage) || 1;
  const paginatedPositions = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAllPositions.slice(start, start + itemsPerPage);
  }, [filteredAllPositions, currentPage, itemsPerPage]);

  return (
    <PageContainer
      title="Model Portföyler"
      badge={{
        label: `${cleanModels.length} ARACI KURUM`,
        background: 'rgba(201, 136, 58, 0.15)',
        color: 'var(--color-warning)',
        borderColor: 'rgba(201, 136, 58, 0.35)'
      }}
      subtitle="Kurumların model portföyleri ve birden fazla kurumun ortak seçtiği hisseler."
      statusDot="var(--color-warning)"
      headerRight={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ 
            fontSize: '11px', 
            background: 'rgba(200, 162, 74, 0.12)', 
            color: 'var(--color-cyan)', 
            border: '1px solid rgba(200, 162, 74, 0.3)', 
            padding: '2px 8px', 
            borderRadius: '4px', 
            fontWeight: 'bold' 
          }}>
            {superPortfolio.length} Konsensüs Hisse
          </span>
          <span style={{ 
            fontSize: '11px', 
            background: 'rgba(255, 255, 255, 0.04)', 
            color: 'var(--text-muted)', 
            border: '1px solid var(--border-color)', 
            padding: '2px 8px', 
            borderRadius: '4px' 
          }}>
            {allPositions.length} Toplam Pozisyon
          </span>
        </div>
      }
      scrollable={false}
    >
      <div className="panel flex-1" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, marginBottom: 0 }}>
        <div className="panel-content" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: '8px 10px' }}>

          {/* Controls & Filter Ribbon */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              
              {/* Mode Switcher Tabs */}
              <button 
                onClick={() => { setActiveTab('CONSENSUS'); setCurrentPage(1); }}
                className={`action-button ${activeTab === 'CONSENSUS' ? 'active-green' : ''}`}
              >
                Süper konsensüs ({superPortfolio.length})
              </button>
              <button 
                onClick={() => { setActiveTab('BY_BROKER'); setCurrentPage(1); }}
                className={`action-button ${activeTab === 'BY_BROKER' ? 'active-cyan' : ''}`}
              >
                Kurumlar ({cleanModels.length})
              </button>
              <button 
                onClick={() => { setActiveTab('ALL_POSITIONS'); setCurrentPage(1); }}
                className={`action-button ${activeTab === 'ALL_POSITIONS' ? 'active-purple' : ''}`}
              >
                Tüm pozisyonlar ({allPositions.length})
              </button>

              <span style={{ color: 'var(--border-color)', margin: '0 2px' }}>|</span>

              {/* Search Bar */}
              <input
                type="text"
                placeholder={activeTab === 'BY_BROKER' ? "Kurum veya Hisse Ara..." : "Hisse veya Kurum Ara..."}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                style={{
                  width: '210px',
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

              {/* Quick Filters */}
              <button 
                onClick={() => { setFilter('ALL'); setSearch(''); setSelectedBroker('ALL'); setCurrentPage(1); }}
                className={`action-button ${filter === 'ALL' && !search && selectedBroker === 'ALL' ? 'active' : ''}`}
              >
                Tümü
              </button>
              <button 
                onClick={() => { setFilter('FAVORITES'); setCurrentPage(1); }}
                className={`action-button ${filter === 'FAVORITES' ? 'active-warning' : ''}`}
              >
                Favoriler{favorites.length > 0 ? ` (${favorites.length})` : ''}
              </button>
              <button 
                onClick={() => { setFilter('HIGH_POT'); setCurrentPage(1); }}
                className={`action-button ${filter === 'HIGH_POT' ? 'active-purple' : ''}`}
              >
                Yüksek potansiyel (%40+)
              </button>
              <button 
                onClick={() => { setFilter('BIST30'); setCurrentPage(1); }}
                className={`action-button ${filter === 'BIST30' ? 'active' : ''}`}
              >
                BIST 30
              </button>

              {/* Reset */}
              {(search || filter !== 'ALL' || selectedBroker !== 'ALL') && (
                <button 
                  onClick={() => { setFilter('ALL'); setSearch(''); setSelectedBroker('ALL'); setCurrentPage(1); }}
                  className="action-button"
                >
                  Sıfırla
                </button>
              )}
            </div>

            {/* Quick broker selector if in BY_BROKER or ALL_POSITIONS mode */}
            {activeTab !== 'CONSENSUS' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Kurum:</span>
                <select
                  value={selectedBroker}
                  onChange={(e) => { setSelectedBroker(e.target.value); setCurrentPage(1); }}
                  style={{
                    height: '28px',
                    padding: '2px 8px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    borderRadius: '4px',
                    fontSize: '11px',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="ALL">Tüm Kurumlar ({cleanModels.length})</option>
                  {cleanModels.map(m => (
                    <option key={m.kurum} value={m.kurum}>
                      {m.kurum} ({m.uniqueCount} Hisse)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* TAB 1: SÜPER KONSENSÜS TABLOSU */}
          {activeTab === 'CONSENSUS' && (
            <>
              <div className="table-responsive stable-scroll" style={{ flex: 1, overflowY: 'auto', borderBottom: '1px solid var(--border-color)' }}>
                <table className="data-table data-table-fixed compact-terminal-table" style={{ width: '100%' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-panel)', zIndex: 2, boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                    <tr>
                      <th style={{ width: '4.5%', textAlign: 'center' }}></th>
                      <th style={{ width: '15%', cursor: 'pointer', textAlign: 'left' }} onClick={() => handleSort('ticker')}>
                        HİSSE {sortConfig.key === 'ticker' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                      </th>
                      <th style={{ width: '13%', cursor: 'pointer', textAlign: 'left' }} onClick={() => handleSort('broker_count')}>
                        MUTABAKAT {sortConfig.key === 'broker_count' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                      </th>
                      <th style={{ width: '31.5%', textAlign: 'left' }}>
                        MODEL PORTFÖYÜNDE BULUNDURAN KURUMLAR
                      </th>
                      <th style={{ width: '12%', cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('price')}>
                        GÜNCEL FİYAT {sortConfig.key === 'price' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                      </th>
                      <th style={{ width: '12%', cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('target')}>
                        ORT. HEDEF {sortConfig.key === 'target' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                      </th>
                      <th style={{ width: '12%', cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('potential')}>
                        ORT. POTANSİYEL {sortConfig.key === 'potential' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      Array.from({ length: 18 }).map((_, i) => (
                        <tr key={`skel-${i}`}>
                          <td style={{ textAlign: 'center' }}>
                            <div className="skeleton-bar" style={{ width: '26px', height: '26px', borderRadius: '50%', margin: '0 auto' }} />
                          </td>
                          <td style={{ textAlign: 'left' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div className="skeleton-bar" style={{ width: '15px', height: '15px', borderRadius: '3px' }} />
                              <div className="skeleton-bar" style={{ width: '60px', height: '14px' }} />
                            </div>
                          </td>
                          <td style={{ textAlign: 'left' }}>
                            <div className="skeleton-bar" style={{ width: '70px', height: '14px' }} />
                          </td>
                          <td style={{ textAlign: 'left' }}>
                            <div className="skeleton-bar" style={{ width: '220px', height: '14px' }} />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="skeleton-bar" style={{ width: '55px', height: '14px', marginLeft: 'auto' }} />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="skeleton-bar" style={{ width: '55px', height: '14px', marginLeft: 'auto' }} />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="skeleton-bar" style={{ width: '60px', height: '14px', marginLeft: 'auto' }} />
                          </td>
                        </tr>
                      ))
                    ) : paginatedConsensus.length > 0 ? (
                      paginatedConsensus.map(item => {
                        const maxDisplayBrokers = 3;
                        const visibleBrokers = item.brokers.slice(0, maxDisplayBrokers);
                        const remainingCount = item.brokers.length - maxDisplayBrokers;

                        return (
                          <tr key={item.ticker} className="row-hoverable">
                            <td style={{ textAlign: 'center', width: '4.5%' }}>
                              <ImageWithFallback 
                                src={`${import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://127.0.0.1:8015'}/logos/${item.ticker}.png`} 
                                alt={item.ticker} 
                                fallbackName={item.ticker}
                                size={26}
                                style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#fff', objectFit: 'contain', margin: '0 auto', display: 'block' }}
                              />
                            </td>
                            <td style={{ textAlign: 'left', width: '15%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FavoriteStar ticker={item.ticker} size={15} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <Link to={`/hisse/${item.ticker}`} className="ticker-link" style={{ fontSize: '13px', fontWeight: 'bold' }}>
                                    {item.ticker}
                                  </Link>
                                  {BIST30.includes(item.ticker) && (
                                    <span className="badge badge-subtle" style={{ fontSize: '9px', padding: '1px 3px' }}>B30</span>
                                  )}
                                  <span style={{ fontSize: '9px', color: 'var(--warning)', fontWeight: 'bold', background: 'rgba(201, 136, 58, 0.15)', padding: '1px 4px', borderRadius: '3px', flexShrink: 0 }}>
                                    MOD
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td style={{ textAlign: 'left', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                              <span style={{ fontWeight: 'bold', color: 'var(--text-highlight)', fontSize: '13px' }}>
                                {item.brokerCount}
                              </span>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '3px' }}>
                                Kurum
                              </span>
                            </td>
                            <td style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'nowrap', overflow: 'hidden' }}>
                                {visibleBrokers.map(b => (
                                  <Link
                                    key={b}
                                    to={`/kurum/${b.replace(/\s+/g, '-').toLowerCase()}`}
                                    style={{
                                      fontSize: '11px',
                                      color: 'var(--text-main)',
                                      background: 'rgba(255,255,255,0.05)',
                                      border: '1px solid var(--border-color)',
                                      padding: '1px 6px',
                                      borderRadius: '3px',
                                      textDecoration: 'none',
                                      whiteSpace: 'nowrap'
                                    }}
                                    className="row-hoverable"
                                    title={b}
                                  >
                                    {b}
                                  </Link>
                                ))}
                                {remainingCount > 0 && (
                                  <span 
                                    style={{
                                      fontSize: '10.5px',
                                      color: 'var(--color-cyan)',
                                      background: 'rgba(200, 162, 74, 0.1)',
                                      border: '1px solid rgba(200, 162, 74, 0.25)',
                                      padding: '1px 5px',
                                      borderRadius: '3px',
                                      whiteSpace: 'nowrap'
                                    }}
                                    title={item.brokers.slice(maxDisplayBrokers).join(', ')}
                                  >
                                    +{remainingCount} Kurum
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                              {item.livePrice ? (
                                <span>
                                  <span style={{ color: 'var(--text-highlight)' }}>{item.livePrice.toFixed(2)}</span>
                                  {item.liveChange !== null && (
                                    <span style={{ 
                                      color: item.liveChange > 0 ? 'var(--color-up)' : item.liveChange < 0 ? 'var(--color-down)' : 'var(--text-muted)',
                                      fontSize: '11px',
                                      marginLeft: '4px'
                                    }}>
                                      {item.liveChange > 0 ? '▲' : item.liveChange < 0 ? '▼' : ''}{Math.abs(item.liveChange).toFixed(1)}%
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>-</span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '13px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                              {item.avgTarget ? item.avgTarget.toFixed(2) : '-'}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                              {item.avgPotential !== null ? (
                                <span style={{ color: getPotentialColor(item.avgPotential) }}>
                                  %{item.avgPotential > 0 ? '+' : ''}{item.avgPotential.toFixed(1)}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                          Kriterlere uygun konsensüs hissesi bulunamadı.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-color)', fontSize: '11.5px', flexShrink: 0 }}>
                <div style={{ color: 'var(--text-muted)' }}>
                  Gösterilen: {filteredConsensus.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredConsensus.length)} / Toplam: {filteredConsensus.length}
                </div>
                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                  <button 
                    className="action-button"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    &lt; Önceki
                  </button>
                  <span style={{ padding: '0 8px', color: 'var(--text-highlight)', fontWeight: 'bold' }}>
                    Sayfa {currentPage} / {totalConsensusPages}
                  </span>
                  <button 
                    className="action-button"
                    onClick={() => setCurrentPage(p => Math.min(totalConsensusPages, p + 1))}
                    disabled={currentPage === totalConsensusPages || totalConsensusPages === 0}
                  >
                    Sonraki &gt;
                  </button>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: KURUMLAR BAZINDA LİSTELER */}
          {activeTab === 'BY_BROKER' && (
            <div className="table-responsive stable-scroll" style={{ flex: 1, overflowY: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingBottom: '16px' }}>
                {filteredBrokers.map((m, idx) => {
                  const slug = slugifyBroker(m.kurum);
                  // Default first 2 brokers open, others closed until clicked, or all open if broker selected
                  const isExpanded = selectedBroker !== 'ALL' ? true : (expandedBrokers[m.kurum] ?? (idx === 0));

                  return (
                    <div 
                      key={m.id || m.kurum} 
                      style={{ 
                        flexShrink: 0,
                        border: '1px solid var(--border-color)', 
                        borderRadius: '5px', 
                        background: 'rgba(18, 18, 20, 0.4)',
                        overflow: 'hidden'
                      }}
                    >
                      {/* Broker Header Banner */}
                      <div 
                        onClick={() => toggleBroker(m.kurum)}
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          padding: '8px 12px',
                          background: isExpanded ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.015)',
                          borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none',
                          cursor: 'pointer'
                        }}
                        className="row-hoverable"
                      >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <ImageWithFallback 
                          src={`${import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://127.0.0.1:8015'}/logos/brokers/${slug}.png`} 
                          alt={m.kurum} 
                          fallbackName={m.kurum}
                          size={26}
                          style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#fff', objectFit: 'contain' }}
                        />
                        <Link 
                          to={`/kurum/${m.kurum.replace(/\s+/g, '-').toLowerCase()}`}
                          onClick={(e) => e.stopPropagation()}
                          className="ticker-link"
                          style={{ fontSize: '13px', fontWeight: 'bold' }}
                        >
                          {m.kurum}
                        </Link>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {m.title || 'Model Portföy'} {m.tarih ? `(${m.tarih})` : ''}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ fontVariantNumeric: 'tabular-nums' }}>
                          <span style={{ fontWeight: 'bold', color: 'var(--text-highlight)', fontSize: '13px' }}>
                            {m.uniqueCount}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '3px' }}>
                            Hisse
                          </span>
                        </div>
                        {m.avgPotential !== 0 && (
                          <span style={{ fontSize: '12px', fontWeight: 'bold', color: getPotentialColor(m.avgPotential) }}>
                            Ort: %{m.avgPotential > 0 ? '+' : ''}{m.avgPotential.toFixed(1)}
                          </span>
                        )}
                        <button 
                          className="action-button" 
                          style={{ padding: '2px 6px', fontSize: '10px' }}
                          onClick={(e) => { e.stopPropagation(); toggleBroker(m.kurum); }}
                        >
                          {isExpanded ? 'Daralt' : 'Genişlet'}
                        </button>
                      </div>
                    </div>

                    {/* Stock Table */}
                    {isExpanded && (
                      <table className="data-table data-table-fixed compact-terminal-table" style={{ width: '100%' }}>
                        <thead>
                          <tr>
                            <th style={{ width: '4.5%', textAlign: 'center' }}></th>
                            <th style={{ width: '22.5%', textAlign: 'left' }}>HİSSE</th>
                            <th style={{ width: '18%', textAlign: 'right' }}>HEDEF FİYAT</th>
                            <th style={{ width: '18%', textAlign: 'right' }}>GÜNCEL FİYAT</th>
                            <th style={{ width: '18%', textAlign: 'right' }}>POTANSİYEL</th>
                            <th style={{ width: '19%', textAlign: 'center' }}>İŞLEM</th>
                          </tr>
                        </thead>
                        <tbody>
                          {m.stocks.map(stock => {
                            const livePrice = prices[stock.ticker] || null;
                            const liveChange = changes[stock.ticker] !== undefined ? changes[stock.ticker] : null;

                            let pot = stock.reportedPotential;
                            if (stock.targetPrice && livePrice && livePrice > 0) {
                              pot = ((stock.targetPrice - livePrice) / livePrice) * 100;
                            }

                            return (
                              <tr key={stock.ticker} className="row-hoverable">
                                <td style={{ textAlign: 'center', width: '4.5%' }}>
                                  <ImageWithFallback 
                                    src={`${import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://127.0.0.1:8015'}/logos/${stock.ticker}.png`} 
                                    alt={stock.ticker} 
                                    fallbackName={stock.ticker}
                                    size={26}
                                    style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#fff', objectFit: 'contain', margin: '0 auto', display: 'block' }}
                                  />
                                </td>
                                <td style={{ textAlign: 'left', width: '22.5%' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <FavoriteStar ticker={stock.ticker} size={15} />
                                    <Link to={`/hisse/${stock.ticker}`} className="ticker-link" style={{ fontSize: '13px', fontWeight: 'bold' }}>
                                      {stock.ticker}
                                    </Link>
                                    {BIST30.includes(stock.ticker) && (
                                      <span className="badge badge-subtle" style={{ fontSize: '9px', padding: '1px 3px' }}>B30</span>
                                    )}
                                  </div>
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '13px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                                  {stock.targetPrice ? `${stock.targetPrice.toFixed(2)} TL` : '-'}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                                  {livePrice ? (
                                    <span>
                                      <span style={{ color: 'var(--text-highlight)' }}>{livePrice.toFixed(2)}</span>
                                      {liveChange !== null && (
                                        <span style={{ 
                                          color: liveChange > 0 ? 'var(--color-up)' : liveChange < 0 ? 'var(--color-down)' : 'var(--text-muted)',
                                          fontSize: '11px',
                                          marginLeft: '4px'
                                        }}>
                                          {liveChange > 0 ? '▲' : liveChange < 0 ? '▼' : ''}{Math.abs(liveChange).toFixed(1)}%
                                        </span>
                                      )}
                                    </span>
                                  ) : (
                                    <span style={{ color: 'var(--text-muted)' }}>-</span>
                                  )}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                                  {pot !== null ? (
                                    <span style={{ color: getPotentialColor(pot) }}>
                                      %{pot > 0 ? '+' : ''}{pot.toFixed(1)}
                                    </span>
                                  ) : (
                                    <span style={{ color: 'var(--text-muted)' }}>-</span>
                                  )}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <Link to={`/hisse/${stock.ticker}`} className="action-button" style={{ padding: '3px 8px', fontSize: '10.5px' }}>
                                    Kokpit
                                  </Link>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}

              {filteredBrokers.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  Arama kriterlerine uygun kurum model portföyü bulunamadı.
                </div>
              )}
              </div>
            </div>
          )}

          {/* TAB 3: TÜM MODEL POZİSYONLARI */}
          {activeTab === 'ALL_POSITIONS' && (
            <>
              <div className="table-responsive stable-scroll" style={{ flex: 1, overflowY: 'auto', borderBottom: '1px solid var(--border-color)' }}>
                <table className="data-table data-table-fixed compact-terminal-table" style={{ width: '100%' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-panel)', zIndex: 2, boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                    <tr>
                      <th style={{ width: '4.5%', textAlign: 'center' }}></th>
                      <th style={{ width: '16%', cursor: 'pointer', textAlign: 'left' }} onClick={() => handleSort('ticker')}>
                        HİSSE {sortConfig.key === 'ticker' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                      </th>
                      <th style={{ width: '22%', cursor: 'pointer', textAlign: 'left' }} onClick={() => handleSort('broker')}>
                        ARACI KURUM {sortConfig.key === 'broker' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                      </th>
                      <th style={{ width: '11%', cursor: 'pointer', textAlign: 'center' }} onClick={() => handleSort('tarih')}>
                        TARİH {sortConfig.key === 'tarih' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                      </th>
                      <th style={{ width: '12%', cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('price')}>
                        GÜNCEL FİYAT {sortConfig.key === 'price' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                      </th>
                      <th style={{ width: '12%', cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('target')}>
                        HEDEF FİYAT {sortConfig.key === 'target' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                      </th>
                      <th style={{ width: '12.5%', cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('potential')}>
                        POTANSİYEL {sortConfig.key === 'potential' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                      </th>
                      <th style={{ width: '10%', textAlign: 'center' }}>
                        İŞLEM
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      Array.from({ length: 18 }).map((_, i) => (
                        <tr key={`skel-${i}`}>
                          <td style={{ textAlign: 'center' }}>
                            <div className="skeleton-bar" style={{ width: '26px', height: '26px', borderRadius: '50%', margin: '0 auto' }} />
                          </td>
                          <td style={{ textAlign: 'left' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div className="skeleton-bar" style={{ width: '15px', height: '15px', borderRadius: '3px' }} />
                              <div className="skeleton-bar" style={{ width: '60px', height: '14px' }} />
                            </div>
                          </td>
                          <td style={{ textAlign: 'left' }}>
                            <div className="skeleton-bar" style={{ width: '120px', height: '14px' }} />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div className="skeleton-bar" style={{ width: '65px', height: '14px', margin: '0 auto' }} />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="skeleton-bar" style={{ width: '55px', height: '14px', marginLeft: 'auto' }} />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="skeleton-bar" style={{ width: '55px', height: '14px', marginLeft: 'auto' }} />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="skeleton-bar" style={{ width: '55px', height: '14px', marginLeft: 'auto' }} />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div className="skeleton-bar" style={{ width: '50px', height: '20px', margin: '0 auto' }} />
                          </td>
                        </tr>
                      ))
                    ) : paginatedPositions.length > 0 ? (
                      paginatedPositions.map(pos => {
                        const slug = slugifyBroker(pos.broker);
                        return (
                          <tr key={pos.id} className="row-hoverable">
                            <td style={{ textAlign: 'center', width: '4.5%' }}>
                              <ImageWithFallback 
                                src={`${import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://127.0.0.1:8015'}/logos/${pos.ticker}.png`} 
                                alt={pos.ticker} 
                                fallbackName={pos.ticker}
                                size={26}
                                style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#fff', objectFit: 'contain', margin: '0 auto', display: 'block' }}
                              />
                            </td>
                            <td style={{ textAlign: 'left', width: '16%' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FavoriteStar ticker={pos.ticker} size={15} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <Link to={`/hisse/${pos.ticker}`} className="ticker-link" style={{ fontSize: '13px', fontWeight: 'bold' }}>
                                    {pos.ticker}
                                  </Link>
                                  {BIST30.includes(pos.ticker) && (
                                    <span className="badge badge-subtle" style={{ fontSize: '9px', padding: '1px 3px' }}>B30</span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td style={{ textAlign: 'left', width: '22%' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <ImageWithFallback 
                                  src={`${import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'http://127.0.0.1:8015'}/logos/brokers/${slug}.png`} 
                                  alt={pos.broker} 
                                  fallbackName={pos.broker}
                                  size={18}
                                  style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#fff', objectFit: 'contain' }}
                                />
                                <Link 
                                  to={`/kurum/${pos.broker.replace(/\s+/g, '-').toLowerCase()}`}
                                  className="ticker-link"
                                  style={{ fontSize: '13px', fontWeight: 'bold' }}
                                >
                                  {pos.broker}
                                </Link>
                              </div>
                            </td>
                            <td style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                              {pos.tarih || '-'}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                              {pos.livePrice ? (
                                <span>
                                  <span style={{ color: 'var(--text-highlight)' }}>{pos.livePrice.toFixed(2)}</span>
                                  {pos.liveChange !== null && (
                                    <span style={{ 
                                      color: pos.liveChange > 0 ? 'var(--color-up)' : pos.liveChange < 0 ? 'var(--color-down)' : 'var(--text-muted)',
                                      fontSize: '11px',
                                      marginLeft: '4px'
                                    }}>
                                      {pos.liveChange > 0 ? '▲' : pos.liveChange < 0 ? '▼' : ''}{Math.abs(pos.liveChange).toFixed(1)}%
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>-</span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '13px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                              {pos.targetPrice ? pos.targetPrice.toFixed(2) : '-'}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                              {pos.potential !== null ? (
                                <span style={{ color: getPotentialColor(pos.potential) }}>
                                  %{pos.potential > 0 ? '+' : ''}{pos.potential.toFixed(1)}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>-</span>
                              )}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <Link to={`/hisse/${pos.ticker}`} className="action-button" style={{ padding: '3px 8px', fontSize: '10.5px' }}>
                                Kokpit
                              </Link>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                          Kriterlere uygun model pozisyonu bulunamadı.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-color)', fontSize: '11.5px', flexShrink: 0 }}>
                <div style={{ color: 'var(--text-muted)' }}>
                  Gösterilen: {filteredAllPositions.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredAllPositions.length)} / Toplam: {filteredAllPositions.length}
                </div>
                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                  <button 
                    className="action-button"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    &lt; Önceki
                  </button>
                  <span style={{ padding: '0 8px', color: 'var(--text-highlight)', fontWeight: 'bold' }}>
                    Sayfa {currentPage} / {totalPositionsPages}
                  </span>
                  <button 
                    className="action-button"
                    onClick={() => setCurrentPage(p => Math.min(totalPositionsPages, p + 1))}
                    disabled={currentPage === totalPositionsPages || totalPositionsPages === 0}
                  >
                    Sonraki &gt;
                  </button>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </PageContainer>
  );
}