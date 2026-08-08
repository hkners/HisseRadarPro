import React from 'react';

export default function ReportFilters({
  searchTerm,
  setSearchTerm,
  selectedBroker,
  setSelectedBroker,
  brokers = [],
  selectedCategory,
  setSelectedCategory,
  categories = [],
  selectedRating,
  setSelectedRating,
  minUpside,
  setMinUpside,
  sortBy,
  setSortBy,
  onReset
}) {
  return (
    <div className="panel" style={{ marginBottom: '15px' }}>
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>FİLTRE & ARAMA KONTROLLERİ</span>
        {onReset && (
          <button
            className="btn-read"
            onClick={onReset}
            style={{ fontSize: '10px', padding: '2px 8px', color: 'var(--color-warning)', borderColor: 'var(--color-warning)' }}
          >
            Sıfırla ↺
          </button>
        )}
      </div>
      <div className="panel-content" style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center' }}>
        <div>
          <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '3px' }}>
            ARAMA (HİSSE / ANAHTAR KELİME)
          </label>
          <input
            type="text"
            className="search-box"
            placeholder="THYAO, ASELS, kargo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '3px' }}>
            ARACI KURUM
          </label>
          <select
            className="search-box"
            style={{ width: '180px' }}
            value={selectedBroker}
            onChange={(e) => setSelectedBroker(e.target.value)}
          >
            <option value="ALL">Tüm Kurumlar</option>
            {brokers.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '3px' }}>
            KATEGORİ
          </label>
          <select
            className="search-box"
            style={{ width: '180px' }}
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="ALL">Tüm Kategoriler</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '3px' }}>
            TAVSİYE
          </label>
          <select
            className="search-box"
            style={{ width: '120px' }}
            value={selectedRating}
            onChange={(e) => setSelectedRating(e.target.value)}
          >
            <option value="ALL">Tümü</option>
            <option value="AL">AL (BUY)</option>
            <option value="TUT">TUT (HOLD)</option>
            <option value="SAT">SAT (SELL)</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '3px' }}>
            MIN. POTANSİYEL (%)
          </label>
          <input
            type="number"
            className="search-box"
            style={{ width: '120px' }}
            placeholder="Örn: 20"
            value={minUpside}
            onChange={(e) => setMinUpside(e.target.value)}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '3px' }}>
            SIRALAMA
          </label>
          <select
            className="search-box"
            style={{ width: '180px' }}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="date_desc">Tarih (En Yeni)</option>
            <option value="date_asc">Tarih (En Eski)</option>
            <option value="potansiyel_desc">Potansiyel (En Yüksek)</option>
            <option value="potansiyel_asc">Potansiyel (En Düşük)</option>
          </select>
        </div>
      </div>
    </div>
  );
}
