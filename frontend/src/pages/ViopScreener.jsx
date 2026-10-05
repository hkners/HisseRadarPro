import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageContainer from '../components/common/PageContainer';
import { InfoTip } from '../components/ui';
import { fmtNum, fmtPct, signClass } from '../utils/format';

const API = import.meta.env.VITE_API_URL || '/api';

// Theoretical single-stock futures prices (cost of carry). Contract prices and open interest are not
// shown: our data sources do not include VİOP market data, and the page used to fill them with
// random numbers.
export default function ViopScreener() {
  const [ratePct, setRatePct] = useState('40');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const r = Number(String(ratePct).replace(',', '.'));
    if (!Number.isFinite(r) || r < 0 || r > 200) return undefined;
    const id = setTimeout(() => {
      fetch(`${API}/viop/fair-value?rate=${r / 100}`)
        .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .then(d => { setData(d); setError(''); })
        .catch(e => setError(e.message));
    }, 300);
    return () => clearTimeout(id);
  }, [ratePct]);

  return (
    <PageContainer
      title="VİOP"
      subtitle="BIST 30 pay vadeli sözleşmeleri için teorik (taşıma maliyeti) fiyat hesaplayıcı."
      badge={data ? `Vade ${data.expiry}` : undefined}
      scrollable
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 16 }}>
        <div className="notice">
          Kontrat piyasa fiyatı ve açık pozisyon (APS) verisi kaynaklarımızda yok; bu sayfa yalnızca teorik fiyatı hesaplar.
          Önceki sürümdeki kontrat fiyatı, APS ve trend sütunları rastgele üretiliyordu ve kaldırıldı.
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="filter-field" style={{ width: 220 }}>
            <span className="eyebrow">Yıllık faiz varsayımı (%) <InfoTip text="Genellikle TCMB politika faizi ya da kısa vadeli TL borçlanma faizi. Teorik fiyat bu orana doğrudan bağlıdır." size={10} /></span>
            <input className="input" value={ratePct} onChange={e => setRatePct(e.target.value)} inputMode="decimal" />
          </label>
          {data && <span className="text-muted" style={{ fontSize: 12 }}>Vadeye {data.days_to_expiry} gün · F = S × (1 + (faiz − temettü verimi) × gün/365)</span>}
        </div>
        {error && <div className="text-down">Hesaplanamadı: {error}</div>}
        {data && (
          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="panel-content" style={{ padding: 0, flex: 'none' }}>
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Sözleşme</th><th>Spot</th><th>Günlük</th>
                    <th>Temettü verimi</th><th>Teorik vadeli fiyat</th>
                    <th>Baz <InfoTip text="Teorik vadeli fiyatın spot fiyata göre farkı. Piyasa fiyatı bundan belirgin saparsa (kaynağınızdan bakarak) arbitraj fırsatı olabilir." size={9} /></th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(r => (
                    <tr key={r.ticker}>
                      <td style={{ textAlign: 'left' }}><Link to={`/hisse/${r.ticker}`} className="ticker-link">{r.contract}</Link></td>
                      <td>{fmtNum(r.spot_price, 2)}</td>
                      <td className={signClass(r.spot_change)}>{fmtPct(r.spot_change, 2)}</td>
                      <td>{fmtPct((r.dividend_yield || 0) * 100, 1, { sign: false })}</td>
                      <td style={{ color: 'var(--text-primary)' }}>{fmtNum(r.fair_price, 2)}</td>
                      <td>{fmtPct(r.basis_pct, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <p className="text-muted" style={{ fontSize: 11 }}>Temettü verimi son 12 ayın verimidir ve vade içinde temettü olup olmadığını dikkate almaz. Yatırım tavsiyesi değildir.</p>
      </div>
    </PageContainer>
  );
}
