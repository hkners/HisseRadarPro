import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CandlestickChart, Landmark, CornerDownLeft } from 'lucide-react';
import { ALL_NAV_ITEMS } from '../../navigation';
import { fetchWithCache } from '../../utils/apiCache';
import { BIST30 } from '../../utils/bistIndices';

const API = import.meta.env.VITE_API_URL || '/api';

// Case/diacritic-insensitive key so "garan", "GARAN" and "ış yatırım" all match.
const fold = (s) => (s || '')
  .toLocaleLowerCase('tr')
  .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c')
  .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o')
  .replace(/i̇/g, 'i');

const brokerSlug = (name) => name.replace(/\s+/g, '-').toLowerCase();

function rankStocks(stocks, q) {
  if (!q) {
    const popular = new Set(BIST30.slice(0, 8));
    return stocks.filter(s => popular.has(s.ticker));
  }
  const scored = [];
  for (const s of stocks) {
    const t = fold(s.ticker);
    const n = fold(s.name);
    let score = -1;
    if (t === q) score = 0;
    else if (t.startsWith(q)) score = 1;
    else if (n.startsWith(q)) score = 2;
    else if (n.includes(q)) score = 3;
    if (score >= 0) scored.push([score, s]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].ticker.localeCompare(b[1].ticker));
  return scored.slice(0, 8).map(x => x[1]);
}

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [stocks, setStocks] = useState([]);
  const [brokers, setBrokers] = useState([]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
    fetchWithCache(`${API}/stocks`).then(d => setStocks(d?.stocks || [])).catch(() => {});
    fetchWithCache(`${API}/kurum-stats`).then(d => setBrokers(Array.isArray(d) ? d : [])).catch(() => {});
  }, [open]);

  const groups = useMemo(() => {
    const q = fold(query.trim());
    const pages = ALL_NAV_ITEMS
      .filter(i => !q || fold(i.label).includes(q))
      .slice(0, q ? 6 : 5)
      .map(i => ({ key: `p:${i.to}`, kind: 'page', item: i, go: i.to }));
    const stockItems = rankStocks(stocks, q).map(s => ({ key: `s:${s.ticker}`, kind: 'stock', item: s, go: `/hisse/${s.ticker}` }));
    const brokerItems = (q ? brokers.filter(b => fold(b.kurum).includes(q)) : [])
      .slice(0, 5)
      .map(b => ({ key: `b:${b.kurum}`, kind: 'broker', item: b, go: `/kurum/${brokerSlug(b.kurum)}` }));
    return [
      { label: q ? 'HİSSELER' : 'POPÜLER HİSSELER', items: stockItems },
      { label: 'KURUMLAR', items: brokerItems },
      { label: 'SAYFALAR', items: pages },
    ].filter(g => g.items.length);
  }, [query, stocks, brokers]);

  const flat = useMemo(() => groups.flatMap(g => g.items), [groups]);

  useEffect(() => { setSelected(0); }, [query]);

  useEffect(() => {
    listRef.current?.querySelector('.cmdk-item.selected')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!open) return null;

  const choose = (entry) => {
    if (!entry) return;
    onClose();
    navigate(entry.go);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(i => Math.min(flat.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(flat[selected]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  let index = -1;
  return (
    <div className="cmdk-overlay" onMouseDown={onClose}>
      <div className="cmdk" role="dialog" aria-label="Arama" onMouseDown={e => e.stopPropagation()}>
        <div className="cmdk-input-row">
          <Search size={16} />
          <input
            ref={inputRef}
            autoFocus
            className="cmdk-input"
            placeholder="Hisse, şirket, kurum veya sayfa ara…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Arama"
          />
          <kbd className="kbd">ESC</kbd>
        </div>
        <div className="cmdk-list" ref={listRef}>
          {flat.length === 0 && (
            <div className="cmdk-empty">
              {stocks.length ? `"${query}" için sonuç yok.` : 'Hisse listesi yükleniyor…'}
            </div>
          )}
          {groups.map(g => (
            <div key={g.label}>
              <div className="cmdk-group-label">{g.label}</div>
              {g.items.map(entry => {
                index += 1;
                const i = index;
                const isSel = i === selected;
                return (
                  <button
                    key={entry.key}
                    type="button"
                    className={`cmdk-item${isSel ? ' selected' : ''}`}
                    onMouseMove={() => setSelected(i)}
                    onClick={() => choose(entry)}
                  >
                    <EntryRow entry={entry} />
                    {isSel && <CornerDownLeft size={13} style={{ color: 'var(--text-tertiary)' }} />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="cmdk-footer">
          <span><kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> gezin</span>
          <span><kbd className="kbd">↵</kbd> aç</span>
          <span><kbd className="kbd">Ctrl</kbd> <kbd className="kbd">K</kbd> aç / kapat</span>
        </div>
      </div>
    </div>
  );
}

function EntryRow({ entry }) {
  if (entry.kind === 'stock') {
    const s = entry.item;
    const chg = Number(s.change_pct) || 0;
    return (
      <>
        <CandlestickChart size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
        <span className="sym">{s.ticker}</span>
        <span className="desc">{s.name}</span>
        {s.price != null && <span className="meta">{Number(s.price).toFixed(2)}</span>}
        <span className="meta" style={{ color: chg > 0 ? 'var(--positive)' : chg < 0 ? 'var(--negative)' : undefined, minWidth: 54, textAlign: 'right' }}>
          {chg > 0 ? '+' : ''}{chg.toFixed(2)}%
        </span>
      </>
    );
  }
  if (entry.kind === 'broker') {
    const b = entry.item;
    return (
      <>
        <Landmark size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
        <span className="desc">{b.kurum}</span>
        <span className="meta">{b.count} rapor</span>
      </>
    );
  }
  const Icon = entry.item.icon;
  return (
    <>
      <Icon size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
      <span className="desc">{entry.item.label}</span>
      {entry.item.soon && <span className="chip">YAKINDA</span>}
    </>
  );
}
