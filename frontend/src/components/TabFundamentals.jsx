import React, { useState, useMemo } from 'react';
import { getFinancialItemMeta } from '../utils/financialDictionary';
import { Search } from 'lucide-react';

export default function TabFundamentals({ fundamentals }) {
  const [activeSubTab, setActiveSubTab] = useState('income_statement'); // 'income_statement' | 'balance_sheet' | 'cash_flow'
  const [viewMode, setViewMode] = useState('summary'); // 'summary' | 'all'
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTooltip, setActiveTooltip] = useState(null);

  if (!fundamentals) {
    return (
      <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Finansal tablolar yükleniyor veya bu hisse için veri bulunamadı...
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. KPI ÖZET VERİLERİNİ HESAPLA (SON ÇEYREK & BÜYÜME)
  // ─────────────────────────────────────────────────────────────────────────────
  const kpiData = useMemo(() => {
    const inc = fundamentals.income_statement || {};
    const bal = fundamentals.balance_sheet || {};
    const cf = fundamentals.cash_flow || {};

    const incDates = inc.dates || [];
    const balDates = bal.dates || [];
    const cfDates = cf.dates || [];

    const getLatestAndPrev = (dataset, key) => {
      if (!dataset || !dataset[key] || !Array.isArray(dataset[key])) return { last: null, prev: null };
      const arr = dataset[key];
      const last = arr[arr.length - 1];
      const prev = arr.length > 1 ? arr[arr.length - 2] : null;
      return { last, prev };
    };

    // Hasılat
    const rev = getLatestAndPrev(inc, 'Total Revenue').last !== null 
      ? getLatestAndPrev(inc, 'Total Revenue') 
      : getLatestAndPrev(inc, 'Operating Revenue');
    const revGrowth = rev.last && rev.prev && rev.prev !== 0 
      ? ((rev.last - rev.prev) / Math.abs(rev.prev)) * 100 
      : null;

    // FAVÖK
    const ebitda = getLatestAndPrev(inc, 'EBITDA').last !== null
      ? getLatestAndPrev(inc, 'EBITDA')
      : getLatestAndPrev(inc, 'Normalized EBITDA');
    const ebitdaMargin = ebitda.last && rev.last && rev.last > 0
      ? (ebitda.last / rev.last) * 100
      : null;

    // Net Kâr
    const netInc = getLatestAndPrev(inc, 'Net Income').last !== null
      ? getLatestAndPrev(inc, 'Net Income')
      : getLatestAndPrev(inc, 'Net Income Common Stockholders');
    const netMargin = netInc.last && rev.last && rev.last > 0
      ? (netInc.last / rev.last) * 100
      : null;

    // Net Borç & Özkaynaklar
    const netDebt = getLatestAndPrev(bal, 'Net Debt').last !== null
      ? getLatestAndPrev(bal, 'Net Debt')
      : { last: null, prev: null };
    const equity = getLatestAndPrev(bal, 'Stockholders Equity').last !== null
      ? getLatestAndPrev(bal, 'Stockholders Equity')
      : getLatestAndPrev(bal, 'Total Equity Gross Minority Interest');

    // Serbest Nakit Akışı
    const fcf = getLatestAndPrev(cf, 'Free Cash Flow');

    return {
      lastQuarter: incDates[incDates.length - 1] || balDates[balDates.length - 1] || "Son Çeyrek",
      revenue: { val: rev.last, growth: revGrowth },
      ebitda: { val: ebitda.last, margin: ebitdaMargin },
      netIncome: { val: netInc.last, margin: netMargin },
      netDebt: { val: netDebt.last },
      equity: { val: equity.last },
      fcf: { val: fcf.last }
    };
  }, [fundamentals]);

  // Sayı formatlayıcı (Milyon TL -> Okunabilir format)
  const formatMln = (val) => {
    if (val === null || val === undefined || isNaN(val)) return "-";
    const mln = val / 1_000_000;
    return mln.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  };

  const formatCardVal = (val) => {
    if (val === null || val === undefined || isNaN(val)) return "-";
    const mln = val / 1_000_000;
    if (Math.abs(mln) >= 1000) {
      return `${(mln / 1000).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mlr TL`;
    }
    return `${mln.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} Milyon TL`;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. TABLO VERİLERİNİ SIRALA, FİLTRELE VE GRUPLA
  // ─────────────────────────────────────────────────────────────────────────────
  const renderTable = (dataKey) => {
    const data = fundamentals[dataKey];
    if (!data || !data.dates || data.dates.length === 0) {
      return (
        <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Bu tablo için geçmiş finansal kayıt bulunamadı.
        </div>
      );
    }

    const { dates, ...rows } = data;
    const rawKeys = Object.keys(rows);

    // Kalemleri zenginleştir ve sırala
    const mappedItems = rawKeys.map(key => {
      const meta = getFinancialItemMeta(key);
      const values = rows[key] || [];
      const lastVal = values[values.length - 1];
      const prevVal = values.length > 1 ? values[values.length - 2] : null;

      // Çeyreklik değişim
      let qoqChange = null;
      let qoqText = null;
      if (lastVal !== null && lastVal !== undefined && prevVal !== null && prevVal !== undefined && prevVal !== 0) {
        if (prevVal < 0 && lastVal > 0) {
          qoqText = "Kâra Geçti";
        } else if (prevVal > 0 && lastVal < 0) {
          qoqText = "Zarara Geçti";
        } else {
          qoqChange = ((lastVal - prevVal) / Math.abs(prevVal)) * 100;
        }
      }

      return {
        originalKey: key,
        ...meta,
        values,
        lastVal,
        prevVal,
        qoqChange,
        qoqText
      };
    });

    // Filtreleme: Özet mod vs Detaylı mod ve Arama sorgusu
    const filteredItems = mappedItems.filter(item => {
      // Arama filtresi
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTr = item.tr.toLowerCase().includes(q);
        const matchOrig = item.originalKey.toLowerCase().includes(q);
        const matchCat = (item.category || '').toLowerCase().includes(q);
        if (!matchTr && !matchOrig && !matchCat) return false;
      }

      // Özet mod filtresi (arama yokken sadece kilit kalemleri göster)
      if (!searchQuery.trim() && viewMode === 'summary') {
        return item.isKey;
      }

      return true;
    });

    // Mantıksal sıraya (order) göre sırala
    filteredItems.sort((a, b) => (a.order || 999) - (b.order || 999));

    // Kategorilere göre gruplama (Detaylı modda)
    let currentCategory = null;

    return (
      <div style={{ overflowX: 'auto', marginTop: '10px', paddingBottom: '20px' }}>
        <table className="data-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'right' }}>
          <thead>
            <tr style={{ background: 'var(--bg-raised)', borderBottom: '2px solid var(--border-color)' }}>
              <th style={{
                textAlign: 'left',
                minWidth: '380px',
                position: 'sticky',
                left: 0,
                background: 'var(--bg-raised)',
                zIndex: 2,
                padding: '14px 16px',
                fontSize: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: 'var(--text-muted)'
              }}>
                Finansal Kalem (Milyon TL)
              </th>
              {dates.map((date, idx) => (
                <th key={idx} style={{
                  padding: '14px 12px',
                  minWidth: '120px',
                  fontSize: '12px',
                  fontWeight: idx === dates.length - 1 ? '700' : '500',
                  color: idx === dates.length - 1 ? 'var(--color-cyan)' : 'var(--text-muted)',
                  borderLeft: '1px solid rgba(255,255,255,0.03)'
                }}>
                  {date} {idx === dates.length - 1 && <span style={{ fontSize: '10px', display: 'block', color: 'var(--text-muted)', fontWeight: 'normal' }}>(Son Dönem)</span>}
                </th>
              ))}
              <th style={{
                padding: '14px 14px',
                minWidth: '130px',
                fontSize: '12px',
                color: 'var(--text-highlight)',
                borderLeft: '1px solid rgba(255,255,255,0.06)',
                textAlign: 'center'
              }}>
                Çeyreklik Trend
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={dates.length + 2} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                  Arama kriterinize uygun finansal kalem bulunamadı.
                </td>
              </tr>
            ) : (
              filteredItems.map((item, i) => {
                const showCategoryBanner = viewMode === 'all' && !searchQuery && item.category && item.category !== currentCategory;
                if (showCategoryBanner) {
                  currentCategory = item.category;
                }

                const isMajor = item.isMajor;
                const rowBg = isMajor ? 'rgba(200, 162, 74, 0.05)' : 'transparent';
                const textColor = isMajor ? 'var(--text-primary)' : 'var(--text-main)';
                const fontWeight = isMajor ? '700' : '400';

                return (
                  <React.Fragment key={item.originalKey || i}>
                    {showCategoryBanner && (
                      <tr style={{ background: 'var(--bg-raised)' }}>
                        <td 
                          colSpan={dates.length + 2} 
                          style={{
                            textAlign: 'left',
                            padding: '10px 16px',
                            fontSize: '11px',
                            fontWeight: '700',
                            textTransform: 'uppercase',
                            letterSpacing: '0.8px',
                            color: 'var(--color-cyan)',
                            borderTop: '1px solid rgba(200, 162, 74, 0.2)',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
                          }}
                        >
                          {currentCategory}
                        </td>
                      </tr>
                    )}
                    <tr 
                      className="row-hoverable" 
                      style={{ 
                        background: rowBg,
                        borderBottom: isMajor ? '1px solid rgba(200, 162, 74, 0.2)' : '1px solid rgba(255,255,255,0.04)',
                        transition: 'background 0.15s ease'
                      }}
                    >
                      {/* Kalem Adı ve Bilgi Butonu */}
                      <td style={{
                        textAlign: 'left',
                        position: 'sticky',
                        left: 0,
                        background: isMajor ? '#172028' : 'var(--bg-raised)',
                        zIndex: 1,
                        borderRight: '1px solid rgba(255,255,255,0.08)',
                        padding: isMajor ? '13px 16px' : '10px 16px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                            {isMajor && (
                              <span style={{ 
                                width: '6px', 
                                height: '6px', 
                                borderRadius: '50%', 
                                background: 'var(--color-cyan)',
                                flexShrink: 0
                              }} />
                            )}
                            <span style={{ 
                              fontWeight, 
                              color: textColor, 
                              fontSize: isMajor ? '13.5px' : '12.5px',
                              letterSpacing: isMajor ? '0.2px' : 'normal'
                            }}>
                              {item.tr}
                            </span>
                          </div>
                          
                          {/* İnteraktif Bilgi Butonu */}
                          <div style={{ position: 'relative', flexShrink: 0 }}>
                            <button
                              type="button"
                              onClick={() => setActiveTooltip(activeTooltip === item.originalKey ? null : item.originalKey)}
                              style={{
                                cursor: 'pointer',
                                border: 'none',
                                background: activeTooltip === item.originalKey ? 'var(--color-cyan)' : 'rgba(255, 255, 255, 0.08)',
                                color: activeTooltip === item.originalKey ? '#000' : 'var(--text-muted)',
                                width: '18px',
                                height: '18px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '11px',
                                fontWeight: 'bold',
                                transition: 'all 0.15s'
                              }}
                              title="Kalem açıklaması için tıkla"
                            >
                              ?
                            </button>

                            {/* Açıklama Baloncuğu */}
                            {activeTooltip === item.originalKey && (
                              <div style={{
                                position: 'absolute',
                                left: '26px',
                                top: '-10px',
                                zIndex: 100,
                                width: '320px',
                                background: '#1f242e',
                                border: '1px solid var(--border-active)',
                                borderRadius: '8px',
                                padding: '14px',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                                textAlign: 'left',
                                color: 'var(--text-primary)',
                                fontSize: '12px',
                                lineHeight: '1.5'
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                  <strong style={{ color: 'var(--color-cyan)', fontSize: '13px' }}>{item.tr}</strong>
                                  <button 
                                    onClick={() => setActiveTooltip(null)}
                                    style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '14px', padding: 0 }}
                                  >
                                    ✕
                                  </button>
                                </div>
                                <p style={{ color: 'var(--text-secondary)', margin: '0 0 8px 0' }}>{item.desc}</p>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '6px' }}>
                                  <span style={{ color: 'var(--text-tertiary)' }}>Teknik Kod: </span>
                                  <code>{item.originalKey}</code>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Tarih Sütunları */}
                      {item.values.map((val, idx) => {
                        const formatted = formatMln(val);
                        const isNegative = val !== null && val < 0;
                        const isLatest = idx === item.values.length - 1;

                        return (
                          <td 
                            key={idx} 
                            style={{ 
                              padding: isMajor ? '13px 12px' : '10px 12px', 
                              fontWeight: isMajor ? '700' : (isLatest ? '600' : '400'),
                              color: isNegative ? 'var(--color-down)' : (isMajor ? 'var(--text-primary)' : 'var(--text-secondary)'),
                              fontSize: isMajor ? '13px' : '12.5px',
                              background: isMajor ? 'rgba(200, 162, 74, 0.03)' : 'transparent',
                              borderLeft: '1px solid rgba(255,255,255,0.03)'
                            }}
                          >
                            {formatted}
                          </td>
                        );
                      })}

                      {/* Çeyreklik Trend Rozeti */}
                      <td style={{ 
                        padding: '10px 14px', 
                        textAlign: 'center',
                        borderLeft: '1px solid rgba(255,255,255,0.06)'
                      }}>
                        {item.qoqText ? (
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: '600',
                            background: item.qoqText === 'Kâra Geçti' ? 'rgba(63, 138, 107, 0.2)' : 'rgba(192, 82, 78, 0.2)',
                            color: item.qoqText === 'Kâra Geçti' ? 'var(--color-up)' : 'var(--color-down)'
                          }}>
                            {item.qoqText}
                          </span>
                        ) : item.qoqChange !== null ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '2px',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: '600',
                            background: item.qoqChange > 0 
                              ? 'rgba(63, 138, 107, 0.12)' 
                              : item.qoqChange < 0 
                                ? 'rgba(192, 82, 78, 0.12)' 
                                : 'rgba(255,255,255,0.05)',
                            color: item.qoqChange > 0 
                              ? 'var(--color-up)' 
                              : item.qoqChange < 0 
                                ? 'var(--color-down)' 
                                : 'var(--text-muted)'
                          }}>
                            {item.qoqChange > 0 ? '▲ +' : item.qoqChange < 0 ? '▼ ' : ''}
                            {item.qoqChange.toFixed(1)}%
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>-</span>
                        )}
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* ─────────────────────────────────────────────────────────────────────────
          ÜST YÖNETİCİ ÖZETİ: 4 TEMEL FİNANSAL KPI KARTI
         ───────────────────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '14px',
        marginTop: '6px'
      }}>
        {/* KART 1: HASILAT (SATIŞ GELİRLERİ) */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(18, 18, 20, 0.9) 0%, rgba(18, 18, 20, 0.7) 100%)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '14px 16px',
          position: 'relative'
        }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Hasılat (Net Satışlar)
          </div>
          <div style={{ fontSize: '19px', fontWeight: '700', color: 'var(--text-primary)', margin: '6px 0 4px 0' }}>
            {formatCardVal(kpiData.revenue.val)}
          </div>
          <div style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {kpiData.revenue.growth !== null ? (
              <span style={{
                color: kpiData.revenue.growth >= 0 ? 'var(--color-up)' : 'var(--color-down)',
                fontWeight: '600',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px'
              }}>
                {kpiData.revenue.growth >= 0 ? '▲ +' : '▼ '}
                {kpiData.revenue.growth.toFixed(1)}%
              </span>
            ) : null}
            <span style={{ color: 'var(--text-muted)' }}>{kpiData.lastQuarter} çeyreği</span>
          </div>
        </div>

        {/* KART 2: FAVÖK (EBITDA) */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(18, 18, 20, 0.9) 0%, rgba(18, 18, 20, 0.7) 100%)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '14px 16px'
        }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            FAVÖK (Nakit Operasyon Kârı)
          </div>
          <div style={{ 
            fontSize: '19px', 
            fontWeight: '700', 
            color: kpiData.ebitda.val !== null && kpiData.ebitda.val < 0 ? 'var(--color-down)' : 'var(--color-cyan)',
            margin: '6px 0 4px 0' 
          }}>
            {formatCardVal(kpiData.ebitda.val)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {kpiData.ebitda.margin !== null ? (
              <span>FAVÖK Marjı: <strong style={{ color: 'var(--text-primary)' }}>%{kpiData.ebitda.margin.toFixed(1)}</strong></span>
            ) : "Nakit kârlılık göstergesi"}
          </div>
        </div>

        {/* KART 3: NET DÖNEM KÂRI / ZARARI */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(18, 18, 20, 0.9) 0%, rgba(18, 18, 20, 0.7) 100%)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '14px 16px'
        }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Net Dönem Kârı / Zararı
          </div>
          <div style={{ 
            fontSize: '19px', 
            fontWeight: '700', 
            color: kpiData.netIncome.val !== null && kpiData.netIncome.val >= 0 ? 'var(--color-up)' : 'var(--color-down)',
            margin: '6px 0 4px 0' 
          }}>
            {formatCardVal(kpiData.netIncome.val)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {kpiData.netIncome.margin !== null ? (
              <span>Net Kâr Marjı: <strong style={{ color: 'var(--text-primary)' }}>%{kpiData.netIncome.margin.toFixed(1)}</strong></span>
            ) : "Vergi & finansman sonrası kâr"}
          </div>
        </div>

        {/* KART 4: SERMAYE VE BORÇ DURUMU */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(18, 18, 20, 0.9) 0%, rgba(18, 18, 20, 0.7) 100%)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '14px 16px'
        }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Net Borç & Bilanço Sağlığı
          </div>
          <div style={{ 
            fontSize: '19px', 
            fontWeight: '700', 
            color: kpiData.netDebt.val !== null && kpiData.netDebt.val > 0 ? 'var(--text-secondary)' : 'var(--color-up)',
            margin: '6px 0 4px 0' 
          }}>
            {kpiData.netDebt.val !== null ? (
              kpiData.netDebt.val <= 0 ? "Net Nakit Zengini" : formatCardVal(kpiData.netDebt.val)
            ) : formatCardVal(kpiData.equity.val)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {kpiData.netDebt.val !== null && kpiData.netDebt.val <= 0 ? (
              <span style={{ color: 'var(--color-up)' }}>Kasadaki nakit borçlardan fazla</span>
            ) : kpiData.equity.val !== null ? (
              <span>Özkaynak: <strong style={{ color: 'var(--text-primary)' }}>{formatCardVal(kpiData.equity.val)}</strong></span>
            ) : "Finansal kaldıraç dengesi"}
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          KONTROL PANELİ: TAB SEÇİCİ, GÖRÜNÜM MODU & ARAMA
         ───────────────────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '14px',
        paddingBottom: '12px',
        borderBottom: '1px solid var(--border-color)'
      }}>
        {/* TAB BUTONLARI (GELİR, BİLANÇO, NAKİT AKIŞI) */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {[
            { id: 'income_statement', label: 'GELİR TABLOSU' },
            { id: 'balance_sheet', label: 'BİLANÇO' },
            { id: 'cash_flow', label: 'NAKİT AKIŞI' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveSubTab(tab.id);
                setActiveTooltip(null);
              }}
              style={{
                background: activeSubTab === tab.id ? 'var(--color-cyan)' : 'rgba(255, 255, 255, 0.05)',
                color: activeSubTab === tab.id ? '#000' : 'var(--text-main)',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '12.5px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* SAĞ KONTROLLER: ÖZET/DETAYLI MOD SEÇİCİ & ARAMA KUTUSU */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Arama Kutusu */}
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Kalem ara (örn: FAVÖK, Hasılat, Stok)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'var(--bg-raised)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                padding: '7px 12px 7px 30px',
                fontSize: '12px',
                color: 'var(--text-primary)',
                width: '240px',
                outline: 'none'
              }}
            />
            <span style={{ position: 'absolute', left: '10px', top: '7px', color: 'var(--text-tertiary)', fontSize: '13px' }}><Search size={13} /></span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '6px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-tertiary)',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Görünüm Modu Toggle (Özet vs Detaylı) */}
          <div style={{
            display: 'inline-flex',
            background: 'var(--bg-raised)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            padding: '2px'
          }}>
            <button
              onClick={() => setViewMode('summary')}
              style={{
                background: viewMode === 'summary' ? 'rgba(200, 162, 74, 0.2)' : 'transparent',
                color: viewMode === 'summary' ? 'var(--color-cyan)' : 'var(--text-muted)',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: viewMode === 'summary' ? '700' : '500',
                cursor: 'pointer'
              }}
              title="Yalnızca en kritik 10-12 temel finansal kalemi gösterir"
            >
              Özet Görünüm
            </button>
            <button
              onClick={() => setViewMode('all')}
              style={{
                background: viewMode === 'all' ? 'rgba(200, 162, 74, 0.2)' : 'transparent',
                color: viewMode === 'all' ? 'var(--color-cyan)' : 'var(--text-muted)',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: viewMode === 'all' ? '700' : '500',
                cursor: 'pointer'
              }}
              title="Tüm muhasebe kalemlerini ve alt detayları gruplandırarak listeler"
            >
              Detaylı Rapor
            </button>
          </div>
        </div>
      </div>

      {/* BİLGİLENDİRME ŞERİDİ */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '11px',
        color: 'var(--text-muted)',
        marginTop: '-10px'
      }}>
        <span>
          <strong>İpucu:</strong> Tüm parasal değerler <strong>Milyon TL</strong> cinsindendir. Kalem açıklamaları için <span style={{ color: 'var(--color-cyan)', fontWeight: 'bold' }}>?</span> butonuna tıklayabilirsiniz.
        </span>
        {viewMode === 'summary' && !searchQuery && (
          <span style={{ color: 'var(--color-cyan)' }}>
            Şu an <strong>Özet Görünüm</strong> aktif. Tüm alt kalemler için sağ üstten <strong>Detaylı Rapor</strong> seçebilirsiniz.
          </span>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────
          FİNANSAL TABLO RENDER
         ───────────────────────────────────────────────────────────────────────── */}
      {renderTable(activeSubTab)}
    </div>
  );
}
