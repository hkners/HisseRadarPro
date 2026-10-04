import React, { useEffect, useState } from 'react';
import { FileDown, RotateCcw, Play, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { Button, InfoTip, Chip, PillTabs } from '../ui';
import { fmtNum, fmtPct, fmtTL, signClass } from '../../utils/format';
import { postDownload } from '../../utils/download';

const API = import.meta.env.VITE_API_URL || '/api';

// Editable inputs per model. pct: shown and typed as percent, stored as fraction.
const FIELDS = {
  dcf: [
    { key: 'growth_y1', label: 'İlk yıl gelir büyümesi', pct: true },
    { key: 'ebit_margin', label: 'Kalıcı faaliyet marjı', pct: true },
    { key: 'terminal_growth', label: 'Uç büyüme (reel)', pct: true },
    { key: 'capex_pct', label: 'Yatırım / gelir (başlangıç)', pct: true },
    { key: 'tax_rate', label: 'Vergi oranı', pct: true },
    { key: 'risk_free', label: 'Risksiz getiri (reel)', pct: true },
    { key: 'equity_premium', label: 'Risk primi', pct: true },
    { key: 'beta', label: 'Beta', pct: false },
  ],
  justified_pb: [
    { key: 'roe', label: 'Sürdürülebilir özkaynak kârlılığı', pct: true },
    { key: 'terminal_growth', label: 'Uç büyüme (nominal)', pct: true },
    { key: 'risk_free', label: 'Risksiz getiri (nominal)', pct: true },
    { key: 'equity_premium', label: 'Risk primi', pct: true },
    { key: 'beta', label: 'Beta', pct: false },
  ],
};
const pct = (v, d = 1) => (v == null ? '—' : fmtPct(v * 100, d, { sign: false }));
const upside = (v, price) => (v != null && price ? (v / price - 1) * 100 : null);

function ValueBox({ label, value, price, active }) {
  const up = upside(value, price);
  return (
    <div className="stat-tile" style={active ? { borderColor: 'var(--gold-border)' } : undefined}>
      <span className="eyebrow">{label}</span>
      <span className="stat-value">{value == null ? '—' : fmtNum(value)}</span>
      <span className={`stat-sub ${signClass(up)}`}>{up == null ? '' : `${fmtPct(up)} fiyata göre`}</span>
    </div>
  );
}

export default function ModelPanel({ ticker }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState('base');
  const [showRows, setShowRows] = useState(false);

  useEffect(() => {
    setData(null);
    setDraft({});
    setView('base');
    fetch(`${API}/stocks/${ticker}/model`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch(e => setError(e.message));
  }, [ticker]);

  if (error) return <div className="text-muted">Model yüklenemedi: {error}</div>;
  if (!data) return <div className="text-muted">Model hesaplanıyor…</div>;
  if (!data.model_ok) {
    return (
      <div className="card">
        <div className="card-eyebrow">İçsel değer modeli</div>
        <div className="card-body">{data.model_note}</div>
      </div>
    );
  }

  const fields = FIELDS[data.model];
  const overrides = Object.fromEntries(Object.entries(draft).filter(([, v]) => v !== '' && v != null && Number.isFinite(Number(v)))
    .map(([k, v]) => [k, fields.find(f => f.key === k)?.pct ? Number(v) / 100 : Number(v)]));
  const hasThesis = !!data.thesis_model;
  const m = view === 'thesis' && hasThesis ? data.thesis_model : data.base_model;
  const isDcf = data.model === 'dcf';

  const runThesis = () => {
    setBusy(true);
    fetch(`${API}/stocks/${ticker}/model`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ overrides }) })
      .then(r => r.json())
      .then(d => { setData(d); setView(d.thesis_model ? 'thesis' : 'base'); })
      .finally(() => setBusy(false));
  };
  const resetThesis = () => { setDraft({}); setView('base'); setData(d => ({ ...d, thesis_model: undefined, thesis_inputs: undefined })); };
  const download = () => postDownload(`/stocks/${ticker}/model.xlsx`, { overrides: view === 'thesis' ? overrides : {} }, `${ticker}-degerleme-modeli.xlsx`).catch(e => setError(e.message));

  const rev = m.reverse;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="panel" style={{ marginBottom: 0 }}>
        <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{isDcf ? 'DCF modeli · reel (bugünkü TL)' : 'Hak edilen PD/DD modeli · nominal'}</span>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center', textTransform: 'none', letterSpacing: 0 }}>
            {hasThesis && <PillTabs tabs={[{ id: 'base', label: 'Temel model' }, { id: 'thesis', label: 'Senin tezin' }]} value={view} onChange={setView} />}
            <Button size="sm" variant="outline-gold" onClick={download}><FileDown size={12} /> Excel'e indir</Button>
          </span>
        </div>
        <div className="panel-content" style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Reverse model first: the most robust reading on TMS 29 data */}
          <div className="card" style={{ borderColor: 'var(--gold-border)', background: 'var(--gold-tint)' }}>
            <div className="card-eyebrow">Fiyat neyi ima ediyor <InfoTip text="Modeldeki diğer varsayımlar sabitken, bugünkü fiyatı haklı çıkarmak için gereken değer. Tahmin değil, piyasanın beklentisinin okunuşudur." size={10} /></div>
            {isDcf ? (
              <div className="card-body" style={{ fontSize: 13.5, lineHeight: 1.7 }}>
                Bugünkü fiyat ({fmtNum(data.price)} TL) için şirketin kalıcı olarak <b className="text-gold">{pct(rev.margin_value)}</b> faaliyet marjı yapması gerekiyor
                {rev.margin_current != null && <> (son raporlanan {pct(rev.margin_current)})</>}
                {rev.value != null && <>; ya da modeldeki marjla ilk yıl gelirini <b className="text-gold">{pct(rev.value)}</b> büyütmesi (modeldeki {pct(rev.current)}).</>}
                {rev.value == null && '.'}
              </div>
            ) : (
              <div className="card-body" style={{ fontSize: 13.5, lineHeight: 1.7 }}>
                Bugünkü fiyat ({fmtNum(data.price)} TL), bankanın kalıcı olarak <b className="text-gold">{pct(rev.value)}</b> özkaynak kârlılığı elde edeceğini varsayıyor
                {rev.current != null && <> (son 12 ay: {pct(rev.current)})</>}.
              </div>
            )}
          </div>

          {m.extreme && (
            <div className="notice" style={{ borderColor: 'rgba(201, 136, 58, 0.5)', background: 'var(--warning-tint)' }}>
              <span style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--warning)' }} />
                Model sonucu fiyattan çok uzak. BIST şirketleri TMS 29 enflasyon muhasebesiyle raporladığı için marjlar olağan dışı düşük görünebilir;
                bu durumda yukarıdaki "fiyat neyi ima ediyor" okuması, tek bir değer tahmininden daha güvenilirdir. Varsayımları kendi tezinle değiştirebilirsin.
              </span>
            </div>
          )}

          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
            <ValueBox label="Kötümser" value={m.scenarios.bear} price={data.price} />
            <ValueBox label={view === 'thesis' ? 'Senin tezin' : 'Temel'} value={m.scenarios.base} price={data.price} active />
            <ValueBox label="İyimser" value={m.scenarios.bull} price={data.price} />
            <div className="stat-tile">
              <span className="eyebrow">{isDcf ? 'AOSM (WACC)' : 'Özkaynak maliyeti'}</span>
              <span className="stat-value">{pct(isDcf ? m.base.wacc : m.base.cost_of_equity)}</span>
              <span className="stat-sub">{isDcf ? `Uç değer payı ${pct(m.base.terminal_share, 0)}` : `Hak edilen PD/DD ${fmtNum(m.base.justified_pb, 2)}`}</span>
            </div>
          </div>
          <p className="text-muted" style={{ fontSize: 11 }}>
            {isDcf
              ? 'Kötümser: ilk yıl büyüme −15 puan ve marj −3 puan. İyimser: +15 ve +3 puan.'
              : 'Kötümser: özkaynak kârlılığı −5 puan. İyimser: +5 puan.'}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">Varsayımlar ve senin tezin</div>
          <div className="panel-content" style={{ flex: 'none', padding: 0 }}>
            <table className="data-table compact">
              <thead><tr><th>Girdi</th><th>Modelde</th><th>Senin tezin</th></tr></thead>
              <tbody>
                {fields.map(f => {
                  const base = data.inputs[f.key];
                  return (
                    <tr key={f.key}>
                      <td style={{ fontFamily: 'var(--font-body)' }}>{f.label}<InfoTip text={data.sources[f.key] || 'Varsayılan değer'} size={10} /></td>
                      <td>{f.pct ? pct(base) : fmtNum(base, 2)}</td>
                      <td style={{ width: 120 }}>
                        <input
                          className="input"
                          type="number"
                          step={f.pct ? 0.5 : 0.05}
                          style={{ width: 100, padding: '3px 6px', textAlign: 'right' }}
                          placeholder={base == null ? '' : f.pct ? (base * 100).toFixed(1) : base.toFixed(2)}
                          value={draft[f.key] ?? ''}
                          onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 8, padding: 10 }}>
              <Button variant="primary" size="sm" onClick={runThesis} disabled={busy || !Object.keys(overrides).length}><Play size={12} /> {busy ? 'Hesaplanıyor…' : 'Tezini hesapla'}</Button>
              <Button size="sm" variant="ghost" onClick={resetThesis} disabled={!hasThesis && !Object.keys(draft).length}><RotateCcw size={12} /> Sıfırla</Button>
              <span className="text-muted" style={{ fontSize: 10.5, alignSelf: 'center' }}>Yüzdeleri yüzde olarak yaz (12,5 = %12,5).</span>
            </div>
          </div>
        </div>

        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">Duyarlılık · hisse başı değer</div>
          <div className="panel-content" style={{ flex: 'none', padding: 0, overflowX: 'auto' }}>
            <table className="data-table compact">
              <thead>
                <tr>
                  <th>{m.sensitivity.rows_label} \ {m.sensitivity.cols_label}</th>
                  {m.sensitivity.cols.map(c => <th key={c}>{pct(c)}</th>)}
                </tr>
              </thead>
              <tbody>
                {m.sensitivity.rows.map((r, i) => (
                  <tr key={r}>
                    <td style={{ fontWeight: 600 }}>{pct(r)}</td>
                    {m.sensitivity.values[i].map((v, j) => {
                      const center = i === 2 && j === 2;
                      return (
                        <td key={j} className={signClass(upside(v, data.price))} style={center ? { outline: '1px solid var(--gold)', fontWeight: 600 } : undefined}>
                          {v == null ? '—' : fmtNum(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-muted" style={{ fontSize: 10.5, padding: '6px 10px' }}>Yeşil: fiyatın üzerinde, kırmızı: altında. Çerçeveli hücre modelin kendisi.</p>
          </div>
        </div>
      </div>

      {isDcf && (
        <div className="panel" style={{ marginBottom: 0 }}>
          <button type="button" className="panel-header" onClick={() => setShowRows(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
            {showRows ? <ChevronDown size={13} /> : <ChevronRight size={13} />} 10 yıllık projeksiyon
          </button>
          {showRows && (
            <div className="panel-content" style={{ flex: 'none', padding: 0, overflowX: 'auto' }}>
              <table className="data-table compact" style={{ minWidth: 900 }}>
                <thead><tr><th>Kalem</th>{m.base.rows.map(r => <th key={r.year}>Yıl {r.year}</th>)}</tr></thead>
                <tbody>
                  {[
                    ['Büyüme', 'growth', v => pct(v)],
                    ['Gelir', 'revenue', fmtTL],
                    ['FVÖK', 'ebit', fmtTL],
                    ['NOPAT', 'nopat', fmtTL],
                    ['Amortisman', 'da', fmtTL],
                    ['Yatırım harcaması', 'capex', fmtTL],
                    ['İşletme sermayesi artışı', 'delta_nwc', fmtTL],
                    ['Serbest nakit akımı', 'fcff', fmtTL],
                    ['Bugünkü değer', 'pv', fmtTL],
                  ].map(([label, key, fmt]) => (
                    <tr key={key}><td style={{ fontFamily: 'var(--font-body)' }}>{label}</td>{m.base.rows.map(r => <td key={r.year}>{fmt(r[key])}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              <p className="text-muted" style={{ fontSize: 10.5, padding: '6px 10px' }}>
                Firma değeri {fmtTL(m.base.enterprise_value)} TL − borç {fmtTL(data.balance.total_debt)} + nakit {fmtTL(data.balance.cash)} = özkaynak {fmtTL(m.base.equity_value)} TL
                ÷ {fmtNum(data.balance.shares / 1e6, 0)} milyon hisse.
              </p>
            </div>
          )}
        </div>
      )}
      <p className="text-muted" style={{ fontSize: 10.5, lineHeight: 1.6 }}>
        <Chip>Basitleştirilmiş model</Chip> TL tutarlar piyasa verisinden (piyasa değeri, F/K, PD/DD) türetilir, finansal tablolardan yalnızca oranlar kullanılır.
        {isDcf ? ' Model TMS 29 tablolarıyla tutarlı olsun diye reel bazdadır.' : ' Bankalar TMS 29 uygulamadığı için model nominaldir.'} Yatırım tavsiyesi değildir.
      </p>
    </div>
  );
}
